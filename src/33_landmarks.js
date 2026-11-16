// =====================================================================
//  Landmarks out in the wild: farms, camps, turbines, lighthouses, piers, ruins, roadside poles
// =====================================================================
const LMK = {
  town: [['farm', 3], ['camp', 4], ['turbine', 4], ['light', 1], ['pier', 3]],
  flood: [['camp', 5], ['turbine', 3], ['light', 1], ['pier', 5]],
  city: [['mast', 5], ['board', 6], ['pier', 2]],
  temple: [['ruin', 5], ['camp', 3], ['farm', 2], ['light', 1], ['pier', 2]],
  desert: [['camp', 4], ['pump', 4], ['bones', 3], ['ruin', 2]],
};
const LMR = { farm: 25, camp: 9, turbine: 5, light: 6, pier: 8, mast: 5, board: 6, ruin: 11, pump: 6, bones: 10 };
function flattenAt(x, z, r, h) {
  const n1 = W.N + 1, H = W.heights, c = W.cell, i0 = Math.max(0, Math.floor((x - r - 12 + W.half) / c)), i1 = Math.min(W.N, Math.ceil((x + r + 12 + W.half) / c)), j0 = Math.max(0, Math.floor((z - r - 12 + W.half) / c)), j1 = Math.min(W.N, Math.ceil((z + r + 12 + W.half) / c));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(-W.half + i * c - x, -W.half + j * c - z); if (d < r + 12) H[j * n1 + i] = lerp(H[j * n1 + i], h, smooth(r + 12, r + 1, d)); }
}
function planLandmarks(R) {
  W.spots = []; const wy = W.waterY, AX = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [type, count] of LMK[W.theme.style] || []) {
    const r = LMR[type]; let made = 0, cand = null, seen = 0;
    for (let t = 0; t < 2600 && made < count; t++) {
      const a = R() * TAU, d = (0.08 + R() * 0.86) * W.R, x = Math.cos(a) * d, z = Math.sin(a) * d, h = groundH(x, z);
      if (nearSite(x, z, r + 8) || pathDist(x, z) < r + 4) continue;
      if (W.spots.some(s => Math.hypot(s.x - x, s.z - z) < s.r + r + (s.type === type ? 90 : 22))) continue;
      const spot = { type, x, z, h, r };
      if (type === 'pier') {
        if (h < wy + 0.5 || h > wy + 1.7) continue;
        const dir = AX.find(([dx, dz]) => groundH(x + dx * 8, z + dz * 8) < wy - 0.6 && groundH(x + dx * 16, z + dz * 16) < wy - 1.2 && groundH(x + dx * 25, z + dz * 25) < wy - 1.4 && groundH(x - dx * 7, z - dz * 7) > wy + 0.5);
        if (!dir) continue; spot.dir = dir; W.spots.push(spot); made++; continue;
      }
      if (h < wy + 1.6 || h > 40) continue;
      let lo = h, hi = h, sea = false; for (let k = 0; k < 8; k++) { const hh = groundH(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r); lo = Math.min(lo, hh); hi = Math.max(hi, hh); if (groundH(x + Math.cos(k * 0.785) * 34, z + Math.sin(k * 0.785) * 34) < wy - 1) sea = true; }
      if (lo < wy + 0.9 || hi - lo > (type === 'farm' ? 4.5 : 6)) continue;
      if (type === 'light') { if (!sea || d < W.R * 0.5) continue; }
      else if (type === 'turbine' || type === 'mast') { seen++; if (!cand || h > cand.h) cand = spot; if (seen < 14) continue; spot.x = cand.x; spot.z = cand.z; spot.h = cand.h; cand = null; seen = 0; if (W.spots.some(s => Math.hypot(s.x - spot.x, s.z - spot.z) < s.r + r + 60)) continue; }
      spot.h = (lo + hi) / 2 > spot.h ? spot.h : (spot.h + (lo + hi) / 2) / 2;
      flattenAt(spot.x, spot.z, r, spot.h); W.spots.push(spot); made++;
    }
  }
}
const LB = {
  cyl(b, r0, r1, h, x, y, z, hex, seg = 10) { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y + h / 2, z); b.geo(g, hex); g.dispose(); },
  box(b, w, h, d, x, y, z, ry, hex, rx = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); b.geo(g, hex); g.dispose(); },
  limb(b, r0, r1, ax, ay, az, bx, by, bz, hex, seg = 5) { const g = gLimb(r0, r1, ax, ay, az, bx, by, bz, seg); b.geo(g, hex); g.dispose(); },
  blob(b, r, x, y, z, hex, sy = 1, sx = 1) { const g = gBlob(r, x, y, z, sy, 0, sx); b.geo(g, hex); g.dispose(); },
  col(x0, y0, z0, x1, y1, z1, mat) { return Grid.add({ minX: Math.min(x0, x1), minY: y0, minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxY: y1, maxZ: Math.max(z0, z1), kind: 'static', mat: mat || 'wood' }); },
};
function lmMesh(geo, mat) { W.disp.push(geo); const m = new THREE.Mesh(geo, mat || MAT.batch); m.castShadow = true; return m; }

