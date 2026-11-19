// =====================================================================
//  Building: walls, ramps, floors on a 4m grid (wood / brick / metal)
// =====================================================================
// Build tiles in Fortnite-style proportions: 5.12 m wide and 3.84 m tall (wider than tall), ramps rise one storey per tile
const T = 5.12, TH = 3.84, CONE_H = TH * 0.5;
// A freshly placed piece is see-through and firms up to solid over this many seconds (sturdier materials take longer)
const BUILD_TIME = { wood: 1.4, brick: 2.0, metal: 2.6 }, FADE_STEPS = 12;
const Build = {
  fades: {}, lines: {}, edgeGeo: {},
  // shared see-through copies of each material at a few opacity steps, so many pieces can fade without a material each
  fadeMat(mat, i) {
    const L = this.fades[mat] || (this.fades[mat] = []);
    if (!L[i]) { const m = MAT[mat].clone(); m.transparent = true; m.depthWrite = false; m.opacity = 0.28 + 0.6 * i / (FADE_STEPS - 1); L[i] = m; }
    return L[i];
  },
  buildEdge(k, mat) {
    const g = this.edgeGeo[k] || (this.edgeGeo[k] = new THREE.EdgesGeometry(GEO[k], 25));
    const lm = this.lines[mat] || (this.lines[mat] = new THREE.LineBasicMaterial({ color: new THREE.Color(MATS[mat].color).lerp(new THREE.Color(0xffffff), 0.55), transparent: true, opacity: 0.85, depthWrite: false }));
    return new THREE.LineSegments(g, lm);
  },
  active: false, piece: 'wall', pieces: [], map: new Map(), ghosts: null, tgt: null, lastKey: null, lastCol: null, placeCD: 0,
  init() {
    this.ghosts = { wall: new THREE.Mesh(GEO.wall, MAT.ghost), floor: new THREE.Mesh(GEO.floor, MAT.ghost), rampX: new THREE.Mesh(GEO.rampX, MAT.ghost), rampZ: new THREE.Mesh(GEO.rampZ, MAT.ghost), cone: new THREE.Mesh(GEO.cone, MAT.ghost) };
    for (const k in this.ghosts) {
      const g = this.ghosts[k]; g.visible = false; g.renderOrder = 6; scene.add(g);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry, 25), MAT.ghostLine); e.renderOrder = 7; g.add(e); g.userData.edge = e;
    }
  },
  // where a piece would sit (for the blocked check): centre point and top height
  centre(t) {
    const y0 = t.gy * TH;
    if (t.type === 'wall') return t.dir === 0 ? [(t.gx + 0.5) * T, y0 + TH / 2, t.gz * T, y0 + TH] : [t.gx * T, y0 + TH / 2, (t.gz + 0.5) * T, y0 + TH];
    if (t.type === 'floor') return [(t.gx + 0.5) * T, y0, (t.gz + 0.5) * T, y0 + 0.12];
    if (t.type === 'cone') return [(t.gx + 0.5) * T, y0 + CONE_H / 2, (t.gz + 0.5) * T, y0 + CONE_H];
    return [(t.gx + 0.5) * T, y0 + TH / 2, (t.gz + 0.5) * T, y0 + TH];
  },
  // why a piece can't go here ('' when it can): shown under the crosshair and turns the blueprint red
  why(a, t) {
    if (!t) return 'Out of range';
    if (this.map.has(t.key)) return 'Spot taken';
    if (!MAT_ORDER.some(m => a.mats[m] >= 10)) return 'Need 10 materials';
    const [x, y, z, top] = this.centre(t);
    if (t.gy * TH > 220 || Math.hypot(x, z) > W.R + 30) return 'Out of range';
    if (groundH(x, z) > top - 0.25) return 'Blocked';   // fully underground
    const L = this._q || (this._q = []); Grid.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, L);
    for (const c of L) if (!c.dead && !c.piece && c.kind !== 'ramp' && c.maxY - c.minY > 0.5 && x > c.minX + 0.15 && x < c.maxX - 0.15 && z > c.minZ + 0.15 && z < c.maxZ - 0.15 && y > c.minY + 0.15 && y < c.maxY - 0.15) return 'Blocked';   // inside a wall, rock, tree or car
    return '';
  },
  clear() {
    for (const p of this.pieces) { scene.remove(p.mesh); if (p.col) Grid.remove(p.col); }
    this.pieces = []; this.map.clear(); this.active = false; this.hideGhost();
  },
  hideGhost() { if (this.ghosts) for (const k in this.ghosts) this.ghosts[k].visible = false; if (this.whyTxt) { this.whyTxt = ''; const el = document.getElementById('buildWhy'); if (el) el.textContent = ''; } },
  compute(a, type) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), p = a.pitch;
    let gy = Math.floor((a.pos.y + 1.2) / TH);
    if (type === 'wall') {
      if (p > 0.75) gy += 1;
      const cx = Math.floor(a.pos.x / T), cz = Math.floor(a.pos.z / T);
      if (Math.abs(fx) > Math.abs(fz)) { const ex = fx > 0 ? cx + 1 : cx; return { type, gx: ex, gy, gz: cz, dir: 1, key: 'w1:' + ex + ':' + gy + ':' + cz }; }
      const ez = fz > 0 ? cz + 1 : cz; return { type, gx: cx, gy, gz: ez, dir: 0, key: 'w0:' + cx + ':' + gy + ':' + ez };
    }
    let gx = Math.floor((a.pos.x + fx * T * 0.7) / T), gz = Math.floor((a.pos.z + fz * T * 0.7) / T);
    if (type === 'floor' || type === 'cone') {
      if (p > 0.6 || (type === 'cone' && p > 0.25)) gy += 1; else if (p < -0.75) { gx = Math.floor(a.pos.x / T); gz = Math.floor(a.pos.z / T); }
      if (type === 'cone' && p > 0.25) { gx = Math.floor(a.pos.x / T); gz = Math.floor(a.pos.z / T); }   // looking up: a roof over your own tile
      return { type, gx, gy, gz, dir: 0, key: (type === 'cone' ? 'c:' : 'f:') + gx + ':' + gy + ':' + gz };
    }
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : (fz > 0 ? 2 : 3);
    return { type: 'ramp', gx, gy, gz, dir, key: 'r:' + gx + ':' + gy + ':' + gz };
  },
  pose(t, m) {
    const y0 = t.gy * TH, ang = Math.atan2(TH, T);
    m.rotation.set(0, 0, 0);
    if (t.type === 'wall') { if (t.dir === 0) m.position.set((t.gx + 0.5) * T, y0 + TH / 2, t.gz * T); else { m.position.set(t.gx * T, y0 + TH / 2, (t.gz + 0.5) * T); m.rotation.y = Math.PI / 2; } }
    else if (t.type === 'floor' || t.type === 'cone') m.position.set((t.gx + 0.5) * T, y0, (t.gz + 0.5) * T);
    else { m.position.set((t.gx + 0.5) * T, y0 + TH / 2, (t.gz + 0.5) * T); if (t.dir === 0) m.rotation.z = ang; else if (t.dir === 1) m.rotation.z = -ang; else if (t.dir === 2) m.rotation.x = -ang; else m.rotation.x = ang; }
  },
  geoKey(t) { return t.type === 'ramp' ? (t.dir < 2 ? 'rampX' : 'rampZ') : t.type; },
  canAfford(a) { return a.mats[a.mat] >= 10; },
  place(a, t) {
    if (!t || this.map.has(t.key)) return false;
    if (a === player && !Net.applying) { const w = this.why(a, t); if (w === 'Blocked' || w === 'Out of range') return false; }
    if (!this.canAfford(a)) {
      const alt = MAT_ORDER.find(m => a.mats[m] >= 10);
      if (!alt) { if (a === player) HUD.toast('Not enough materials. Harvest with the tool in slot 1.'); return false; }
      a.mat = alt; if (a === player) HUD.dirty = true;
    }
    a.mats[a.mat] -= 10;
    const k = this.geoKey(t), mesh = new THREE.Mesh(GEO[k], this.fadeMat(a.mat, 0)); this.pose(t, mesh);
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.scale.setScalar(0.4); mesh.renderOrder = 2; scene.add(mesh);
    const edge = this.buildEdge(k, a.mat); edge.renderOrder = 3; mesh.add(edge);   // bright outline while it is still see-through
    const y0 = t.gy * TH; let col;
    if (t.type === 'wall') col = t.dir === 0 ? { minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T - 0.15, maxZ: t.gz * T + 0.15, minY: y0, maxY: y0 + TH } : { minX: t.gx * T - 0.15, maxX: t.gx * T + 0.15, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0, maxY: y0 + TH };
    else if (t.type === 'floor') col = { minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0 - 0.12, maxY: y0 + 0.12 };
    else if (t.type === 'cone') col = { kind: 'ramp', cone: true, minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0, maxY: y0 + CONE_H, y0, rise: CONE_H, dir: 0 };   // walkable like a ramp, sloping up to the middle
    else col = { kind: 'ramp', minX: t.gx * T, maxX: (t.gx + 1) * T, minZ: t.gz * T, maxZ: (t.gz + 1) * T, minY: y0, maxY: y0 + TH, y0, rise: TH, dir: t.dir };
    col.kind = col.kind || 'piece'; col.mat = a.mat;
    const p = { type: t.type, key: t.key, mat: a.mat, hp: MATS[a.mat].hp, maxHp: MATS[a.mat].hp, mesh, col, owner: a, anim: 0.14, x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, build: 0, buildT: BUILD_TIME[a.mat] || 1.6, edge };
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
    this.vt = (this.vt || 0) - dt;
    if (this.vt <= 0) { this.vt = 0.3; const cp = camera.position, f = View.far + 12, f2 = f * f; for (const p of this.pieces) if (p.mesh) p.mesh.visible = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2 < f2; }   // pieces lost in the fog are not drawn
    for (const p of this.pieces) {
      if (p.anim > 0) { p.anim -= dt; p.mesh.scale.setScalar(p.anim > 0 ? 1 - p.anim / 0.14 * 0.6 : 1); }
      if (p.build < 1) {   // see-through while it builds, then solid
        p.build = Math.min(1, p.build + dt / p.buildT);
        if (p.build >= 1) { p.mesh.material = MAT[p.mat]; p.mesh.castShadow = true; p.mesh.renderOrder = 0; if (p.edge) { p.mesh.remove(p.edge); p.edge = null; } }
        else p.mesh.material = this.fadeMat(p.mat, Math.min(FADE_STEPS - 1, Math.floor(p.build * p.build * FADE_STEPS)));
      }
    }
    this.placeCD -= dt;
    this.hideGhost();
    if (!this.active || !player || !player.alive || player.crawl || player.state !== 'ground' || player.vehicle || !Match.build) { this.tgt = null; return; }
    const t = this.compute(player, this.piece); this.tgt = t;
    const g = this.ghosts[this.geoKey(t)]; this.pose(t, g);
    const why = this.why(player, t), ok = !why;
    g.material = ok ? MAT.ghost : MAT.ghostBad; g.userData.edge.material = ok ? MAT.ghostLine : MAT.ghostLineBad; g.visible = true;
    if (why !== this.whyTxt) { this.whyTxt = why; $('buildWhy').textContent = why; }
    // one click = one piece. While fire stays held you can keep building as you move or turn, but never a second
    // piece of the same kind straight above / below the last one (a fresh ramp lifts you, which used to stack a twin)
    const col = t.type + ':' + t.gx + ':' + t.gz + ':' + (t.dir || 0);
    if (player.input.fire && this.placeCD <= 0 && ok && t.key !== this.lastKey && col !== this.lastCol) { if (this.place(player, t)) { this.lastKey = t.key; this.lastCol = col; this.placeCD = 0.25; } }
    if (!player.input.fire) { this.lastKey = null; this.lastCol = null; this.placeCD = Math.min(this.placeCD, 0.05); }
  },
};
