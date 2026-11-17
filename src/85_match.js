// =====================================================================
//  Match: storm, flying bus, live event, modes, endings, rewards
// =====================================================================
// tuned for the 530 m island: one more early circle, longer moves while the storm is large
const PHASES = [
  { wait: 70, shrink: 60, r: 400, dmg: 1 },
  { wait: 60, shrink: 52, r: 250, dmg: 1 },
  { wait: 52, shrink: 46, r: 150, dmg: 2 },
  { wait: 45, shrink: 40, r: 85, dmg: 4 },
  { wait: 40, shrink: 33, r: 45, dmg: 7 },
  { wait: 32, shrink: 27, r: 20, dmg: 10 },
  { wait: 24, shrink: 30, r: 0, dmg: 15 },
];
const STORM_START = 900;
const Storm = {
  cx: 0, cz: 0, r: 900, fx: 0, fz: 0, fr: 900, tx: 0, tz: 0, tr: 900, phase: -1, state: 'idle', t: 0, dur: 1, dmg: 1, tick: 1, hasNext: false, rumble: false,
  init(mode) {
    Object.assign(this, { cx: 0, cz: 0, r: STORM_START, phase: -1, state: 'idle', t: 0, dmg: 1, tick: 1, hasNext: false, rumble: mode === 'rumble' });
    stormMesh.visible = true;
  },
  start() {
    if (this.rumble) {
      const p = pick(W.pois.length ? W.pois : [{ x: 0, z: 0 }]);
      Object.assign(this, { fx: this.cx, fz: this.cz, fr: this.r, tx: p.x, tz: p.z, tr: 120, hasNext: true, state: 'shrink', t: 32, dur: 32, dmg: 3, phase: 0 });
      return;
    }
    this.nextPhase();
  },
  nextPhase() {
    this.phase++;
    if (this.rumble || this.phase >= PHASES.length) { this.state = 'done'; this.hasNext = false; return; }
    const P = PHASES[this.phase], maxOff = Math.max(0, this.r - P.r) * (this.phase === 0 ? 0.55 : 0.9);
    let bx = this.cx, bz = this.cz;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * maxOff; const x = this.cx + Math.cos(a) * d, z = this.cz + Math.sin(a) * d;
      if (this.phase === 0 && Math.hypot(x, z) > W.R * 0.55) continue;
      bx = x; bz = z; if (groundH(x, z) > W.waterY + 0.5) break;
    }
    Object.assign(this, { fx: this.cx, fz: this.cz, fr: this.r, tx: bx, tz: bz, tr: P.r, hasNext: true, state: 'wait', t: P.wait });
    if (this.phase > 0) HUD.banner('New safe zone marked', 'Check your map · storm moves in ' + fmtTime(P.wait), 3);
  },
  update(dt) {
    if (this.state === 'wait') {
      this.t -= dt;
      if (this.t <= 0 && !Net.guest) { const P = PHASES[this.phase]; this.state = 'shrink'; this.t = this.dur = P.shrink; this.dmg = P.dmg; HUD.banner('The storm is closing in', P.dmg + ' damage per second outside the eye', 3); Sfx.storm(); }
    } else if (this.state === 'shrink') {
      this.t -= dt; const k = 1 - Math.max(0, this.t) / this.dur;
      this.cx = lerp(this.fx, this.tx, k); this.cz = lerp(this.fz, this.tz, k); this.r = lerp(this.fr, this.tr, k);
      if (this.t <= 0 && !Net.guest) { this.cx = this.tx; this.cz = this.tz; this.r = this.tr; this.nextPhase(); }
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 1;
      if (this.state !== 'idle' && !Net.guest) for (const a of actors) if (a.alive && !a.npc && a.state !== 'bus' && a.invuln <= 0 && this.outside(a.pos.x, a.pos.z)) damageActor(a, this.dmg, null, { raw: true, storm: true });
    }
    stormMesh.visible = this.state !== 'idle' && this.r < STORM_START - 20;
    stormMesh.scale.set(Math.max(0.5, this.r), 760, Math.max(0.5, this.r)); stormMesh.position.set(this.cx, 120, this.cz);
  },
  safe() { return this.hasNext ? { x: this.tx, z: this.tz, r: this.tr } : { x: this.cx, z: this.cz, r: this.r }; },
  urgent() { return this.state === 'shrink' || (this.state === 'wait' && this.t < 25) || this.state === 'done'; },
  outside(x, z) { return Math.hypot(x - this.cx, z - this.cz) > this.r; },
};