function buildCamp(s, R, b, eb) {
  const cols = [0xe8662a, 0x2a9ab0, 0x7a8a3a, 0xd8b84a, 0xb04a6a, 0x3a6ad8], nT = 2 + (R() < 0.5 ? 1 : 0), a0 = R() * TAU;
  for (let i = 0; i < nT; i++) {
    const a = a0 + i / nT * TAU * 0.8, x = s.x + Math.cos(a) * 5, z = s.z + Math.sin(a) * 5, y = groundH(x, z) - 0.05, c = pickR(R, cols), ry = -a + Math.PI / 2;
    const sh = new THREE.Shape(); sh.moveTo(-1.25, 0); sh.lineTo(1.25, 0); sh.lineTo(0, 1.65); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.9, bevelEnabled: false }); g.translate(0, 0, -1.45); g.rotateY(ry); g.translate(x, y, z); b.geo(g, c); g.dispose();
    const dsh = new THREE.Shape(); dsh.moveTo(-0.55, 0); dsh.lineTo(0.55, 0); dsh.lineTo(0, 1.15); dsh.closePath();
    const dg = new THREE.ExtrudeGeometry(dsh, { depth: 0.06, bevelEnabled: false }); dg.translate(0, 0, 1.43); dg.rotateY(ry + Math.PI); dg.translate(x, y, z); b.geo(dg, 0x1c1a18); dg.dispose();
    LB.box(b, 0.06, 0.06, 3.3, x, y + 1.66, z, ry, shade(c, 0.6));
    for (const k of [-1, 1]) LB.limb(b, 0.025, 0.025, x + Math.cos(a) * 1.9 * k, y, z + Math.sin(a) * 1.9 * k, x + Math.cos(a) * 1.4 * k, y + 1.6, z + Math.sin(a) * 1.4 * k, 0xd8d0c0, 4);
    LB.col(x - 1.3, y, z - 1.3, x + 1.3, y + 1.4, z + 1.3, 'wood');
  }
  const y = groundH(s.x, s.z);
  LB.cyl(b, 0.95, 0.95, 0.06, s.x, y, s.z, 0x2a2622, 10);
  for (let k = 0; k < 8; k++) LB.blob(b, 0.2 + R() * 0.08, s.x + Math.cos(k * 0.785) * 0.85, y + 0.1, s.z + Math.sin(k * 0.785) * 0.85, k % 2 ? 0x8a8d93 : 0x74777d, 0.7);
  for (let k = 0; k < 3; k++) { const a = k * 2.09 + 0.4; LB.limb(b, 0.09, 0.08, s.x + Math.cos(a) * 0.55, y + 0.08, s.z + Math.sin(a) * 0.55, s.x - Math.cos(a) * 0.35, y + 0.42, s.z - Math.sin(a) * 0.35, 0x4a3018, 6); }
  const fl = new THREE.Group(); fl.position.set(s.x, y + 0.15, s.z);
  const f1 = new THREE.ConeGeometry(0.36, 1.1, 6).translate(0, 0.55, 0), f2 = new THREE.ConeGeometry(0.2, 0.75, 6).translate(0.04, 0.42, 0.03); W.disp.push(f1, f2);
  fl.add(new THREE.Mesh(f1, basic(0xff7a1a)), new THREE.Mesh(f2, basic(0xffe14a))); W.group.add(fl); Nature.fires.push({ o: fl, ph: R() * 6 });
  for (let k = 0; k < 2; k++) { const a = a0 + Math.PI + (k ? 0.8 : -0.6), x = s.x + Math.cos(a) * 2.6, z = s.z + Math.sin(a) * 2.6, gy = groundH(x, z); const g = new THREE.CylinderGeometry(0.26, 0.28, 2, 8); g.rotateZ(Math.PI / 2); g.rotateY(-a + Math.PI / 2); g.translate(x, gy + 0.26, z); b.geo(g, 0x6b4a2b); g.dispose(); LB.col(x - 0.7, gy, z - 0.7, x + 0.7, gy + 0.5, z + 0.7); }
  const ca = a0 + Math.PI * 0.85, cx = s.x + Math.cos(ca) * 5.5, cz = s.z + Math.sin(ca) * 5.5, cy = groundH(cx, cz);
  if (R() < 0.6) addChest('chest', cx, cy, cz, -ca + Math.PI / 2, null); else addChest('ammo', cx, cy, cz, -ca, null);
  LB.box(b, 0.7, 0.45, 0.45, s.x + Math.cos(ca + 0.5) * 3.4, y + 0.22, s.z + Math.sin(ca + 0.5) * 3.4, R() * 3, 0x2f7fd8); LB.box(b, 0.74, 0.1, 0.49, s.x + Math.cos(ca + 0.5) * 3.4, y + 0.5, s.z + Math.sin(ca + 0.5) * 3.4, 0, 0xf2f2f2);
  spawnSpot(s.x + Math.cos(a0 + 2.6) * 2.2, y, s.z + Math.sin(a0 + 2.6) * 2.2, null);
}

