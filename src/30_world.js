// =====================================================================
//  World: spatial hash, heightfield, towns, vaults, foliage, chests
// =====================================================================
const CS = 8;
const Grid = {
  map: new Map(), stamp: 1,
  clear() { this.map.clear(); },
  key(cx, cz) { return (cx + 2048) * 4096 + (cz + 2048); },
  add(c) {
    c.cells = []; c._s = 0;
    if (!Number.isFinite(c.minX + c.maxX + c.minZ + c.maxZ) || c.maxX - c.minX > 400 || c.maxZ - c.minZ > 400) return c;
    const x0 = Math.floor(c.minX / CS), x1 = Math.floor(c.maxX / CS), z0 = Math.floor(c.minZ / CS), z1 = Math.floor(c.maxZ / CS);
    c.cells = []; c._s = 0;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = this.key(x, z); let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); } a.push(c); c.cells.push(k);
    }
    return c;
  },
  remove(c) {
    if (!c.cells) return;
    for (const k of c.cells) { const a = this.map.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); } }
    c.cells = null; c.dead = true;
  },
  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0; const s = ++this.stamp;
    if (!Number.isFinite(minX + minZ + maxX + maxZ) || maxX - minX > 400 || maxZ - minZ > 400) return out;
    const x0 = Math.floor(minX / CS), x1 = Math.floor(maxX / CS), z0 = Math.floor(minZ / CS), z1 = Math.floor(maxZ / CS);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const a = this.map.get(this.key(x, z)); if (!a) continue;
      for (const c of a) if (c._s !== s) { c._s = s; out.push(c); }
    }
    return out;
  },
};

const W = {
  size: 1400, half: 700, N: 280, cell: 5, R: 530, heights: null, cls: null, waterY: 0, theme: null, key: '', noise: null, paths: [], pathGrid: null, pathN: 0, spots: [],
  pois: [], vaults: [], sites: [], harv: [], chests: [], footprints: [], group: null, disp: [], maxH: 0, carList: [],
  mapCanvas: null, TC: {}, skyTop: null, skyHor: null, sunDir: new THREE.Vector3(0.4, 0.8, 0.3).normalize(),
};

function rawHeight(x, z) {
  const th = W.theme, n = W.noise;
  const d = Math.hypot(x, z) / W.R;
  const wob = n.fbm(x * 0.004 + 11, z * 0.004 - 7, 3) * 0.35;
  const mask = smooth(1.02, 0.78, d + wob);
  let h = th.base + 2 + n.fbm(x * 0.0045, z * 0.0045, 5) * th.rough;
  const m = Math.max(0, n.fbm(x * 0.0022 + 31, z * 0.0022 - 17, 4) + th.mBias);
  h += m * m * th.mount;
  return lerp(-12, h, mask);
}

function groundH(x, z) {
  const fx = (x + W.half) / W.cell, fz = (z + W.half) / W.cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= W.N || iz >= W.N) return -12;
  const tx = fx - ix, tz = fz - iz, n1 = W.N + 1, H = W.heights;
  const h00 = H[iz * n1 + ix], h10 = H[iz * n1 + ix + 1], h01 = H[(iz + 1) * n1 + ix], h11 = H[(iz + 1) * n1 + ix + 1];
  if (tz > tx) return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
}

function placeSites(R) {
  const th = W.theme; W.pois = []; W.vaults = [];
  let tries = 0;
  const want = Math.min(th.pois.length, 15);
  while (W.pois.length < want && tries < 9000) {
    tries++;
    const a = R() * TAU, d = (0.08 + R() * 0.66) * W.R; const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = rawHeight(x, z); if (h < W.waterY + 1.2 || h > 42) continue;
    if (W.pois.some(p => Math.hypot(p.x - x, p.z - z) < 106)) continue;
    W.pois.push({ x, z, r: 44, h: Math.max(h, W.waterY + 2.2), name: th.pois[W.pois.length], kind: 'poi' });
  }
  tries = 0;
  const vn = [["The Warden's Vault", 'warden'], ["The Foreman's Forge", 'foreman']];
  while (W.vaults.length < 2 && tries < 6000) {
    tries++;
    const a = R() * TAU, d = (0.12 + R() * 0.62) * W.R; const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = rawHeight(x, z); if (h < W.waterY + 1.5 || h > 40) continue;
    if (W.pois.some(p => Math.hypot(p.x - x, p.z - z) < 84) || W.vaults.some(p => Math.hypot(p.x - x, p.z - z) < 120)) continue;
    const [name, boss] = vn[W.vaults.length];
    W.vaults.push({ x, z, r: 20, h: Math.max(h, W.waterY + 2.2), name, boss, kind: 'vault' });
  }
  W.sites = W.pois.concat(W.vaults);
}

function computeHeights() {
  const n1 = W.N + 1; W.heights = new Float32Array(n1 * n1); let mx = -99;
  for (let iz = 0; iz <= W.N; iz++) for (let ix = 0; ix <= W.N; ix++) {
    const x = -W.half + ix * W.cell, z = -W.half + iz * W.cell;
    let h = rawHeight(x, z);
    for (const p of W.sites) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 34) h = lerp(h, p.h, smooth(p.r + 34, p.r + 8, d)); }
    W.heights[iz * n1 + ix] = h; if (h > mx) mx = h;
  }
  W.maxH = mx;
}

// Colour of a patch of ground. Returns its class: 0 water, 1 sand, 2 grass, 3 rock, 4 plaza, 5 snow.
function terrainColor(x, h, z, ny, out) {
  const th = W.theme, TC = W.TC, wy = W.waterY, n = W.noise; let cls = 2;
  if (h < wy - 0.15) { cls = 0; out.copy(TC.under).lerp(TC.deep, clamp((wy - h - 1.5) / 8, 0, 1)); }
  else if (h < wy + 1.1) { cls = 1; out.copy(TC.sand); if (h < wy + 0.3) out.multiplyScalar(0.86); else out.lerp(TC.sand2, n.n2(x * 0.06, z * 0.06) * 0.5 + 0.5); }
  else if (ny < 0.74) { cls = 3; out.copy(TC.rock).lerp(TC.rock2, Math.sin(h * 1.1 + n.n2(x * 0.02, z * 0.02) * 4) * 0.5 + 0.5); }
  else if (th.snowLine && h > th.snowLine + n.n2(x * 0.03, z * 0.03) * 4) { cls = 5; out.copy(TC.snow); }
  else {
    const t = n.n2(x * 0.035, z * 0.035) * 0.5 + 0.5, big = n.fbm(x * 0.006 + 9, z * 0.006 + 4, 2) * 0.5 + 0.5;
    out.copy(TC.grass).lerp(TC.grass2, t).lerp(TC.dry, smooth(0.5, 0.75, big) * 0.55);
    out.lerp(TC.floor, forestAt(x, z) * 0.5);
    const dn = n.n2(x * 0.09 + 40, z * 0.09 - 12); if (dn > 0.5) out.lerp(TC.dirt, smooth(0.5, 0.7, dn) * 0.65);
    if (h < wy + 2.6) out.lerp(TC.sand, smooth(wy + 2.6, wy + 1.1, h) * 0.65);
    if (ny < 0.85) out.lerp(TC.rock, smooth(0.85, 0.74, ny) * 0.6);
    if (th.snowLine && h > th.snowLine - 7) out.lerp(TC.snow, smooth(th.snowLine - 7, th.snowLine, h) * 0.5);
  }
  if (h >= wy - 1) for (const p of W.sites) { const dx = x - p.x, dz = z - p.z; if (dx * dx + dz * dz < (p.r + 4) * (p.r + 4)) { out.copy(TC.plaza); cls = 4; break; } }
  if (cls === 2 || cls === 1 || cls === 3) { const pd = pathDist(x, z); if (pd < 6.5) out.lerp(TC.path, smooth(6.5, 1.5, pd) * 0.5); }
  const hv = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; const v = 0.93 + (hv - Math.floor(hv)) * 0.1;
  out.multiplyScalar(v); return cls;
}

function buildTerrain() {
  const N = W.N, n1 = N + 1, H = W.heights, cs = W.cell;
  const pos = new Float32Array(n1 * n1 * 3), col = new Float32Array(n1 * n1 * 3), uv = new Float32Array(n1 * n1 * 2), vc = new Uint8Array(n1 * n1), idx = new Uint32Array(N * N * 6);
  const tc = new THREE.Color(), hAt = (ix, iz) => H[clamp(iz, 0, N) * n1 + clamp(ix, 0, N)];
  for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) {
    const i = iz * n1 + ix, x = -W.half + ix * cs, z = -W.half + iz * cs, h = H[i];
    const gx = (hAt(ix + 1, iz) - hAt(ix - 1, iz)) / (2 * cs), gz = (hAt(ix, iz + 1) - hAt(ix, iz - 1)) / (2 * cs);
    vc[i] = terrainColor(x, h, z, 1 / Math.sqrt(1 + gx * gx + gz * gz), tc);
    pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z; col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; uv[i * 2] = x / 7; uv[i * 2 + 1] = z / 7;
  }
  W.cls = new Uint8Array(N * N); let k = 0;
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const a = iz * n1 + ix, b = a + 1, c = a + n1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = d; idx[k++] = a; idx[k++] = d; idx[k++] = b;
    const cl = [vc[a], vc[b], vc[c], vc[d]];   // a cell only counts as grass (or sand) when all four corners agree
    W.cls[iz * N + ix] = cl.includes(0) ? 0 : cl.every(v => v === 2) ? 2 : cl.every(v => v === 1 || v === 2) ? 1 : cl.find(v => v !== 2 && v !== 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals(); W.disp.push(g);
  const m = new THREE.Mesh(g, MAT.terrain); m.receiveShadow = true; W.group.add(m);
  const wg = new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2); W.disp.push(wg);
  waterMesh = new THREE.Mesh(wg, waterMaterial());
  waterMesh.position.y = W.waterY; waterMesh.renderOrder = 1; W.group.add(waterMesh);
  // sea floor past the edge of the terrain, so the open ocean has no square seam
  const fg = new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2); W.disp.push(fg);
  const floor = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: W.TC.deep })); floor.position.y = -12.3; W.group.add(floor);
}

