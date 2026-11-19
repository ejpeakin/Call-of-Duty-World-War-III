// =====================================================================
//  HUD
// =====================================================================
const HUD = {
  dirty: true, nums: [], dds: [], slots: [], toastEl: null, toastT: 0, bannerT: 0, hitT: 0, hurtT: 0, slow: 0, last: {},
  init() {
    const hb = $('hotbar');
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div'); d.className = 'slot'; d.innerHTML = '<span class="gi"></span><span class="key">' + (i + 1) + '</span><span class="ct"></span><span class="ic"></span>';
      d.addEventListener('touchstart', e => { e.preventDefault(); if (player && player.alive) { switchSlot(player, i); Build.active = false; } }, { passive: false });
      d.addEventListener('mousedown', e => { if (!Input.locked && player && player.alive) { switchSlot(player, i); Build.active = false; } e.stopPropagation(); });
      hb.appendChild(d); this.slots.push(d);
    }
    for (let i = 0; i < 28; i++) { const d = document.createElement('div'); d.className = 'dn'; d.style.display = 'none'; $('dmgNums').appendChild(d); this.nums.push({ el: d, t: 0 }); }
    for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'dd'; $('dmgDir').appendChild(d); this.dds.push({ el: d, t: 0, x: 0, z: 0 }); }
    const t = document.createElement('div'); t.style.cssText = 'position:absolute;left:50%;top:calc(50% + 120px);transform:translateX(-50%);background:rgba(14,10,31,.8);padding:6px 14px;border-radius:9px;font-size:13px;font-weight:600;opacity:0;transition:opacity .25s;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis';
    $('hud').appendChild(t); this.toastEl = t;
    $('mats').innerHTML = MAT_ORDER.map(m => `<div class="mat" data-m="${m}"><i style="background:${hexCss(MATS[m].color)}"></i><span>0</span></div>`).join('');
  },
  startMatch() {
    $('hud').hidden = false; $('killfeed').innerHTML = ''; this.dirty = true; this.last = {};
    $('scoreBox').hidden = Match.mode !== 'rumble'; $('aliveLbl').textContent = Match.mode === 'rumble' ? 'to win' : 'left';
    $('mats').style.display = Match.build ? '' : 'none'; $('buildbar').style.display = Match.build && !Input.touch.on ? '' : 'none';
    $('teamList').style.display = Match.mode === 'squads' || Match.mode === 'duos' ? '' : 'none';
    $('death').hidden = true; $('results').hidden = true; $('pause').hidden = true; $('bigmap').hidden = true;
    for (const n of this.nums) { n.t = 0; n.el.style.display = 'none'; }
  },
  feed(html, mine) {
    const d = document.createElement('div'); d.innerHTML = html; if (mine) d.className = 'me';
    const kf = $('killfeed'); kf.prepend(d); while (kf.children.length > 5) kf.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  },
  toast(text) { this.toastEl.textContent = text; this.toastEl.style.opacity = 1; this.toastT = 2.2; },
  banner(title, sub, dur = 3) { $('bannerT').textContent = title; $('bannerS').textContent = sub || ''; $('banner').style.opacity = 1; this.bannerT = dur; },
  hitmark(head) { const h = $('hitmarker'); h.className = head ? 'head' : ''; h.style.opacity = 1; this.hitT = 0.16; },
  dmgNum(x, y, z, val, kind) {
    const n = this.nums.find(n => n.t <= 0) || this.nums[0];
    n.t = 0.9; n.x = x + rnd(-0.3, 0.3); n.y = y; n.z = z; n.el.textContent = val; n.el.style.display = 'block';
    n.el.style.color = { head: '#ffd84a', shield: '#7cc8ff', hp: '#ffffff', mat: '#d9f7c4', build: '#c9c0b0' }[kind] || '#fff';
    n.el.style.fontSize = kind === 'mat' ? '14px' : kind === 'build' ? '15px' : kind === 'head' ? '24px' : '20px';
  },
  hurt(src, dmg, o) {
    this.hurtT = Math.min(0.6, 0.15 + dmg / 80); this.dirty = true;
    if (src && src !== player) { const d = this.dds.find(d => d.t <= 0) || this.dds[0]; d.t = 1.2; d.x = src.pos.x; d.z = src.pos.z; }
    if (o && o.storm) Sfx.noise(0.2, 300, 1, 0.15, 'lowpass');
  },
  setSlot(i, it, on) {
    const el = this.slots[i]; const key = (it ? (it.kind + (it.wid || it.hid || '') + (it.rarity || 0) + (it.count || '') + (it.kind === 'weapon' ? it.mag : '')) : 'e') + on;
    if (el._k === key) return; el._k = key;
    el.classList.toggle('on', on);
    const ic = el.querySelector('.ic'), ct = el.querySelector('.ct'), gi = el.querySelector('.gi');
    gi.style.backgroundImage = it ? 'url(' + Icons.get(it) + ')' : 'none';
    if (!it) { el.classList.remove('r'); ic.textContent = ''; ct.textContent = ''; return; }
    if (it.kind === 'pick') { el.classList.remove('r'); ic.textContent = 'TOOL'; ct.textContent = ''; return; }
    el.classList.add('r'); el.style.setProperty('--rc', RARITY[itemRarity(it)].css);
    if (it.kind === 'weapon') { ic.textContent = WEAPONS[it.wid].short; ct.textContent = WEAPONS[it.wid].melee ? '' : it.mag; }
    else { ic.textContent = HEALS[it.hid].short; ct.textContent = it.count; }
  },
  update(dt) {
    const a = player; if (!a) return;
    const v = Cam.view || a;
    // timers
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.style.opacity = 0; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').style.opacity = 0; }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').style.opacity = 0; }
    if (this.hurtT > 0) { this.hurtT -= dt; $('hurtVig').style.opacity = clamp(this.hurtT * 1.6, 0, 1); }
    { const down = !!(player && player.alive && player.crawl && Cam.view === player); if ($('downVig').hidden === down) $('downVig').hidden = !down;
      if (down) { const has = player.inv.some(it => it && it.kind === 'heal' && it.hid === 'medkit'), tip = has ? 'Switch to your Med-Kit and hold ' + (Input.pad.on ? 'RT' : Keys.of('fire')) + ' to heal' : 'Find a Med-Kit to get back up'; if (this.last.down !== tip) { this.last.down = tip; $('downTip').textContent = tip; } } }
    // damage numbers
    for (const n of this.nums) {
      if (n.t <= 0) continue; n.t -= dt; n.y += dt * 1.3;
      _v1.set(n.x, n.y, n.z).project(camera);
      if (n.t <= 0 || _v1.z > 1) { n.el.style.display = 'none'; if (n.t <= 0) continue; else continue; }
      n.el.style.display = 'block';
      n.el.style.transform = `translate(${(_v1.x * 0.5 + 0.5) * innerWidth - 10}px,${(-_v1.y * 0.5 + 0.5) * innerHeight - 12}px)`; n.el.style.opacity = clamp(n.t * 2.2, 0, 1);
    }
    for (const d of this.dds) {
      if (d.t <= 0) { d.el.style.opacity = 0; continue; }
      d.t -= dt; const ang = angDiff(a.yaw, Math.atan2(d.x - a.pos.x, d.z - a.pos.z));
      d.el.style.transform = `rotate(${-ang * 180 / Math.PI}deg)`; d.el.style.opacity = clamp(d.t, 0, 1);
    }
    // vitals (of the viewed actor)
    const set = (id, w) => { const k = id + 'w'; if (this.last[k] !== w) { this.last[k] = w; $(id).style.width = w + '%'; } };
    const txt = (id, s) => { if (this.last[id] !== s) { this.last[id] = s; $(id).textContent = s; } };
    set('hpFill', v.hp / v.maxHp * 100); txt('hpTxt', Math.ceil(v.hp)); set('shFill', v.shield); txt('shTxt', Math.ceil(v.shield) + (!Match.build && v.over > 0.5 ? ' +' + Math.ceil(v.over) : ''));
    // hotbar + ammo
    const it = v.inv[v.slot];
    for (let i = 0; i < 6; i++) this.setSlot(i, v.inv[i], i === v.slot && !Build.active);
    if (it && it.kind === 'weapon') {
      const st = wstat(it);
      txt('wName', itemName(it)); $('wName').style.color = RARITY[it.rarity].css;
      txt('magTxt', st.melee ? '' : String(it.mag)); txt('resTxt', st.melee ? '' : v.isPlayer ? '/ ' + v.ammo[st.ammo] : '');
    } else if (it && it.kind === 'heal') { txt('wName', HEALS[it.hid].name); $('wName').style.color = RARITY[HEALS[it.hid].rarity].css; txt('magTxt', String(it.count)); txt('resTxt', ''); }
    else { txt('wName', v.vehicle ? 'Driving · ' + Math.round(Math.abs(v.vehicle.speed) * 3.6) + ' km/h' : 'Harvesting Tool'); $('wName').style.color = '#fff'; txt('magTxt', ''); txt('resTxt', ''); }
    if (Match.build) {
      const mk = MAT_ORDER.map(m => v.mats[m]).join(',') + v.mat;
      if (this.last.mats !== mk) { this.last.mats = mk; [...$('mats').children].forEach(el => { const m = el.dataset.m; el.querySelector('span').textContent = v.mats[m]; el.classList.toggle('on', m === v.mat); }); }
      const bk = Build.active + Build.piece + Input.pad.on;
      if (this.last.bb !== bk) { this.last.bb = bk; const pad = Input.pad.on; $('buildbar').innerHTML = [['wall', Keys.of('wall'), 'Wall'], ['ramp', Keys.of('ramp'), 'Ramp'], ['floor', Keys.of('floor'), 'Floor'], ['cone', Keys.of('cone'), 'Cone']].map(([p, k, n]) => `<div class="${Build.active && Build.piece === p ? 'on' : ''}">${pad ? '' : '<kbd>' + k + '</kbd>'}${n}</div>`).join('') + (pad ? '<div><kbd>B</kbd>Build</div><div><kbd>RB</kbd>Piece</div><div><kbd>LB</kbd>Material</div>' : '<div><kbd>' + esc(Keys.of('material')) + '</kbd>Material</div>'); }
    }
    // dark purple tint while standing in the storm
    { const inS = v.alive && v.state !== 'bus' && Storm.state !== 'idle' && Storm.outside(v.pos.x, v.pos.z); const st = $('stormTint'); if (st.classList.contains('on') !== inS) st.classList.toggle('on', inS); }
    // stamina
    { const sv = v.stamina ?? 100; $('stFill').style.width = sv.toFixed(1) + '%'; $('stBar').classList.toggle('tired', !!v.exhausted); }
    // reload arc beside the crosshair: fills bottom to top while reloading
    { const ra = $('reloadArc'), rl = v === player && a.reloadT > 0 && it && it.kind === 'weapon';
      if (ra.hidden === !!rl) ra.hidden = !rl;
      if (rl) { const p = clamp(1 - a.reloadT / Math.max(0.01, wstat(it).reload), 0, 1); ra.querySelector('.fg').style.strokeDasharray = (p * 100).toFixed(1) + ' 100'; } }
    // crosshair
    const ch = $('crosshair'); const isPick = !it || it.kind !== 'weapon' || Build.active;
    if (this.last.chp !== isPick) { this.last.chp = isPick; ch.classList.toggle('pick', isPick); }
    if (it && it.kind === 'weapon') {
      // size the crosshair to the real bullet / pellet spread on screen (same rules as fireWeapon)
      const st = wstat(it), sg = st.type === 'shotgun' && !Build.active, ads = !!a.input.ads;
      const moving = Math.hypot(a.vel.x, a.vel.z) > 1.5;
      let sp = (ads ? st.ads : st.spread) * (moving ? 1.35 : 1); if (!a.onGround && !a.inWater) sp *= 1.6;
      const want = Math.tan(sp) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2;
      this.sprS = this.sprS == null ? want : lerp(this.sprS, want, Math.min(1, dt * 14));
      const px = Math.round(sg ? Math.max(8, this.sprS) : 3 + this.sprS);
      if (this.last.spr !== px) { this.last.spr = px; ch.style.setProperty('--spr', px + 'px'); }
      if (this.last.chsg !== sg + '' + ads) { this.last.chsg = sg + '' + ads; ch.classList.toggle('sg', sg); ch.classList.toggle('ads', sg && ads); }
    } else if (this.last.chsg !== 'no') { this.last.chsg = 'no'; ch.classList.remove('sg', 'ads'); }
    ch.style.display = Cam.scoped || v !== a || a.state === 'bus' ? 'none' : '';
    $('scope').hidden = !Cam.scoped;
    // prompt
    const pr = $('prompt'), c = Interact.cur;
    if (a.alive && a.state === 'bus') { pr.style.display = 'block'; pr.innerHTML = '<kbd>' + (Input.pad.on ? 'A' : Input.touch.on ? 'JUMP' : esc(Keys.of('jump')).toUpperCase()) + '</kbd>Jump from the bus'; pr.style.setProperty('--pc', '#4fb0ff'); }
    else if (a.alive && a.state === 'sky') { pr.style.display = 'block'; pr.innerHTML = '<kbd>' + (Input.pad.on ? 'A' : Input.touch.on ? 'JUMP' : esc(Keys.of('jump')).toUpperCase()) + '</kbd>Open glider early'; pr.style.setProperty('--pc', '#3aa8ff'); }
    else if (c && a.alive) { pr.style.display = 'block'; const k = (Input.pad.on ? 'X' : Input.touch.on ? 'USE' : Keys.of('use')); if (this.last.pr !== c.label + k) { this.last.pr = c.label + k; pr.innerHTML = '<kbd>' + k + '</kbd>' + esc(c.label); } pr.style.setProperty('--pc', c.color); }
    else { pr.style.display = 'none'; this.last.pr = null; }
    // channel bar
    let chl = null, chf = 0;
    if (a.useT > 0) { chl = 'Using ' + HEALS[a.inv[a.useSlot] ? a.inv[a.useSlot].hid : 'bandage'].name; chf = 1 - a.useT / a.useDur; }
    else if (a.reloadT > 0 && it && it.kind === 'weapon') { chl = 'Reloading'; chf = 1 - a.reloadT / wstat(it).reload; }
    else if (a.channel) { chl = a.channel.label; chf = 1 - a.channel.t / a.channel.dur; }
    $('channel').hidden = !chl; if (chl) { txt('chLbl', chl); $('chFill').style.width = (chf * 100) + '%'; }
    // storm, counts (10 Hz)
    this.slow -= dt;
    if (this.slow <= 0) {
      this.slow = 0.1;
      let st;
      if (Bus.active) st = 'Bus route · ' + fmtTime(Bus.dur - Bus.t);
      else if (Storm.state === 'wait') st = 'Storm moves in ' + fmtTime(Storm.t);
      else if (Storm.state === 'shrink') st = 'Storm closing · ' + fmtTime(Storm.t);
      else if (Storm.state === 'done') st = Storm.rumble ? 'Rumble zone locked' : 'Final circle';
      else st = 'Storm forming';
      txt('stormTxt', st);
      if (Match.mode === 'rumble') { txt('aliveN', '40'); txt('scoreBlue', String(Match.score[0])); txt('scoreRed', String(Match.score[1])); }
      else txt('aliveN', String(Match.aliveCount));
      txt('elimN', String(v.kills));
      const out = v.alive && v.state !== 'bus' && Storm.state !== 'idle' && Storm.outside(v.pos.x, v.pos.z);
      $('stormVig').style.opacity = out ? 1 : 0;
      // boss bar
      let boss = null; for (const b of actors) if (b.boss && b.alive && b.pos.distanceTo(v.pos) < 55) boss = b;
      $('bossbar').hidden = !boss || Match.mode === 'rumble'; if (boss) { txt('bossName', boss.name); $('bossFill').style.width = (boss.hp / boss.maxHp * 100) + '%'; }
      $('eventTag').hidden = LiveEvent.state !== 'active';
      $('eventTag').textContent = 'Live event · Skywhale crossing';
      const spec = !a.alive && Match.mode !== 'rumble' && v !== a;
      $('specBar').hidden = !spec; if (spec) txt('specBar', 'Spectating ' + v.name + ' · ' + v.kills + ' elims · ' + (Input.touch.on ? 'tap' : 'click or Space') + ' to switch');
      if (Match.mode === 'squads' || Match.mode === 'duos') {
        const mates = actors.filter(m => m.team === player.team && !m.npc);
        $('teamList').innerHTML = mates.map(m => `<div class="tm ${m.alive ? '' : 'dead'}">${esc(m === player ? 'You' : m.name)}<div class="tb"><i style="width:${m.alive ? m.shield * 0.7 : 0}px;background:var(--shield)"></i><i style="width:${m.alive ? m.hp * 0.7 : 0}px;background:var(--hp)"></i></div></div>`).join('');
      }
    }
    drawMinimap();
    if (!$('bigmap').hidden) drawBigMap();
  },
};