function buildFarm(s, R, b, eb) {
  const y = s.h + 0.03, x0 = s.x - 18, x1 = s.x + 5, z0 = s.z - 11, z1 = s.z + 11, wood = 0x8a6a45, vine = W.theme.style === 'temple';
  b.box(x0, y - 0.6, z0, x1, y + 0.05, z1, 0x6a4a2e);
  const crop = vine ? [0x5a8a3a, 0x7a4a9a] : pickR(R, [[0xd8b84a, 0xc8a83a], [0x5aa03a, 0x4a9030], [0x6ab04a, 0xe8662a]]);
  for (let r = 0; r < 10; r++) { const z = z0 + 1.5 + r * 2.1; b.box(x0 + 0.8, y + 0.05, z - 0.42, x1 - 0.8, y + 0.16, z + 0.42, 0x5a3c24); for (let x = x0 + 1; x < x1 - 1.4; x += 1.05) { const h = (vine ? 0.9 : 0.35) + R() * 0.35, w = 0.3 + R() * 0.1; b.box(x, y + 0.16, z - w, x + 0.8, y + 0.16 + h, z + w, crop[R() < (vine ? 0.8 : 0.55) ? 0 : 1]); } }
  const rail = (ax, a0, a1, f) => {   // fence run with posts
    for (let t = a0; t <= a1 + 0.01; t += (a1 - a0) / Math.max(1, Math.round((a1 - a0) / 2.6))) { if (ax === 'x') b.box(t - 0.09, y - 0.1, f - 0.09, t + 0.09, y + 1.15, f + 0.09, wood); else b.box(f - 0.09, y - 0.1, t - 0.09, f + 0.09, y + 1.15, t + 0.09, wood); }
    for (const h of [0.45, 0.9]) { if (ax === 'x') b.box(a0, y + h - 0.06, f - 0.04, a1, y + h + 0.06, f + 0.04, shade(wood, 1.12)); else b.box(f - 0.04, y + h - 0.06, a0, f + 0.04, y + h + 0.06, a1, shade(wood, 1.12)); }
    if (ax === 'x') LB.col(a0, y - 0.3, f - 0.12, a1, y + 1.05, f + 0.12); else LB.col(f - 0.12, y - 0.3, a0, f + 0.12, y + 1.05, a1);
  };
  rail('x', x0, x1, z0); rail('x', x0, x1, z1); rail('z', z0, z1, x0); rail('z', z0, s.z - 2, x1); rail('z', s.z + 2, z1, x1);
  // scarecrow
  const sx = s.x - 7, sz = s.z + 0.5; b.box(sx - 0.06, y, sz - 0.06, sx + 0.06, y + 2.2, sz + 0.06, wood); b.box(sx - 0.9, y + 1.5, sz - 0.05, sx + 0.9, y + 1.62, sz + 0.05, wood); b.box(sx - 0.35, y + 1.0, sz - 0.14, sx + 0.35, y + 1.75, sz + 0.14, 0xc0392b);
  LB.blob(b, 0.28, sx, y + 2.1, sz, 0xe8c888); LB.cyl(b, 0.5, 0.5, 0.05, sx, y + 2.3, sz, 0x5a3a20, 8); LB.cyl(b, 0.26, 0.2, 0.3, sx, y + 2.33, sz, 0x5a3a20, 8);
  // hay bales
  for (let k = 0; k < 5; k++) { const x = x1 + 2 + (k % 2) * 2.1, z = s.z + 5 + Math.floor(k / 2) * 2.2 + (k % 2) * 0.4, g = new THREE.CylinderGeometry(0.85, 0.85, 1.35, 12); g.rotateZ(Math.PI / 2); g.rotateY(k === 4 ? 0.6 : 0); g.translate(x, y + 0.85, z); b.geo(g, k % 2 ? 0xd8b84a : 0xcaa83e); g.dispose(); LB.col(x - 0.8, y, z - 0.85, x + 0.8, y + 1.7, z + 0.85); }
  // barn
  const bx0 = s.x + 10, bx1 = s.x + 19, bz0 = s.z - 6.5, bz1 = s.z + 5.5, red = vine ? 0xe8dcc0 : 0xa83226, trim = 0xf4f1ea, roof = vine ? 0xb8552f : 0x3a3f48, cx = (bx0 + bx1) / 2;
  solid(b, bx0, y - 0.8, bz0, bx1, y + 5, bz1, red, 'wood');
  triPrism(b, [[bx0 - 0.15, y + 5], [bx1 + 0.15, y + 5], [cx, y + 8.2]], true, bz0, bz1, red);
  for (const sgn of [-1, 1]) { const g = new THREE.BoxGeometry(5.9, 0.22, bz1 - bz0 + 1.2); g.rotateZ(sgn * Math.atan2(3.2, 4.65)); g.translate(cx - sgn * 2.45, y + 6.72, (bz0 + bz1) / 2); b.geo(g, roof); g.dispose(); }
  LB.col(cx - 2.6, y + 5, bz0, cx + 2.6, y + 6.8, bz1);
  for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]]) b.box(x - 0.14, y, z - 0.14, x + 0.14, y + 5, z + 0.14, trim);
  b.box(bx0 - 0.08, y, s.z - 2.4, bx0, y + 3.9, s.z + 1.4, shade(red, 0.62)); b.box(bx0 - 0.12, y + 3.9, s.z - 2.6, bx0, y + 4.1, s.z + 1.6, trim); b.box(bx0 - 0.12, y, s.z - 2.6, bx0, y + 4, s.z - 2.4, trim); b.box(bx0 - 0.12, y, s.z + 1.4, bx0, y + 4, s.z + 1.6, trim); b.box(bx0 - 0.12, y, s.z - 0.6, bx0, y + 3.9, s.z - 0.4, trim);
  for (const sg of [-1, 1]) { const g = new THREE.BoxGeometry(0.06, 4.2, 0.16); g.rotateX(sg * 0.46); g.translate(bx0 - 0.1, y + 1.95, s.z - 1.5 + (sg > 0 ? 0 : 2)); b.geo(g, trim); g.dispose(); }
  for (const z of [bz0 - 0.06, bz1 + 0.06]) { b.box(cx - 0.6, y + 5.3, z - 0.04, cx + 0.6, y + 6.5, z + 0.04, trim); b.box(cx - 0.45, y + 5.45, z - 0.07, cx + 0.45, y + 6.35, z + 0.07, 0x1c1a18); }
  W.footprints.push([bx0, bz0, bx1, bz1]);
  // silo
  const qx = bx1 - 2.2, qz = bz1 + 3.4, sc = vine ? 0xd8cdb4 : 0xb8c0c8;
  LB.cyl(b, 2, 2, 9.5, qx, y - 0.5, qz, sc, 14); for (const h of [1.5, 4, 6.5]) LB.cyl(b, 2.06, 2.06, 0.16, qx, y + h, qz, shade(sc, 0.72), 14);
  const dome = new THREE.SphereGeometry(2, 14, 6, 0, TAU, 0, Math.PI / 2); dome.scale(1, 0.7, 1); dome.translate(qx, y + 9, qz); b.geo(dome, vine ? 0xb8552f : 0x8a94a0); dome.dispose();
  b.box(qx - 2.3, y, qz - 0.12, qx - 2.0, y + 9, qz + 0.12, 0x5a5f68); LB.col(qx - 1.9, y - 0.5, qz - 1.9, qx + 1.9, y + 10.4, qz + 1.9, 'metal');
  spawnSpot(bx0 - 2.5, y, s.z - 4, null); addChest('ammo', x1 + 3, y, s.z - 6, 0, null);
}