// ---------------------------------------------------------------- static geometry batches
class Batch {
  constructor() { this.p = []; this.n = []; this.c = []; }
  get count() { return this.p.length; }
  _q(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, r, g, b) {
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 6; i++) { this.n.push(nx, ny, nz); this.c.push(r, g, b); }
  }
  box(x0, y0, z0, x1, y1, z1, hex) {
    _c1.setHex(hex); const r = _c1.r, g = _c1.g, b = _c1.b;
    this._q(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, r, g, b);
    this._q(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, r, g, b);
    this._q(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, r, g, b);
    this._q(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, r, g, b);
    this._q(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, r, g, b);
    this._q(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, r, g, b);
  }
  // a single flat quad on an axis-aligned plane (axis 'x': plane z = f, 'z': plane x = f), facing +/- along the normal
  face(axis, f, n, s0, s1, y0, y1, hex) {
    _c1.setHex(hex); const r = _c1.r, g = _c1.g, bb = _c1.b;
    if (axis === 'x') { if (n > 0) this._q(s0, y0, f, s1, y0, f, s1, y1, f, s0, y1, f, 0, 0, 1, r, g, bb); else this._q(s1, y0, f, s0, y0, f, s0, y1, f, s1, y1, f, 0, 0, -1, r, g, bb); }
    else { if (n > 0) this._q(f, y0, s1, f, y0, s0, f, y1, s0, f, y1, s1, 1, 0, 0, r, g, bb); else this._q(f, y0, s0, f, y0, s1, f, y1, s1, f, y1, s0, -1, 0, 0, r, g, bb); }
  }
  geo(g, hex) {
    const ng = g.index ? g.toNonIndexed() : g; const P = ng.attributes.position.array, N = ng.attributes.normal.array;
    _c1.setHex(hex);
    for (let i = 0; i < P.length; i += 3) { this.p.push(P[i], P[i + 1], P[i + 2]); this.n.push(N[i], N[i + 1], N[i + 2]); this.c.push(_c1.r, _c1.g, _c1.b); }
    if (ng !== g) ng.dispose();
  }
  mesh(mat, shadows = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); W.disp.push(g);
    const m = new THREE.Mesh(g, mat); m.castShadow = shadows; m.receiveShadow = shadows; return m;
  }
}
function solid(b, x0, y0, z0, x1, y1, z1, hex, mat) {
  b.box(x0, y0, z0, x1, y1, z1, hex);
  return Grid.add({ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, kind: 'static', mat: mat || 'brick' });
}
function wallSeg(b, axis, a0, a1, fixed, y0, y1, th, open, hex, mat) {
  const box = (s0, s1, yy0, yy1) => {
    if (s1 - s0 < 0.05 || yy1 - yy0 < 0.05) return;
    if (axis === 'x') solid(b, s0, yy0, fixed - th / 2, s1, yy1, fixed + th / 2, hex, mat);
    else solid(b, fixed - th / 2, yy0, s0, fixed + th / 2, yy1, s1, hex, mat);
  };
  if (!open) { box(a0, a1, y0, y1); return; }
  const o0 = open.c - open.w / 2, o1 = open.c + open.w / 2;
  box(a0, o0, y0, y1); box(o1, a1, y0, y1);
  if (open.b > 0) box(o0, o1, y0, y0 + open.b);
  if (open.t < y1 - y0) box(o0, o1, y0 + open.t, y1);
}
function rampGeo(b, x0, z0, x1, z1, y0, rise, dir, hex, thick = 0.22, lift = 0) {
  const alongX = dir < 2; const L = alongX ? x1 - x0 : z1 - z0; const wid = alongX ? z1 - z0 : x1 - x0;
  const sl = Math.hypot(L, rise), ang = Math.atan2(rise, L);
  const g = alongX ? new THREE.BoxGeometry(sl, thick, wid) : new THREE.BoxGeometry(wid, thick, sl);
  if (dir === 0) g.rotateZ(ang); else if (dir === 1) g.rotateZ(-ang); else if (dir === 2) g.rotateX(-ang); else g.rotateX(ang);
  g.translate((x0 + x1) / 2, y0 + rise / 2 + lift, (z0 + z1) / 2);
  b.geo(g, hex); g.dispose();
}
function addRamp(b, x0, z0, x1, z1, y0, rise, dir, hex, mat) {
  rampGeo(b, x0, z0, x1, z1, y0, rise, dir, hex);
  return Grid.add({ kind: 'ramp', minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: y0, maxY: y0 + rise, y0, rise, dir, mat: mat || 'wood' });
}

function rollFloorLoot() {
  const r = Math.random();
  if (r < 0.55) { const w = rollWeapon(RAR_FLOOR); return [w, ammoFor(w.wid)]; }
  if (r < 0.85) return [rollHeal()];
  const a = pick(Object.keys(AMMO)); return [{ kind: 'ammo', ammo: a, count: AMMO[a].pick }];
}
function spawnSpot(x, y, z, path) {
  const items = rollFloorLoot();
  items.forEach((it, i) => Pickups.spawn(it, x + (i ? 0.7 : 0), y, z + (i ? 0.4 : 0), { path, spot: true }));
}