// ---------------------------------------------------------------- the flying bus ("Sky Coach")
// The Sky Coach: a blue bus slung under a blue airship.
function buildBusModel() {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // bus
  add(B(3.4, 3.0, 11), lam(0x2a6fe0), 0, 0, 0);
  add(B(3.45, 0.9, 11.05), lam(0xfff1d6), 0, -0.8, 0);
  add(B(3.5, 0.9, 9.4), basic(0x1d2a3a), 0, 0.55, -0.4);
  add(B(3.0, 1.1, 0.1), basic(0x1d2a3a), 0, 0.5, 5.52);
  add(B(3.2, 0.25, 10.6), lam(0x163a8a), 0, 1.6, 0);
  for (const sx of [-1, 1]) {
    add(B(0.5, 0.3, 0.05), basic(0xfff3c4), sx * 1.2, -0.7, 5.53);
    add(B(0.5, 0.3, 0.05), basic(0xff3040), sx * 1.2, -0.7, -5.53);
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12).rotateZ(Math.PI / 2), lam(0x18181c), sx * 1.5, -1.6, 3.4);
    add(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12).rotateZ(Math.PI / 2), lam(0x18181c), sx * 1.5, -1.6, -3.4);
  }
  // airship
  const ship = new THREE.Group(); ship.position.y = 10.2; g.add(ship);
  const sph = new THREE.SphereGeometry(1, 28, 18);
  const hull = add(sph, new THREE.MeshLambertMaterial({ color: 0x3d7ff0, emissive: 0x0e2a6e }), 0, 0, 0, ship); hull.scale.set(4.3, 4.3, 12.5);
  const band = add(sph, lam(0xf4f6fb), 0, 0, 1.5, ship); band.scale.set(4.36, 4.36, 1.3);
  const band2 = add(sph, lam(0xf4f6fb), 0, 0, -3.2, ship); band2.scale.set(4.2, 4.2, 0.7);
  const nose = add(sph, lam(0x1f4fb8), 0, 0, 11.3, ship); nose.scale.set(1.6, 1.6, 1.4);
  for (const [x, y, rz] of [[0, 3.6, 0], [0, -3.6, 0], [3.6, 0, Math.PI / 2], [-3.6, 0, Math.PI / 2]]) {
    const f = add(B(0.35, 4.2, 4.2), lam(0x163a8a), x, y, -10.2, ship); f.rotation.z = rz;
    const t = add(B(0.4, 1.2, 1.6), lam(0xf4f6fb), x * 1.35, y * 1.35, -11.2, ship); t.rotation.z = rz;
  }
  g.userData.props = [];
  for (const sx of [-1, 1]) {
    add(B(2.6, 0.3, 0.6), lam(0x163a8a), sx * 4.6, -1.2, -1.5, ship);
    add(new THREE.CylinderGeometry(0.75, 0.9, 3.0, 14).rotateX(Math.PI / 2), lam(0xd9dee8), sx * 6.0, -1.2, -1.5, ship);
    const prop = new THREE.Group(); prop.position.set(sx * 6.0, -1.2, -3.2); ship.add(prop);
    add(B(0.22, 3.2, 0.08), lam(0x22222a), 0, 0, 0, prop); add(B(3.2, 0.22, 0.08), lam(0x22222a), 0, 0, 0, prop);
    g.userData.props.push(prop);
  }
  // gondola cables from the bus roof up to the hull
  for (const sx of [-1.25, 1.25]) for (const sz of [-4.2, 0, 4.2]) {
    const c = add(B(0.07, 4.9, 0.07), lam(0x2a2a30), sx, 4.0, sz); c.rotation.z = -sx * 0.06;
  }
  add(B(2.2, 0.3, 9.5), lam(0x2a2a30), 0, 6.15, 0);
  return g;
}
const Bus = {
  pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), start: new THREE.Vector3(), speed: 40, dur: 30, t: 0, mesh: null, active: false,
  init() {
    if (!this.mesh) { this.mesh = buildBusModel(); scene.add(this.mesh); }
    const a = Math.random() * TAU; this.dir.set(Math.cos(a), 0, Math.sin(a));
    const off = rnd(-170, 170), px = -this.dir.z, pz = this.dir.x;
    this.start.set(-this.dir.x * 730 + px * off, 450, -this.dir.z * 730 + pz * off);
    this.dur = 1460 / this.speed; this.t = 0; this.active = true; this.mesh.visible = true; this.update(0);
  },
  update(dt) {
    this.t += dt; this.pos.copy(this.start).addScaledVector(this.dir, this.speed * this.t);
    this.mesh.position.set(this.pos.x, this.pos.y + Math.sin(this.t * 1.3) * 0.6, this.pos.z);
    this.mesh.rotation.set(0, Math.atan2(this.dir.x, this.dir.z), Math.sin(this.t * 0.9) * 0.04);
    for (const p of this.mesh.userData.props) p.rotation.z += dt * 30;
    if (this.t > this.dur && this.active) {
      for (const a of actors) if (a.state === 'bus' && !a.remote) busJump(a);
      this.active = false; this.mesh.visible = false; if (!Net.guest) Storm.start();
      HUD.banner('The storm is forming', 'Find gear, then head for the safe zone', 3);
    }
  },
  timeNear(x, z) { const s = (x - this.start.x) * this.dir.x + (z - this.start.z) * this.dir.z; return clamp(s / this.speed, 1.5, this.dur - 1); },
  lateral(x, z) { return Math.abs((x - this.start.x) * -this.dir.z + (z - this.start.z) * this.dir.x); },
};

