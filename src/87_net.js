// =====================================================================
//  Net: play with friends by room code (website version)
//  The host's browser runs the bots, storm and loot. Every player runs their own character and reports it.
//  The server only passes messages along.
// =====================================================================
const NET_RANGE = 350;
const Net = {
  ws: null, state: 'off', code: '', me: 0, hostId: 0, members: [], err: '', sig: '',
  inMatch: false, applying: false, building: false, startData: null,
  ids: new Map(), humans: new Map(), queue: [], stT: 0, snN: 0,
  supported: /^https?:$/.test(location.protocol) && !/claude|anthropic/.test(location.hostname),
  get isHost() { return this.me === this.hostId; },
  get hosting() { return this.inMatch && this.me === this.hostId; },
  get guest() { return this.inMatch && this.me !== this.hostId; },

  // ---------------------------------------------------------------- connection + rooms
  connect(then) {
    if (this.ws && this.ws.readyState === 1) { then(); return; }
    if (!this.supported) { this.fail('Multiplayer works on the website version of FortDay.'); return; }
    this.state = 'connecting'; this.err = ''; Lobby.refresh();
    let ws; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { this.fail('Could not reach the multiplayer server.'); return; }
    this.ws = ws; let opened = false;
    ws.onopen = () => { opened = true; then(); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } try { this.onServer(m); } catch (x) { console.error(x); } };
    ws.onclose = () => { if (this.ws !== ws) return; this.ws = null; this.dropRoom(!opened ? 'Could not reach the multiplayer server. Try again in a moment.' : this.state === 'room' ? 'Lost the connection to the room.' : ''); };
    ws.onerror = () => {};
  },
  fail(msg) { this.state = 'off'; this.err = msg; Lobby.refresh(); },
  dropRoom(msg) {
    const was = this.inMatch; this.state = 'off'; this.code = ''; this.members = []; this.err = msg || '';
    if (was && (Match.state === 'play' || Match.state === 'results' || Match.state === 'loading')) Match.toLobby();
    this.inMatch = false; Lobby.refresh();
  },
  raw(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); },
  send(to, d) { this.raw({ t: 'x', to, d }); },
  me_() { return { name: (Profile.d.name || 'Player').slice(0, 16), eq: Profile.d.eq }; },
  create() { this.connect(() => this.raw(Object.assign({ t: 'create' }, this.me_()))); },
  join(code) { code = String(code || '').toUpperCase().replace(/[^A-Z]/g, ''); if (code.length !== 4) { this.err = 'Room codes are 4 letters.'; Lobby.refresh(); return; } this.connect(() => this.raw(Object.assign({ t: 'join', code }, this.me_()))); },
  leaveRoom() { this.raw({ t: 'leave' }); this.dropRoom(''); },
  tellProfile() { if (this.state === 'room') this.raw(Object.assign({ t: 'me' }, this.me_())); },
  onServer(m) {
    if (m.t === 'room') { this.me = m.you; this.code = m.code; this.hostId = m.host; this.members = m.members; this.state = 'room'; this.err = ''; Lobby.refresh(); }
    else if (m.t === 'left') { if (this.hosting) this.dropHuman(m.id); }
    else if (m.t === 'closed') this.dropRoom('The host left, so the room closed.');
    else if (m.t === 'error') { this.err = m.msg || 'Something went wrong.'; if (this.state !== 'room') this.state = 'off'; Lobby.refresh(); }
    else if (m.t === 'x' && m.d && typeof m.d === 'object') this.onMsg(m.from, m.d);
  },

  // ---------------------------------------------------------------- lobby panel
  render() {
    const box = $('mpBox'); if (!box) return;
    const sig = [this.state, this.code, this.hostId, this.me, this.err, this.members.map(m => m.id + m.name).join(',')].join('|');
    const eqSig = JSON.stringify(Profile.d.eq) + (Profile.d.name || '');
    if (this.state === 'room' && this.eqSig && eqSig !== this.eqSig) this.tellProfile();   // changed outfit in the Locker while in a room
    this.eqSig = eqSig;
    const rb = $('readyBtn'), waiting = this.state === 'room' && !this.isHost;
    rb.disabled = waiting; rb.textContent = waiting ? 'WAITING FOR HOST' : this.state === 'room' ? 'START MATCH · ' + this.members.length + (this.members.length === 1 ? ' PLAYER' : ' PLAYERS') : 'READY UP';
    if (sig === this.sig) return; this.sig = sig;
    const err = this.err ? `<div class="mp-err">${esc(this.err)}</div>` : '';
    if (!this.supported) { box.innerHTML = '<div class="hint">Multiplayer works on the website version of FortDay. This copy plays against bots.</div>'; return; }
    if (this.state === 'connecting') { box.innerHTML = '<div class="hint">Connecting…</div>'; return; }
    if (this.state === 'room') {
      box.innerHTML = `<div class="mp-code">Room code <b>${esc(this.code)}</b></div>`
        + `<div class="mp-list">${this.members.map(m => `<span class="${m.id === this.me ? 'me' : ''}">${esc(m.name)}${m.id === this.hostId ? ' <i>host</i>' : ''}${m.id === this.me ? ' <i>you</i>' : ''}</span>`).join('')}</div>`
        + `<div class="hint">${this.isHost ? 'Share the code. Pick the mode and island below, then press START MATCH. Bots fill the other spots.' : 'The host picks the mode and island and starts the match.'}</div>`
        + `<div class="mp-row"><button data-mp="leave">Leave room</button></div>` + err;
      return;
    }
    box.innerHTML = `<div class="mp-row"><input id="mpName" maxlength="16" placeholder="Your name" value="${esc(Profile.d.name || '')}"><button data-mp="create">Create room</button></div>`
      + `<div class="mp-row"><input id="mpCode" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off"><button data-mp="join">Join room</button></div>`
      + `<div class="hint">Create a room and share its 4-letter code. Friends open this same site and join with it (up to 8 players).</div>` + err;
  },
  initUI() {
    const box = $('mpBox'); if (!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-mp]'); if (!b) return; Sfx.init();
      const nm = $('mpName'); if (nm) { Profile.d.name = nm.value.trim().slice(0, 16); Profile.save(); }
      if (b.dataset.mp === 'create') this.create(); else if (b.dataset.mp === 'join') this.join($('mpCode').value); else this.leaveRoom();
    });
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'mpCode') this.join(e.target.value); });
    this.render();
  },

  // ---------------------------------------------------------------- match start
  lookFromEq(eq) {
    eq = eq || {}; const o = cosById('outfit', eq.outfit) || COS.outfit[0], bp = cosById('backpack', eq.backpack), gl = cosById('glider', eq.glider);
    return { outfit: o.id, body: eq.body === 'man' ? 'man' : 'woman', shirt: o.shirt, pants: o.pants, skin: o.skin, sleeve: o.sleeve, hat: o.hair != null ? o.hair : o.hatC, pack: bp && bp.c ? bp.c : 0x444444, glider: gl && gl.c ? gl.c : 0x3aa8ff, gun: 0x444444 };
  },
  // which room member (if any) takes actor slot i instead of a bot
  slotMember(i, mode) {
    const g = this.members.filter(m => m.id !== this.me);
    for (let j = 0; j < g.length; j++) { const slot = mode === 'rumble' ? (j % 2 === 0 ? 16 + j / 2 : 1 + (j - 1) / 2) : j + 1; if (slot === i) return g[j]; }
    return null;
  },
  stormState() { const s = Storm; return { cx: s.cx, cz: s.cz, r: s.r, fx: s.fx, fz: s.fz, fr: s.fr, tx: s.tx, tz: s.tz, tr: s.tr, phase: s.phase, state: s.state, t: s.t, dur: s.dur, dmg: s.dmg, hasNext: s.hasNext }; },
  hostStart() {
    const r1 = v => Math.round(v * 10) / 10;
    this.ids.clear(); for (const a of actors) this.ids.set(a.id, a);
    const roster = actors.map(a => [a.id, a === player ? (Profile.d.name || 'Host').slice(0, 16) : a.name, a.team, (a.npc ? 1 : 0) | (a.boss ? 2 : 0), a.scale, a.maxHp, a === player ? this.lookFromEq(Profile.d.eq) : a.look, a.state, r1(a.pos.x), r1(a.pos.y), r1(a.pos.z)]);
    const pk = Pickups.list.filter(p => p.alive).map(p => [p.id, p.item, r1(p.x), r1(p.y), r1(p.z)]);
    const base = { k: 'start', cfg: { theme: Match.theme, mode: Match.mode, build: Match.build }, roster, pk, storm: this.stormState(), time: Match.time,
      bus: { x: Bus.start.x, y: Bus.start.y, z: Bus.start.z, dx: Bus.dir.x, dz: Bus.dir.z, dur: Bus.dur, t: Bus.t, on: Bus.active } };
    for (const [cid, a] of this.humans) this.send(cid, Object.assign({ you: a.id }, base));
  },
  guestSetup() {
    const d = this.startData, M = Match; this.ids.clear(); this.humans.clear(); let ri = 0, maxId = 0;
    for (const [id, name, team, fl, scale, maxHp, look, st, x, y, z] of d.roster) {
      nextId = id; const mine = id === d.you;
      const a = newActor({ name: mine ? 'You' : String(name).slice(0, 24), team, npc: !!(fl & 1), boss: !!(fl & 2), scale: +scale || 1, hp: maxHp, maxHp, look: look || {}, state: st === 'ground' || st === 'sky' ? st : 'bus' });
      a.pos.set(x, y, z);
      if (mine) { a.isPlayer = true; player = a; }
      else { a.remote = true; a.ri = ri++; BotRig.setLook(a.ri, a.look); a.net = { x, y, z, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, t: 0, fresh: true, ic: 0 }; }
      actors.push(a); this.ids.set(id, a); maxId = Math.max(maxId, id);
    }
    nextId = maxId + 1;
    if (!player) throw new Error('the host did not include you in this match');
    if (!M.build) { player.overMax = 50; player.over = 50; }
    Storm.init(M.mode); Object.assign(Storm, d.storm);
    Pickups.clear(); this.applying = true;
    try { for (const p of d.pk) if (this.okItem(p[1])) Pickups.spawn(p[1], p[2], p[3], p[4], { id: p[0] }); } finally { this.applying = false; }
    if (M.mode === 'rumble' || !d.bus.on) { Bus.active = false; if (Bus.mesh) Bus.mesh.visible = false; if (M.mode === 'rumble') M.respawn(player, true); else { player.state = 'bus'; Bus.init(); Bus.t = Bus.dur + 1; } }
    else { Bus.init(); Bus.start.set(d.bus.x, d.bus.y, d.bus.z); Bus.dir.set(d.bus.dx, 0, d.bus.dz); Bus.dur = d.bus.dur; Bus.t = d.bus.t; Bus.update(0); }
    M.time = d.time || 0;
  },

  // ---------------------------------------------------------------- per-frame traffic
  enc(a) {
    const it = a.inv[a.slot], S = { bus: 0, sky: 1, glide: 2, ground: 3 };
    const code = (S[a.state] || 0) | (a.alive ? 4 : 0) | (a.onGround ? 8 : 0) | (a.inWater ? 16 : 0) | (a.input.ads ? 32 : 0) | (a.pickAnim > 0.2 ? 64 : 0) | (a.useT > 0 ? 128 : 0) | (a.reloadT > 0 ? 256 : 0) | (a.mantleT > 0 ? 512 : 0) | (Math.round(clamp(a.dive || 0, 0, 1) * 3) << 10);
    return [a.id, Math.round(a.pos.x * 10), Math.round(a.pos.y * 10), Math.round(a.pos.z * 10), Math.round(a.yaw * 100), Math.round(a.pitch * 100), code,
      !it || it.kind === 'pick' ? 0 : it.kind === 'weapon' ? 'w' + it.wid + ':' + it.rarity : 'h' + it.hid, Math.ceil(a.hp), Math.ceil(a.shield), a.emote || 0];
  },
  dec(a, s) {
    const n = a.net || (a.net = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, t: 0, fresh: true, ic: 0 });
    const x = s[1] / 10, y = s[2] / 10, z = s[3] / 10, now = performance.now() / 1000, gap = now - n.t;
    if (![x, y, z, s[4], s[5]].every(Number.isFinite)) return;
    const c = s[6] | 0, st = ['bus', 'sky', 'glide', 'ground'][c & 3], alive = !!(c & 4), jump = st !== a.state;
    if (!n.fresh && !jump && gap > 0.02 && gap < 0.6) { n.vx = (x - n.x) / gap; n.vy = (y - n.y) / gap; n.vz = (z - n.z) / gap; } else n.vx = n.vy = n.vz = 0;
    n.x = x; n.y = y; n.z = z; n.yaw = s[4] / 100; n.pitch = clamp(s[5] / 100, -1.5, 1.5); n.t = now;
    if (n.fresh || jump || Math.hypot(a.pos.x - x, a.pos.y - y, a.pos.z - z) > 25) { a.pos.set(x, y, z); a.yaw = n.yaw; n.fresh = false; }
    a.state = st; a.onGround = !!(c & 8); a.inWater = !!(c & 16); a.input.ads = !!(c & 32);
    if ((c & 64) && a.pickAnim <= 0) a.pickAnim = 0.32;
    a.useT = c & 128 ? 1 : 0; a.reloadT = c & 256 ? 1 : 0; a.mantleT = c & 512 ? 0.2 : 0; a.dive = ((c >> 10) & 3) / 3;
    const ic = s[7] || 0;
    if (ic !== n.ic) {
      n.ic = ic;
      if (!ic || typeof ic !== 'string') a.slot = 0;
      else if (ic[0] === 'w') { const [wid, rar] = ic.slice(1).split(':'); if (WEAPONS[wid]) { a.inv[1] = makeWeapon(wid, clamp(+rar | 0, 0, 6)); a.slot = 1; } else a.slot = 0; }
      else if (HEALS[ic.slice(1)]) { a.inv[1] = { kind: 'heal', hid: ic.slice(1), count: 1 }; a.slot = 1; } else a.slot = 0;
    }
    a.hp = clamp(+s[8] || 0, 0, a.maxHp); a.shield = clamp(+s[9] || 0, 0, 100);
    const em = typeof s[10] === 'string' ? s[10].slice(0, 16) : null; if (em !== a.emote) { a.emote = em; a.emoteT = 0; }
    if (alive && !a.alive) { a.alive = true; a.respawnT = 0; a._dissolveAt = 0; Match.recount(); }
    else if (!alive && a.alive && gap < 5 && !a.human) { a.alive = false; Match.recount(); }   // missed the elimination itself: just mark it
  },
  // other players' characters glide toward where they were last reported, slightly ahead
  tickRemote(a, dt) {
    const n = a.net; if (a.pickAnim > 0) a.pickAnim -= dt; if (a.emote) a.emoteT += dt; if (a.invuln > 0) a.invuln -= dt;
    if (!n || !a.alive || a.state === 'bus') return;
    const age = performance.now() / 1000 - n.t, k = 1 - Math.exp(-dt * 12), lead = Math.min(age, 0.22);
    if (age > 0.5) n.vx = n.vy = n.vz = 0;
    a.pos.x += (n.x + n.vx * lead - a.pos.x) * k; a.pos.y += (n.y + n.vy * lead - a.pos.y) * k; a.pos.z += (n.z + n.vz * lead - a.pos.z) * k;
    a.yaw += angDiff(a.yaw, n.yaw) * k; a.pitch += (n.pitch - a.pitch) * k;
    a.vel.set(n.vx, n.vy, n.vz); a.aliveTime += dt;
    if (a.onGround) a.walkPhase += Math.hypot(n.vx, n.vz) * dt * 1.7;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw); a.input.f = clamp((n.vx * fx + n.vz * fz) / 6, -1, 1); a.input.r = clamp((-n.vx * fz + n.vz * fx) / 6, -1, 1);
  },
  update(dt) {
    if (!this.inMatch || !player || Match.state !== 'play') return;
    this.stT -= dt; if (this.stT > 0) return;
    if (!this.isHost) { this.stT = 0.066; this.send('h', { k: 'st', s: this.enc(player) }); return; }
    this.stT = 0.1; this.snN++;
    const all = []; for (const a of actors) if ((a.alive || a.human) && (a.state !== 'bus' || a.human)) all.push([a, this.enc(a)]);
    const extra = { t: Math.round(Match.time * 100) / 100, bt: Bus.active ? Math.round(Bus.t * 100) / 100 : -1, sc: Match.score };
    if (this.snN % 5 === 0) extra.sm = this.stormState();
    for (const [cid, me] of this.humans) {
      const arr = []; for (const [a, s] of all) { if (a === me) continue; const dx = a.pos.x - me.pos.x, dz = a.pos.z - me.pos.z; if (a.human || a === player || dx * dx + dz * dz < NET_RANGE * NET_RANGE) arr.push(s); }
      this.send(cid, Object.assign({ k: 'snap', a: arr }, extra));
    }
  },
  applyStorm(s) {
    const ph = Storm.phase, st = Storm.state;
    for (const k of ['cx', 'cz', 'r', 'fx', 'fz', 'fr', 'tx', 'tz', 'tr', 'phase', 't', 'dur', 'dmg']) if (Number.isFinite(s[k])) Storm[k] = s[k];
    if (['idle', 'wait', 'shrink', 'done'].includes(s.state)) Storm.state = s.state; Storm.hasNext = !!s.hasNext;
    if (Storm.state === st && Storm.phase === ph) return;
    if (Storm.state === 'wait' && Storm.phase > 0) HUD.banner('New safe zone marked', 'Check your map · storm moves in ' + fmtTime(Storm.t), 3);
    else if (Storm.state === 'shrink' && st !== 'shrink' && !Storm.rumble) { HUD.banner('The storm is closing in', Storm.dmg + ' damage per second outside the eye', 3); Sfx.storm(); }
  },

  // ---------------------------------------------------------------- events
  // something happened here that the others need to know about
  emit(ev, pos, range) { if (!this.inMatch) return; if (this.isHost) this.toGuests(ev, 0, pos, range); else this.send('h', ev); },
  toGuests(ev, except, pos, range) {
    for (const [cid, a] of this.humans) {
      if (cid === except) continue;
      if (pos && Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z) > range) continue;
      this.send(cid, ev);
    }
  },
  slim(o) { o = o || {}; const r = {}; for (const k of ['head', 'raw', 'storm', 'fall', 'shark']) if (o[k]) r[k] = 1; for (const k of ['x', 'y', 'z']) if (Number.isFinite(o[k])) r[k] = Math.round(o[k] * 10) / 10; if (o.w) r.w = String(o.w).slice(0, 30); return r; },
  okItem(it) {
    if (!it || typeof it !== 'object') return false;
    if (it.kind === 'weapon') return !!WEAPONS[it.wid] && Number.isFinite(it.rarity) && it.rarity >= 0 && it.rarity <= 6 && Number.isFinite(it.mag);
    if (it.kind === 'heal') return !!HEALS[it.hid] && it.count > 0 && it.count <= 20;
    if (it.kind === 'ammo') return !!AMMO[it.ammo] && it.count > 0 && it.count <= 999;
    if (it.kind === 'mats') return !!MATS[it.mat] && it.count > 0 && it.count <= 999;
    return false;
  },
  chestNear(x, z) { let best = null, bd = 9; for (const c of W.chests) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } } return best; },
  dropHuman(cid) {
    const a = this.humans.get(cid); if (!a) return; this.humans.delete(cid);
    if (a.alive && Match.state === 'play') { this.applying = true; try { eliminate(a, null, {}); } finally { this.applying = false; } this.toGuests({ k: 'elim', id: a.id, src: 0, o: {} }); }
    a.human = 0; a.remote = true;
  },
  onMsg(from, d) {
    if (d.k === 'start') {
      if (from !== this.hostId || this.isHost) return;
      if (Match.state !== 'lobby') { this.inMatch = false; Match.toLobby(); }
      this.startData = d; this.inMatch = true; Sfx.init();
      Match.start({ mode: ['solo', 'squads', 'rumble'].includes(d.cfg.mode) ? d.cfg.mode : 'solo', build: !!d.cfg.build, ranked: false, theme: THEMES[d.cfg.theme] ? d.cfg.theme : 'greenvale' });
      return;
    }
    if (!this.inMatch || Match.state === 'lobby') return;
    if (Match.state === 'loading') { if (!this.isHost && from === this.hostId && d.k !== 'snap' && this.queue.length < 4000) this.queue.push(d); return; }   // still building the island: catch up after
    if (this.isHost) {
      const me = this.humans.get(from); if (!me) return;
      if (d.k === 'st') { if (Array.isArray(d.s)) { d.s[0] = me.id; this.dec(me, d.s); } }
      else if (d.k === 'dmg') { const t = this.ids.get(d.id); if (!t || !t.alive) return; d.src = me.id; if (t.human) this.send(t.human, d); else if (!t.remote) damageActor(t, clamp(+d.dmg || 0, 0, 400), me, d.o || {}); }
      else if (d.k === 'take') { const p = Pickups.byId.get(d.id); if (p && p.alive) Pickups.remove(p); }
      else if (d.k === 'drop') { if (this.okItem(d.item) && Number.isFinite(d.x + d.y + d.z)) Pickups.spawn(d.item, d.x, d.y, d.z, { pop: Array.isArray(d.pop) ? { x: d.pop[0], y: d.pop[1] - 1, z: d.pop[2] } : null, ttl: Match.mode === 'rumble' ? 75 : 0 }); }
      else if (d.k === 'chest') { const c = this.chestNear(d.x, d.z); if (c && !c.opened && !c.falling) openChest(c, me); }
      else if (d.k === 'elim') {
        if (!me.alive) return; const pos = me.pos.clone();
        this.applying = true; try { eliminate(me, this.ids.get(d.src) || null, d.o || {}); } finally { this.applying = false; }
        if (Array.isArray(d.items)) scatterLoot(d.items.filter(it => this.okItem(it)).slice(0, 16), pos);
        this.toGuests({ k: 'elim', id: me.id, src: d.src, o: d.o || {} }, from);
      }
      else if (d.k === 'bye') this.dropHuman(from);
      else if (['bp', 'bd', 'hv', 'shot', 'rk'].includes(d.k)) { d.id = me.id; this.applyWorld(d); this.toGuests(d, from, d.k === 'shot' || d.k === 'rk' ? me.pos : null, NET_RANGE); }
      return;
    }
    if (from !== this.hostId) return;
    if (d.k === 'snap') {
      if (Number.isFinite(d.t) && Math.abs(Match.time - d.t) > 0.3) Match.time = d.t;
      if (d.bt >= 0) { if (Bus.active && Math.abs(Bus.t - d.bt) > 0.4) Bus.t = d.bt; } else if (Bus.active) Bus.t = Bus.dur + 1;
      if (Array.isArray(d.sc)) Match.score = [d.sc[0] | 0, d.sc[1] | 0];
      if (Array.isArray(d.a)) for (const s of d.a) { const a = this.ids.get(s[0]); if (a && a !== player) this.dec(a, s); }
      if (d.sm) this.applyStorm(d.sm);
    }
    else if (d.k === 'dmg') { if (player && player.alive) damageActor(player, clamp(+d.dmg || 0, 0, 400), this.ids.get(d.src) || null, d.o || {}); }
    else if (d.k === 'end') { if (Match.state === 'play') { HUD.toast('The host ended the match'); Match.showResults(); } }
    else this.applyWorld(d);
  },
  flush() { const q = this.queue.splice(0); for (const d of q) { try { this.onMsg(this.hostId, d); } catch (e) { console.error(e); } } },
  // replay something another player (or the host's world) did
  applyWorld(d) {
    this.applying = true;
    try {
      const A = id => this.ids.get(id) || null, V = a => Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite);
      if (d.k === 'elim') { const t = A(d.id); if (t && t.alive && t !== player) eliminate(t, A(d.src), d.o || {}); }
      else if (d.k === 'bp') { const t = d.t; if (t && ['wall', 'floor', 'ramp'].includes(t.type) && [t.gx, t.gy, t.gz, t.dir].every(Number.isInteger) && typeof t.key === 'string' && t.key.length < 40) Build.place({ mats: { wood: 99, brick: 99, metal: 99 }, mat: MATS[d.mat] ? d.mat : 'wood', remote: true }, { type: t.type, gx: t.gx, gy: t.gy, gz: t.gz, dir: t.dir, key: t.key }); }
      else if (d.k === 'bd') { const p = Build.map.get(d.key); if (p) Build.damage(p, clamp(+d.dmg || 0, 0, 2000), null); }
      else if (d.k === 'hv') { let best = null, bd = 4; for (const hv of W.harv) { if (hv.dead || hv.vehicle) continue; const q = (hv.x - d.x) ** 2 + (hv.z - d.z) ** 2; if (q < bd) { bd = q; best = hv; } } if (best) destroyHarv(best); }
      else if (d.k === 'shot') {
        if (!V(d.m) || !Array.isArray(d.h)) return; const a = A(d.id), col = Number.isFinite(d.c) ? d.c : 0xfff1a8;
        for (const h of d.h.slice(0, 4)) if (V(h)) FX.tracer(d.m[0], d.m[1], d.m[2], h[0], h[1], h[2], col);
        Sfx.shot(String(d.ty || 'ar'), d.m[0], d.m[1], d.m[2]); FX.burst(d.m[0], d.m[1], d.m[2], 0xffd27a, 2, 1.5, 0.06, 0.12, 0); if (a) a.lastShotT = Match.time;
      }
      else if (d.k === 'rk') { const a = A(d.id); if (a && V(d.o) && V(d.d) && WEAPONS[d.wid]) { const st = wstat(makeWeapon(d.wid, clamp(d.r | 0, 0, 6))); if (st.proj) Rockets.spawn(a, new THREE.Vector3(d.o[0], d.o[1], d.o[2]), new THREE.Vector3(d.d[0], d.d[1], d.d[2]).normalize(), st, true); } }
      else if (d.k === 'pk+') { if (this.okItem(d.item) && Number.isFinite(d.x + d.y + d.z)) Pickups.spawn(d.item, d.x, d.y, d.z, { id: d.id, pop: V(d.pop) ? { x: d.pop[0], y: d.pop[1] - 1, z: d.pop[2] } : null, ttl: +d.ttl || 0 }); }
      else if (d.k === 'pk-') { const p = Pickups.byId.get(d.id); if (p) Pickups.remove(p); }
      else if (d.k === 'chest') { const c = this.chestNear(d.x, d.z); if (c && !c.opened) openChest(c, A(d.by) || player); }
      else if (d.k === 'finish') { if (!Match.ending && Match.state === 'play') Match.finish(d.w | 0); }
    } finally { this.applying = false; }
  },
};