const DOORN = { '-z': [0, -1], '+z': [0, 1], '-x': [-1, 0], '+x': [1, 0] };
// ---------------------------------------------------------------- decorative building detail (merged into the static batch, no collision)
const TRIM = { town: 0xf4f1ea, flood: 0xf7f7f3, city: 0x161822, temple: 0xd8a82a, desert: 0x6b4a32 };
const INNER = { town: [0xefe6d2, 0xe2e8ee, 0xf0dcc8, 0xdfe8d6, 0xf3eee4], flood: [0xeef2f0, 0xe6eef4, 0xf4ece0], city: [0x3a3f55, 0x33384a, 0x45405a], temple: [0xf3efe6], desert: [0xead8ba, 0xe4cfa9] };
const FLOOR = { town: 0xa8794a, flood: 0xb8996a, city: 0x2c2f3c, temple: 0xe6e0d2, desert: 0xc4744c };
function shade(hex, k) { return _c2.setHex(hex).multiplyScalar(k).getHex(); }
function decoRand(x, z) { return mulberry32(((Math.round(x * 10) * 73856093) ^ (Math.round(z * 10) * 19349663)) >>> 0); }
// solid parts of a wall with one opening, as [s0, s1, y0, y1]
function wallRects(a0, a1, y0, y1, open) {
  if (!open) return [[a0, a1, y0, y1]];
  const o0 = open.c - open.w / 2, o1 = open.c + open.w / 2, r = [[a0, o0, y0, y1], [o1, a1, y0, y1]];
  if (open.b > 0) r.push([o0, o1, y0, y0 + open.b]);
  if (open.t < y1 - y0) r.push([o0, o1, y0 + open.t, y1]);
  return r.filter(q => q[1] - q[0] > 0.04 && q[3] - q[2] > 0.04);
}
// a box stuck to a wall face: s along the wall, y up, depth d0..d1 out from the face (f = face coordinate, n = outward sign)
function faceBox(b, axis, f, n, s0, s1, y0, y1, d0, d1, hex) {
  const p0 = f + n * d0, p1 = f + n * d1, q0 = Math.min(p0, p1), q1 = Math.max(p0, p1);
  if (axis === 'x') b.box(Math.min(s0, s1), y0, q0, Math.max(s0, s1), y1, q1, hex); else b.box(q0, y0, Math.min(s0, s1), q1, y1, Math.max(s0, s1), hex);
}
function triPrism(b, pts, axisZ, c0, c1, hex) {   // triangle in the x/y (or z/y) plane, extruded between c0 and c1 along the other axis
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); sh.lineTo(pts[1][0], pts[1][1]); sh.lineTo(pts[2][0], pts[2][1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: c1 - c0, bevelEnabled: false });
  if (axisZ) g.translate(0, 0, c0); else { g.rotateY(-Math.PI / 2); g.translate(c0, 0, 0); g.scale(-1, 1, 1); g.translate(c0 + c1, 0, 0); }
  b.geo(g, hex); g.dispose();
}
// one wall segment's dressing: paint inside, siding outside, framed windows (crossbars, sill, shutters, flower box), door frame and open door leaves
function dressWall(b, eb, o) {
  const { axis, a0, a1, fixed, th, y0, y1, open, n, style, wc, trim, inner, D, ground, door } = o;
  const outF = fixed + n * th / 2, inF = fixed - n * th / 2, rects = wallRects(a0, a1, y0, y1, open);
  for (const [s0, s1, q0, q1] of rects) {
    b.face(axis, inF - n * 0.012, -n, Math.min(s0, s1), Math.max(s0, s1), q0, q1, inner);
    if (q0 <= y0 + 0.01) faceBox(b, axis, inF, -n, s0, s1, q0, q0 + 0.13, 0, 0.035, shade(inner, 0.72));       // skirting board
    if (style === 'town' || style === 'flood') for (let y = y0 + 0.42; y < y1 - 0.1; y += 0.42) if (y >= q0 && y + 0.05 <= q1) { b.face(axis, outF + n * 0.012, n, Math.min(s0, s1), Math.max(s0, s1), y, y + 0.05, shade(wc, 0.84)); b.face(axis, outF + n * 0.006, n, Math.min(s0, s1), Math.max(s0, s1), y + 0.05, y + 0.11, shade(wc, 0.94)); }
  }
  if (!open) return;
  const o0 = open.c - open.w / 2, o1 = open.c + open.w / 2, ob = y0 + open.b, ot = y0 + open.t, tw = 0.13;
  faceBox(b, axis, outF, n, o0 - tw, o0, ob - (door ? 0 : 0.05), ot + 0.05, 0, 0.07, trim);
  faceBox(b, axis, outF, n, o1, o1 + tw, ob - (door ? 0 : 0.05), ot + 0.05, 0, 0.07, trim);
  faceBox(b, axis, outF, n, o0 - tw - 0.06, o1 + tw + 0.06, ot, ot + 0.17, 0, 0.1, trim);
  if (!door) {
    faceBox(b, axis, outF, n, o0 - tw - 0.09, o1 + tw + 0.09, ob - 0.1, ob, 0, 0.17, trim);                    // sill
    const mid = (o0 + o1) / 2, my = (ob + ot) / 2;                                                                 // crossbars set in the wall
    faceBox(b, axis, fixed, n, mid - 0.03, mid + 0.03, ob, ot, -0.03, 0.03, trim);
    faceBox(b, axis, fixed, n, o0, o1, my - 0.03, my + 0.03, -0.03, 0.03, trim);
    if (style === 'town' && D() < 0.6) {
      const sc = pickR(D, [0x2f4f3a, 0x34507a, 0x7a2f2f, 0x333338, 0x5a4a3a]);
      for (const [s0, s1] of [[o0 - tw - 0.62, o0 - tw - 0.03], [o1 + tw + 0.03, o1 + tw + 0.62]]) {
        faceBox(b, axis, outF, n, s0, s1, ob, ot, 0, 0.05, sc);
        for (let y = ob + 0.18; y < ot - 0.1; y += 0.2) faceBox(b, axis, outF, n, s0 + 0.06, s1 - 0.06, y, y + 0.035, 0.05, 0.062, shade(sc, 0.7));
      }
    }
    if (ground && (style === 'town' || style === 'flood') && D() < 0.4) {
      faceBox(b, axis, outF, n, o0 - 0.05, o1 + 0.05, ob - 0.42, ob - 0.12, 0.05, 0.32, 0x6b4a2a);
      for (let s = o0 + 0.1; s < o1 - 0.05; s += 0.17) { const fc = pickR(D, [0xe8384f, 0xffd23a, 0xff8ad8, 0xffffff, 0xff7a2a]); faceBox(b, axis, outF, n, s, s + 0.11, ob - 0.12, ob - 0.02 + D() * 0.08, 0.1, 0.24, D() < 0.4 ? 0x3f8a3a : fc); }
    }
  } else {
    const dc = pickR(D, style === 'city' ? [0x22252e, 0x1a1c24] : [0x7a4b2a, 0x8a2f2f, 0x2f4f7a, 0x2f2f33, 0x3f6a4a]);
    for (const [s0, s1] of [[o0 - 1.08, o0 - 0.02], [o1 + 0.02, o1 + 1.08]]) {                                     // double doors swung open against the inside wall
      faceBox(b, axis, inF, -n, s0, s1, y0 + 0.02, ot - 0.04, 0.03, 0.09, dc);
      for (const [q0, q1] of [[y0 + 0.25, y0 + 1.25], [y0 + 1.45, ot - 0.3]]) faceBox(b, axis, inF, -n, s0 + 0.14, s1 - 0.14, q0, q1, 0.09, 0.105, shade(dc, 0.78));
      faceBox(b, axis, inF, -n, s0 < o0 ? s0 + 0.08 : s1 - 0.14, s0 < o0 ? s0 + 0.14 : s1 - 0.08, y0 + 1.0, y0 + 1.08, 0.09, 0.14, 0xd8c070);
    }
    if (style !== 'city') {
      faceBox(b, axis, outF, n, o0 - 0.5, o1 + 0.5, ot + 0.3, ot + 0.42, 0, 1.25, o.roof);                        // awning
      for (const s of [o0 - 0.35, o1 + 0.27]) faceBox(b, axis, outF, n, s, s + 0.08, ot - 0.1, ot + 0.3, 0, 0.9, trim);
    }
    faceBox(eb, axis, outF, n, o1 + 0.32, o1 + 0.5, y0 + 2.2, y0 + 2.48, 0, 0.12, style === 'city' ? 0x9ff3ff : 0xffe2a0);   // porch light
  }
}
// furniture against a wall; returns the footprint so loot keeps clear of it
function furniture(b, kind, x0, z0, x1, z1, y, D, along) {
  const bx = (a, b2, c, d, e, f, h) => b.box(a, b2, c, d, e, f, h);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (kind === 'sofa') {
    const c = pickR(D, [0x5a6a8a, 0x8a4a3a, 0x4a6a4a, 0x6a5a7a, 0x9a8a6a]);
    solid(b, x0, y, z0, x1, y + 0.42, z1, shade(c, 0.85), 'wood');
    const backZ = along === 'x' ? [z0, z0 + 0.22] : null, backX = along === 'z' ? [x0, x0 + 0.22] : null;
    if (backZ) bx(x0, y + 0.42, backZ[0], x1, y + 0.9, backZ[1], c); else bx(backX[0], y + 0.42, z0, backX[1], y + 0.9, z1, c);
    if (along === 'x') { bx(x0, y + 0.42, z0, x0 + 0.2, y + 0.65, z1, c); bx(x1 - 0.2, y + 0.42, z0, x1, y + 0.65, z1, c); for (let i = 0; i < 2; i++) { const s = lerp(x0 + 0.22, x1 - 0.22, i / 2); bx(s + 0.03, y + 0.42, z0 + 0.24, s + (x1 - x0 - 0.44) / 2 - 0.03, y + 0.55, z1 - 0.04, shade(c, 1.12)); } }
    else { bx(x0, y + 0.42, z0, x1, y + 0.65, z0 + 0.2, c); bx(x0, y + 0.42, z1 - 0.2, x1, y + 0.65, z1, c); for (let i = 0; i < 2; i++) { const s = lerp(z0 + 0.22, z1 - 0.22, i / 2); bx(x0 + 0.24, y + 0.42, s + 0.03, x1 - 0.04, y + 0.55, s + (z1 - z0 - 0.44) / 2 - 0.03, shade(c, 1.12)); } }
  } else if (kind === 'table') {
    const c = pickR(D, [0x7a5232, 0x5a3a22, 0xd8c8a8]);
    solid(b, x0, y + 0.72, z0, x1, y + 0.78, z1, c, 'wood');
    for (const [lx, lz] of [[x0 + 0.06, z0 + 0.06], [x1 - 0.12, z0 + 0.06], [x0 + 0.06, z1 - 0.12], [x1 - 0.12, z1 - 0.12]]) bx(lx, y, lz, lx + 0.06, y + 0.72, lz + 0.06, shade(c, 0.8));
    bx(cx - 0.12, y + 0.78, cz - 0.12, cx + 0.12, y + 0.92, cz + 0.12, 0xf2f2f2);
    const ch = (ax, az) => { bx(ax - 0.22, y + 0.44, az - 0.22, ax + 0.22, y + 0.5, az + 0.22, shade(c, 0.9)); for (const [lx, lz] of [[-0.2, -0.2], [0.16, -0.2], [-0.2, 0.16], [0.16, 0.16]]) bx(ax + lx, y, az + lz, ax + lx + 0.04, y + 0.44, az + lz + 0.04, shade(c, 0.75)); };
    if (x1 - x0 > z1 - z0) { ch(cx - 0.4, z0 - 0.35); ch(cx + 0.4, z1 + 0.35); } else { ch(x0 - 0.35, cz - 0.4); ch(x1 + 0.35, cz + 0.4); }
  } else if (kind === 'kitchen') {
    const body = pickR(D, [0xf2f0ea, 0x6a8aa8, 0x8aa88a, 0x3a3a40]);
    solid(b, x0, y, z0, x1, y + 0.88, z1, body, 'wood'); bx(x0 - 0.02, y + 0.88, z0 - 0.02, x1 + 0.02, y + 0.94, z1 + 0.02, 0x2a2a2e);
    const long = x1 - x0 > z1 - z0;
    for (let i = 0; i < 2; i++) { const a = long ? x0 + 0.4 + i * 0.35 : z0 + 0.4 + i * 0.35; if (long) bx(a, y + 0.94, cz - 0.12, a + 0.22, y + 0.955, cz + 0.12, 0x111114); else bx(cx - 0.12, y + 0.94, a, cx + 0.12, y + 0.955, a + 0.22, 0x111114); }
    if (long) bx(x1 - 0.8, y + 0.94, cz - 0.18, x1 - 0.3, y + 0.96, cz + 0.18, 0xb8c0c8); else bx(cx - 0.18, y + 0.94, z1 - 0.8, cx + 0.18, y + 0.96, z1 - 0.3, 0xb8c0c8);
  } else if (kind === 'shelf') {
    const c = pickR(D, [0x6a4428, 0x8a6a48, 0xe8e4dc]);
    solid(b, x0, y, z0, x1, y + 1.9, z1, c, 'wood');
    const long = x1 - x0 > z1 - z0;
    for (let k = 0; k < 4; k++) { const sy = y + 0.2 + k * 0.44; let t = 0.08; const L = long ? x1 - x0 : z1 - z0;
      while (t < L - 0.12) { const w = 0.05 + D() * 0.06, h = 0.22 + D() * 0.13, bc = pickR(D, [0xb03030, 0x3050a0, 0x308a50, 0xd8b030, 0xe8e8e8, 0x5a3a7a]);
        if (long) bx(x0 + t, sy, z0 - 0.02, x0 + t + w, sy + h, z1 - 0.12, bc); else bx(x0 - 0.02, sy, z0 + t, x1 - 0.12, sy + h, z0 + t + w, bc); t += w + 0.015; } }
  } else if (kind === 'bed') {
    const c = pickR(D, [0x5a3a22, 0xe8e4dc, 0x3a3a40]), sheet = pickR(D, [0x3a6aa8, 0xc0504a, 0x6a8a5a, 0xe8d8b8]);
    solid(b, x0, y, z0, x1, y + 0.42, z1, c, 'wood'); bx(x0 + 0.05, y + 0.42, z0 + 0.05, x1 - 0.05, y + 0.6, z1 - 0.05, 0xf6f6f2);
    const long = x1 - x0 > z1 - z0;
    if (long) { bx(x0 + 0.6, y + 0.6, z0 + 0.03, x1 - 0.03, y + 0.66, z1 - 0.03, sheet); bx(x0 + 0.1, y + 0.6, z0 + 0.15, x0 + 0.5, y + 0.74, z1 - 0.15, 0xffffff); bx(x0 - 0.02, y, z0, x0 + 0.06, y + 1.1, z1, c); }
    else { bx(x0 + 0.03, y + 0.6, z0 + 0.6, x1 - 0.03, y + 0.66, z1 - 0.03, sheet); bx(x0 + 0.15, y + 0.6, z0 + 0.1, x1 - 0.15, y + 0.74, z0 + 0.5, 0xffffff); bx(x0, y, z0 - 0.02, x1, y + 1.1, z0 + 0.06, c); }
  } else if (kind === 'tv') {
    solid(b, x0, y, z0, x1, y + 0.5, z1, 0x3a2a1e, 'wood');
    const long = x1 - x0 > z1 - z0;
    if (long) b.box(x0 + 0.15, y + 0.55, (z0 + z1) / 2 - 0.03, x1 - 0.15, y + 1.25, (z0 + z1) / 2 + 0.03, 0x0c0c10); else b.box((x0 + x1) / 2 - 0.03, y + 0.55, z0 + 0.15, (x0 + x1) / 2 + 0.03, y + 1.25, z1 - 0.15, 0x0c0c10);
    b.box(cx - 0.1, y + 0.5, cz - 0.1, cx + 0.1, y + 0.56, cz + 0.1, 0x222226);
  }
  return [x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3];
}
function buildHouse(b, eb, p, cx, cz, R) {
  const st = STYLES[W.theme.style], style = W.theme.style, D = decoRand(cx, cz);
  const w = R() < 0.5 ? 8 : 12, d = R() < 0.5 ? 8 : 12;
  const two = w >= 12 && d >= 12 && R() < 0.55;
  const fy = p.h + 0.3, H = 4, th = 0.4;
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const wc = pickR(R, st.walls), rc = pickR(R, st.roofs), mat = st.mat, trim = TRIM[style] ?? 0xf4f1ea, paint = pickR(D, INNER[style] || INNER.town);
  const ddx = p.x - cx, ddz = p.z - cz;
  const door = (two || Math.abs(ddz) >= Math.abs(ddx)) ? (ddz > 0 ? '+z' : '-z') : (ddx > 0 ? '+x' : '-x');
  const DN = DOORN[door];
  solid(b, x0 - 0.25, fy - 3.2, z0 - 0.25, x1 + 0.25, fy, z1 + 0.25, st.found, 'brick');
  const floors = two ? 2 : 1;
  for (let f = 0; f < floors; f++) {
    const y0 = fy + f * H, y1 = y0 + H;
    const sides = [['-z', 'x', x0, x1, z0 + th / 2, -1], ['+z', 'x', x0, x1, z1 - th / 2, 1], ['-x', 'z', z0 + th, z1 - th, x0 + th / 2, -1], ['+x', 'z', z0 + th, z1 - th, x1 - th / 2, 1]];
    for (const [side, axis, a0, a1, fixed, n] of sides) {
      const mid = (a0 + a1) / 2, len = a1 - a0; let open = null;
      if (f === 0 && side === door) open = { c: mid, w: 2.2, b: 0, t: 3.0 };
      else if (len >= 7 && R() < 0.8) open = { c: mid + (R() - 0.5) * (len - 5) * 0.6, w: 2.2, b: 1.25, t: 2.8 };
      wallSeg(b, axis, a0, a1, fixed, y0, y1, th, open, wc, mat);
      dressWall(b, eb, { axis, a0, a1, fixed, th, y0, y1, open, n, style, wc, trim, inner: paint, D, ground: f === 0, door: f === 0 && side === door, roof: rc });
    }
    // floor finish with plank lines and a rug
    const fl = FLOOR[style] ?? 0xa8794a, fz0 = f === 0 ? z0 + th : (door === '-z' ? cz : z0 + th), fz1 = f === 0 ? z1 - th : (door === '-z' ? z1 - th : cz);
    b.box(x0 + th, y0, fz0, x1 - th, y0 + 0.025, fz1, fl);
    if (style === 'town' || style === 'flood') for (let x = x0 + th + 0.45; x < x1 - th; x += 0.45) b.box(x, y0 + 0.025, fz0, x + 0.02, y0 + 0.03, fz1, shade(fl, 0.8));
    if (f === 0 && style !== 'city' && D() < 0.75) { const rcol = pickR(D, [0x8a2f3a, 0x2f4f7a, 0xc8a050, 0x5a7a4a]); b.box(cx - 1.6, y0 + 0.03, cz - 1.1, cx + 1.6, y0 + 0.045, cz + 1.1, rcol); b.box(cx - 1.35, y0 + 0.045, cz - 0.85, cx + 1.35, y0 + 0.05, cz + 0.85, shade(rcol, 1.25)); }
  }
  // corner boards and the band between storeys
  if (style !== 'city') {
    for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box(qx - 0.07, fy, qz - 0.07, qx + 0.07, fy + floors * H, qz + 0.07, trim);
    if (two) { const y = fy + H; b.box(x0 - 0.06, y - 0.1, z0 - 0.06, x1 + 0.06, y + 0.1, z0 + 0.1, trim); b.box(x0 - 0.06, y - 0.1, z1 - 0.1, x1 + 0.06, y + 0.1, z1 + 0.06, trim); b.box(x0 - 0.06, y - 0.1, z0, x0 + 0.1, y + 0.1, z1, trim); b.box(x1 - 0.1, y - 0.1, z0, x1 + 0.06, y + 0.1, z1, trim); }
  }
  const dcx = door[1] === 'z' ? cx : (door[0] === '-' ? x0 : x1), dcz = door[1] === 'z' ? (door[0] === '-' ? z0 : z1) : cz;
  const doorOut = { x: dcx + DN[0] * 2.6, y: fy, z: dcz + DN[1] * 2.6 }, doorIn = { x: dcx - DN[0] * 2.2, y: fy, z: dcz - DN[1] * 2.2 };
  // porch step in front of the door
  if (door[1] === 'z') solid(b, dcx - 1.7, fy - 0.32, door[0] === '-' ? z0 - 1.3 : z1, dcx + 1.7, fy - 0.02, door[0] === '-' ? z0 : z1 + 1.3, shade(st.found, 1.12), 'brick');
  else solid(b, door[0] === '-' ? x0 - 1.3 : x1, fy - 0.32, dcz - 1.7, door[0] === '-' ? x0 : x1 + 1.3, fy - 0.02, dcz + 1.7, shade(st.found, 1.12), 'brick');
  let rampBox = null, up = null, rampB = null, rampT = null;
  if (two) {
    const front = door === '-z';
    const sz0 = front ? cz : z0 + th, sz1 = front ? z1 - th : cz;
    solid(b, x0 + th, fy + H - 0.3, sz0, x1 - th, fy + H, sz1, paint, mat);
    const rx0 = x0 + th, rx1 = x0 + th + 2.4, rz0 = front ? cz - 4 : cz, rz1 = front ? cz : cz + 4;
    addRamp(b, rx0, rz0, rx1, rz1, fy, H, front ? 2 : 3, 0x8a6a4a, mat);
    rampBox = { x1: rx1, z0: rz0, z1: rz1 };
    rampB = { x: rx0 + 1.2, y: fy, z: front ? cz - 5.2 : cz + 5.2 };
    rampT = { x: rx0 + 1.2, y: fy + H, z: front ? cz + 1.2 : cz - 1.2 };
    up = { x0: x0 + th + 3.2, x1: x1 - th - 1.2, z0: Math.min(sz0, sz1) + 1.2, z1: Math.max(sz0, sz1) - 1.2, y: fy + H };
  }
  const ry = fy + floors * H;
  let rx0 = x0 - 0.4, rx1 = x1 + 0.4, rz0 = z0 - 0.4, rz1 = z1 + 0.4;
  if (st.columns) {
    if (door === '-z') rz0 -= 2.4; else if (door === '+z') rz1 += 2.4; else if (door === '-x') rx0 -= 2.4; else rx1 += 2.4;
    const cols = door[1] === 'z' ? [[x0 + 0.2, dcz + DN[1] * 2.2], [x1 - 0.2, dcz + DN[1] * 2.2]] : [[dcx + DN[0] * 2.2, z0 + 0.2], [dcx + DN[0] * 2.2, z1 - 0.2]];
    for (const [qx, qz] of cols) for (let f = 0; f < floors; f++) { solid(b, qx - 0.35, fy + f * H, qz - 0.35, qx + 0.35, fy + f * H + H, qz + 0.35, 0xf6f1e8, 'brick'); b.box(qx - 0.45, fy + f * H, qz - 0.45, qx + 0.45, fy + f * H + 0.3, qz + 0.45, 0xe8e2d4); b.box(qx - 0.45, fy + f * H + H - 0.3, qz - 0.45, qx + 0.45, fy + f * H + H, qz + 0.45, 0xe8e2d4); }
  }
  const gable = style === 'town' || style === 'flood';
  const chimney = R() < 0.45;
  if (gable) {
    // ceiling, then a pitched roof you can walk on (two ramps) with fascia, gutters, shingle rows, ridge cap and gable ends
    solid(b, x0, ry, z0, x1, ry + 0.25, z1, paint, mat);
    const oh = 0.6, k = 0.55, ridgeZ = w <= d, half = (ridgeZ ? w : d) / 2, ye = ry + 0.3 - oh * k, rise = (half + oh) * k, yr = ye + rise;
    const shingle = shade(rc, 0.78);
    if (ridgeZ) {
      addRamp(b, x0 - oh, z0 - oh, cx, z1 + oh, ye, rise, 0, rc, mat); addRamp(b, cx, z0 - oh, x1 + oh, z1 + oh, ye, rise, 1, rc, mat);
      for (let t = 0.12; t < 0.95; t += 0.14) { const L = half + oh, sx = x0 - oh + t * L; rampGeo(b, sx, z0 - oh, sx + 0.04 * L, z1 + oh, ye + t * rise, 0.04 * rise, 0, shingle, 0.05, 0.13); const sx2 = x1 + oh - (t + 0.04) * L; rampGeo(b, sx2, z0 - oh, sx2 + 0.04 * L, z1 + oh, ye + t * rise, 0.04 * rise, 1, shingle, 0.05, 0.13); }
      b.box(cx - 0.18, yr + 0.02, z0 - oh - 0.02, cx + 0.18, yr + 0.2, z1 + oh + 0.02, shade(rc, 0.6));
      for (const zz of [z0, z1]) triPrism(b, [[x0, ry + 0.3], [x1, ry + 0.3], [cx, yr - 0.05]], true, zz - (zz === z0 ? 0.0 : th), zz + (zz === z0 ? th : 0.0), wc);
      for (const zz of [z0 - 0.02, z1 - 0.06]) b.box(cx - 0.35, ry + 0.9, zz, cx + 0.35, ry + 1.4, zz + 0.08, shade(wc, 0.7));
      for (const xx of [x0 - oh, x1 + oh - 0.12]) { b.box(xx, ye - 0.25, z0 - oh, xx + 0.12, ye + 0.05, z1 + oh, trim); b.box(xx + (xx < cx ? -0.14 : 0.12), ye - 0.3, z0 - oh, xx + (xx < cx ? 0 : 0.26), ye - 0.12, z1 + oh, 0x8a8f96); }
    } else {
      addRamp(b, x0 - oh, z0 - oh, x1 + oh, cz, ye, rise, 2, rc, mat); addRamp(b, x0 - oh, cz, x1 + oh, z1 + oh, ye, rise, 3, rc, mat);
      for (let t = 0.12; t < 0.95; t += 0.14) { const L = half + oh, sz = z0 - oh + t * L; rampGeo(b, x0 - oh, sz, x1 + oh, sz + 0.04 * L, ye + t * rise, 0.04 * rise, 2, shingle, 0.05, 0.13); const sz2 = z1 + oh - (t + 0.04) * L; rampGeo(b, x0 - oh, sz2, x1 + oh, sz2 + 0.04 * L, ye + t * rise, 0.04 * rise, 3, shingle, 0.05, 0.13); }
      b.box(x0 - oh - 0.02, yr + 0.02, cz - 0.18, x1 + oh + 0.02, yr + 0.2, cz + 0.18, shade(rc, 0.6));
      for (const xx of [x0, x1]) triPrism(b, [[z0, ry + 0.3], [z1, ry + 0.3], [cz, yr - 0.05]], false, xx - (xx === x0 ? 0 : th), xx + (xx === x0 ? th : 0), wc);
      for (const zz of [z0 - oh, z1 + oh - 0.12]) { b.box(x0 - oh, ye - 0.25, zz, x1 + oh, ye + 0.05, zz + 0.12, trim); b.box(x0 - oh, ye - 0.3, zz + (zz < cz ? -0.14 : 0.12), x1 + oh, ye - 0.12, zz + (zz < cz ? 0 : 0.26), 0x8a8f96); }
    }
    if (chimney) { const qx = ridgeZ ? cx + half * 0.45 : x1 - 2.2, qz = ridgeZ ? z1 - 2.2 : cz + half * 0.45; solid(b, qx - 0.5, ry, qz - 0.5, qx + 0.5, yr + 1.0, qz + 0.5, 0x8a5a44, 'brick'); b.box(qx - 0.62, yr + 1.0, qz - 0.62, qx + 0.62, yr + 1.15, qz + 0.62, 0x6a4434); for (let y = ry + 0.4; y < yr + 0.9; y += 0.3) b.box(qx - 0.51, y, qz - 0.51, qx + 0.51, y + 0.03, qz + 0.51, 0xb8a090); }
  } else {
    solid(b, rx0, ry, rz0, rx1, ry + 0.4, rz1, rc, mat);
    if (st.columns) { solid(b, rx0 + 0.6, ry + 0.4, rz0 + 0.6, rx1 - 0.6, ry + 0.9, rz1 - 0.6, rc, mat); b.box(rx0 - 0.05, ry - 0.35, rz0 - 0.05, rx1 + 0.05, ry, rz1 + 0.05, 0xd8a82a); }
    else {
      // parapet around the flat roof; desert houses also get wooden beam ends poking out under it
      for (const [a, c, e, g] of [[rx0, rz0, rx1, rz0 + 0.25], [rx0, rz1 - 0.25, rx1, rz1], [rx0, rz0, rx0 + 0.25, rz1], [rx1 - 0.25, rz0, rx1, rz1]]) solid(b, a, ry + 0.4, c, e, ry + 1.0, g, shade(wc, 0.92), mat);
      if (style === 'desert') { for (let x = x0 + 0.8; x < x1 - 0.4; x += 1.2) for (const zz of [z0 - 0.5, z1]) b.box(x, ry - 0.45, zz, x + 0.22, ry - 0.23, zz + 0.5, 0x5a3a22); for (let z = z0 + 0.8; z < z1 - 0.4; z += 1.2) for (const xx of [x0 - 0.5, x1]) b.box(xx, ry - 0.45, z, xx + 0.5, ry - 0.23, z + 0.22, 0x5a3a22); }
      if (style === 'city') { b.box(cx - 0.9, ry + 0.4, cz - 0.6, cx + 0.5, ry + 1.3, cz + 0.6, 0x8a8f9a); b.box(cx - 0.8, ry + 1.3, cz - 0.5, cx + 0.4, ry + 1.34, cz + 0.5, 0x2a2c34); }
    }
    if (chimney && !st.columns) solid(b, x1 - 2.6, ry + 0.4, z1 - 2.6, x1 - 1.4, ry + 1.9, z1 - 1.4, 0x8a5a44, 'brick');
  }
  if (W.theme.style === 'city') eb.box(dcx - 1.6 + (door[1] === 'x' ? DN[0] * 0.3 : 0), fy + 3.25, dcz - (door[1] === 'z' ? -DN[1] * 0.3 : 1.6), dcx + 1.6 + (door[1] === 'x' ? DN[0] * 0.3 : 0), fy + 3.6, dcz + (door[1] === 'z' ? DN[1] * 0.3 : 1.6), pickR(R, STYLES.city.neon));
  // furniture: along the back and side walls, never in front of the door or on the stairs
  const blocked = [];
  const clear = (q) => {
    if (Math.hypot((q[0] + q[2]) / 2 - doorIn.x, (q[1] + q[3]) / 2 - doorIn.z) < 2.6) return false;
    if (rampBox && q[0] < rampBox.x1 + 1.0 && q[3] > rampBox.z0 - 2.0 && q[1] < rampBox.z1 + 2.0) return false;
    return !blocked.some(o => q[0] < o[2] && q[2] > o[0] && q[1] < o[3] && q[3] > o[1]);
  };
  const place = (kind, len, dep, y, area) => {
    const [ax0, az0, ax1, az1] = area;
    for (let tries = 0; tries < 8; tries++) {
      const wall = pickR(D, ['-z', '+z', '-x', '+x'].filter(s => s !== door)), alongX = wall[1] === 'z';
      const span = alongX ? ax1 - ax0 : az1 - az0; if (span < len + 0.6) continue;
      const s0 = (alongX ? ax0 : az0) + 0.3 + D() * (span - len - 0.6);
      let q;
      if (alongX) { const zz = wall === '-z' ? az0 : az1 - dep; q = [s0, zz, s0 + len, zz + dep]; }
      else { const xx = wall === '-x' ? ax0 : ax1 - dep; q = [xx, s0, xx + dep, s0 + len]; }
      if (!clear(q)) continue;
      const along = kind === 'sofa' || kind === 'bed' ? (alongX ? 'x' : 'z') : null;
      // sofas and beds put their back/headboard against the wall
      let fx0 = q[0], fz0 = q[1], fx1 = q[2], fz1 = q[3];
      if (kind === 'sofa' && ((alongX && wall === '+z') || (!alongX && wall === '+x'))) { /* back sits on the far side */ }
      blocked.push(furniture(b, kind, fx0, fz0, fx1, fz1, y, D, along === 'x' ? (wall === '-z' ? 'x' : 'x') : 'z'));
      return true;
    }
    return false;
  };
  if (style !== 'city' || D() < 0.5) {
    const area = [x0 + th + 0.02, z0 + th + 0.02, x1 - th - 0.02, z1 - th - 0.02];
    const set = pickR(D, [['sofa', 'tv', 'shelf'], ['table', 'kitchen'], ['sofa', 'table', 'shelf'], ['kitchen', 'shelf', 'tv'], two ? ['sofa', 'kitchen'] : ['bed', 'shelf']]);
    const dims = { sofa: [2.3, 0.95], tv: [1.6, 0.5], shelf: [1.5, 0.42], table: [1.6, 0.95], kitchen: [2.8, 0.66], bed: [2.1, 1.5] };
    for (const k of set) { const [L, Dp] = dims[k]; if (k === 'table') { const q = clear([cx - 0.8, cz - 0.48, cx + 0.8, cz + 0.48]) ? [cx - 0.8, cz - 0.48, cx + 0.8, cz + 0.48] : null; if (q) blocked.push(furniture(b, 'table', ...q, fy, D, null)); continue; } place(k, L, Dp, fy, area); }
    if (up) { const area2 = [up.x0 - 1.0, up.z0 - 1.0, x1 - th - 0.02, up.z1 + 1.0]; place('bed', 2.1, 1.5, up.y, area2); place('shelf', 1.5, 0.42, up.y, area2); }
  }
  const inner = (backOnly) => {
    for (let i = 0; i < 25; i++) {
      const px = lerp(x0 + 1.4, x1 - 1.4, R()), pz = lerp(z0 + 1.4, z1 - 1.4, R());
      if (Math.hypot(px - doorIn.x, pz - doorIn.z) < 2.0) continue;
      if (backOnly && (px - cx) * DN[0] + (pz - cz) * DN[1] > -0.5) continue;
      if (rampBox && px < rampBox.x1 + 0.9 && pz > rampBox.z0 - 1.6 && pz < rampBox.z1 + 1.6) continue;
      if (blocked.some(o => px > o[0] && px < o[2] && pz > o[1] && pz < o[3])) continue;
      return { x: px, z: pz };
    }
    return { x: cx - DN[0] * (w / 2 - 1.5), z: cz - DN[1] * (d / 2 - 1.5) };
  };
  const upSpot = () => { for (let i = 0; i < 12; i++) { const x = lerp(up.x0, up.x1, R()), z = lerp(up.z0, up.z1, R()); if (!blocked.some(o => x > o[0] && x < o[2] && z > o[1] && z < o[3])) return { x, z }; } return { x: up.x0, z: up.z0 }; };
  const pathIn = [doorOut, doorIn];
  if (R() < 0.62) {
    if (up && R() < 0.6) { const q = upSpot(); addChest('chest', q.x, up.y, q.z, Math.atan2(DN[0], DN[1]), [doorOut, doorIn, rampB, rampT]); }
    else { const q = inner(true); addChest('chest', q.x, fy, q.z, Math.atan2(DN[0], DN[1]), pathIn); }
  }
  const nl = R() < 0.5 ? 1 : 2;
  for (let i = 0; i < nl; i++) { const q = inner(false); spawnSpot(q.x, fy, q.z, pathIn); }
  if (up && R() < 0.5) { const q = upSpot(); spawnSpot(q.x, up.y, q.z, [doorOut, doorIn, rampB, rampT]); }
  // yard: a mailbox and a couple of shrubs out front
  if (style === 'town' || style === 'flood') {
    const mx = dcx + DN[0] * 4.2 + (door[1] === 'z' ? 2.4 : 0), mz = dcz + DN[1] * 4.2 + (door[1] === 'x' ? 2.4 : 0);
    if (!W.footprints.some(f => mx > f[0] - 1 && mx < f[2] + 1 && mz > f[1] - 1 && mz < f[3] + 1)) { b.box(mx - 0.05, p.h, mz - 0.05, mx + 0.05, p.h + 1.0, mz + 0.05, 0x5a5a60); b.box(mx - 0.18, p.h + 1.0, mz - 0.25, mx + 0.18, p.h + 1.3, mz + 0.25, pickR(D, [0x2f4f7a, 0x2a2a2e, 0xc03030])); }
    for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, sx = dcx + (door[1] === 'z' ? s * 2.6 : DN[0] * 0.75), sz = dcz + (door[1] === 'x' ? s * 2.6 : DN[1] * 0.75); const g = new THREE.IcosahedronGeometry(0.55, 0); g.scale(1, 0.75, 1); g.translate(sx, p.h + 0.4, sz); b.geo(g, pickR(D, [0x3f7a35, 0x4a8a3a, 0x356a2e])); g.dispose(); }
  }
  W.footprints.push([x0, z0, x1, z1]);
}