function mapXY(x, z, cx, cz, scale, S) { return [(x - cx) * scale + S / 2, (z - cz) * scale + S / 2]; }
function drawMarkers(g, S, cx, cz, scale, big) {
  // storm
  if (Storm.state !== 'idle') {
    const [sx, sy] = mapXY(Storm.cx, Storm.cz, cx, cz, scale, S);
    g.fillStyle = 'rgba(120,40,220,0.45)'; g.beginPath(); g.rect(-5, -5, S + 10, S + 10); g.arc(sx, sy, Math.max(0.5, Storm.r * scale), 0, TAU); g.fill('evenodd');
    g.strokeStyle = 'rgba(200,150,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(sx, sy, Math.max(0.5, Storm.r * scale), 0, TAU); g.stroke();
    if (Storm.hasNext) { const [nx, ny] = mapXY(Storm.tx, Storm.tz, cx, cz, scale, S); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.beginPath(); g.arc(nx, ny, Math.max(0.5, Storm.tr * scale), 0, TAU); g.stroke(); g.setLineDash([]); }
  }
  if (Bus.active) {
    const [ax, ay] = mapXY(Bus.start.x, Bus.start.z, cx, cz, scale, S), [bx, by] = mapXY(Bus.start.x + Bus.dir.x * 940, Bus.start.z + Bus.dir.z * 940, cx, cz, scale, S);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
    const [px, py] = mapXY(Bus.pos.x, Bus.pos.z, cx, cz, scale, S); g.fillStyle = '#3a8bff'; g.beginPath(); g.arc(px, py, big ? 7 : 5, 0, TAU); g.fill();
  }
  Reboot.drawMap(g, S, cx, cz, scale, big);
  for (const c of W.chests) if (c.kind === 'supply' && !c.opened) { const [x, y] = mapXY(c.x, c.z, cx, cz, scale, S); g.fillStyle = '#3aa8ff'; g.fillRect(x - 4, y - 4, 8, 8); g.strokeStyle = '#fff'; g.strokeRect(x - 4, y - 4, 8, 8); }
  if (big || scale > 0.5) {
    g.font = (big ? 'bold 13px ' : 'bold 10px ') + 'Rubik, system-ui, sans-serif'; g.textAlign = 'center';
    for (const p of W.sites) { const [x, y] = mapXY(p.x, p.z, cx, cz, scale, S); if (x < -60 || x > S + 60 || y < -20 || y > S + 20) continue; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillText(p.name, x + 1, y + 1); g.fillStyle = p.kind === 'vault' ? '#ffe066' : '#fff'; g.fillText(p.name, x, y); }
  }
  for (const m of actors) {
    if (!m.alive || m === player || m.npc || m.state === 'bus') continue;
    const fr = m.friend || m.human, mate = m.team === player.team && Match.mode !== 'solo';
    if (!fr && m.team !== player.team) continue;
    const [x, y] = mapXY(m.pos.x, m.pos.z, cx, cz, scale, S);
    if (fr) {   // friends from the room: a diamond with an outline, and their name on the big map
      const r = big ? 7 : 5; g.fillStyle = mate ? '#5ff0a0' : '#ffb84a'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); g.stroke();
      if (big) { g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(m.name, x + 1, y - r - 4); g.fillStyle = '#fff'; g.fillText(m.name, x, y - r - 5); }
      continue;
    }
    g.fillStyle = Match.mode === 'rumble' ? '#7cc8ff' : '#ffd84a'; g.beginPath(); g.arc(x, y, big ? 4 : 3, 0, TAU); g.fill();
  }
  const v = Cam.view || player; if (!v) return;
  const p = v.state === 'bus' ? Bus.pos : v.pos; const [x, y] = mapXY(p.x, p.z, cx, cz, scale, S);
  g.save(); g.translate(x, y); g.rotate(Math.PI - (v.state === 'bus' ? Math.atan2(Bus.dir.x, Bus.dir.z) : v.yaw));
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function drawMinimap() {
  const c = $('minimap'), g = c.getContext('2d'), S = c.width; if (!W.mapCanvas) return;
  const v = Cam.view || player; const p = v ? (v.state === 'bus' ? Bus.pos : v.pos) : { x: 0, z: 0 };
  const span = v && (v.state === 'bus' || v.state === 'sky') ? 760 : 260, scale = S / span, mp = W.mapCanvas.width / W.size;
  g.fillStyle = hexCss(W.theme.water); g.fillRect(0, 0, S, S);
  g.drawImage(W.mapCanvas, (p.x - span / 2 + W.half) * mp, (p.z - span / 2 + W.half) * mp, span * mp, span * mp, 0, 0, S, S);
  drawMarkers(g, S, p.x, p.z, scale, false);
}
function drawBigMap() {
  const c = $('bigmapC'), g = c.getContext('2d'), S = c.width; const scale = S / (W.R * 2.3);
  g.fillStyle = hexCss(W.theme.water); g.fillRect(0, 0, S, S);
  const span = W.R * 2.3, mp = W.mapCanvas.width / W.size;
  g.drawImage(W.mapCanvas, (-span / 2 + W.half) * mp, (-span / 2 + W.half) * mp, span * mp, span * mp, 0, 0, S, S);
  drawMarkers(g, S, 0, 0, scale, true);
}