function bladeGeo() {
  if (Nature._blade) return Nature._blade;
  const b = new GB(); b.add(new THREE.ConeGeometry(0.62, 1.5, 10).rotateX(Math.PI / 2).translate(0, 0, 0.2), 0xf4f4f4);
  for (let k = 0; k < 3; k++) { b.add(new THREE.CylinderGeometry(0.12, 0.52, 11.5, 4).scale(1, 1, 0.22).translate(0, 6.2, 0).rotateZ(k * TAU / 3), 0xf4f4f4); b.add(new THREE.BoxGeometry(0.36, 1.3, 0.1).translate(0, 11.2, 0).rotateZ(k * TAU / 3), 0xd8202e); }
  return Nature._blade = b.build();
}
function buildTurbine(s, R, b) {
  const y = s.h, yaw = 0.7;
  LB.cyl(b, 1.7, 1.5, 0.7, s.x, y - 0.3, s.z, 0x8a8d93, 12); LB.cyl(b, 1.0, 0.5, 27, s.x, y, s.z, 0xf2f2f2, 12);
  b.box(s.x - 0.35, y + 0.4, s.z + 0.9, s.x + 0.35, y + 2.1, s.z + 1.02, 0x5a5f68);
  LB.box(b, 1.5, 1.4, 3.6, s.x + Math.sin(yaw) * 0.5, y + 27.2, s.z + Math.cos(yaw) * 0.5, yaw, 0xe6e6e6);
  const rot = new THREE.Group(); rot.position.set(s.x + Math.sin(yaw) * 2.5, y + 27.2, s.z + Math.cos(yaw) * 2.5); rot.rotation.y = yaw;
  const fan = lmMesh(bladeGeo()); fan.rotation.z = R() * 6; rot.add(fan); W.group.add(rot); Nature.spin.push({ o: fan, ax: 'z', v: 0.9 + R() * 0.5 });
  LB.col(s.x - 0.9, y - 1, s.z - 0.9, s.x + 0.9, y + 27, s.z + 0.9, 'metal');
}
function buildPump(s, R, b) {
  const y = s.h, H = 9.5, M = 0x8a8f96, yaw = 0.7;
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) LB.limb(b, 0.09, 0.07, s.x + lx * 1.4, y - 0.3, s.z + lz * 1.4, s.x + lx * 0.3, y + H, s.z + lz * 0.3, M, 4);
  for (let lv = 0; lv < 3; lv++) { const t0 = lv / 3, t1 = (lv + 1) / 3, r0 = lerp(1.4, 0.3, t0), r1 = lerp(1.4, 0.3, t1), C = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4]; LB.limb(b, 0.04, 0.04, s.x + p[0] * r0, y + H * t0, s.z + p[1] * r0, s.x + q[0] * r1, y + H * t1, s.z + q[1] * r1, M, 3); LB.limb(b, 0.04, 0.04, s.x + p[0] * r1, y + H * t1, s.z + p[1] * r1, s.x + q[0] * r1, y + H * t1, s.z + q[1] * r1, M, 3); } }
  if (!Nature._fan) { const g = new GB(); g.add(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 8).rotateX(Math.PI / 2), 0x5a5f68); for (let k = 0; k < 14; k++) g.add(new THREE.BoxGeometry(0.42, 1.5, 0.04).rotateY(0.45).translate(0, 1.1, 0).rotateZ(k * TAU / 14), k % 2 ? 0xc8ccd4 : 0xb04a3a); g.add(new THREE.TorusGeometry(1.75, 0.04, 4, 20), 0x5a5f68); Nature._fan = g.build(); }
  const rot = new THREE.Group(); rot.position.set(s.x + Math.sin(yaw) * 0.7, y + H + 0.3, s.z + Math.cos(yaw) * 0.7); rot.rotation.y = yaw; const fan = lmMesh(Nature._fan); fan.material = Nature.matDS || (Nature.matDS = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); rot.add(fan); W.group.add(rot); Nature.spin.push({ o: fan, ax: 'z', v: 1.6 + R() });
  LB.box(b, 0.06, 0.9, 1.7, s.x - Math.sin(yaw) * 1.5, y + H + 0.3, s.z - Math.cos(yaw) * 1.5, yaw, 0xb04a3a); LB.box(b, 0.08, 0.08, 2.2, s.x - Math.sin(yaw) * 0.5, y + H + 0.3, s.z - Math.cos(yaw) * 0.5, yaw, M);
  LB.col(s.x - 0.9, y, s.z - 0.9, s.x + 0.9, y + H, s.z + 0.9, 'metal');
  const tx = s.x + 3.6, tz = s.z - 1; for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(tx + lx * 1.1 - 0.1, y - 0.3, tz + lz * 1.1 - 0.1, tx + lx * 1.1 + 0.1, y + 1.6, tz + lz * 1.1 + 0.1, 0x6b4a32);
  LB.cyl(b, 1.7, 1.7, 2.3, tx, y + 1.6, tz, 0x9a6a45, 12); for (const h of [1.9, 3.5]) LB.cyl(b, 1.75, 1.75, 0.12, tx, y + h, tz, 0x4a4f58, 12); LB.cyl(b, 1.8, 0.2, 0.8, tx, y + 3.9, tz, 0x7a8088, 12);
  LB.col(tx - 1.6, y, tz - 1.6, tx + 1.6, y + 4.6, tz + 1.6, 'wood');
}
function buildMast(s, R, b, eb) {
  const y = s.h, H = 32, M = 0x3a3f55, C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  b.box(s.x - 2.4, y - 1, s.z - 2.4, s.x + 2.4, y + 0.3, s.z + 2.4, 0x2a2a3a);
  for (const [lx, lz] of C) LB.limb(b, 0.14, 0.08, s.x + lx * 1.9, y, s.z + lz * 1.9, s.x + lx * 0.3, y + H, s.z + lz * 0.3, M, 4);
  for (let lv = 0; lv < 6; lv++) { const t0 = lv / 6, t1 = (lv + 1) / 6, r0 = lerp(1.9, 0.3, t0), r1 = lerp(1.9, 0.3, t1); for (let k = 0; k < 4; k++) { const p = C[k], q = C[(k + 1) % 4]; LB.limb(b, 0.05, 0.05, s.x + p[0] * r0, y + H * t0, s.z + p[1] * r0, s.x + q[0] * r1, y + H * t1, s.z + q[1] * r1, M, 3); LB.limb(b, 0.05, 0.05, s.x + p[0] * r1, y + H * t1, s.z + p[1] * r1, s.x + q[0] * r1, y + H * t1, s.z + q[1] * r1, M, 3); } eb.box(s.x - r1 - 0.06, y + H * t1 - 0.06, s.z - r1 - 0.06, s.x - r1 + 0.06, y + H * t1 + 0.06, s.z + r1 + 0.06, lv % 2 ? 0xff2fd0 : 0x2fe7ff); }
  LB.cyl(b, 0.07, 0.03, 6, s.x, y + H, s.z, 0xc8ccd4, 5); const og = new THREE.OctahedronGeometry(0.45, 0); og.translate(s.x, y + H + 6.2, s.z); eb.geo(og, 0xff2a3a); og.dispose();
  for (const [h, a] of [[20, 0.4], [24.5, 2.6], [15, 4.4]]) { const g = new THREE.CylinderGeometry(1.1, 0.25, 0.5, 10); g.rotateX(Math.PI / 2); g.rotateY(a); g.translate(s.x + Math.sin(a) * 1.3, y + h, s.z + Math.cos(a) * 1.3); b.geo(g, 0xd8dce4); g.dispose(); }
  LB.col(s.x - 1.5, y - 1, s.z - 1.5, s.x + 1.5, y + H, s.z + 1.5, 'metal');
}
function buildBoard(s, R, b, eb) {
  const y = s.h, ax = R() < 0.5, GL = [0xff2fd0, 0x2fe7ff, 0x9bff4a, 0xffe14a, 0xff7a2a];
  const B = (u0, y0, w0, u1, y1, w1, hex, bt) => { if (ax) bt.box(s.x + u0, y0, s.z + w0, s.x + u1, y1, s.z + w1, hex); else bt.box(s.x + w0, y0, s.z + u0, s.x + w1, y1, s.z + u1, hex); };
  for (const u of [-3.4, 3.4]) { B(u - 0.18, y - 0.5, -0.18, u + 0.18, y + 8.6, 0.18, 0x2a2a3a, b); if (ax) LB.col(s.x + u - 0.25, y, s.z - 0.25, s.x + u + 0.25, y + 8.6, s.z + 0.25, 'metal'); else LB.col(s.x - 0.25, y, s.z + u - 0.25, s.x + 0.25, y + 8.6, s.z + u + 0.25, 'metal'); }
  B(-4.6, y + 4.2, -0.14, 4.6, y + 8.8, 0.14, 0x14141c, b);
  for (const f of [-1, 1]) {
    B(-4.6, y + 8.72, f * 0.15, 4.6, y + 8.86, f * 0.19, GL[1], eb); B(-4.6, y + 4.14, f * 0.15, 4.6, y + 4.28, f * 0.19, GL[0], eb);
    for (let k = 0; k < 5; k++) { const h = 0.6 + R() * 2.6, u = -3.9 + k * 1.1; B(u, y + 4.7, f * 0.15, u + 0.75, y + 4.7 + h, f * 0.18, GL[Math.floor(R() * GL.length)], eb); }
    B(2.1, y + 6.4, f * 0.15, 4.1, y + 8.2, f * 0.18, GL[Math.floor(R() * GL.length)], eb); B(2.1, y + 4.8, f * 0.15, 4.1, y + 5.9, f * 0.18, GL[Math.floor(R() * GL.length)], eb);
  }
}
function buildLight(s, R, b, eb) {
  const y = s.h, alt = W.theme.style === 'flood' ? 0x2a6ad8 : 0xd8342a, H = 17;
  LB.cyl(b, 4.2, 3.6, 1.4, s.x, y - 0.8, s.z, 0x8a8d93, 14);
  for (let i = 0; i < 5; i++) { const t0 = i / 5, t1 = (i + 1) / 5; LB.cyl(b, lerp(2.7, 1.7, t0), lerp(2.7, 1.7, t1), H / 5, s.x, y + 0.6 + H * t0, s.z, i % 2 ? alt : 0xf6f4ee, 14); }
  b.box(s.x - 0.6, y + 0.6, s.z + 2.5, s.x + 0.6, y + 2.8, s.z + 2.75, 0x3a2a1c);
  for (const h of [6, 11]) b.box(s.x - 0.3, y + h, s.z + 1.9, s.x + 0.3, y + h + 0.9, s.z + 2.3, 0x1c2430);
  LB.cyl(b, 2.6, 2.6, 0.3, s.x, y + 0.6 + H, s.z, 0x2a2e36, 14); LB.cyl(b, 2.55, 2.55, 0.08, s.x, y + 1.9 + H, s.z, 0x2a2e36, 14);
  for (let k = 0; k < 10; k++) b.box(s.x + Math.cos(k * 0.628) * 2.5 - 0.04, y + 0.9 + H, s.z + Math.sin(k * 0.628) * 2.5 - 0.04, s.x + Math.cos(k * 0.628) * 2.5 + 0.04, y + 1.9 + H, s.z + Math.sin(k * 0.628) * 2.5 + 0.04, 0x2a2e36);
  const lg = new THREE.CylinderGeometry(1.25, 1.25, 2, 10); lg.translate(s.x, y + 1.9 + H, s.z); eb.geo(lg, 0xfff2a8); lg.dispose();
  for (let k = 0; k < 6; k++) b.box(s.x + Math.cos(k * 1.047) * 1.28 - 0.05, y + 0.9 + H, s.z + Math.sin(k * 1.047) * 1.28 - 0.05, s.x + Math.cos(k * 1.047) * 1.28 + 0.05, y + 2.9 + H, s.z + Math.sin(k * 1.047) * 1.28 + 0.05, 0x2a2e36);
  LB.cyl(b, 1.7, 0.1, 1.6, s.x, y + 2.9 + H, s.z, alt, 10); LB.cyl(b, 0.08, 0.08, 1.2, s.x, y + 4.4 + H, s.z, 0x2a2e36, 5);
  const beam = new THREE.Group(); beam.position.set(s.x, y + 1.9 + H, s.z);
  const bg = new THREE.ConeGeometry(4, 70, 12, 1, true); bg.translate(0, -35, 0); bg.rotateZ(Math.PI / 2 + 0.04); W.disp.push(bg);
  const bm = Nature.matBeam || (Nature.matBeam = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  bm.opacity = W.theme.night ? 0.22 : 0.05; const m1 = new THREE.Mesh(bg, bm), m2 = new THREE.Mesh(bg, bm); m2.rotation.y = Math.PI; beam.add(m1, m2); W.group.add(beam); Nature.spin.push({ o: beam, ax: 'y', v: 0.5 });
  LB.col(s.x - 2.4, y - 1, s.z - 2.4, s.x + 2.4, y + H + 0.6, s.z + 2.4, 'brick');
  spawnSpot(s.x, y, s.z + 5, null);
}
function buildPier(s, R, b, eb) {
  const [dx, dz] = s.dir, wy = W.waterY, y = wy + 0.95, L = 26, hw = 1.45, PL = [0x9a7248, 0x8a6540, 0xa67c50, 0x7d5c3a];
  const at = (i, w) => [s.x + dx * i - dz * w, s.z + dz * i + dx * w];
  const bx = (i0, w0, y0, i1, w1, y1, hex, bt) => { const p = at(i0, w0), q = at(i1, w1); (bt || b).box(Math.min(p[0], q[0]), y0, Math.min(p[1], q[1]), Math.max(p[0], q[0]), y1, Math.max(p[1], q[1]), hex); };
  let i0 = 0; while (i0 > -12 && groundH(s.x + dx * i0, s.z + dz * i0) < y - 0.15) i0 -= 0.6;
  for (let i = i0; i < L; i += 0.62) bx(i, -hw, y - 0.14, i + 0.54, hw, y, PL[Math.floor(R() * PL.length)]);
  bx(i0, -hw + 0.1, y - 0.34, L, -hw + 0.3, y - 0.14, 0x5a4028); bx(i0, hw - 0.3, y - 0.34, L, hw - 0.1, y - 0.14, 0x5a4028);
  for (let i = 0; i <= L; i += 4.3) for (const w of [-hw, hw]) { const p = at(i, w); LB.cyl(b, 0.17, 0.15, 5.2, p[0], wy - 3.6, p[1], 0x5a4028, 7); LB.cyl(b, 0.2, 0.2, 0.08, p[0], wy + 1.6, p[1], 0xd8d0c0, 7); }
  for (let i = 4.3; i <= L - 4; i += 4.3) { const p = at(i, hw), q = at(i + 4.3, hw); for (let k = 0; k < 4; k++) LB.limb(b, 0.03, 0.03, lerp(p[0], q[0], k / 4), y + 0.55 - Math.sin(k / 4 * Math.PI) * 0.22, lerp(p[1], q[1], k / 4), lerp(p[0], q[0], (k + 1) / 4), y + 0.55 - Math.sin((k + 1) / 4 * Math.PI) * 0.22, lerp(p[1], q[1], (k + 1) / 4), 0xd8c8a0, 4); }
  for (let i = L; i < L + 5.4; i += 0.62) bx(i, -3, y - 0.14, i + 0.54, 3, y, PL[Math.floor(R() * PL.length)]);
  for (const [i, w] of [[L, -3], [L, 3], [L + 5.4, -3], [L + 5.4, 3]]) { const p = at(i, w); LB.cyl(b, 0.2, 0.18, 5.6, p[0], wy - 3.6, p[1], 0x5a4028, 7); }
  { const p = at(i0, -hw), q = at(L, hw); LB.col(p[0], y - 0.3, p[1], q[0], y, q[1]); const p2 = at(L, -3), q2 = at(L + 5.4, 3); LB.col(p2[0], y - 0.3, p2[1], q2[0], y, q2[1]); }
  // lamp, barrel, crate on the end platform
  { const p = at(L + 4.6, -2.4); b.box(p[0] - 0.08, y, p[1] - 0.08, p[0] + 0.08, y + 3.2, p[1] + 0.08, 0x2a2e36); eb.box(p[0] - 0.2, y + 3.2, p[1] - 0.2, p[0] + 0.2, y + 3.6, p[1] + 0.2, W.theme.night ? 0x2fe7ff : 0xffe9a0); b.box(p[0] - 0.26, y + 3.6, p[1] - 0.26, p[0] + 0.26, y + 3.68, p[1] + 0.26, 0x2a2e36); }
  { const p = at(L + 1.2, 2.2); LB.cyl(b, 0.42, 0.42, 1.0, p[0], y, p[1], 0x7a4a26, 10); for (const h of [0.2, 0.8]) LB.cyl(b, 0.44, 0.44, 0.07, p[0], y + h, p[1], 0x3a3f48, 10); LB.col(p[0] - 0.4, y, p[1] - 0.4, p[0] + 0.4, y + 1, p[1] + 0.4); const q = at(L + 2.4, 2.2); solid(b, q[0] - 0.45, y, q[1] - 0.45, q[0] + 0.45, y + 0.9, q[1] + 0.45, 0xb07a3a, 'wood'); }
  // rowing boat moored alongside
  { const p = at(L * 0.55, -hw - 1.5), g = new THREE.SphereGeometry(1, 12, 8), pa = g.attributes.position.array; for (let k = 1; k < pa.length; k += 3) pa[k] = Math.min(pa[k], 0.1); g.scale(0.85, 0.62, 2.1); g.computeVertexNormals(); if (dx !== 0) g.rotateY(Math.PI / 2); g.translate(p[0], wy + 0.22, p[1]); b.geo(g, pickR(R, [0xd8342a, 0x2a6ad8, 0xf2f2f2, 0x2f9a5a])); g.dispose();
    for (const o of [-0.8, 0.3]) { const q = at(L * 0.55 + o, -hw - 1.5); if (dx !== 0) b.box(q[0] - 0.12, wy + 0.2, q[1] - 0.72, q[0] + 0.12, wy + 0.32, q[1] + 0.72, 0x8a6540); else b.box(q[0] - 0.72, wy + 0.2, q[1] - 0.12, q[0] + 0.72, wy + 0.32, q[1] + 0.12, 0x8a6540); }
    LB.col(p[0] - 0.9, wy - 0.4, p[1] - 0.9, p[0] + 0.9, wy + 0.3, p[1] + 0.9); }
  const e = at(L + 2.7, -0.6); if (R() < 0.5) addChest('ammo', e[0], y, e[1], Math.atan2(-dx, -dz), null); spawnSpot(e[0] + dx, y, e[1] + dz, null);
}
function buildRuin(s, R, b, eb) {
  const y = s.h, desert = W.theme.style === 'desert', st = desert ? 0xc49a6a : 0xe8e0cc, st2 = shade(st, 0.86);
  LB.cyl(b, 9, 9, 0.5, s.x, y - 0.25, s.z, st2, 20); LB.cyl(b, 7.8, 7.8, 0.45, s.x, y + 0.25, s.z, st, 20); LB.col(s.x - 5.6, y - 1, s.z - 5.6, s.x + 5.6, y + 0.7, s.z + 5.6, 'brick');
  const tops = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU, x = s.x + Math.cos(a) * 6.2, z = s.z + Math.sin(a) * 6.2, full = R() < 0.55, h = full ? 6 : 1.2 + R() * 3.4;
    b.box(x - 0.72, y + 0.7, z - 0.72, x + 0.72, y + 1.0, z + 0.72, st2);
    for (let d = 0; d < h; d += 1.2) LB.cyl(b, 0.52, 0.5, Math.min(1.16, h - d), x, y + 1.0 + d, z, d / 1.2 % 2 ? st : shade(st, 0.94), 12);
    if (full) { b.box(x - 0.74, y + 7.0, z - 0.74, x + 0.74, y + 7.35, z + 0.74, st2); tops.push([k, x, z]); } else LB.blob(b, 0.5, x, y + 1.0 + h, z, st2, 0.5);
    LB.col(x - 0.5, y + 0.6, z - 0.5, x + 0.5, y + 1 + h, z + 0.5, 'brick');
  }
  for (let i = 0; i < tops.length; i++) { const p = tops[i], q = tops[(i + 1) % tops.length]; if ((q[0] - p[0] + 8) % 8 !== 1) continue; const g = new THREE.BoxGeometry(Math.hypot(q[1] - p[1], q[2] - p[2]) + 1.3, 0.7, 1.1); g.rotateY(-Math.atan2(q[2] - p[2], q[1] - p[1])); g.translate((p[1] + q[1]) / 2, y + 7.7, (p[2] + q[2]) / 2); b.geo(g, st); g.dispose(); }
  for (let k = 0; k < 3; k++) { const a = R() * TAU, d = 8.5 + R() * 2.5, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, gy = groundH(x, z), g = new THREE.CylinderGeometry(0.52, 0.52, 1.3, 12); g.rotateZ(Math.PI / 2); g.rotateY(R() * 3); g.translate(x, gy + 0.42, z); b.geo(g, st2); g.dispose(); LB.col(x - 0.6, gy - 0.2, z - 0.6, x + 0.6, gy + 0.95, z + 0.6, 'brick'); }
  solid(b, s.x - 1, y + 0.7, s.z - 0.7, s.x + 1, y + 1.6, s.z + 0.7, st, 'brick'); b.box(s.x - 1.15, y + 1.6, s.z - 0.85, s.x + 1.15, y + 1.78, s.z + 0.85, st2);
  const og = new THREE.OctahedronGeometry(0.42, 0); og.scale(1, 1.5, 1); og.translate(s.x, y + 2.7, s.z); eb.geo(og, desert ? 0x2fe0d0 : 0xffd84a); og.dispose();
  const a = R() * TAU; addChest('chest', s.x + Math.cos(a) * 3.2, y + 0.7, s.z + Math.sin(a) * 3.2, -a + Math.PI / 2, null); spawnSpot(s.x - Math.cos(a) * 3, y + 0.7, s.z - Math.sin(a) * 3, null);
}
function buildBones(s, R, b) {
  const y = groundH(s.x, s.z), bone = 0xe8e0cc, a = R() * TAU, ux = Math.cos(a), uz = Math.sin(a), ry = -a;
  LB.limb(b, 0.34, 0.2, s.x - ux * 6.5, y + 0.5, s.z - uz * 6.5, s.x + ux * 6, y + 1.2, s.z + uz * 6, bone, 7);
  for (let k = 0; k < 8; k++) { const t = -5 + k * 1.4, r = 2.9 - Math.abs(k - 3) * 0.26, g = new THREE.TorusGeometry(r, 0.17, 5, 12, Math.PI * 0.9); g.rotateZ(0.16); g.rotateY(ry + Math.PI / 2 + (R() - 0.5) * 0.14); g.translate(s.x + ux * t, y + 0.25, s.z + uz * t); b.geo(g, k % 2 ? bone : shade(bone, 0.9)); g.dispose(); }
  const hx = s.x + ux * 7.6, hz = s.z + uz * 7.6; LB.blob(b, 1.5, hx, y + 1.3, hz, bone, 0.85); LB.blob(b, 1.0, hx + ux * 1.5, y + 0.9, hz + uz * 1.5, shade(bone, 0.94), 0.7);
  for (const k of [-1, 1]) { LB.blob(b, 0.32, hx + ux * 0.9 - uz * 0.75 * k, y + 1.6, hz + uz * 0.9 + ux * 0.75 * k, 0x1c1a18); LB.limb(b, 0.24, 0.03, hx - uz * 1.1 * k, y + 1.9, hz + ux * 1.1 * k, hx - uz * 2.6 * k + ux * 0.8, y + 3.3, hz + ux * 2.6 * k + uz * 0.8, bone, 6); }
  LB.col(hx - 1.3, y, hz - 1.3, hx + 1.3, y + 2.4, hz + 1.3, 'brick');
  addChest('ammo', s.x - uz * 0.2, y, s.z + ux * 0.2, R() * 6, null); spawnSpot(s.x + ux * 2, y, s.z + uz * 2, null);
}
// poles, lamps and braziers along the roads
function buildRoadside(R, b, eb) {
  const style = W.theme.style, wires = [];
  for (const p of W.paths) {
    const pts = p.pts, side = R() < 0.5 ? 1 : -1; let prev = null;
    for (let i = 8; i < pts.length - 6; i += style === 'city' ? 13 : 15) {
      const a = pts[i - 1], c = pts[i + 1]; let tx = c[0] - a[0], tz = c[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const off = p.w / 2 + 1.7, x = pts[i][0] - tz * off * side, z = pts[i][1] + tx * off * side, y = groundH(x, z);
      if (nearSite(x, z, 3) || y < W.waterY + 0.6) { prev = null; continue; }
      if (style === 'city') {
        b.box(x - 0.1, y - 0.3, z - 0.1, x + 0.1, y + 6.4, z + 0.1, 0x2a2a3a); LB.limb(b, 0.07, 0.06, x, y + 6.3, z, x + tz * 1.7 * side, y + 6.7, z - tx * 1.7 * side, 0x2a2a3a, 4);
        const lx = x + tz * 1.7 * side, lz = z - tx * 1.7 * side; eb.box(lx - 0.28, y + 6.5, lz - 0.28, lx + 0.28, y + 6.66, lz + 0.28, (i / 13 | 0) % 2 ? 0xff2fd0 : 0x2fe7ff); LB.col(x - 0.16, y, z - 0.16, x + 0.16, y + 6.4, z + 0.16, 'metal');
      } else if (style === 'temple') {
        b.box(x - 0.38, y - 0.3, z - 0.38, x + 0.38, y + 0.3, z + 0.38, 0xd8cdb4); LB.cyl(b, 0.2, 0.17, 1.7, x, y + 0.3, z, 0xe8e0cc, 8); LB.cyl(b, 0.2, 0.46, 0.3, x, y + 2.0, z, 0xb8862a, 8);
        const g = new THREE.OctahedronGeometry(0.26, 0); g.scale(1, 1.7, 1); g.translate(x, y + 2.62, z); eb.geo(g, 0xff9a2a); g.dispose(); LB.col(x - 0.3, y, z - 0.3, x + 0.3, y + 2.3, z + 0.3, 'brick');
      } else {
        const wood = 0x5e4028; b.box(x - 0.11, y - 0.4, z - 0.11, x + 0.11, y + 7.6, z + 0.11, wood); LB.box(b, 2.0, 0.12, 0.12, x, y + 7.1, z, Math.atan2(tx, tz) + Math.PI / 2 + Math.PI / 2, wood);
        const ends = [-1, 1].map(k => [x - tz * 0.9 * k, y + 7.28, z + tx * 0.9 * k]); for (const e of ends) LB.cyl(b, 0.05, 0.05, 0.18, e[0], y + 7.16, e[2], 0x9fc4dd, 5);
        if (i % 2) { b.box(x - 0.2, y + 5.6, z - 0.2, x + 0.2, y + 6.3, z + 0.2, 0x7a8088); }
        LB.col(x - 0.14, y, z - 0.14, x + 0.14, y + 7.6, z + 0.14, 'wood');
        if (prev) for (let k = 0; k < 2; k++) for (let q = 0; q < 6; q++) { const t0 = q / 6, t1 = (q + 1) / 6, A = prev[k], B = ends[k]; wires.push(lerp(A[0], B[0], t0), lerp(A[1], B[1], t0) - Math.sin(t0 * Math.PI) * 0.7, lerp(A[2], B[2], t0), lerp(A[0], B[0], t1), lerp(A[1], B[1], t1) - Math.sin(t1 * Math.PI) * 0.7, lerp(A[2], B[2], t1)); }
        prev = ends;
      }
    }
  }
  if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); W.disp.push(g); W.group.add(new THREE.LineSegments(g, Nature.matWire || (Nature.matWire = new THREE.LineBasicMaterial({ color: 0x1c1c1c })))); }
}
function buildLandmarks(R, b, eb) {
  const F = { camp: buildCamp, farm: buildFarm, turbine: buildTurbine, pump: buildPump, mast: buildMast, board: buildBoard, light: buildLight, pier: buildPier, ruin: buildRuin, bones: buildBones };
  for (const s of W.spots) { s.h = s.type === 'pier' ? s.h : groundH(s.x, s.z); F[s.type](s, R, b, eb); }
  buildRoadside(R, b, eb);
}