function buildTower(b, eb, p, cx, cz, R) {
  const st = STYLES.city;
  const w = pickR(R, [8, 12, 12]), d = pickR(R, [8, 12]), h = pickR(R, [12, 16, 20, 24, 32, 40]);
  const fy = p.h + 0.3, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  solid(b, x0, fy - 3, z0, x1, fy + h, z1, pickR(R, st.walls), 'metal');
  const nc = pickR(R, st.neon), nc2 = pickR(R, st.neon);
  for (let y = fy + 3.6; y < fy + h - 1; y += 4) {
    eb.box(x0 - 0.06, y, z0 - 0.07, x1 + 0.06, y + 0.2, z0, nc);
    eb.box(x0 - 0.06, y, z1, x1 + 0.06, y + 0.2, z1 + 0.07, nc);
    eb.box(x0 - 0.07, y, z0, x0, y + 0.2, z1, nc);
    eb.box(x1, y, z0, x1 + 0.07, y + 0.2, z1, nc);
  }
  for (const fx of [x0 + 1.5, x1 - 1.5]) { eb.box(fx - 0.1, fy + 2, z0 - 0.08, fx + 0.1, fy + h - 1, z0, nc2); eb.box(fx - 0.1, fy + 2, z1, fx + 0.1, fy + h - 1, z1 + 0.08, nc2); }
  solid(b, x0 - 0.3, fy + h, z0 - 0.3, x1 + 0.3, fy + h + 0.5, z1 + 0.3, 0x15151f, 'metal');
  if (R() < 0.6) eb.box(cx - 0.15, fy + h + 0.5, cz - 0.15, cx + 0.15, fy + h + 6, cz + 0.15, nc);
  const side = R() < 0.5 ? -1 : 1;
  spawnSpot(cx + side * (w / 2 + 1.6), fy, cz, null);
  if (R() < 0.5) addChest('chest', cx + 1, fy + h + 0.5, cz, R() * TAU, null, true);
  W.footprints.push([x0, z0, x1, z1]);
}