// ---------------------------------------------------------------- item pictures for the hotbar, rendered once from the 3D models
const Icons = {
  cache: new Map(), rt: null, scene: null, cam: null,
  key(it) { return it.kind === 'weapon' ? 'w' + it.wid + '|' + it.rarity + '|' + Profile.d.eq.wrap : it.kind === 'pick' ? 'p' + Profile.d.eq.pickaxe : 'h' + it.hid; },
  get(it) {
    const k = this.key(it); if (this.cache.has(k)) return this.cache.get(k);
    let url = ''; try { url = this.render(it); } catch (e) { console.warn('icon', e); }
    this.cache.set(k, url); return url;
  },
  render(it) {
    const S = 256, SH = 128;   // wide frame: guns are long and thin
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(S, SH); this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.95)); const d = new THREE.DirectionalLight(0xffffff, 0.75); d.position.set(-1, 2, 3); this.scene.add(d);
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20); this.cam.position.set(0, 0, 5);
    }
    const holder = new THREE.Group(); let obj;
    if (it.kind === 'weapon') { obj = gunModel(it, cosById('wrap', Profile.d.eq.wrap).c); obj.rotation.set(0.12, Math.PI / 2, 0); }
    else if (it.kind === 'pick') { obj = new THREE.Group(); pickModel(Profile.d.eq.pickaxe, obj); obj.rotation.set(0, Math.PI / 2, 0.75); }
    else { obj = heldModel(it.hid); obj.rotation.set(0.35, 0.5, 0); }
    holder.add(obj); this.scene.add(holder); holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const h = Math.max(sz.x / 2, sz.y) * 0.54; this.cam.left = c.x - h * 2; this.cam.right = c.x + h * 2; this.cam.top = c.y + h; this.cam.bottom = c.y - h; this.cam.position.set(c.x, c.y, 5); this.cam.updateProjectionMatrix();
    const prevT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    renderer.setRenderTarget(this.rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(this.scene, this.cam);
    const px = new Uint8Array(S * SH * 4); renderer.readRenderTargetPixels(this.rt, 0, 0, S, SH, px);
    renderer.setRenderTarget(prevT); renderer.setClearColor(prevC, prevA);
    this.scene.remove(holder);
    const big = document.createElement('canvas'); big.width = S; big.height = SH; const bx = big.getContext('2d'), img = bx.createImageData(S, SH);
    for (let y = 0; y < SH; y++) img.data.set(px.subarray((SH - 1 - y) * S * 4, (SH - y) * S * 4), y * S * 4);
    bx.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); out.width = 128; out.height = 64; const ox = out.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(big, 0, 0, 128, 64);
    return out.toDataURL('image/png');
  },
};