// ---------------------------------------------------------------- live event: the Skywhale crossing
function buildWhale() {
  const g = new THREE.Group(); const s = new THREE.SphereGeometry(1, 20, 14);
  const body = new THREE.Mesh(s, lam(0x2b3f8a)); body.scale.set(14, 11, 42); g.add(body);
  const belly = new THREE.Mesh(s, lam(0xa9bdf0)); belly.scale.set(11.5, 7, 36); belly.position.set(0, -4.2, 2); g.add(belly);
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(s, basic(i % 2 ? 0x2fe0d0 : 0xb48cff)); m.scale.setScalar(1.1 + Math.random()); m.position.set(rnd(-7, 7), 9 + Math.random() * 2, rnd(-28, 24)); g.add(m); }
  const tail = new THREE.Group(); tail.position.set(0, 1, -40); g.add(tail);
  const tm = new THREE.Mesh(new THREE.BoxGeometry(30, 1.4, 9), lam(0x2b3f8a)); tm.position.z = -6; tail.add(tm);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 7), lam(0x3b54a8)); f.position.set(sx * 17, -4, 8); f.rotation.z = sx * 0.45; g.add(f); g.userData['fin' + sx] = f; }
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(s, basic(0xfff8e0)); e.scale.setScalar(1.4); e.position.set(sx * 11.5, 0, 30); g.add(e); }
  g.userData.tail = tail; return g;
}
const LiveEvent = {
  state: 'off', at: 0, t: 0, mesh: null, dir: new THREE.Vector3(), start: new THREE.Vector3(), drops: [], dropped: 0, dur: 52,
  init(mode) {
    if (this.mesh) { scene.remove(this.mesh); this.mesh = null; }
    for (const d of this.drops) if (d.balloon && d.balloon.parent) d.balloon.parent.remove(d.balloon);
    this.drops = []; this.dropped = 0; this.state = mode === 'rumble' ? 'off' : 'pending'; this.at = Bus.dur + 120;
  },
  begin() {
    this.state = 'active'; this.t = 0; this.mesh = buildWhale(); scene.add(this.mesh);
    const z = Storm.safe(); const a = Math.random() * TAU; this.dir.set(Math.cos(a), 0, Math.sin(a));
    this.start.set(z.x - this.dir.x * 1100, 235, z.z - this.dir.z * 1100);
    HUD.banner('LIVE EVENT · The Skywhale Crossing', 'Look up. It is dropping supply crates inside the safe zone.', 5);
    Sfx.whale();
  },
  update(dt) {
    if (this.state === 'pending' && Match.time >= this.at) this.begin();
    if (this.state === 'active') {
      this.t += dt; const k = this.t / this.dur;
      const p = _v1.copy(this.start).addScaledVector(this.dir, 2200 * k);
      this.mesh.position.set(p.x, p.y + Math.sin(this.t * 0.8) * 5, p.z);
      this.mesh.rotation.set(Math.sin(this.t * 0.8) * 0.05, Math.atan2(this.dir.x, this.dir.z), 0);
      this.mesh.userData.tail.rotation.x = Math.sin(this.t * 1.6) * 0.35;
      this.mesh.userData['fin-1'].rotation.x = this.mesh.userData.fin1.rotation.x = Math.sin(this.t * 1.6) * 0.2;
      const tint = Math.sin(clamp(k, 0, 1) * Math.PI);
      if (W.skyTop) { _c1.copy(W.skyTop).lerp(_c2.setHex(0x3a1d7a), tint * 0.75); const top = _c1.clone(); _c1.copy(W.skyHor).lerp(_c2.setHex(0x5fe3d6), tint * 0.6); setSky(top, _c1); }
      if (this.dropped < 3 && k > 0.38 + this.dropped * 0.1) { this.dropSupply(p.x + rnd(-20, 20), p.z + rnd(-20, 20)); this.dropped++; Sfx.tone(160, 1.2, 'sine', 0.2, -60); }
      if (this.t > this.dur) { this.state = 'done'; scene.remove(this.mesh); this.mesh = null; setSky(W.skyTop, W.skyHor); }
    }
    for (const d of this.drops) {
      if (!d.c.falling) continue;
      const g = d.ground, c = d.c; const sp = c.y - g > 45 ? 26 : 4.5;
      c.y = Math.max(g, c.y - sp * dt); c.mesh.position.y = c.y; d.balloon.position.set(c.x, c.y + 3.6, c.z);
      if (c.y <= g) { c.falling = false; d.balloon.parent.remove(d.balloon); FX.burst(c.x, c.y + 0.5, c.z, 0x5ab8ff, 14, 4, 0.7, 0.15); }
    }
  },
  dropSupply(x, z) {
    const s = Storm.safe(); const dd = Math.hypot(x - s.x, z - s.z);
    if (dd > s.r * 0.8 && s.r > 5) { const k = s.r * 0.8 / dd; x = s.x + (x - s.x) * k; z = s.z + (z - s.z) * k; }
    const g = topSurface(x, z); if (g < W.waterY) return;
    const c = addChest('supply', x, 200, z, Math.random() * TAU, null); c.falling = true;
    const bal = new THREE.Group(); const sp = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10), lam(0x3aa8ff)); bal.add(sp);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.5, 14), lam(0xffffff)); bal.add(band);
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.2, 0.04), lam(0xdddddd)); str.position.y = -2.4; bal.add(str);
    W.group.add(bal); this.drops.push({ c, balloon: bal, ground: g });
  },
};