function buildCenterpiece(b, eb, p, R) {
  const s = W.theme.style, y = p.h + 0.3, x = p.x, z = p.z;
  if (s === 'city') {
    solid(b, x - 2, y - 1, z - 2, x + 2, y + 1, z + 2, 0x2a2a3a, 'metal');
    eb.box(x - 0.6, y + 1, z - 0.6, x + 0.6, y + 14, z + 0.6, 0x2fe7ff);
    eb.box(x - 1.4, y + 9, z - 1.4, x + 1.4, y + 9.3, z + 1.4, 0xff2fd0);
  } else if (s === 'temple') {
    solid(b, x - 2.5, y - 1, z - 2.5, x + 2.5, y + 1.6, z + 2.5, 0xe8e0cc, 'brick');
    solid(b, x - 0.6, y + 1.6, z - 0.4, x + 0.6, y + 4.4, z + 0.4, 0xd8a82a, 'metal');
    solid(b, x - 0.45, y + 4.4, z - 0.45, x + 0.45, y + 5.3, z + 0.45, 0xd8a82a, 'metal');
    solid(b, x - 1.6, y + 3.6, z - 0.2, x + 1.6, y + 4.0, z + 0.2, 0xd8a82a, 'metal');
  } else if (s === 'desert') {
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) solid(b, x + lx - 0.25, y - 1, z + lz - 0.25, x + lx + 0.25, y + 9, z + lz + 0.25, 0x6b4a32, 'wood');
    solid(b, x - 2.8, y + 9, z - 2.8, x + 2.8, y + 13, z + 2.8, 0x9aa4ae, 'metal');
    addChest('chest', x, y + 13, z, 0, null, true);
  } else {
    solid(b, x - 3.5, y - 1, z - 3.5, x + 3.5, y + 0.7, z - 3.0, 0xb8b4aa, 'brick');
    solid(b, x - 3.5, y - 1, z + 3.0, x + 3.5, y + 0.7, z + 3.5, 0xb8b4aa, 'brick');
    solid(b, x - 3.5, y - 1, z - 3.0, x - 3.0, y + 0.7, z + 3.0, 0xb8b4aa, 'brick');
    solid(b, x + 3.0, y - 1, z - 3.0, x + 3.5, y + 0.7, z + 3.0, 0xb8b4aa, 'brick');
    b.box(x - 3.0, y + 0.1, z - 3.0, x + 3.0, y + 0.45, z + 3.0, 0x4aa8e0);
    solid(b, x - 0.5, y, z - 0.5, x + 0.5, y + 2.8, z + 0.5, 0xd0ccc2, 'brick');
  }
  for (let i = 0; i < 2; i++) { const a = R() * TAU; spawnSpot(x + Math.cos(a) * 6, y, z + Math.sin(a) * 6, null); }
  const a = R() * TAU; addChest('ammo', x + Math.cos(a) * 8, y, z + Math.sin(a) * 8, a, null);
}

