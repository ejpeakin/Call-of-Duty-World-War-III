// =====================================================================
//  Rescue Tags + Comeback Towers (Duos and Squads)
//  A fallen teammate drops a glowing Rescue Tag. A teammate who grabs it within 90 seconds can carry
//  it to any Comeback Tower and bring them back: they launch out of the tower on a glider with a
//  pistol. Each tower then recharges for a minute. Bot teammates do this for you too.
// =====================================================================
const TAG_TTL = 90, REBOOT_TIME = 4, TOWER_CD = 60;
const Reboot = {
  on: false, towers: [], mine: null, mineT: 0, gt: 0, hintK: '',
  // towers sit just outside the first dozen towns; positions come from the island's seed, so every
  // player in a shared match gets the same ones
  setup(mode) {
    this.on = mode === 'duos' || mode === 'squads'; this.towers = []; this.mine = null; this.hintK = '';
    if (!this.on || !W.theme) return;
    const R = mulberry32(W.theme.seed * 31 + 17), L = [];
    for (const p of W.pois.slice(0, 12)) {
      for (let k = 0; k < 18; k++) {
        const a = R() * TAU, d = p.r + 6 + R() * 10, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, h = groundH(x, z);
        if (h < W.waterY + 0.8 || Math.abs(x) > W.half - 20 || Math.abs(z) > W.half - 20) continue;
        if ([[2, 0], [-2, 0], [0, 2], [0, -2]].some(([ox, oz]) => Math.abs(groundH(x + ox, z + oz) - h) > 1.2)) continue;
        Grid.query(x - 2.6, z - 2.6, x + 2.6, z + 2.6, L); if (L.some(c => !c.dead && c.maxY > h + 0.4 && c.minY < h + 3)) continue;
        this.towers.push(this.makeTower(x, h, z, this.towers.length)); break;
      }
    }
  },
  makeTower(x, y, z, i) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.userData.tower = true;
    const metal = lam(0x2b3242), dark = lam(0x161b26);
    const glow = new THREE.MeshBasicMaterial({ color: 0x3ff0d0 }), soft = new THREE.MeshBasicMaterial({ color: 0x3ff0d0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const add = (geo, mat, px, py, pz, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = shadow; m.receiveShadow = true; g.add(m); return m; };
    add(new THREE.CylinderGeometry(2.3, 2.6, 0.35, 16), dark, 0, 0.17, 0);                                          // pad
    const pad = add(new THREE.TorusGeometry(1.75, 0.07, 6, 32), glow, 0, 0.37, 0, false); pad.rotation.x = Math.PI / 2;  // glowing rim on the pad
    add(new THREE.CylinderGeometry(0.2, 0.32, 6.2, 8), metal, 0, 3.4, 0);                                             // mast
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU, s = add(new THREE.BoxGeometry(0.16, 3.4, 0.16), metal, Math.cos(a) * 0.75, 1.7, Math.sin(a) * 0.75); s.rotation.set(-Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22); }
    const ring = add(new THREE.TorusGeometry(1.0, 0.1, 8, 28), glow, 0, 6.3, 0, false); ring.rotation.x = Math.PI / 2;
    const orb = add(new THREE.SphereGeometry(0.42, 16, 12), glow, 0, 7.0, 0, false);
    const beam = add(new THREE.CylinderGeometry(0.55, 0.55, 46, 12, 1, true), soft, 0, 30, 0, false);               // tall light so you can spot it
    W.group.add(g);
    Grid.add({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, minY: y, maxY: y + 7.4, kind: 'static', mat: 'metal', tough: true });
    return { i, x, y, z, mesh: g, ring, orb, beam, glow, soft, cd: 0, _r: true };
  },
  actor(id) { return actors.find(a => a.id === id) || null; },
  nameOf(tag) { const a = this.actor(tag.aid); return a ? (a === player ? 'you' : a.name) : tag.name; },
  // the Rescue Tag a fallen character leaves for their team (or null): only when someone on the team is
  // still standing, and only on teams with a real player (bot-only teams don't use tags)
  tagFor(t) {
    if (!this.on || t.npc || Match.state !== 'play' || Match.mode === 'tutorial') return null;
    const team = actors.filter(a => a.team === t.team && !a.npc);
    if (!team.some(a => a !== t && a.alive)) return null;
    if (!team.some(a => a.isPlayer || a.human || a.friend)) return null;
    return { kind: 'tag', aid: t.id, team: t.team, name: String(t === player ? (Profile.d.name || 'Teammate') : t.name).slice(0, 24) };
  },
  take(a, p) {   // a teammate grabs a tag off the ground
    const it = p.item; if (!p.alive || it.kind !== 'tag' || it.team !== a.team) return false;
    Pickups.remove(p); (a.tags || (a.tags = [])).push({ aid: it.aid, team: it.team, name: it.name });
    if (a === player) { Sfx.pickup(); HUD.toast('Got ' + this.nameOf(it) + '’s Rescue Tag. Take it to a Comeback Tower!'); HUD.dirty = true; }
    return true;
  },
  tagGone(p) {   // remember what happened to your own tag (for the hint while you are out)
    if (!player || p.item.aid !== player.id || player.alive) return;
    this.mine = p.ttl && p.age >= p.ttl - 1.5 ? 'expired' : 'carried'; this.mineT = 0;
  },
  nearest(x, z, ready) { let b = null, bd = 1e9; for (const t of this.towers) { if (ready && t.cd > 0) continue; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; b = t; } } return b; },
  // finish at a tower: everyone whose tag you carry comes back
  complete(a, tw) {
    if (!tw || tw.cd > 0 || !a.tags || !a.tags.length) return false;
    const by = a === player ? (Profile.d.name || 'Your teammate') : a.name;
    for (const tg of a.tags.splice(0)) {
      const t = this.actor(tg.aid); if (!t || t.alive) continue;
      if (!t.remote) Match.reboot(t, tw.i, a === player && t !== player ? 'You' : by);
      else Net.rebootRemote(t, tw.i, by);
    }
    this.cool(tw.i); if (Net.inMatch && !Net.applying) Net.emit({ k: 'rbc', tw: tw.i });
    if (a === player) HUD.dirty = true;
    return true;
  },
  cool(i) {
    const tw = this.towers[i]; if (!tw) return; tw.cd = TOWER_CD;
    if (camera.position.distanceToSquared(_v4.set(tw.x, tw.y, tw.z)) < 160 * 160) { FX.burst(tw.x, tw.y + 7, tw.z, 0x3ff0d0, 24, 6, 0.9, 0.16, -3); FX.flash(tw.x, tw.y + 7, tw.z, 3, 0x3ff0d0, 0.6); }
    if (Sfx.vol(tw.x, tw.y, tw.z) > 0.15) Sfx.chest();
  },
  update(dt) {
    if (!this.on) return;
    for (const tw of this.towers) {
      if (tw.cd > 0) tw.cd = Math.max(0, tw.cd - dt);
      const ready = tw.cd <= 0;
      if (tw._r !== ready) { tw._r = ready; const c = ready ? 0x3ff0d0 : 0xff4d5e; tw.glow.color.setHex(c); tw.soft.color.setHex(c); tw.beam.visible = ready; }
      if (tw.mesh.visible) { tw.ring.rotation.z += dt * (ready ? 1.6 : 0.3); tw.orb.position.y = 7.0 + Math.sin(gameTime * 2 + tw.i) * 0.12; }
    }
    // a tag is useless once its whole team is out (the host or a solo game decides)
    this.gt -= dt;
    if (this.gt <= 0) { this.gt = 1; if (!Net.guest) for (const p of Pickups.list) if (p.alive && p.item.kind === 'tag' && !Match.teamAlive(p.item.team)) Pickups.remove(p); }
    this.mineT += dt;
    this.hint();
  },
  // one line under the top of the screen: what to do next
  hint() {
    const el = $('rbHint'); if (!el) return; let t = '';
    if (player && Match.state === 'play' && !Match.ending) {
      if (!player.alive && Match.teamAlive(player.team)) {
        const p = Pickups.list.find(q => q.alive && q.item.kind === 'tag' && q.item.aid === player.id);
        const carrier = actors.find(a => a.alive && a.tags && a.tags.some(g => g.aid === player.id));
        if (carrier && carrier.rebootT > 0) t = carrier.name + ' is bringing you back…';
        else if (carrier) t = carrier.name + ' has your Rescue Tag! Hang on…';
        else if (p) t = 'Your Rescue Tag is where you fell · ' + Math.max(0, Math.ceil(p.ttl - p.age)) + 's. A teammate can take it to a Comeback Tower to bring you back.';
        else if (this.mine === 'carried') t = 'A teammate has your Rescue Tag! Hang on…';
        else if (this.mine === 'expired' && this.mineT < 8) t = 'Your Rescue Tag ran out. Keep cheering on your team!';
      } else if (player.alive && player.tags && player.tags.length) {
        const tw = this.nearest(player.pos.x, player.pos.z, true), who = player.tags.map(g => this.nameOf(g)).join(' and ');
        t = 'Carrying ' + who + '’s Rescue Tag · ' + (tw ? 'Comeback Tower ' + Math.round(Math.hypot(tw.x - player.pos.x, tw.z - player.pos.z)) + ' m' : 'every Comeback Tower is recharging');
      } else if (player.alive) {
        const p = Pickups.list.find(q => q.alive && q.item.kind === 'tag' && q.item.team === player.team && q.item.aid !== player.id);
        if (p) t = this.nameOf(p.item) + ' dropped a Rescue Tag · ' + Math.max(0, Math.ceil(p.ttl - p.age)) + 's left · ' + Math.round(Math.hypot(p.x - player.pos.x, p.z - player.pos.z)) + ' m. Grab it!';
      }
    }
    if (t !== this.hintK) { this.hintK = t; el.textContent = t; el.hidden = !t; }
  },
  // on-screen markers: your teammates' tags, and the nearest ready tower while you carry one
  points() {
    const out = []; if (!this.on || !player || !player.alive || Match.state !== 'play') return out;
    for (const p of Pickups.list) if (p.alive && p.item.kind === 'tag' && p.item.team === player.team && p.item.aid !== player.id) out.push({ key: 'tag' + p.id, x: p.x, y: p.y + 1.6, z: p.z, label: this.nameOf(p.item) + '’s tag', cls: 'tag' });
    if (player.tags && player.tags.length) { const tw = this.nearest(player.pos.x, player.pos.z, true); if (tw) out.push({ key: 'tw' + tw.i, x: tw.x, y: tw.y + 8, z: tw.z, label: 'Comeback Tower', cls: 'tower' }); }
    return out;
  },
  drawMap(g, S, cx, cz, scale, big) {
    if (!this.on) return;
    for (const tw of this.towers) {
      const [x, y] = mapXY(tw.x, tw.z, cx, cz, scale, S); if (x < -10 || y < -10 || x > S + 10 || y > S + 10) continue;
      const r = big ? 7 : 5; g.fillStyle = tw.cd > 0 ? '#ff4d5e' : '#3ff0d0'; g.strokeStyle = '#06222a'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#06222a'; g.fillRect(x - r * 0.55, y - 1, r * 1.1, 2); g.fillRect(x - 1, y - r * 0.55, 2, r * 1.1);
    }
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 180);
    for (const p of Pickups.list) {
      if (!p.alive || p.item.kind !== 'tag' || !player || p.item.team !== player.team) continue;
      const [x, y] = mapXY(p.x, p.z, cx, cz, scale, S), r = (big ? 7 : 5) * (0.8 + 0.3 * pulse);
      g.fillStyle = 'rgba(63,240,208,' + pulse + ')'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); g.stroke();
    }
  },
  // bot teammates: grab a tag on the ground, then carry it to the nearest ready tower and bring them back
  botJob(a) {
    if (!this.on) return false;
    const ai = a.ai, j = ai.rescue;
    if (a.tags && a.tags.length) {
      if (!j || j.kind !== 'tower' || j.tw.cd > 0) { const tw = this.nearest(a.pos.x, a.pos.z, true); if (!tw) return false; ai.rescue = { kind: 'tower', tw }; }
      return true;
    }
    if (j && j.kind === 'tag' && j.p.alive) return true;
    let best = null, bd = 280;
    for (const p of Pickups.list) { if (!p.alive || p.item.kind !== 'tag' || p.item.team !== a.team) continue; const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z); if (d < bd) { bd = d; best = p; } }
    ai.rescue = best ? { kind: 'tag', p: best } : null; return !!best;
  },
  botStep(a, dt) {
    const ai = a.ai, j = ai.rescue; if (!j) { ai.mode = 'roam'; a.rebootT = 0; return; }
    if (j.kind === 'tag') {
      const p = j.p; if (!p.alive) { ai.rescue = null; ai.mode = 'roam'; return; }
      if (Math.hypot(p.x - a.pos.x, p.z - a.pos.z) < 1.8) { this.take(a, p); ai.rescue = null; ai.t = 0; return; }
      moveTo(a, p, dt, true); return;
    }
    const tw = j.tw; if (tw.cd > 0) { ai.rescue = null; a.rebootT = 0; ai.t = 0; return; }
    if (Math.hypot(tw.x - a.pos.x, tw.z - a.pos.z) > 2.6) { a.rebootT = 0; moveTo(a, { x: tw.x + 1.6, z: tw.z }, dt, true); return; }
    lookAround(a, dt); a.rebootT = (a.rebootT || 0) + dt;
    if (a.rebootT >= REBOOT_TIME) { a.rebootT = 0; this.complete(a, tw); ai.rescue = null; ai.mode = 'roam'; ai.t = 0; }
  },
};