// ---------------------------------------------------------------- match controller
let PlayerRig = null;
const Match = {
  state: 'lobby', mode: 'solo', build: true, ranked: false, theme: 'greenvale', time: 0, aliveCount: 0, teamsAlive: 0,
  score: [0, 0], ending: false, endT: 0, spectate: null, paused: false, result: null, deathShown: false, hasWinner: false,
  start(o) {
    Object.assign(this, o); MapRotation.began();   // the 30-day island timer starts with a player's first match
    this.state = 'loading'; $('loading').hidden = false; $('lobby').hidden = true; $('ldFill').style.width = '15%';
    $('ldMsg').textContent = 'Raising ' + THEMES[this.theme].name + '…';
    Sfx.init();
    setTimeout(() => {
      try { this.setup(); }
      catch (e) { console.error(e); $('ldMsg').textContent = 'Something went wrong while building the island: ' + e.message; }
    }, 40);
  },
  setup() {
    Net.building = true;
    genWorld(this.theme);
    $('ldFill').style.width = '80%';
    actors.length = 0; nextId = 1; ElimFX.clear(); CharPool.clear(); BotRig.hideAll(); Trails.clear();
    if (Net.guest) Net.guestSetup(); else {
    Net.humans.clear();
    player = newActor({ name: 'You', isPlayer: true, team: 0 });
    actors.push(player);
    const N = this.mode === 'rumble' ? 32 : 100;
    for (let i = 1; i < N; i++) {
      const team = this.mode === 'solo' ? i : this.mode === 'squads' ? Math.floor(i / 4) : (i < 16 ? 0 : 1);
      const hm = Net.hosting ? Net.slotMember(i, this.mode) : null;
      if (hm) { const h = newActor({ name: hm.name, team, ri: i - 1, look: Net.lookFromEq(hm.eq), remote: true, human: hm.id }); BotRig.setLook(h.ri, h.look); actors.push(h); Net.humans.set(hm.id, h); continue; }   // a friend takes this spot
      const b = newActor({ name: botName(), team, ri: i - 1, look: randomLook() });
      initBotAI(b, clamp(rnd(0.15, 0.85) + (this.ranked ? 0.18 : 0), 0, 1));
      if (this.mode === 'squads' && team === 0) b.leader = player;
      BotRig.setLook(b.ri, b.look); actors.push(b);
    }
    if (this.mode !== 'rumble') for (const v of W.vaults) this.spawnVault(v);
    for (const a of actors) if (!this.build && !a.npc) { a.overMax = 50; a.over = 50; }
    this.time = 0; this.firstLander = null; this.sharkKills = 0; this.score = [0, 0]; this.ending = false; this.spectate = null; this.paused = false; this.result = null; this.deathShown = false; this.hasWinner = false;
    Storm.init(this.mode);
    if (this.mode === 'rumble') {
      Bus.active = false; if (Bus.mesh) Bus.mesh.visible = false;
      for (const a of actors) if (!a.npc) this.respawn(a, true);
      Storm.start();
    } else {
      Bus.init();
      for (const a of actors) {
        if (a.npc) continue; a.state = 'bus';
        if (!a.ai) continue;
        let tx, tz; const r = Math.random();
        if (r < 0.62 && W.pois.length) { const p = pick(W.pois); const ang = Math.random() * TAU, d = Math.random() * p.r; tx = p.x + Math.cos(ang) * d; tz = p.z + Math.sin(ang) * d; }
        else if (r < 0.7 && W.vaults.length) { const v = pick(W.vaults); tx = v.x + rnd(-25, 25); tz = v.z + rnd(-25, 25); }
        else { for (let k = 0; k < 10; k++) { const ang = Math.random() * TAU, d = Math.sqrt(Math.random()) * W.R * 0.85; tx = Math.cos(ang) * d; tz = Math.sin(ang) * d; if (groundH(tx, tz) > W.waterY + 1) break; } }
        a.ai.drop.set(tx, 0, tz);
        const lat = Bus.lateral(tx, tz); a.ai.deployH = lat > 320 ? 280 : lat > 200 ? 180 : lat > 120 ? 110 : lat > 60 ? 80 : GLIDER_AUTO + Math.random() * 15;
        a.ai.jumpAt = a.leader ? Bus.dur - 0.5 : Bus.timeNear(tx, tz) - Math.random() * 2.5;
      }
    }
    }
    this.time = this.time || 0; this.firstLander = null; this.sharkKills = 0; if (Net.guest) { this.score = [0, 0]; this.ending = false; this.spectate = null; this.paused = false; this.result = null; this.deathShown = false; this.hasWinner = false; }
    if (this.mode !== 'rumble') player.shield = 50;   // everyone drops in with half a shield
    LiveEvent.init(this.mode); if (Net.inMatch) LiveEvent.state = 'off'; else Creatures.spawn();
    if (PlayerRig) scene.remove(PlayerRig.root);
    PlayerRig = makeRig(Profile.d.eq); scene.add(PlayerRig.root);
    sun.castShadow = !!Profile.d.shadows && !SOFT_GL;
    this.recount();
    this.state = 'play'; Net.building = false;
    if (Net.hosting) Net.hostStart(); else if (Net.guest) Net.flush();
    $('loading').hidden = true; HUD.startMatch();
    Input.requestLock();
    if (this.mode !== 'rumble') HUD.banner('Welcome aboard the Sky Coach', Input.pad.on ? 'Press A to jump out' : IS_TOUCH ? 'Tap JUMP to leave the bus' : 'Press SPACE to jump out', 4);
    else HUD.banner('Storm Rumble', 'First team to 40 eliminations wins. You respawn.', 4);
  },
  spawnVault(v) {
    const isW = v.boss === 'warden';
    const boss = newActor({
      name: isW ? 'The Warden' : 'The Foreman', team: -1, npc: true, boss: true, scale: 1.55, hp: 1100, maxHp: 1100, state: 'ground', ri: actors.length - 1,
      look: isW ? { shirt: 0x1d2230, pants: 0x14161e, skin: 0x9aa4b0, sleeve: 0x2a3040, hat: 0xffe066, pack: 0x14161e, glider: 0x000000, gun: 0xffe066 }
        : { shirt: 0x8a3a1a, pants: 0x3a2a1a, skin: 0xd9a37a, sleeve: 0x6b2a10, hat: 0xff7a2a, pack: 0x4a3020, glider: 0x000000, gun: 0xffe066 },
    });
    boss.inv[1] = makeWeapon(isW ? 'stormcaller' : 'sledge', 5); boss.slot = 1;
    boss.pos.set(v.x, v.fy, v.z + 2); initBotAI(boss, 0.5); boss.ai.err = 0.06; boss.ai.home = boss.pos.clone();
    BotRig.setLook(boss.ri, boss.look); actors.push(boss);
    for (let k = 0; k < 2; k++) {
      const g = newActor({ name: (isW ? 'Vault Guard' : 'Forge Guard'), team: -1, npc: true, hp: 150, maxHp: 150, shield: 50, state: 'ground', ri: actors.length - 1, look: { shirt: 0x3a3f48, pants: 0x22252b, skin: 0xc49a74, sleeve: 0x3a3f48, hat: isW ? 0xffe066 : 0xff7a2a, pack: 0x22252b, glider: 0, gun: 0x3f95ff } });
      g.inv[1] = makeWeapon(k ? 'shotgun' : 'ar', 2); g.slot = 1; g.pos.set(v.x + (k ? 5 : -5), v.fy, v.z - 8);
      initBotAI(g, 0.45); g.ai.home = g.pos.clone(); BotRig.setLook(g.ri, g.look); actors.push(g);
    }
  },
  rumbleKit(a) {
    const w1 = rollWeapon(RAR_FLOOR), w2 = makeWeapon(pick(['shotgun', 'smg']), rndi(0, 2));
    a.inv = [{ kind: 'pick' }, w1, w2, { kind: 'heal', hid: 'mini', count: 3 }, null, null]; a.slot = 1;
    a.ammo = { light: 120, medium: 120, heavy: 12, shells: 30, rockets: 2 };
    if (this.build) a.mats = { wood: 300, brick: 150, metal: 100 };
  },
  respawn(a, first) {
    const z = Storm.safe(); const p = zonePoint(first ? 0.9 : 0.8);
    a.alive = true; a.hp = 100; a.shield = 50; a.stamina = 100; a.exhausted = false; a.over = a.overMax; a.state = 'sky'; a.vel.set(0, -10, 0); a.invuln = first ? 0 : 2.5;
    a.pos.set(p.x + rnd(-6, 6), Math.max(groundH(p.x, p.z), W.waterY) + 95, p.z + rnd(-6, 6)); a.respawnT = 0; a.useT = 0; a.reloadT = 0;
    if (a.ai) { a.ai.target = null; a.ai.mode = 'roam'; a.ai.drop.set(p.x, 0, p.z); a.ai.deployH = GLIDER_AUTO; a.ai.loot = null; }
    if (!first) this.rumbleKit(a);   // everything they carried was dropped where they fell
    if (a === player) HUD.dirty = true;
    void z;
  },
  recount() { const s = new Set(); let n = 0; for (const a of actors) if (a.alive && !a.npc) { n++; s.add(a.team); } this.aliveCount = n; this.teamsAlive = s.size; },
  teamAlive(t) { return actors.some(a => a.alive && !a.npc && a.team === t); },
  onElim(t, src, o = {}) {
    if (t.npc) { if (t.boss) HUD.banner(t.name + ' has fallen', 'Its Mythic weapon is on the floor of the vault', 4); return; }
    if (this.mode === 'rumble') {
      if (src && src !== t && src.team !== t.team) this.score[src.team]++; else this.score[1 - t.team]++;
      t.respawnT = 5;
      if (t === player) HUD.banner('Eliminated', 'Respawning in 5 seconds', 3);
      if (!this.ending && !Net.guest && (this.score[0] >= 40 || this.score[1] >= 40)) this.finish(this.score[0] >= 40 ? 0 : 1);
      return;
    }
    this.recount();
    if (t === player) this.spectate = src && src.alive ? src : null;
    if (!this.deathShown && !this.teamAlive(player.team)) { player.placement = this.teamsAlive + 1; this.deathShown = true; this.showDeath(src, o); }
    else if (t === player) HUD.banner('You are out', 'Your squad fights on. Spectating a teammate.', 3);
    if (this.teamsAlive <= 1 && !this.ending && !Net.guest) { const w = actors.find(a => a.alive && !a.npc); this.finish(w ? w.team : -2); }
  },
  showDeath(src, o = {}) {
    if (document.pointerLockElement) document.exitPointerLock();
    $('dPlace').innerHTML = '#' + player.placement + ' <small>of ' + (this.mode === 'squads' ? 25 : 100) + '</small>';
    $('dTitle').textContent = this.mode === 'squads' ? 'Squad eliminated' : 'Eliminated';
    $('dSub').textContent = src && src !== player ? 'Taken out by ' + src.name + '. ' + player.kills + ' elimination' + (player.kills === 1 ? '' : 's') + ' this match.' : 'Taken out by ' + (o.shark ? 'a shark' : o.storm ? 'the storm' : o.fall ? 'a long fall' : 'the island') + '. ' + player.kills + ' elimination' + (player.kills === 1 ? '' : 's') + ' this match.';
    $('death').hidden = false;
  },
  finish(winTeam) {
    this.ending = true; this.endT = 3.2; this.hasWinner = true;
    if (Net.hosting) Net.emit({ k: 'finish', w: winTeam });
    const win = winTeam === player.team;
    if (this.mode !== 'rumble') { if (win) player.placement = 1; }
    this.result = { win, winTeam };
    if (win) {
      Sfx.win(); HUD.banner(this.mode === 'rumble' ? 'Your team wins the Rumble' : '#1 · Last one standing', this.mode === 'squads' ? 'Your squad survived the storm' : 'You outlasted every other player', 4);
      if (player.alive && player.state === 'ground') { player.emote = Profile.d.eq.emote; player.emoteT = 0; }
    } else {
      const w = actors.find(a => a.alive && !a.npc && a.team === winTeam);
      HUD.banner(this.mode === 'rumble' ? 'The other team wins' : (w ? w.name + ' wins the match' : 'Match over'), '', 4);
      if (w && !player.alive) this.spectate = w;
    }
    $('death').hidden = true;
  },
  update(dt) {
    if (this.state !== 'play') return;
    this.time += dt;
    if (Bus.active) Bus.update(dt);
    Storm.update(dt); LiveEvent.update(dt);
    if (this.mode === 'rumble' && !this.ending) for (const a of actors) if (!a.alive && !a.npc && !a.remote && a.respawnT > 0) { a.respawnT -= dt; if (a.respawnT <= 0) this.respawn(a, false); }
    if (this.ending) { this.endT -= dt; if (this.endT <= 0) { this.ending = false; this.showResults(); } }
  },
  showResults() {
    if (Net.hosting && !this.hasWinner) Net.emit({ k: 'end' });   // the host runs the match, so it ends for everyone
    this.state = 'results';
    if (document.pointerLockElement) document.exitPointerLock();
    const r = this.result || { win: false }, p = player, d = Profile.d;
    Profile.syncSeason();
    const place = this.mode === 'rumble' ? null : (p.placement || 1), won = place === 1 || (!place && r.win);
    const lines = [['Match performance', 100 + Math.round(p.aliveTime * 2.5) + p.kills * 150 + p.chests * 30]];
    if (place === 1) lines.push(['1st place', 2500]); else if (place) { const pb = place <= 5 ? 500 : place <= 10 ? 300 : place <= 25 ? 120 : 0; if (pb) lines.push(['Top ' + (place <= 5 ? 5 : place <= 10 ? 10 : 25) + ' finish', pb]); }
    else if (r.win) lines.push(['Rumble won', 600]);
    if (this.firstLander === p) lines.push(['First to land', 500]);
    if (this.sharkKills) lines.push([this.sharkKills > 1 ? 'Sharks defeated ×' + this.sharkKills : 'Shark defeated', 2000 * this.sharkKills]);
    if (!d.firstBonus) { d.firstBonus = true; lines.push(['First time playing', 5000]); }
    const xp = lines.reduce((s, l) => s + l[1], 0), lv = Profile.addXp(xp), tier0 = lv.l0;
    d.matches++; d.kills += p.kills;
    if (r.win) d.wins++;
    if (place && place <= 10) d.top10++;
    let rpTxt = '';
    if (this.ranked && place) { const rp = (place === 1 ? 120 : place <= 5 ? 60 : place <= 10 ? 35 : place <= 25 ? 10 : -10) + p.kills * 10; d.rp = Math.max(0, d.rp + rp); rpTxt = ' · ' + (rp >= 0 ? '+' : '') + rp + ' rank points (' + RANKS[Profile.rankIdx()][0] + ')'; }
    let newUmb = false;
    if (r.win && this.mode !== 'rumble' && !d.umbrella) { d.umbrella = true; newUmb = true; }
    const tier1 = lv.l1; const unl = lv.got.slice();
    const winCoins = won ? 100 : 0, coins = winCoins + lv.coins;
    d.coins += winCoins;
    Profile.save();
    if (newUmb) unl.push(cosById('glider', 'umbrella'));
    $('rPlace').innerHTML = place ? '#' + place + ' <small>of ' + (this.mode === 'squads' ? 25 : 100) + '</small>' : (this.score[0] + ' – ' + this.score[1]);
    $('rTitle').textContent = r.win ? (this.mode === 'rumble' ? 'Rumble won' : 'Last one standing') : (this.mode === 'rumble' ? 'Rumble lost' : 'Match complete');
    $('rSub').textContent = THEMES[this.theme].name + ' · ' + { solo: 'Solo', squads: 'Squads', rumble: 'Storm Rumble' }[this.mode] + ' · ' + (this.build ? 'Build' : 'No-Build');
    $('rStats').innerHTML = [['Eliminations', p.kills], ['Damage dealt', p.dmgDealt], ['Survived', fmtTime(p.aliveTime)]].map(s => `<div class="stat"><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
    $('rXp').innerHTML = lines.map(l => `<span class="xpl"><span>${esc(l[0])}</span><b>+${l[1].toLocaleString()} XP</b></span>`).join('')
      + (winCoins ? `<span class="xpl gold"><span>Victory reward</span><b>+${winCoins} ${COIN}</b></span>` : '')
      + (lv.coins ? `<span class="xpl gold"><span>Level ${tier0} → ${tier1}</span><b>+${lv.coins.toLocaleString()} ${COIN}</b></span>` : '')
      + `<span class="xpl tot"><span>Level ${tier1} · ${Season.name()}</span><b>${(d.seasonXp % XP_PER_LEVEL).toLocaleString()} / ${XP_PER_LEVEL.toLocaleString()} XP</b></span>` + (rpTxt ? `<span class="xpl"><span>Ranked</span><b>${esc(rpTxt.replace(/^ · /, ''))}</b></span>` : '');
    $('rXpFill').style.width = ((d.seasonXp % XP_PER_LEVEL) / XP_PER_LEVEL * 100) + '%';
    $('rUnlocks').innerHTML = unl.map(u => `<span style="--rc:${RARITY[u.r].css}">Unlocked: ${esc(u.name)}</span>`).join('');
    $('death').hidden = true; $('results').hidden = false;
  },
  toLobby() {
    if (Net.inMatch) { if (Net.isHost) { if (!this.hasWinner) Net.emit({ k: 'end' }); } else if (this.state === 'play') Net.send('h', { k: 'bye' }); Net.inMatch = false; Net.queue.length = 0; }
    this.state = 'lobby'; $('results').hidden = true; $('death').hidden = true; $('pause').hidden = true; $('hud').hidden = true; $('bigmap').hidden = true; $('clickHint').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    if (Bus.mesh) Bus.mesh.visible = false; stormMesh.visible = false; Build.hideGhost();
    LiveEvent.init('rumble'); Lightning.clear(); ElimFX.clear(); CharPool.clear(); BotRig.hideAll(); Trails.clear(); Creatures.clear(); actors.length = 0; player = null;
    $('lobby').hidden = false; Lobby.refresh();
  },
};

// ---------------------------------------------------------------- lightning along (and inside) the storm
const Lightning = {
  list: [], t: 2, flash: 0, near: 0,
  clear() { for (const b of this.list) for (const m of b.ms) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.list = []; this.flash = 0; },
  ribbon(pts, w0, w1, color, op) {
    const cp = camera.position, P = [], idx = [], d = new THREE.Vector3(), tc = new THREE.Vector3(), sd = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      d.subVectors(b, a).normalize(); tc.subVectors(cp, pts[i]).normalize(); sd.crossVectors(d, tc).normalize();
      const w = lerp(w0, w1, i / (pts.length - 1)); P.push(pts[i].x - sd.x * w, pts[i].y - sd.y * w, pts[i].z - sd.z * w, pts[i].x + sd.x * w, pts[i].y + sd.y * w, pts[i].z + sd.z * w);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; m.renderOrder = 8; scene.add(m); m.userData.op = op; return m;
  },
  channel(from, to, segs, jag) {
    const pts = [from.clone()];
    for (let i = 1; i < segs; i++) { const k = i / segs, p = from.clone().lerp(to, k); p.x += rnd(-jag, jag); p.z += rnd(-jag, jag); p.y += rnd(-jag, jag) * 0.3; pts.push(p); }
    pts.push(to.clone()); return pts;
  },
  strike(x, z) {
    const gy = topSurface(x, z), top = new THREE.Vector3(x + rnd(-20, 20), gy + rnd(150, 210), z + rnd(-20, 20)), bot = new THREE.Vector3(x, gy, z);
    const main = this.channel(top, bot, 16, 9), ms = [];
    ms.push(this.ribbon(main, 3.2, 1.6, 0x7a4aff, 0.35), this.ribbon(main, 0.9, 0.35, 0xf2ecff, 1));
    for (let b = 0; b < 3; b++) {   // forks off the main channel
      const s = main[2 + Math.floor(Math.random() * 9)], end = s.clone().add(new THREE.Vector3(rnd(-40, 40), -rnd(25, 70), rnd(-40, 40)));
      ms.push(this.ribbon(this.channel(s, end, 6, 5), 0.5, 0.1, 0xd8ccff, 0.8));
    }
    this.list.push({ ms, life: 0.42, age: 0 });
    const v = Cam.view || player, dist = v ? Math.hypot(v.pos.x - x, v.pos.z - z) : 999;
    this.flash = 1; this.near = clamp(1 - dist / 260, 0.15, 1);
    if (dist < 420) setTimeout(() => { if (Match.state === 'play') Sfx.noise(1.4, 110, 0.6, 0.32 * clamp(1 - dist / 420, 0.15, 1), 'lowpass'); }, dist / 340 * 1000);
    FX.burst && dist < 200 && FX.burst(x, gy + 0.5, z, 0xd8ccff, 14, 9, 0.5, 0.18, 6);
  },
  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 5);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i]; b.age += dt; const k = b.age / b.life, flick = k < 0.25 ? 1 : k < 0.4 ? 0.25 : k < 0.6 ? 0.9 : 1 - (k - 0.6) / 0.4;
      for (const m of b.ms) m.material.opacity = m.userData.op * Math.max(0, flick);
      if (b.age >= b.life) { for (const m of b.ms) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.list.splice(i, 1); }
    }
    if (Match.state !== 'play' || Match.paused || Storm.state === 'idle' || !stormMesh.visible) return;
    this.t -= dt; if (this.t > 0) return;
    this.t = rnd(1.0, 3.0);
    const v = Cam.view || player; if (!v) return;
    const a0 = Math.atan2(v.pos.z - Storm.cz, v.pos.x - Storm.cx), inside = !Storm.outside(v.pos.x, v.pos.z);
    let a = a0 + rnd(-0.45, 0.45), r = Storm.r + rnd(0, 45);
    if (!inside && Math.random() < 0.6) { const dv = Math.hypot(v.pos.x - Storm.cx, v.pos.z - Storm.cz); r = clamp(dv + rnd(-60, 60), Storm.r + 4, dv + 80); }
    const x = clamp(Storm.cx + Math.cos(a) * r, -W.half + 5, W.half - 5), z = clamp(Storm.cz + Math.sin(a) * r, -W.half + 5, W.half - 5);
    this.strike(x, z);
  },
};