function buildPOI(p, b, eb, R) {
  const s = W.theme.style;
  for (let gx = -2; gx <= 2; gx++) for (let gz = -2; gz <= 2; gz++) {
    if (gx === 0 && gz === 0) continue;
    const x = p.x + gx * 19 + (R() - 0.5) * 3, z = p.z + gz * 19 + (R() - 0.5) * 3;
    if (Math.hypot(x - p.x, z - p.z) > p.r) continue;
    if (R() < 0.22) continue;
    if (s === 'city' && R() < 0.55) buildTower(b, eb, p, x, z, R); else buildHouse(b, eb, p, x, z, R);
  }
  buildCenterpiece(b, eb, p, R);
  if (W.theme.cars) {
    let n = 0;
    for (let t = 0; t < 30 && n < 5; t++) {
      const a = R() * TAU, r = 8 + R() * (p.r - 6); const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (W.footprints.some(f => x > f[0] - 4.2 && x < f[2] + 4.2 && z > f[1] - 4.2 && z < f[3] + 4.2)) continue;
      if (W.carList.some(c => Math.hypot(c.x - x, c.z - z) < 8.5)) continue;
      W.carList.push({ x, z, y: p.h + 0.3, rot: R() < 0.5 ? 0 : Math.PI / 2, color: pickR(R, [0xc8202a, 0xf2c14e, 0xe8e8e8, 0x2f9a5a, 0x222228, 0xff7a2a, 0x7a3fd0]) });
      n++;
    }
  }
  for (let i = 0; i < 2; i++) { const a = R() * TAU, r = 10 + R() * 26; addChest('ammo', p.x + Math.cos(a) * r, groundH(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r), p.z + Math.sin(a) * r, a, null); }
}

