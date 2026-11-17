// =====================================================================
//  Building: walls, ramps, floors on a 4m grid (wood / brick / metal)
// =====================================================================
const T = 4;
const Build = {
  active: false, piece: 'wall', pieces: [], map: new Map(), ghosts: null, tgt: null, lastKey: null, placeCD: 0,
  init() {
    this.ghosts = { wall: new THREE.Mesh(GEO.wall, MAT.ghost), floor: new THREE.Mesh(GEO.floor, MAT.ghost), rampX: new THREE.Mesh(GEO.rampX, MAT.ghost), rampZ: new THREE.Mesh(GEO.rampZ, MAT.ghost) };
    for (const k in this.ghosts) { this.ghosts[k].visible = false; this.ghosts[k].renderOrder = 6; scene.add(this.ghosts[k]); }
  },
  clear() {
    for (const p of this.pieces) { scene.remove(p.mesh); if (p.col) Grid.remove(p.col); }
    this.pieces = []; this.map.clear(); this.active = false; this.hideGhost();
  },
  hideGhost() { if (this.ghosts) for (const k in this.ghosts) this.ghosts[k].visible = false; },
  compute(a, type) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), p = a.pitch;
    let gy = Math.floor((a.pos.y + 1.2) / T);
    if (type === 'wall') {
      if (p > 0.75) gy += 1;
      const cx = Math.floor(a.pos.x / T), cz = Math.floor(a.pos.z / T);
      if (Math.abs(fx) > Math.abs(fz)) { const ex = fx > 0 ? cx + 1 : cx; return { type, gx: ex, gy, gz: cz, dir: 1, key: 'w1:' + ex + ':' + gy + ':' + cz }; }
      const ez = fz > 0 ? cz + 1 : cz; return { type, gx: cx, gy, gz: ez, dir: 0, key: 'w0:' + cx + ':' + gy + ':' + ez };
    }
    let gx = Math.floor((a.pos.x + fx * T * 0.7) / T), gz = Math.floor((a.pos.z + fz * T * 0.7) / T);
    if (type === 'floor') {
      if (p > 0.6) gy += 1; else if (p < -0.75) { gx = Math.floor(a.pos.x / T); gz = Math.floor(a.pos.z / T); }
      return { type, gx, gy, gz, dir: 0, key: 'f:' + gx + ':' + gy + ':' + gz };
    }
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
    return { type: 'ramp', gx, gy, gz, dir, key: 'r:' + gx + ':' + gy + ':' + gz };
  },
  pose(t, m) {
    const y0 = t.gy * T;
    m.rotation.set(0, 0, 0);
    if (t.type === 'wall') { if (t.dir === 0) m.position.set((t.gx + 0.5) * T, y0 + T / 2, t.gz * T); else { m.position.set(t.gx * T, y0 + T / 2, (t.gz + 0.5) * T); m.rotation.y = Math.PI / 2; } }
    else if (t.type === 'floor') m.position.set((t.gx + 0.5) * T, y0, (t.gz + 0.5) * T);
    else { m.position.set((t.gx + 0.5) * T, y0 + T / 2, (t.gz + 0.5) * T); if (t.dir === 0) m.rotation.z = Math.PI / 4; else if (t.dir === 1) m.rotation.z = -Math.PI / 4; else if (t.dir === 2) m.rotation.x = -Math.PI / 4; else m.rotation.x = Math.PI / 4; }
  },
  geoKey(t) { return t.type === 'ramp' ? (t.dir < 2 ? 'rampX' : 'rampZ') : t.type; },
  canAfford(a) { return a.mats[a.mat] >= 10; },
  place(a, t) {
    if (!t || this.map.has(t.key)) return false;
    if (!this.canAfford(a)) {
      const alt = MAT_ORDER.find(m => a.mats[m] >= 10);
      if (!alt) { if (a === player) HUD.toast('Not enough materials. Harvest with the tool in slot 1.'); return false; }
      a.mat = alt; if (a === player) HUD.dirty = true;
    }
    a.mats[a.mat] -= 10;
    const k = this.geoKey(t), mesh = new THREE.Mesh(GEO[k], MAT[a.mat]); this.pose(t, mesh);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.scale.setScalar(0.4); scene.add(mesh);
    const y0 = t.gy * T; let col;
    if (t.type === 'wall') col = t.dir === 0 ? { minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T - 0.15, maxZ: t.gz * T + 0.15, minY: y0, maxY: y0 + T } : { minX: t.gx * T - 0.15, maxX: t.gx * T + 0.15, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0, maxY: y0 + T };
    else if (t.type === 'floor') col = { minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0 - 0.12, maxY: y0 + 0.12 };
    else col = { kind: 'ramp', minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0, maxY: y0 + T, y0, rise: T, dir: t.dir };
    col.kind = col.kind || 'piece'; col.mat = a.mat;
    const p = { type: t.type, key: t.key, mat: a.mat, hp: MATS[a.mat].hp, maxHp: MATS[a.mat].hp, mesh, col, owner: a, anim: 0.14, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    col.piece = p; Grid.add(col);
    this.pieces.push(p); this.map.set(t.key, p);
    if (a === player || Sfx.vol(p.x, p.y, p.z) > 0.25) Sfx.build();
    if (this.pieces.length > 520) { const old = this.pieces.find(q => q.owner !== player); if (old) this.remove(old, false); }
    if (a === player) HUD.dirty = true;
    if (Net.inMatch && !Net.applying && !a.remote) Net.emit({ k: 'bp', t: { type: t.type, gx: t.gx, gy: t.gy, gz: t.gz, dir: t.dir, key: t.key }, mat: p.mat });
    return true;
  },
  damage(p, dmg, src) {
    if (p.dead) return; p.hp -= dmg;
    if (Net.inMatch && !Net.applying) Net.emit({ k: 'bd', key: p.key, dmg: Math.round(dmg) });
    if (src === player) HUD.dmgNum(p.x, p.y + 1, p.z, Math.round(dmg), 'build');
    if (p.hp <= 0) this.remove(p, true);
  },
  remove(p, fx) {
    if (p.dead) return; p.dead = true; scene.remove(p.mesh); Grid.remove(p.col); this.map.delete(p.key);
    const i = this.pieces.indexOf(p); if (i >= 0) this.pieces.splice(i, 1);
    if (fx) { FX.burst(p.x, p.y, p.z, MATS[p.mat].color, 14, 5, 0.7, 0.22); if (Sfx.vol(p.x, p.y, p.z) > 0.2) Sfx.noise(0.25, 260, 1, 0.4 * Sfx.vol(p.x, p.y, p.z), 'lowpass'); }
  },
  explode(x, y, z, r, dmg) {
    for (const p of this.pieces.slice()) { const d = Math.hypot(p.x - x, p.y - y, p.z - z); if (d < r + 2) this.damage(p, dmg * (1 - d / (r + 2) * 0.5), null); }
  },
  update(dt) {
    for (const p of this.pieces) if (p.anim > 0) { p.anim -= dt; p.mesh.scale.setScalar(p.anim > 0 ? 1 - p.anim / 0.14 * 0.6 : 1); }
    this.placeCD -= dt;
    this.hideGhost();
    if (!this.active || !player || !player.alive || player.state !== 'ground' || player.vehicle || !Match.build) { this.tgt = null; return; }
    const t = this.compute(player, this.piece); this.tgt = t;
    const g = this.ghosts[this.geoKey(t)]; this.pose(t, g);
    const ok = !this.map.has(t.key) && MAT_ORDER.some(m => player.mats[m] >= 10);
    g.material = ok ? MAT.ghost : MAT.ghostBad; g.visible = true;
    if (player.input.fire && this.placeCD <= 0 && ok && t.key !== this.lastKey) { if (this.place(player, t)) { this.lastKey = t.key; this.placeCD = 0.07; } }
    if (!player.input.fire) this.lastKey = null;
  },
};