// ---------------------------------------------------------------- waypoints over friends in a shared match
// Every player from the room gets a marker with their name and distance; it slides to the screen edge when they are off screen.
const Waypoints = {
  els: new Map(), v: new THREE.Vector3(),
  // one marker on screen; pinned to the edge (or the bottom, when behind you) if it is off-screen
  pin(key, cls, x, y, z, name, seen) {
    const box = $('wps'); seen.add(key);
    let el = this.els.get(key);
    if (!el) { el = document.createElement('div'); el.className = 'wp'; el.innerHTML = '<i></i><b></b><span></span>'; box.appendChild(el); this.els.set(key, el); }
    if (el._c !== cls) { el._c = cls; el.className = 'wp ' + cls; }
    const cam = camera, W2 = innerWidth / 2, H2 = innerHeight / 2, m = 46;
    const v = this.v.set(x, y, z), cz = v.clone().applyMatrix4(cam.matrixWorldInverse).z;
    v.project(cam); let px0 = v.x, py0 = -v.y; const behind = cz > 0;
    if (behind) { px0 = -px0; py0 = -py0; }
    const off = behind || Math.abs(px0) > 1 || Math.abs(py0) > 1;
    let px = W2 + px0 * W2, py = H2 + py0 * H2;
    if (off) {
      const k = Math.min((W2 - m) / Math.max(1e-3, Math.abs(px - W2)), (H2 - m) / Math.max(1e-3, Math.abs(py - H2)));
      if (behind) { px = clamp(W2 + px0 * W2 * 3, m, W2 * 2 - m); py = H2 * 2 - m - 70; }   // behind you: along the bottom, on the side it is on
      else { px = W2 + (px - W2) * Math.min(1, k); py = H2 + (py - H2) * Math.min(1, k); }
    }
    const d = Math.round(Math.hypot(x - player.pos.x, y - player.pos.y, z - player.pos.z));
    el.style.transform = 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)';
    el.classList.toggle('off', off);
    if (el._n !== name) { el._n = name; el.querySelector('b').textContent = name; }
    const ds = d + ' m'; if (el._d !== ds) { el._d = ds; el.querySelector('span').textContent = ds; }
    el.style.opacity = d < 6 ? 0.35 : 1;
  },
  update() {
    if (!$('wps')) return;
    const seen = new Set();
    if (player && Match.state === 'play') {
      if (Net.inMatch) for (const a of actors) {   // friends from the room
        if (!(a.friend || a.human) || a === player || !a.alive || a.state === 'bus') continue;
        this.pin(a, a.team === player.team && Match.mode !== 'solo' ? 'mate' : '', a.pos.x, a.pos.y + 2.5 * (a.scale || 1), a.pos.z, a.name + (a.crawl ? ' (down)' : ''), seen);
      }
      for (const w of Reboot.points()) this.pin(w.key, w.cls, w.x, w.y, w.z, w.label, seen);   // Rescue Tags and Comeback Towers
    }
    for (const [k, el] of this.els) if (!seen.has(k)) { el.remove(); this.els.delete(k); }
  },
};