function buildVault(v, b, eb, R) {
  const S = 13, fy = v.h + 0.3, H = 6, th = 0.6, mc = v.boss === 'warden' ? 0x4f5866 : 0x6b4a3a;
  const x0 = v.x - S, x1 = v.x + S, z0 = v.z - S, z1 = v.z + S;
  solid(b, x0 - 0.5, fy - 3, z0 - 0.5, x1 + 0.5, fy, z1 + 0.5, 0x33373f, 'metal');
  wallSeg(b, 'x', x0, x1, z0 + th / 2, fy, fy + H, th, { c: v.x, w: 3.4, b: 0, t: 3.8 }, mc, 'metal');
  wallSeg(b, 'x', x0, x1, z1 - th / 2, fy, fy + H, th, { c: v.x, w: 3.4, b: 0, t: 3.8 }, mc, 'metal');
  wallSeg(b, 'z', z0 + th, z1 - th, x0 + th / 2, fy, fy + H, th, null, mc, 'metal');
  wallSeg(b, 'z', z0 + th, z1 - th, x1 - th / 2, fy, fy + H, th, null, mc, 'metal');
  const gc = v.boss === 'warden' ? 0xffe066 : 0xff7a2a;
  eb.box(x0, fy + H, z0, x1, fy + H + 0.18, z0 + th, gc); eb.box(x0, fy + H, z1 - th, x1, fy + H + 0.18, z1, gc);
  eb.box(x0, fy + H, z0, x0 + th, fy + H + 0.18, z1, gc); eb.box(x1 - th, fy + H, z0, x1, fy + H + 0.18, z1, gc);
  for (const [px, pz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) solid(b, v.x + px - 0.8, fy, v.z + pz - 0.8, v.x + px + 0.8, fy + 3, v.z + pz + 0.8, 0x2b2f36, 'metal');
  const pathA = [{ x: v.x, y: fy, z: z0 - 3 }, { x: v.x, y: fy, z: z0 + 3 }];
  addChest('chest', v.x - 9, fy, v.z + 9, Math.PI, pathA);
  addChest('chest', v.x + 9, fy, v.z + 9, Math.PI, pathA);
  v.fy = fy;
  W.footprints.push([x0, z0, x1, z1]);
}

// ---------------------------------------------------------------- foliage, rocks, cars
function nearSite(x, z, pad) { for (const p of W.sites) if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return true; return false; }
const _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _ss = new THREE.Vector3(), _pp = new THREE.Vector3(), _yy = new THREE.Vector3(0, 1, 0);
function placeCars() { for (const c of W.carList) Vehicles.add(c); }

// ---------------------------------------------------------------- chests
// Wooden treasure chest: two-tone planks, an arched plank lid, iron straps with rivets, corner posts,
// side handles and a lock plate. Geometry is merged per kind (base + lid), so each chest costs two draw calls.
function colorGeo(list) {
  const P = [], N = [], C = [], c = new THREE.Color();
  for (const [g0, hex] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0; c.setHex(hex);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2]); N.push(na[i], na[i + 1], na[i + 2]); C.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}
const _chestGeo = {}; let CHEST_MAT = null;
function chestGeo(kind) {
  if (_chestGeo[kind]) return _chestGeo[kind];
  const [w1, w2, metal, dark, rivet] = { chest: [0xd9912a, 0xb9741f, 0xffc93a, 0x4a2a12, 0xfff3b0], exotic: [0x22a89c, 0x1a8a80, 0xd6eef0, 0x0e3d3a, 0xffffff], supply: [0x2f6fd0, 0x285fb4, 0xe6ebf2, 0x163a7a, 0xffffff] }[kind];
  const W = 1.1, H = 0.55, D = 0.72, R = D / 2, L = [];
  const box = (sx, sy, sz, x, y, z, hex) => L.push([new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), hex]);
  const dot = (x, y, z, hex, r = 0.02) => L.push([new THREE.SphereGeometry(r, 6, 4).translate(x, y, z), hex]);
  for (let i = 0; i < 3; i++) box(W, H / 3 - 0.01, D, 0, H / 6 + i * H / 3, 0, i % 2 ? w2 : w1);
  box(W + 0.03, 0.05, D + 0.03, 0, 0.025, 0, dark);
  for (const sx of [-0.31, 0.31]) for (const sz of [1, -1]) {
    box(0.11, H - 0.04, 0.025, sx, H / 2 + 0.01, sz * (R + 0.012), metal);
    for (const y of [0.13, 0.42]) dot(sx, y, sz * (R + 0.03), rivet);
  }
  for (const x of [-W / 2, W / 2]) for (const z of [-R, R]) box(0.05, H, 0.05, x, H / 2, z, metal);
  for (const sx of [-1, 1]) {
    L.push([new THREE.TorusGeometry(0.09, 0.016, 6, 12, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2).translate(sx * (W / 2 + 0.035), 0.36, 0), metal]);
    box(0.02, 0.07, 0.05, sx * (W / 2 + 0.012), 0.36, 0.09, metal); box(0.02, 0.07, 0.05, sx * (W / 2 + 0.012), 0.36, -0.09, metal);
  }
  box(0.2, 0.2, 0.03, 0, H - 0.09, R + 0.02, metal);
  box(0.03, 0.07, 0.012, 0, H - 0.11, R + 0.038, dark); dot(0, H - 0.07, R + 0.036, dark, 0.017);
  for (const [x, y] of [[-0.075, H - 0.17], [0.075, H - 0.17], [-0.075, H - 0.01], [0.075, H - 0.01]]) dot(x, y, R + 0.036, rivet, 0.013);
  for (const [x, hex] of [[-0.42, 0xff3b6b], [0.42, 0x3fd0ff]]) L.push([new THREE.OctahedronGeometry(0.06, 0).scale(1, 1.2, 0.6).translate(x, H / 2, R + 0.03), hex]);
  const base = colorGeo(L);
  // lid, in pivot space (pivot = back top edge of the base)
  const LL = [];
  for (let i = 0; i < 4; i++) LL.push([new THREE.CylinderGeometry(R, R, W, 6, 1, true, i * Math.PI / 4, Math.PI / 4).rotateZ(Math.PI / 2).scale(1, 0.62, 1).translate(0, 0, R), i % 2 ? w2 : w1]);
  for (const sx of [-1, 1]) LL.push([new THREE.CircleGeometry(R, 14, 0, Math.PI).rotateY(sx * Math.PI / 2).scale(1, 0.62, 1).translate(sx * W / 2, 0, R), w2]);
  for (const sx of [-0.31, 0.31]) LL.push([new THREE.CylinderGeometry(R + 0.014, R + 0.014, 0.11, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.62, 1).translate(sx, 0, R), metal]);
  LL.push([new THREE.BoxGeometry(W + 0.03, 0.045, 0.035).translate(0, 0.02, D + 0.005), metal]);
  LL.push([new THREE.BoxGeometry(0.13, 0.13, 0.03).translate(0, -0.03, D + 0.03), metal]);
  for (const sx of [-0.31, 0.31]) LL.push([new THREE.SphereGeometry(0.02, 6, 4).translate(sx, 0.12, D - 0.02), rivet]);
  return (_chestGeo[kind] = { base, lid: colorGeo(LL) });
}
function chestMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'ammo') {   // olive ammo crate
    const s = 0.75, C = [0x4a7a3a, 0x2a4a20, 0xb0e080];
    const base = new THREE.Mesh(GEO.unit, lam(C[0])); base.scale.set(1.1 * s, 0.55 * s, 0.7 * s); base.position.y = 0.275 * s; g.add(base);
    const lid = new THREE.Group(); lid.position.set(0, 0.55 * s, -0.35 * s); g.add(lid);
    const lm = new THREE.Mesh(GEO.unit, lam(C[1])); lm.scale.set(1.14 * s, 0.24 * s, 0.74 * s); lm.position.set(0, 0.12 * s, 0.35 * s); lid.add(lm);
    const lock = new THREE.Mesh(GEO.unit, basic(C[2])); lock.scale.set(0.16 * s, 0.2 * s, 0.06 * s); lock.position.set(0, 0.5 * s, 0.36 * s); g.add(lock);
    base.castShadow = lm.castShadow = true; g.userData.lid = lid; g.userData.lock = lock; g.userData.s0 = 1.25; g.scale.setScalar(1.25); return g;
  }
  if (!CHEST_MAT) CHEST_MAT = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const G = chestGeo(kind);
  const base = new THREE.Mesh(G.base, CHEST_MAT); base.castShadow = true; g.add(base);
  const lid = new THREE.Group(); lid.position.set(0, 0.55, -0.36); g.add(lid);
  const lm = new THREE.Mesh(G.lid, CHEST_MAT); lm.castShadow = true; lid.add(lm);
  // glowing parts: a gem lock, a line of light under the lid, treasure inside, a light beam and a spinning star while it is unopened
  if (!GEO.chestGem) { GEO.chestGem = new THREE.OctahedronGeometry(0.085, 0).scale(1, 1.25, 0.55); GEO.chestStar = (() => { const b = new GB(); for (let k = 0; k < 3; k++) { const o = new THREE.OctahedronGeometry(0.2, 0); o.scale(k === 0 ? 0.32 : 1.25, k === 1 ? 0.32 : 1.25, k === 2 ? 0.32 : 0.32); if (k === 2) o.scale(0.26, 0.26, 1.5); b.add(o, 0xffffff); } return b.build(); })(); }
  const glowC = kind === 'exotic' ? 0x9ffff5 : kind === 'supply' ? 0xbfe2ff : 0xfff0a0, rar = kind === 'exotic' ? 6 : kind === 'supply' ? 2 : 4;
  const lock = new THREE.Mesh(GEO.chestGem, basic(kind === 'exotic' ? 0xff5fd0 : 0x58f0ff)); lock.position.set(0, 0.45, 0.42); g.add(lock);
  const seam = new THREE.Mesh(GEO.unit, basic(glowC)); seam.scale.set(1.12, 0.022, 0.74); seam.position.set(0, 0.552, 0); g.add(seam);
  const gold = new THREE.Mesh(GEO.unit, basic(kind === 'exotic' ? 0x6ffff0 : 0xffd84a)); gold.scale.set(1.0, 0.06, 0.62); gold.position.set(0, 0.5, 0); g.add(gold);
  const beam = new THREE.Mesh(GEO.beam, MAT.beam[rar]); beam.scale.set(2.2, 1.5, 2.2); beam.position.y = 0.3; g.add(beam);
  const star = new THREE.Mesh(GEO.chestStar, basic(glowC)); star.position.y = 1.3; g.add(star);
  g.userData.lid = lid; g.userData.lock = lock; g.userData.star = star; g.userData.beam = beam; g.userData.s0 = kind === 'supply' ? 1.55 : 1.3;
  g.scale.setScalar(g.userData.s0);
  return g;
}
// loot out in the wild: chests and ammo boxes dotted over the whole island, not just in the towns
function scatterChests(R) {
  const n = Math.round(150 * W.R * W.R / (530 * 530)); let made = 0;
  for (let t = 0; t < n * 12 && made < n; t++) {
    const a = R() * TAU, r = Math.sqrt(R()) * W.R * 0.97, x = Math.cos(a) * r, z = Math.sin(a) * r, h = groundH(x, z);
    if (h < W.waterY + 0.8 || nearSite(x, z, 6) || !clearGround(x, z, 2.5)) continue;
    if (Math.abs(groundH(x + 1.5, z) - h) > 0.9 || Math.abs(groundH(x, z + 1.5) - h) > 0.9) continue;
    addChest(R() < 0.72 ? 'chest' : 'ammo', x, h, z, R() * TAU, null); W.spots.push({ type: 'loot', x, z, r: 1.6 }); made++;
  }
}
function addChest(kind, x, y, z, rot, path, noBot) {
  const mesh = chestMesh(kind); mesh.position.set(x, y, z); mesh.rotation.y = rot || 0; W.group.add(mesh);
  const c = { kind, x, y, z, rot, path: path ? path.slice() : [], noBot: !!noBot, opened: false, mesh, claim: null, fails: 0 };
  W.chests.push(c); return c;
}

// ---------------------------------------------------------------- minimap image
function buildMapCanvas() {
  const S = 768, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const img = g.createImageData(S, S); const tc = new THREE.Color(), wc = new THREE.Color(W.theme.water);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const x = (px + 0.5) / S * W.size - W.half, z = (py + 0.5) / S * W.size - W.half; const h = groundH(x, z);
    if (h < W.waterY) { const dp = clamp((W.waterY - h) / 12, 0, 1); tc.copy(wc).multiplyScalar(1.1 - dp * 0.45); }
    else {
      const hx = groundH(x + 1.5, z) - h, hz = groundH(x, z + 1.5) - h; const ny = 1 / Math.hypot(hx / 1.5, 1, hz / 1.5);
      terrainColor(x, h, z, ny, tc); tc.multiplyScalar(clamp(1 - hx * 0.25 + hz * 0.1, 0.7, 1.25));
    }
    const i = (py * S + px) * 4; img.data[i] = clamp(tc.r * 255, 0, 255); img.data[i + 1] = clamp(tc.g * 255, 0, 255); img.data[i + 2] = clamp(tc.b * 255, 0, 255); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = '#' + W.TC.path.getHexString(); g.lineWidth = 1.6; g.lineJoin = 'round'; g.globalAlpha = 0.85;
  for (const p of W.paths) { g.beginPath(); p.pts.forEach((q, i) => { const px = (q[0] + W.half) / W.size * S, py = (q[1] + W.half) / W.size * S; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(40,28,56,.78)';
  for (const f of W.footprints) g.fillRect((f[0] + W.half) / W.size * S, (f[1] + W.half) / W.size * S, (f[2] - f[0]) / W.size * S, (f[3] - f[1]) / W.size * S);
  W.mapCanvas = c;
}

function applyTheme(th) {
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar); scene.background = new THREE.Color(th.fog);
  W.skyTop = new THREE.Color(th.skyTop); W.skyHor = new THREE.Color(th.skyHor); setSky(W.skyTop, W.skyHor);
  sun.color.setHex(th.sun); sun.intensity = th.sunI * 0.85; hemi.color.setHex(th.hemiS); hemi.groundColor.setHex(th.hemiG); hemi.intensity = th.hemiI * 0.82;
  stars.visible = th.night;
  W.sunDir.set(th.night ? -0.3 : 0.45, 0.8, th.night ? 0.5 : 0.3).normalize();
}

function clearWorld() {
  if (W.group) scene.remove(W.group);
  for (const g of W.disp) g.dispose(); W.disp = [];
  if (waterMesh) { waterMesh.material.dispose(); waterMesh = null; }
  Grid.clear(); W.harv = []; W.chests = []; W.footprints = []; W.carList = []; W.paths = []; W.pathGrid = null; W.spots = []; W.cls = null; Nature.clear();
  Pickups.clear(); Build.clear(); FX.clear(); Rockets.clear(); Vehicles.clear();
}

function genWorld(key) {
  clearWorld();
  const th = THEMES[key]; W.theme = th; W.key = key; W.waterY = th.waterY; W.noise = makeNoise(th.seed);
  const nat = NAT[th.style], C = h => new THREE.Color(h);
  W.TC = { grass: C(th.grass), grass2: C(th.grass2), sand: C(th.sand), sand2: C(th.sand).multiplyScalar(0.92), rock: C(th.rock), rock2: C(th.rock).multiplyScalar(0.76), snow: C(th.snow || 0xffffff), plaza: C(th.plaza), under: C(th.sand).multiplyScalar(0.7),
    deep: C(th.water).multiplyScalar(0.32), dry: C(nat.dry), dirt: C(nat.dirt), floor: C(th.grass2).multiplyScalar(0.7), path: C(nat.path) };
  const R = mulberry32(th.seed * 7 + 3), RN = mulberry32(th.seed * 13 + 5);
  W.group = new THREE.Group(); scene.add(W.group);
  placeSites(R); computeHeights(); buildPaths(RN); planLandmarks(RN); buildTerrain();
  for (const s of W.pois.concat(W.vaults)) {
    const b = new Batch(), eb = new Batch();
    if (s.kind === 'vault') buildVault(s, b, eb, R); else buildPOI(s, b, eb, R);
    if (b.count) W.group.add(b.mesh(MAT.batch, true));
    if (eb.count) W.group.add(eb.mesh(MAT.glow, false));
  }
  { const b = new Batch(), eb = new Batch(); buildPathMesh(eb); buildLandmarks(RN, b, eb); if (b.count) W.group.add(b.mesh(MAT.batch, true)); if (eb.count) W.group.add(eb.mesh(MAT.glow, false)); }
  scatterChests(RN); scatterForest(RN); scatterBoulders(RN); if (!Net.inMatch) placeCars();   // cars are not shared between players yet
  GroundCover.build(); Nature.buildSky(RN);
  // exotic crates near three plazas
  const ps = W.pois.slice().sort(() => R() - 0.5).slice(0, 3);
  for (const p of ps) { const a = R() * TAU; addChest('exotic', p.x + Math.cos(a) * 11, p.h + 0.3, p.z + Math.sin(a) * 11, a, null); }
  buildMapCanvas(); applyTheme(th); Nature.placeSun();
}
