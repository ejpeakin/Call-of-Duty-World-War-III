// =====================================================================
//  Nature: roads, forests, rocks, ground cover, living water, sky
// =====================================================================
const NAT = {
  town:   { path: 0xb89a6a, dirt: 0x8a6a45, dry: 0xa9b84c, moss: 0x6f9a4a, tuft: [0x6fb24c, 0x5a9c45, 0x86c25a], bush: [0x3f8a3a, 0x4f9a3d, 0x2f6e3a], berry: 0xd8344a, flowers: [0xffffff, 0xffd84a, 0xc77dff, 0xff6b6b], cloud: 0xffffff, cloudN: 24, motes: 0xfff6c8 },
  flood:  { path: 0xdcc898, dirt: 0x9a8a5a, dry: 0xb4c85a, moss: 0x7aa85a, tuft: [0x78c25a, 0x66ad50, 0x93d06a], bush: [0x3fa04a, 0x5aa84a, 0x2f8a4a], berry: 0xff5fa2, flowers: [0xff5fa2, 0xffb347, 0xffffff, 0xff3b3b], cloud: 0xffffff, cloudN: 28, motes: 0xffffff },
  city:   { path: 0x1b1b26, dirt: 0x24303c, dry: 0x2f7078, moss: 0x3a4a6a, tuft: [0x2f6a6a, 0x3a7a80, 0x285a66], bush: [0x24505a, 0x2f5a6a, 0x1f4450], berry: 0x2fe7ff, flowers: [0xff2fd0, 0x2fe7ff, 0x9bff4a, 0xffe14a], glow: true, cloud: 0x4a3a7a, cloudN: 18, motes: 0x9bff4a },
  temple: { path: 0xe0d6bc, dirt: 0xa88a5a, dry: 0xc0bc5c, moss: 0xb8b47a, tuft: [0x8abf60, 0x78ad55, 0xa0cc6a], bush: [0x5a8a45, 0x6f9a50, 0x8a9a5a], berry: 0x9b6bff, flowers: [0x9b6bff, 0xff4a4a, 0xffffff, 0xffd84a], cloud: 0xfff2e0, cloudN: 22, motes: 0xffe6a0 },
  desert: { path: 0xa9825a, dirt: 0xb8875a, dry: 0xe2c488, moss: 0xd9a36a, tuft: [0xc9b060, 0xb89a50, 0xd8c070], bush: [0x8a9a5a, 0x9aa66a, 0x7a8a4a], berry: 0xffe14a, flowers: [0xff7ab8, 0xffe14a, 0xffffff, 0xff9a3a], cloud: 0xfff4dc, cloudN: 10, motes: 0xf0d6a8 },
};
const _gbc = new THREE.Color(), _gba = new THREE.Vector3(), _gbb = new THREE.Vector3();

// Geometry builder: coloured parts merged into one BufferGeometry (position / normal / color).
class GB {
  constructor() { this.P = []; this.N = []; this.C = []; }
  // o: { flat, grad: [y0, y1, k0, k1], jit, up }
  add(g0, hex, o) {
    o = o || {}; const g = g0.index ? g0.toNonIndexed() : g0; if (o.flat) g.computeVertexNormals();
    const pa = g.attributes.position.array, na = g.attributes.normal.array, c = _gbc.setHex(hex); let k = 1;
    for (let i = 0; i < pa.length; i += 3) {
      if (o.jit && i % 9 === 0) k = 1 + (GB.rnd() - 0.5) * 2 * o.jit;
      let s = k; if (o.grad) s *= lerp(o.grad[2], o.grad[3], clamp((pa[i + 1] - o.grad[0]) / (o.grad[1] - o.grad[0]), 0, 1));
      this.P.push(pa[i], pa[i + 1], pa[i + 2]);
      if (o.up) this.N.push(0, 1, 0); else this.N.push(na[i], na[i + 1], na[i + 2]);
      this.C.push(c.r * s, c.g * s, c.b * s);
    }
    if (g !== g0) g.dispose(); g0.dispose(); return this;
  }
  // one triangle with a brightness per corner; normal is the face normal, or straight up for foliage
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, hex, ka = 1, kb = 1, kc = 1, up = false) {
    const c = _gbc.setHex(hex); let nx = 0, ny = 1, nz = 0;
    if (!up) { _gba.set(bx - ax, by - ay, bz - az); _gbb.set(cx - ax, cy - ay, cz - az); _gba.cross(_gbb).normalize(); nx = _gba.x; ny = _gba.y; nz = _gba.z; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } }
    this.P.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    for (const k of [ka, kb, kc]) { this.N.push(nx, ny, nz); this.C.push(c.r * k, c.g * k, c.b * k); }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeBoundingSphere(); return g;
  }
}
GB.rnd = mulberry32(7);
function qRot(g, fx, fy, fz, tx, ty, tz) { g.applyMatrix4(_mm.makeRotationFromQuaternion(_qq.setFromUnitVectors(_gba.set(fx, fy, fz).normalize(), _gbb.set(tx, ty, tz).normalize()))); return g; }
const gCyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, h / 2, 0);
const gBlob = (r, x, y, z, sy = 1, d = 0, sx = 1) => { const g = new THREE.IcosahedronGeometry(r, d); g.rotateY(GB.rnd() * 6); g.rotateX(GB.rnd() * 6); g.scale(sx, sy, 1); g.translate(x, y, z); return g; };
const gLimb = (r0, r1, ax, ay, az, bx, by, bz, seg = 5) => { const L = Math.hypot(bx - ax, by - ay, bz - az), g = new THREE.CylinderGeometry(r1, r0, L, seg); g.translate(0, L / 2, 0); qRot(g, 0, 1, 0, bx - ax, by - ay, bz - az); g.translate(ax, ay, az); return g; };
// a bent leaf: a ridged strip that rises, then droops, tapering to a point
function gLeaf(b, ox, oy, oz, ang, L, rise, droop, wid, hex, segs = 4, up = false) {
  const dx = Math.cos(ang), dz = Math.sin(ang), px = -dz, pz = dx, row = [];
  for (let i = 0; i <= segs; i++) { const s = i / segs, d = L * s, y = oy + rise * s - droop * s * s, w = wid * Math.sin(Math.PI * (0.14 + 0.86 * s)); row.push([ox + dx * d, y, oz + dz * d, w]); }
  for (let i = 0; i < segs; i++) {
    const a = row[i], c = row[i + 1], k0 = 0.78 + 0.3 * i / segs, k1 = 0.78 + 0.3 * (i + 1) / segs, r = 0.22;
    const aL = [a[0] + px * a[3], a[1] - a[3] * r, a[2] + pz * a[3]], aR = [a[0] - px * a[3], a[1] - a[3] * r, a[2] - pz * a[3]], cL = [c[0] + px * c[3], c[1] - c[3] * r, c[2] + pz * c[3]], cR = [c[0] - px * c[3], c[1] - c[3] * r, c[2] - pz * c[3]];
    b.tri(aL[0], aL[1], aL[2], a[0], a[1], a[2], c[0], c[1], c[2], hex, k0 * 0.85, k0, k1, up); b.tri(aL[0], aL[1], aL[2], c[0], c[1], c[2], cL[0], cL[1], cL[2], hex, k0 * 0.85, k1, k1 * 0.85, up);
    b.tri(a[0], a[1], a[2], aR[0], aR[1], aR[2], cR[0], cR[1], cR[2], hex, k0, k0 * 0.85, k1 * 0.85, up); b.tri(a[0], a[1], a[2], cR[0], cR[1], cR[2], c[0], c[1], c[2], hex, k0, k1 * 0.85, k1, up);
  }
}
// a geometry that shares another's buffers but carries its own bounding sphere, so each chunk of instances can be culled
function geoView(geo, sphere) { const g = new THREE.BufferGeometry(); g.index = geo.index; for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]); g.boundingSphere = sphere; return g; }

// ---------------------------------------------------------------- wind + distance fade, shared by foliage materials
function coverCompile(sh) {
  const u = this.userData; sh.uniforms.uTime = Nature.uTime; sh.uniforms.uFade = { value: u.fade }; sh.uniforms.uSway = { value: u.sway }; sh.uniforms.uCam = Nature.uCam;
  sh.vertexShader = 'uniform float uTime; uniform vec2 uFade; uniform float uSway; uniform vec3 uCam;\n' + sh.vertexShader
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 cvP = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
        transformed *= 1.0 - smoothstep(uFade.x, uFade.y, distance(cvP.xz, uCam.xz));
      #endif`)
    .replace('#include <lights_lambert_vertex>', `#include <lights_lambert_vertex>
      #ifdef DOUBLE_SIDED
        vLightBack = vLightFront; vIndirectBack = vIndirectFront;
      #endif`)
    .replace('#include <project_vertex>', `vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        float cvW = sin(uTime * 1.6 + cvP.x * 0.31 + cvP.z * 0.23) + 0.5 * sin(uTime * 2.7 + cvP.x * 0.83 - cvP.z * 0.71);
        float cvH = max(0.0, transformed.y) * uSway;
        mvPosition.x += cvW * cvH; mvPosition.z += cvW * 0.6 * cvH;
      #endif
      mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`);
}
function coverMat(glow, fade0, fade1, sway) {
  const m = glow ? new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.userData = { fade: new THREE.Vector2(fade0, fade1), sway }; m.onBeforeCompile = coverCompile; return m;
}

// ---------------------------------------------------------------- roads between the named places
const PG = 12;   // lookup cell for path points
function buildPaths(R) {
  W.paths = []; W.pathN = Math.ceil(W.size / PG); W.pathGrid = new Array(W.pathN * W.pathN).fill(null);
  const nodes = W.sites, n = nodes.length, edges = [], inT = [0], has = (a, b) => edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  const dist = (a, b) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
  while (inT.length < n) {   // minimum spanning tree, so every place is reachable by road
    let best = null, bd = 1e9; for (const a of inT) for (let b = 0; b < n; b++) if (!inT.includes(b)) { const d = dist(a, b); if (d < bd) { bd = d; best = [a, b]; } }
    edges.push(best); inT.push(best[1]);
  }
  for (let a = 0; a < n; a++) { const o = []; for (let b = 0; b < n; b++) if (b !== a) o.push([dist(a, b), b]); o.sort((p, q) => p[0] - q[0]); for (const [d, b] of o.slice(0, 2)) if (d < 300 && !has(a, b)) edges.push([a, b]); }   // a few loops
  const wy = W.waterY;
  for (const [ia, ib] of edges) {
    const A = nodes[ia], B = nodes[ib], D = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / D, uz = (B.z - A.z) / D, L = D - A.r - B.r + 6; if (L < 16) continue;
    const sx = A.x + ux * (A.r - 3), sz = A.z + uz * (A.r - 3);
    for (let attempt = 0; attempt < 5; attempt++) {
      const amp = (attempt === 0 ? (R() - 0.5) * 0.3 : (attempt % 2 ? 1 : -1) * 0.22 * Math.ceil(attempt / 2)) * L, ctrl = [], nc = Math.max(3, Math.round(L / 28)); let wet = false;
      for (let i = 0; i <= nc; i++) {
        const t = i / nc, o = Math.sin(t * Math.PI) * (amp + W.noise.n2(sx * 0.01 + t * 3, sz * 0.01 - t * 2) * 16);
        const x = sx + ux * L * t - uz * o, z = sz + uz * L * t + ux * o; if (groundH(x, z) < wy + 0.7) { wet = true; break; }
        ctrl.push(new THREE.Vector3(x, 0, z));
      }
      if (wet) continue;
      const curve = new THREE.CatmullRomCurve3(ctrl), pts = curve.getSpacedPoints(Math.max(4, Math.round(curve.getLength() / 2.2))).map(p => [p.x, p.z]);
      if (pts.some(p => groundH(p[0], p[1]) < wy + 0.5)) continue;
      const p = { pts, w: W.theme.style === 'city' ? 5 : 3.4, a: A, b: B }; W.paths.push(p);
      for (const q of pts) { const k = clamp(Math.floor((q[0] + W.half) / PG), 0, W.pathN - 1) + W.pathN * clamp(Math.floor((q[1] + W.half) / PG), 0, W.pathN - 1); (W.pathGrid[k] || (W.pathGrid[k] = [])).push(q[0], q[1]); }
      break;
    }
  }
  // soften the ground under the roads so they sit flat
  const n1 = W.N + 1, H = W.heights;
  for (let pass = 0; pass < 2; pass++) {
    const src = H.slice();
    for (let iz = 1; iz < W.N; iz++) for (let ix = 1; ix < W.N; ix++) {
      const x = -W.half + ix * W.cell, z = -W.half + iz * W.cell; const d = pathDist(x, z); if (d > 9) continue;
      const i = iz * n1 + ix, avg = (src[i - 1] + src[i + 1] + src[i - n1] + src[i + n1] + src[i - n1 - 1] + src[i + n1 + 1] + src[i - n1 + 1] + src[i + n1 - 1]) / 8;
      H[i] = lerp(src[i], avg, smooth(9, 3, d) * 0.85);
    }
  }
}
function pathDist(x, z) {
  const G = W.pathGrid; if (!G) return 99;
  const cx = Math.floor((x + W.half) / PG), cz = Math.floor((z + W.half) / PG), n = W.pathN; let best = 1e9;
  for (let j = cz - 1; j <= cz + 1; j++) { if (j < 0 || j >= n) continue; for (let i = cx - 1; i <= cx + 1; i++) { if (i < 0 || i >= n) continue; const a = G[j * n + i]; if (!a) continue; for (let k = 0; k < a.length; k += 2) { const dx = a[k] - x, dz = a[k + 1] - z, d = dx * dx + dz * dz; if (d < best) best = d; } } }
  return best > 1e8 ? 99 : Math.sqrt(best);
}
function buildPathMesh(eb) {
  if (!W.paths.length) return;
  const P = [], C = [], I = [], tc = new THREE.Color(), pc = W.TC.path, city = W.theme.style === 'city', trk = new THREE.Color().copy(pc).multiplyScalar(city ? 1.25 : 0.84), mid = new THREE.Color().copy(pc).multiplyScalar(city ? 1 : 1.07);
  for (const p of W.paths) {
    const w = p.w, offs = [-w / 2 - 1.2, -w / 2, -w * 0.3, -w * 0.1, w * 0.1, w * 0.3, w / 2, w / 2 + 1.2], kind = [0, 1, 2, 3, 3, 2, 1, 0], base = P.length / 3, pts = p.pts;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)]; let tx = c[0] - a[0], tz = c[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nv = 0.94 + 0.12 * (W.noise.n2(pts[i][0] * 0.4, pts[i][1] * 0.4) * 0.5 + 0.5);
      for (let k = 0; k < 8; k++) {
        const x = pts[i][0] - tz * offs[k], z = pts[i][1] + tx * offs[k], h = groundH(x, z);
        P.push(x, h + (kind[k] ? 0.07 : 0.03), z);
        if (kind[k] === 0) { terrainColor(x, h, z, 1, tc); } else tc.copy(kind[k] === 2 ? trk : kind[k] === 3 ? mid : pc).multiplyScalar(nv);
        C.push(tc.r, tc.g, tc.b);
      }
      if (i) for (let k = 0; k < 7; k++) { const q = base + (i - 1) * 8 + k; I.push(q, q + 1, q + 8, q + 1, q + 9, q + 8); }
      if (city && eb && i % 4 === 1) { const g = new THREE.BoxGeometry(0.2, 0.05, 2.2); g.rotateY(Math.atan2(tx, tz)); g.translate(pts[i][0], groundH(pts[i][0], pts[i][1]) + 0.1, pts[i][1]); eb.geo(g, 0x2fe7ff); g.dispose(); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeVertexNormals(); W.disp.push(g);
  const m = new THREE.Mesh(g, Nature.matPath || (Nature.matPath = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }))); m.receiveShadow = true; W.group.add(m);
}

// ---------------------------------------------------------------- forests
function forestAt(x, z) { return smooth(-0.02, 0.28, W.noise.fbm(x * 0.0055 + 50, z * 0.0055 - 20, 3)); }
function treeDefs(type) {
  const crown = (b, blobs, cols, d = 0) => blobs.forEach(([x, y, z, r, sy = 1], i) => b.add(gBlob(r, x, y, z, sy, d), cols[i % cols.length], { grad: [y - r * sy, y + r * sy, 0.7, 1.16], flat: d > 0 }));
  const pine = (c1, c2, tall, n) => {
    const b = new GB(); b.add(gCyl(0.16, 0.36, 2.4 * tall, 7), 0x5e4028);
    for (let i = 0; i < n; i++) { const t = i / (n - 1), r = lerp(2.5, 0.8, t), y = 1.5 * tall + i * 1.3; b.add(new THREE.ConeGeometry(r, 2.7, 8).rotateY(i * 0.6).translate(0, y + 1.35, 0), i % 2 ? c2 : c1, { grad: [y, y + 2.7, 0.68, 1.15], flat: true }); }
    return { geo: b.build(), h: 1.5 * tall + n * 1.3 + 1.6, r: 0.42 };
  };
  const broad = (trunkC, cols, h0, extra) => {
    const b = new GB(); b.add(gCyl(0.26, 0.48, h0, 7), trunkC);
    b.add(gLimb(0.2, 0.1, 0, h0 - 0.6, 0, 1.3, h0 + 0.9, 0.4), trunkC).add(gLimb(0.2, 0.1, 0, h0 - 0.4, 0, -1.2, h0 + 1.0, -0.5), trunkC).add(gLimb(0.16, 0.08, 0, h0 - 0.2, 0, 0.2, h0 + 1.2, 1.2), trunkC);
    crown(b, [[0, h0 + 2.3, 0, 2.2], [1.7, h0 + 1.5, 0.5, 1.6], [-1.6, h0 + 1.6, -0.5, 1.7], [0.3, h0 + 1.4, 1.7, 1.5], [-0.2, h0 + 1.5, -1.7, 1.5], [0.6, h0 + 3.3, 0.2, 1.4], [-0.9, h0 + 3.0, 0.7, 1.2]], cols);
    if (extra) for (let i = 0; i < 9; i++) { const a = i * 2.4, e = 0.3 + (i % 3) * 0.35; b.add(gBlob(0.16, Math.cos(a) * 2.1 * Math.cos(e), h0 + 2.1 + Math.sin(e) * 2.0, Math.sin(a) * 2.1 * Math.cos(e)), extra); }
    return { geo: b.build(), h: h0 + 4.6, r: 0.5 };
  };
  if (type === 'mixed') {
    const birch = (() => { const b = new GB(); b.add(gCyl(0.13, 0.2, 5.6, 6), 0xe8e4da); for (const y of [0.9, 2.1, 3.0, 4.2]) b.add(gCyl(0.185 - y * 0.012, 0.19 - y * 0.012, 0.16, 6).translate(0, y, 0), 0x2a2a2a); crown(b, [[0, 6.2, 0, 1.5, 1.25], [0.8, 5.4, 0.3, 1.1, 1.2], [-0.7, 5.6, -0.4, 1.15, 1.2], [0.1, 7.3, 0.1, 0.95, 1.2]], [0x9acb4e, 0x86bd45, 0xaad65a]); return { geo: b.build(), h: 8.2, r: 0.3 }; })();
    return [{ ...pine(0x2f6e3a, 0x25603a, 1, 5), w: 0.3 }, { ...pine(0x2a6642, 0x1f5636, 1.5, 6), w: 0.14 }, { ...broad(0x6b4a2b, [0x4f9a3d, 0x3f8a3a, 0x5aa846], 3.2), w: 0.3 }, { ...birch, w: 0.16 }, { ...broad(0x5a3a22, [0xe8662a, 0xd9482a, 0xf2a03a], 3.0), w: 0.1 }];
  }
  if (type === 'palm') {
    const palm = (lean, hgt) => {
      const b = new GB(), S = 7; for (let i = 0; i < S; i++) { const t0 = i / S, t1 = (i + 1) / S; b.add(gLimb(lerp(0.32, 0.18, t0), lerp(0.32, 0.18, t1) * 0.9, lean * t0 * t0, hgt * t0, 0, lean * t1 * t1, hgt * t1, 0, 7), i % 2 ? 0x8a6a45 : 0x75583a); }
      for (let k = 0; k < 9; k++) gLeaf(b, lean, hgt, 0, k / 9 * TAU + 0.2, 3.1 + (k % 3) * 0.4, k % 2 ? 1.5 : 0.7, k % 2 ? 2.6 : 2.9, 0.5, k % 2 ? 0x3fa04a : 0x2f8a40, 5);
      for (let k = 0; k < 3; k++) b.add(gBlob(0.19, lean + Math.cos(k * 2.1) * 0.24, hgt - 0.2, Math.sin(k * 2.1) * 0.24), 0x5a3a20);
      return { geo: b.build(), h: hgt + 1, r: 0.36 };
    };
    const b = new GB(); b.add(gCyl(0.24, 0.4, 2.2, 7), 0x6b5a3a);
    crown(b, [[0, 3.4, 0, 1.7, 0.8], [1.2, 2.9, 0.3, 1.2, 0.8], [-1.1, 3.0, -0.4, 1.25, 0.8], [0.1, 2.9, 1.2, 1.1, 0.8]], [0x4fb04a, 0x3fa04a, 0x66bd50]);
    for (let i = 0; i < 7; i++) { const a = i * 2.4; b.add(gBlob(0.2, Math.cos(a) * 1.5, 3.3 + (i % 3) * 0.35, Math.sin(a) * 1.5), i % 2 ? 0xff5fa2 : 0xffb347); }
    return [{ ...palm(1.1, 6.6), w: 0.42 }, { ...palm(-0.5, 8.2), w: 0.26 }, { geo: b.build(), h: 4.6, r: 0.45, w: 0.32 }];
  }
  if (type === 'neon') {
    const crystal = (c, c2) => {
      const b = new GB(), e = new GB(); b.add(gCyl(0.16, 0.3, 3.6, 6), 0x1c1c28);
      for (const y of [0.9, 1.8, 2.7]) e.add(new THREE.TorusGeometry(0.3 - y * 0.03, 0.035, 5, 10).rotateX(Math.PI / 2).translate(0, y, 0), c2);
      for (const [x, y, z, r, sy] of [[0, 5.2, 0, 1.5, 1.5], [1.0, 4.4, 0.3, 0.9, 1.4], [-0.9, 4.5, -0.4, 0.95, 1.4], [0.1, 4.3, -1.0, 0.8, 1.3]]) e.add(new THREE.OctahedronGeometry(r, 0).scale(1, sy, 1).rotateY(x * 2 + z).translate(x, y, z), c, { jit: 0.22 });
      return { geo: b.build(), glow: e.build(), h: 7, r: 0.35 };
    };
    const ring = (() => { const b = new GB(), e = new GB(); b.add(gCyl(0.14, 0.26, 2.2, 6), 0x1c1c28); b.add(new THREE.ConeGeometry(1.7, 6, 7).translate(0, 5, 0), 0x14202e, { flat: true }); for (let i = 0; i < 5; i++) e.add(new THREE.TorusGeometry(1.62 - i * 0.3, 0.05, 5, 14).rotateX(Math.PI / 2).translate(0, 2.6 + i * 1.05, 0), i % 2 ? 0x9bff4a : 0x2fe7ff); e.add(gBlob(0.22, 0, 8.15, 0), 0xffffff); return { geo: b.build(), glow: e.build(), h: 8.2, r: 0.35 }; })();
    return [{ ...crystal(0xff2fd0, 0x2fe7ff), w: 0.36 }, { ...crystal(0x2fe7ff, 0xff2fd0), w: 0.36 }, { ...ring, w: 0.28 }];
  }
  if (type === 'cypress') {
    const cyp = (() => { const b = new GB(); b.add(gCyl(0.18, 0.28, 1.4, 6), 0x5a4030); b.add(new THREE.SphereGeometry(1.15, 8, 6).scale(1, 3.7, 1).translate(0, 5.2, 0), 0x2e5a34, { grad: [1.2, 9.4, 0.66, 1.18], flat: true, jit: 0.07 }); return { geo: b.build(), h: 9.6, r: 0.45 }; })();
    const olive = (() => { const b = new GB(), T = 0x6b5a45; b.add(gLimb(0.42, 0.3, 0, 0, 0, 0.3, 1.3, 0.1, 6), T).add(gLimb(0.3, 0.2, 0.3, 1.3, 0.1, -0.2, 2.5, -0.2, 6), T).add(gLimb(0.2, 0.1, -0.2, 2.4, -0.2, 1.1, 3.4, 0.4), T).add(gLimb(0.2, 0.1, -0.2, 2.4, -0.2, -1.2, 3.5, -0.3), T); crown(b, [[0, 4.0, 0, 1.7, 0.7], [1.5, 3.7, 0.5, 1.3, 0.7], [-1.5, 3.8, -0.4, 1.35, 0.7], [0.2, 3.7, 1.4, 1.1, 0.7], [-0.1, 3.7, -1.5, 1.15, 0.7]], [0x8a9a6a, 0x9aa878, 0x7a8c5c]); return { geo: b.build(), h: 5.2, r: 0.5 }; })();
    const stone = (() => { const b = new GB(), T = 0x7a5a40; b.add(gLimb(0.34, 0.24, 0, 0, 0, 0.4, 3.4, 0, 7), T).add(gLimb(0.24, 0.18, 0.4, 3.4, 0, 0.2, 6.6, 0.1, 7), T); for (let k = 0; k < 4; k++) b.add(gLimb(0.13, 0.07, 0.2, 6.3, 0.1, 0.2 + Math.cos(k * 1.6) * 1.8, 7.3, 0.1 + Math.sin(k * 1.6) * 1.8), T); crown(b, [[0.2, 7.9, 0.1, 2.3, 0.42], [2.0, 7.6, 0.4, 1.5, 0.42], [-1.7, 7.6, -0.3, 1.6, 0.42], [0.3, 7.6, 2.0, 1.4, 0.42], [0.1, 7.6, -1.9, 1.5, 0.42]], [0x2f6a3a, 0x3a7a44, 0x285a34]); return { geo: b.build(), h: 8.8, r: 0.42 }; })();
    return [{ ...cyp, w: 0.36 }, { ...olive, w: 0.3 }, { ...stone, w: 0.22 }, { ...broad(0x5a4030, [0xffb7d5, 0xff9ec4, 0xffd0e4], 2.6), w: 0.12 }];
  }
  // desert
  const arm = (b, c, side, y0, len, up) => { b.add(gLimb(0.26, 0.26, 0, y0, 0, side * len, y0 + 0.15, 0, 8), c, { jit: 0.1 }).add(gLimb(0.26, 0.24, side * len, y0, 0, side * len, y0 + up, 0, 8), c, { jit: 0.1 }).add(gBlob(0.25, side * len, y0 + up, 0), c); b.add(gBlob(0.1, side * len, y0 + up + 0.26, 0), 0xff7ab8); };
  const sag = (() => { const b = new GB(), c = 0x4f8a3a; b.add(gCyl(0.4, 0.46, 4.6, 10), c, { jit: 0.1 }).add(gBlob(0.41, 0, 4.6, 0), c); arm(b, c, 1, 2.0, 1.0, 1.7); arm(b, c, -1, 2.7, 0.9, 1.2); b.add(gBlob(0.13, 0, 5.05, 0), 0xffffff); return { geo: b.build(), h: 5.2, r: 0.5 }; })();
  const josh = (() => { const b = new GB(), T = 0x8a6a45; b.add(gLimb(0.3, 0.22, 0, 0, 0, 0.1, 2.0, 0, 6), T); const tips = [[1.2, 3.4, 0.2], [-1.0, 3.6, -0.3], [0.2, 4.0, -0.9], [-0.1, 3.3, 1.0]]; for (const [x, y, z] of tips) { b.add(gLimb(0.2, 0.13, 0.1, 1.9, 0, x, y, z), T); for (let k = 0; k < 3; k++) b.add(new THREE.OctahedronGeometry(0.5, 0).scale(0.28, 1.5, 0.28).rotateZ(k * 1.05).rotateY(k * 2 + x).translate(x, y + 0.15, z), k % 2 ? 0x7a9a4a : 0x8aaa58); } return { geo: b.build(), h: 4.6, r: 0.4 }; })();
  const dead = (() => { const b = new GB(), T = 0x8a7a66; b.add(gLimb(0.3, 0.16, 0, 0, 0, 0.2, 3.0, 0.1, 6), T).add(gLimb(0.15, 0.04, 0.15, 2.2, 0.1, 1.6, 4.0, 0.3), T).add(gLimb(0.14, 0.04, 0.18, 2.6, 0.1, -1.2, 4.4, -0.4), T).add(gLimb(0.12, 0.03, 0.2, 3.0, 0.1, 0.4, 5.0, -0.8), T).add(gLimb(0.07, 0.02, 1.0, 3.3, 0.2, 1.3, 4.6, 1.0), T); return { geo: b.build(), h: 4.8, r: 0.34 }; })();
  const pear = (() => { const b = new GB(), c = 0x5a9a4a; for (const [x, y, z, r, rz] of [[0, 0.7, 0, 0.7, 0], [0.6, 1.5, 0.1, 0.55, -0.5], [-0.55, 1.6, -0.1, 0.5, 0.5], [0.9, 2.3, 0.2, 0.4, -0.3], [-0.2, 2.4, 0, 0.42, 0.2]]) { b.add(new THREE.SphereGeometry(r, 8, 6).scale(1, 1.15, 0.3).rotateZ(rz).rotateY(x).translate(x, y, z), c, { jit: 0.08, flat: true }); b.add(gBlob(0.11, x, y + r * 1.1, z), 0xff5fa2); } return { geo: b.build(), h: 2.9, r: 0.6 }; })();
  return [{ ...sag, w: 0.4 }, { ...josh, w: 0.22 }, { ...dead, w: 0.16 }, { ...pear, w: 0.22 }];
}
const NCH = 6;
function chunkInst(parts, items, rad, shadow) {
  const size = W.size / NCH, groups = new Map();
  for (const t of items) { const k = clamp(Math.floor((t.x + W.half) / size), 0, NCH - 1) + NCH * clamp(Math.floor((t.z + W.half) / size), 0, NCH - 1); let L = groups.get(k); if (!L) groups.set(k, L = []); L.push(t); }
  const e = new THREE.Euler();
  for (const L of groups.values()) {
    const box = new THREE.Box3(); for (const t of L) box.expandByPoint(_pp.set(t.x, t.y, t.z));
    const sp = box.getBoundingSphere(new THREE.Sphere()); sp.radius += rad;
    const ms = parts.map(([geo, mat]) => { const gv = geoView(geo, sp); W.disp.push(gv); const m = new THREE.InstancedMesh(gv, mat, L.length); m.frustumCulled = true; m.castShadow = shadow; m.receiveShadow = true; W.group.add(m); return m; });
    L.forEach((t, i) => {
      _qq.setFromEuler(e.set(t.tx || 0, t.rot, t.tz || 0, 'YXZ')); _mm.compose(_pp.set(t.x, t.y, t.z), _qq, _ss.set(t.s, t.s * (t.sy || 1), t.s));
      for (const m of ms) { m.setMatrixAt(i, _mm); m.setColorAt(i, _c1.setRGB(t.k, t.k, t.k)); } t.meshes = ms; t.idx = i;
    });
    Nature.chunks.push({ ms, x: sp.center.x, z: sp.center.z, r: sp.radius });
  }
}
function clearGround(x, z, pad) { if (pathDist(x, z) < pad + 2) return false; for (const s of W.spots) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return false; return true; }
function scatterForest(R) {
  const th = W.theme, defs = treeDefs(th.trees.type), lists = defs.map(() => []), wsum = defs.reduce((a, d) => a + d.w, 0);
  const nT = Math.round(th.trees.n * 1.3 * W.R * W.R / (330 * 330)); let placed = 0, tries = 0;
  while (placed < nT && tries < nT * 14) {
    tries++;
    const a = R() * TAU, r = Math.sqrt(R()) * W.R, x = Math.cos(a) * r, z = Math.sin(a) * r, h = groundH(x, z);
    if (h < W.waterY + 0.9) continue;
    const f = forestAt(x, z); if (R() > 0.07 + 0.93 * f * f) continue;
    if (nearSite(x, z, 4) && R() < 0.9) continue;
    if (!clearGround(x, z, 1.6)) continue;
    if (Math.abs(groundH(x + 2, z) - h) > 2.4 || Math.abs(groundH(x, z + 2) - h) > 2.4) continue;
    let pick = R() * wsum, ki = 0; while (ki < defs.length - 1 && (pick -= defs[ki].w) > 0) ki++;
    lists[ki].push({ x, z, y: h - 0.25, s: 0.8 + R() * 0.75, rot: R() * TAU, tx: (R() - 0.5) * 0.1, tz: (R() - 0.5) * 0.1, k: 0.86 + R() * 0.28 }); placed++;
  }
  const mat = Nature.matTree || (Nature.matTree = coverMat(false, 1e5, 1e6, 0.011)), gmat = Nature.matTreeGlow || (Nature.matTreeGlow = coverMat(true, 1e5, 1e6, 0.011));
  defs.forEach((K, ki) => {
    W.disp.push(K.geo); if (K.glow) W.disp.push(K.glow); const L = lists[ki]; if (!L.length) return;
    chunkInst(K.glow ? [[K.geo, mat], [K.glow, gmat]] : [[K.geo, mat]], L, 12, true);
    for (const t of L) {
      const rr = K.r * t.s, col = Grid.add({ minX: t.x - rr, maxX: t.x + rr, minZ: t.z - rr, maxZ: t.z + rr, minY: t.y - 1, maxY: t.y + K.h * t.s, kind: 'static', mat: 'wood' });
      const hv = { kind: 'tree', meshes: t.meshes, idx: t.idx, hp: 160, mat: 'wood', yield: 9, col, x: t.x, y: t.y, z: t.z }; col.harv = hv; W.harv.push(hv);
    }
  });
}

// ---------------------------------------------------------------- boulders
function rockGeo(seed, top, strata, baseHex) {
  const R = mulberry32(seed), g = new THREE.IcosahedronGeometry(1, 1), pa = g.attributes.position.array, memo = new Map();
  for (let i = 0; i < pa.length; i += 3) {
    const key = Math.round(pa[i] * 50) + ',' + Math.round(pa[i + 1] * 50) + ',' + Math.round(pa[i + 2] * 50); let k = memo.get(key); if (k == null) { k = 0.72 + R() * 0.5; memo.set(key, k); }
    pa[i] *= k; pa[i + 1] = Math.max(-0.32, pa[i + 1] * k * 0.8); pa[i + 2] *= k;
  }
  g.computeVertexNormals();
  const na = g.attributes.normal.array, col = new Float32Array(pa.length), c = new THREE.Color(), tcol = new THREE.Color(top == null ? 0xffffff : top), bcol = new THREE.Color(baseHex); tcol.setRGB(tcol.r / bcol.r, tcol.g / bcol.g, tcol.b / bcol.b);
  for (let i = 0; i < pa.length; i += 9) {
    const ny = na[i + 1], y = (pa[i + 1] + pa[i + 4] + pa[i + 7]) / 3, j = 0.84 + R() * 0.28;
    c.setRGB(j, j, j); if (strata) c.multiplyScalar(0.86 + 0.2 * (Math.sin(y * 9) * 0.5 + 0.5)); c.multiplyScalar(0.8 + 0.2 * clamp(y + 0.6, 0, 1));
    if (top != null && ny > 0.5) c.lerp(_gbc.copy(tcol).multiplyScalar(j), smooth(0.5, 0.8, ny) * 0.85);
    for (let v = 0; v < 3; v++) { col[i + v * 3] = c.r; col[i + v * 3 + 1] = c.g; col[i + v * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere(); return g;
}
function scatterBoulders(R) {
  const th = W.theme, nat = NAT[th.style], n = Math.round(th.rocks * W.R * W.R / (330 * 330)), geos = [0, 1, 2].map(i => rockGeo(th.seed + i * 17, nat.moss, th.style === 'desert', th.rock)), lists = [[], [], []]; let tries = 0, cnt = 0;
  const rockC = new THREE.Color(th.rock), mat = Nature.matRock || (Nature.matRock = new THREE.MeshLambertMaterial({ vertexColors: true }));
  while (cnt < n && tries < n * 12) {
    tries++;
    const a = R() * TAU, r = Math.sqrt(R()) * W.R, x = Math.cos(a) * r, z = Math.sin(a) * r, h = groundH(x, z);
    if (h < W.waterY - 1 || nearSite(x, z, 2) || !clearGround(x, z, 2.5)) continue;
    const s = 1.1 + R() * 2.3, gi = Math.floor(R() * 3); cnt++;
    const main = { x, z, y: h + s * 0.2, s, sy: 0.8 + R() * 0.35, rot: R() * TAU, tx: (R() - 0.5) * 0.3, tz: (R() - 0.5) * 0.3, k: 0.88 + R() * 0.24, big: true }; lists[gi].push(main);
    const extra = R() < 0.55 ? 1 + Math.floor(R() * 3) : 0;
    for (let e = 0; e < extra; e++) { const ea = R() * TAU, ed = s * (0.9 + R() * 0.9), ex = x + Math.cos(ea) * ed, ez = z + Math.sin(ea) * ed, eh = groundH(ex, ez), es = s * (0.2 + R() * 0.28); if (eh < W.waterY - 1) continue; lists[Math.floor(R() * 3)].push({ x: ex, z: ez, y: eh + es * 0.15, s: es, sy: 0.8 + R() * 0.4, rot: R() * TAU, tx: (R() - 0.5) * 0.5, tz: (R() - 0.5) * 0.5, k: 0.88 + R() * 0.24 }); }
  }
  geos.forEach((g, gi) => {
    W.disp.push(g); const L = lists[gi]; if (!L.length) return; chunkInst([[g, mat]], L, 6, true);
    for (const t of L) {
      for (const m of t.meshes) m.setColorAt(t.idx, _c1.copy(rockC).multiplyScalar(t.k));
      if (!t.big) continue;
      const rr = t.s * 0.74, h = t.y - t.s * 0.2, col = Grid.add({ minX: t.x - rr, maxX: t.x + rr, minZ: t.z - rr, maxZ: t.z + rr, minY: h - 1, maxY: h + t.s * 0.95 * t.sy, kind: 'static', mat: 'brick' });
      const hv = { kind: 'rock', meshes: t.meshes, idx: t.idx, hp: 220, mat: 'brick', yield: 8, col, x: t.x, y: h, z: t.z }; col.harv = hv; W.harv.push(hv);
    }
  });
}

// ---------------------------------------------------------------- water: shallows, shore foam and ripples
function waterMaterial() {
  const n1 = W.N + 1, data = new Uint8Array(n1 * n1 * 4);
  for (let i = 0; i < n1 * n1; i++) { data[i * 4] = clamp(0.5 + (W.waterY - W.heights[i]) / 16, 0, 1) * 255; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, n1, n1, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; W.disp.push(tex);
  const th = W.theme, shal = new THREE.Color(th.water).lerp(new THREE.Color(th.night ? 0x4a6aff : 0x7ff0e0), 0.62);
  const m = new THREE.MeshPhongMaterial({ color: th.water, transparent: true, opacity: 0.86, shininess: 120, specular: th.night ? 0x8a6aff : 0x9fc4dd });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = Nature.uTime; sh.uniforms.uDepth = { value: tex }; sh.uniforms.uShal = { value: shal }; sh.uniforms.uMap = { value: new THREE.Vector3(W.half, W.cell, n1) };
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uTime; uniform sampler2D uDepth; uniform vec3 uShal; uniform vec3 uMap; varying vec3 vWP;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 dUv = ((vWP.xz + uMap.x) / uMap.y + 0.5) / uMap.z;
        float dep = (texture2D(uDepth, dUv).r - 0.5) * 16.0;
        if (dUv.x < 0.0 || dUv.x > 1.0 || dUv.y < 0.0 || dUv.y > 1.0) dep = 8.0;
        float wv = sin(vWP.x * 0.33 + uTime * 1.1) + sin(vWP.z * 0.27 - uTime * 0.9);
        diffuseColor.rgb *= 0.95 + 0.05 * sin(vWP.x * 0.05 + vWP.z * 0.08 + uTime * 0.5 + wv * 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uShal, smoothstep(7.5, 0.3, dep) * 0.9);
        float foam = smoothstep(1.5, 0.15, dep) * smoothstep(0.35, 0.75, 0.5 + 0.5 * sin(dep * 6.5 - uTime * 2.0 + wv * 0.8));
        foam = max(foam, smoothstep(0.4, 0.05, dep)) * step(-0.4, dep);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam * 0.9);
        diffuseColor.a = mix(diffuseColor.a * mix(0.7, 1.0, smoothstep(0.0, 4.5, dep)), 1.0, foam * 0.7);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        vec2 rp = vWP.xz; vec3 rn = vec3(0.0, 1.0, 0.0); float rk = 1.0 - smoothstep(50.0, 420.0, distance(vWP, cameraPosition));
        rn.x += 0.09 * sin(rp.x * 0.9 + uTime * 1.6) * (0.3 + 0.7 * rk) + (0.06 * sin(rp.x * 2.3 - rp.y * 1.7 + uTime * 2.4) + 0.035 * sin(rp.y * 4.1 + uTime * 3.1)) * rk;
        rn.z += 0.09 * sin(rp.y * 0.8 - uTime * 1.3) * (0.3 + 0.7 * rk) + (0.06 * sin(rp.y * 2.1 + rp.x * 1.9 - uTime * 2.1) + 0.035 * sin(rp.x * 3.7 - uTime * 2.7)) * rk;
        normal = normalize((viewMatrix * vec4(normalize(rn), 0.0)).xyz);`);
  };
  return m;
}

// ---------------------------------------------------------------- ground cover: grass, flowers, ferns, bushes, pebbles near the camera
function cvHash(i, j, s) { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(s + 1, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return (h ^ (h >>> 16)) >>> 0; }
const CoverGeo = {
  tuft(n, hgt, wid, spread) { const b = new GB(); for (let i = 0; i < n; i++) { const a = i / n * TAU + GB.rnd() * 2, r = spread * GB.rnd(), x = Math.cos(a) * r, z = Math.sin(a) * r, h = hgt * (0.6 + GB.rnd() * 0.6), lx = Math.cos(a) * h * 0.35, lz = Math.sin(a) * h * 0.35, px = -Math.sin(a) * wid, pz = Math.cos(a) * wid; b.tri(x - px, 0, z - pz, x + px, 0, z + pz, x + lx, h, z + lz, 0xffffff, 0.55, 0.55, 1.25, true); } return b.build(); },
  flower(hex, glow) {
    const b = new GB();
    for (const [x, z, h] of [[0, 0, 0.42], [0.22, 0.12, 0.3], [-0.14, 0.2, 0.36]]) {
      b.tri(x - 0.02, 0, z, x + 0.02, 0, z, x, h, z, 0x4f9a3d, 0.7, 0.7, 1, true);
      for (let k = 0; k < 5; k++) { const a0 = k / 5 * TAU, a1 = (k + 1) / 5 * TAU, r = glow ? 0.085 : 0.1; b.tri(x, h + 0.02, z, x + Math.cos(a0) * r, h, z + Math.sin(a0) * r, x + Math.cos(a1) * r, h, z + Math.sin(a1) * r, hex, 1.05, 0.9, 0.9, true); }
      if (!glow) b.tri(x - 0.025, h + 0.03, z - 0.015, x + 0.025, h + 0.03, z - 0.015, x, h + 0.03, z + 0.03, 0xffd84a, 1, 1, 1, true);
    }
    return b.build();
  },
  bush(cols, berry) { const b = new GB(); [[0, 0.5, 0, 0.62], [0.5, 0.38, 0.2, 0.46], [-0.45, 0.4, -0.25, 0.5], [0, 0.38, -0.5, 0.44]].forEach(([x, y, z, r], i) => b.add(gBlob(r, x, y, z, 0.85), cols[i % cols.length], { grad: [0, 1.0, 0.62, 1.15] })); for (let i = 0; i < 4; i++) { const a = i * 1.9, e = 0.4 + (i % 3) * 0.25; b.add(new THREE.OctahedronGeometry(0.06, 0).translate(Math.cos(a) * 0.62 * Math.cos(e), 0.5 + Math.sin(e) * 0.5, Math.sin(a) * 0.62 * Math.cos(e)), berry); } return b.build(); },
  fern(hex) { const b = new GB(); for (let k = 0; k < 6; k++) gLeaf(b, 0, 0.03, 0, k / 6 * TAU + 0.3, 0.62 + (k % 2) * 0.16, 0.5, 0.42, 0.11, hex, 2, true); return b.build(); },
  pebbles(hex) { const b = new GB(); for (const [x, z, r] of [[0, 0, 0.16], [0.26, 0.1, 0.1], [-0.14, 0.22, 0.08]]) b.add(gBlob(r, x, r * 0.35, z, 0.6), hex, { jit: 0.12 }); return b.build(); },
  mushroom(cap, glow) { const b = new GB(); for (const [x, z, s] of [[0, 0, 1], [0.2, 0.12, 0.65]]) { b.add(gCyl(0.03 * s, 0.045 * s, 0.2 * s, 4).translate(x, 0, z), glow ? cap : 0xf2ead8); b.add(new THREE.ConeGeometry(0.15 * s, 0.11 * s, 7).translate(x, 0.25 * s, z), cap, { grad: [0.19 * s, 0.31 * s, 0.75, 1.2] }); } return b.build(); },
  reeds() { const b = new GB(); for (let i = 0; i < 6; i++) { const a = i * 1.3, r = 0.22 * GB.rnd(), x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.0 + GB.rnd() * 0.7; b.tri(x - 0.03, 0, z, x + 0.03, 0, z, x + Math.cos(a) * 0.12, h, z + Math.sin(a) * 0.12, 0x7aa850, 0.6, 0.6, 1.15, true); if (i % 3 === 0) { const hx = x + Math.cos(a) * 0.1, hz = z + Math.sin(a) * 0.1, hy = h * 0.82; b.tri(hx - 0.04, hy, hz, hx + 0.04, hy, hz, hx, hy + 0.26, hz, 0x5a3a20, 1, 1, 0.8, true); b.tri(hx, hy, hz - 0.04, hx, hy, hz + 0.04, hx, hy + 0.26, hz, 0x5a3a20, 1, 1, 0.8, true); } } return b.build(); },
  beach() { const b = new GB(); for (let k = 0; k < 5; k++) { const a0 = k / 5 * TAU, a1 = a0 + TAU / 10, a2 = a0 - TAU / 10; b.tri(0, 0.05, 0, Math.cos(a2) * 0.07, 0.03, Math.sin(a2) * 0.07, Math.cos(a0) * 0.2, 0.02, Math.sin(a0) * 0.2, 0xff7a4a, 1.1, 0.9, 0.8, true); b.tri(0, 0.05, 0, Math.cos(a0) * 0.2, 0.02, Math.sin(a0) * 0.2, Math.cos(a1) * 0.07, 0.03, Math.sin(a1) * 0.07, 0xff7a4a, 1.1, 0.8, 0.9, true); } b.add(new THREE.ConeGeometry(0.07, 0.12, 6).rotateZ(1.2).translate(0.32, 0.05, 0.12), 0xfff0e4, { jit: 0.1 }); b.add(gBlob(0.06, -0.2, 0.03, 0.26, 0.6), 0xc8c0b0); return b.build(); },
  cactus() { const b = new GB(); b.add(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.15, 1).translate(0, 0.3, 0), 0x5a9a4a, { jit: 0.1, flat: true }); b.add(gBlob(0.08, 0, 0.66, 0), 0xff5fa2); b.add(new THREE.SphereGeometry(0.17, 7, 5).translate(0.36, 0.15, 0.1), 0x4f8a3a, { jit: 0.1, flat: true }); return b.build(); },
  weed() { const b = new GB(); b.add(new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.85, 1).translate(0, 0.38, 0), 0xb89a5a, { jit: 0.3, flat: true }); return b.build(); },
};
const GroundCover = {
  layers: [], shown: true, thin: false,
  // when a match runs slowly: keep the grass, hide flowers, ferns, mushrooms, reeds and shells
  thinOut() { this.thin = true; this.layers.forEach((l, i) => { if (i > 0 && l.cell < 6) { l.m.visible = false; l.off = true; } }); },
  clear() { for (const l of this.layers) { if (l.m.dispose) l.m.dispose(); l.m.geometry.dispose(); l.m.material.dispose(); } this.layers = []; this.thin = false; },
  // hab: 'grass' | 'open' | 'forest' | 'sand' | 'shore' | 'land'
  add(geo, o) {
    const M = o.M, mat = coverMat(!!o.glow, o.cell * M * 0.5 * 0.72, o.cell * M * 0.5 * 0.97, o.sway || 0);
    const m = new THREE.InstancedMesh(geo, mat, M * M); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.receiveShadow = !o.glow;
    for (let i = 0; i < M * M; i++) { m.setMatrixAt(i, ZERO_M); m.setColorAt(i, _c1.setRGB(1, 1, 1)); }
    W.group.add(m);
    this.layers.push({ m, M, cell: o.cell, prob: o.prob, hab: o.hab, s0: o.s[0], s1: o.s[1], cols: (o.cols || [0xffffff]).map(h => new THREE.Color(h)), seed: this.layers.length * 7 + 3, key: new Int32Array(M * M * 2).fill(1 << 30), cx: 1 << 30, cz: 0, patch: o.patch || 0, yo: o.yo || 0 });
  },
  build() {
    const th = W.theme, s = th.style, nat = NAT[s], G = CoverGeo; GB.rnd = mulberry32(th.seed);
    const desert = s === 'desert', dense = IS_TOUCH ? 0.6 : GFX.fast ? 0.7 : 1;
    this.add(G.tuft(desert ? 7 : 10, desert ? 0.4 : 0.34, 0.035, desert ? 0.25 : 0.42), { cell: desert ? 2.0 : 0.92, M: Math.round((desert ? 44 : 76) * dense), prob: desert ? 0.5 : 0.95, hab: desert ? 'land' : 'grass', s: [0.7, 1.45], cols: nat.tuft, sway: 0.2 });
    nat.flowers.forEach((hex, i) => this.add(G.flower(hex, nat.glow), { cell: 3.1, M: Math.round(26 * dense), prob: desert ? 0.12 : 0.62, hab: 'open', s: [0.8, 1.45], sway: 0.14, glow: nat.glow, patch: 0.021 + i * 0.004 }));
    this.add(G.bush(nat.bush, nat.berry), { cell: 9, M: 20, prob: desert ? 0.16 : 0.34, hab: 'grass', s: [0.8, 1.9], cols: [0xffffff, 0xe8e8e8, 0xd4d4d4], sway: 0.02 });
    this.add(G.pebbles(th.rock), { cell: 4.5, M: 20, prob: desert ? 0.7 : 0.4, hab: 'land', s: [0.6, 1.8], cols: [0xffffff, 0xdcdcdc] });
    if (desert) { this.add(G.cactus(), { cell: 8, M: 14, prob: 0.3, hab: 'land', s: [0.7, 1.6] }); this.add(G.weed(), { cell: 11, M: 12, prob: 0.3, hab: 'land', s: [0.7, 1.4], sway: 0.03 }); }
    else {
      this.add(G.fern(nat.tuft[1]), { cell: 3, M: Math.round(26 * dense), prob: 0.6, hab: 'forest', s: [0.8, 1.7], cols: [0xffffff, 0xd8ecd0, 0xc0dcc0], sway: 0.06 });
      this.add(G.mushroom(nat.glow ? 0x9bff4a : 0xd8342a, nat.glow), { cell: 6, M: 14, prob: 0.4, hab: 'forest', s: [0.8, 1.8], glow: nat.glow });
      this.add(G.reeds(), { cell: 1.7, M: Math.round(36 * dense), prob: 0.75, hab: 'shore', s: [0.8, 1.4], sway: 0.09, patch: 0.05 });
      if (s === 'flood' || s === 'town' || s === 'temple') this.add(G.beach(), { cell: 5, M: 16, prob: 0.4, hab: 'sand', s: [0.8, 1.6] });
    }
    for (const l of this.layers) W.disp.push(l.m.geometry);
  },
  place(l, slot, gi, gj) {
    const h1 = cvHash(gi, gj, l.seed), h2 = cvHash(gj, gi, l.seed + 11), x = (gi + (h1 & 1023) / 1023) * l.cell, z = (gj + ((h1 >>> 10) & 1023) / 1023) * l.cell, m = l.m;
    let ok = ((h1 >>> 20) & 1023) / 1023 < l.prob, h = 0;
    if (ok) {
      const fx = (x + W.half) / W.cell, fz = (z + W.half) / W.cell;
      if (fx < 0 || fz < 0 || fx >= W.N || fz >= W.N) ok = false;
      else {
        const cls = W.cls[Math.floor(fz) * W.N + Math.floor(fx)], hab = l.hab; h = groundH(x, z);
        if (hab === 'shore') ok = (cls === 0 || cls === 1) && h > W.waterY - 0.45 && h < W.waterY + 0.3;
        else if (hab === 'sand') ok = cls === 1 && h > W.waterY + 0.3;
        else if (hab === 'land') ok = (cls === 2 || cls === 1) && h > W.waterY + 0.3;
        else ok = cls === 2;
        if (ok && (hab === 'forest' || hab === 'open')) { const f = forestAt(x, z); ok = hab === 'forest' ? f > 0.45 : f < 0.6; }
        if (ok && l.patch) ok = W.noise.n2(x * l.patch + l.seed, z * l.patch - l.seed) > -0.02;
        if (ok && cls !== 0 && !clearGround(x, z, l.cell > 6 ? 1.2 : 0.2)) ok = false;
      }
    }
    if (!ok) { m.setMatrixAt(slot, ZERO_M); return; }
    const sc = lerp(l.s0, l.s1, (h2 & 1023) / 1023);
    _qq.setFromAxisAngle(_yy, ((h2 >>> 10) & 1023) / 1023 * TAU); _mm.compose(_pp.set(x, h + l.yo, z), _qq, _ss.set(sc, sc, sc)); m.setMatrixAt(slot, _mm);
    const c = l.cols[(h2 >>> 20) % l.cols.length], k = 0.88 + ((h2 >>> 24) & 63) / 63 * 0.26; m.setColorAt(slot, _c1.copy(c).multiplyScalar(k));
  },
  update(cam) {
    if (!this.layers.length || !W.cls) return;
    const show = cam.y - groundH(cam.x, cam.z) < 75;
    if (show !== this.shown) { this.shown = show; for (const l of this.layers) l.m.visible = show && !l.off; }
    if (!show) return;
    for (const l of this.layers) {
      const cx = Math.floor(cam.x / l.cell), cz = Math.floor(cam.z / l.cell); if (cx === l.cx && cz === l.cz) continue;
      l.cx = cx; l.cz = cz; const M = l.M, hf = M >> 1, key = l.key; let dirty = false;
      for (let gj = cz - hf; gj < cz - hf + M; gj++) { const sj = ((gj % M) + M) % M; for (let gi = cx - hf; gi < cx - hf + M; gi++) { const slot = sj * M + (((gi % M) + M) % M); if (key[slot * 2] === gi && key[slot * 2 + 1] === gj) continue; key[slot * 2] = gi; key[slot * 2 + 1] = gj; this.place(l, slot, gi, gj); dirty = true; } }
      if (dirty) { l.m.instanceMatrix.needsUpdate = true; l.m.instanceColor.needsUpdate = true; }
    }
  },
};

// ---------------------------------------------------------------- sky: clouds, sun, drifting motes
const Nature = {
  uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, chunks: [], spin: [], fires: [], cloudItems: [], cloudMeshes: [], motes: null, sunSprite: null, ct: 0,
  clear() {
    for (const c of this.chunks) for (const m of c.ms) if (m.dispose) m.dispose();
    for (const m of this.cloudMeshes) if (m.dispose) m.dispose();
    this._blade = null; this._fan = null;
    this.chunks = []; this.spin = []; this.fires = []; this.cloudItems = []; this.cloudMeshes = []; this.motes = null; GroundCover.clear();
  },
  buildSky(R) {
    const th = W.theme, nat = NAT[th.style];
    // clouds: flat-bottomed puffs that drift on the wind, below the bus and above the hills
    const geos = [0, 1, 2].map(v => { const b = new GB(), n = 5 + v * 2; for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.62 + (GB.rnd() - 0.5) * 0.3, r = 0.5 + GB.rnd() * 0.42 - Math.abs(i - (n - 1) / 2) * 0.05, g = new THREE.IcosahedronGeometry(r, 1), pa = g.attributes.position.array; for (let k = 1; k < pa.length; k += 3) pa[k] = Math.max(-0.2, pa[k] * 0.72); g.translate(x, 0.25 + GB.rnd() * 0.12, (GB.rnd() - 0.5) * 0.7); b.add(g, 0xffffff, { flat: true }); } const cg = b.build(), na = cg.attributes.normal.array, ca = cg.attributes.color.array; for (let i = 0; i < na.length; i += 3) { const k = 0.87 + 0.13 * (na[i + 1] * 0.6 + na[i] * 0.4); ca[i] = k * 0.97; ca[i + 1] = k * 0.985; ca[i + 2] = Math.min(1, k * 1.02); } return cg; });
    const mat = Nature.matCloud || (Nature.matCloud = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    const per = Math.ceil(nat.cloudN / 3);
    geos.forEach((g, gi) => {
      W.disp.push(g); const m = new THREE.InstancedMesh(g, mat, per); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < per; i++) { const it = { m, i, x: (R() * 2 - 1) * 1250, y: 235 + R() * 110, z: (R() * 2 - 1) * 1250, s: 42 + R() * 60, rot: R() * TAU, v: 2 + R() * 2.5 }; this.cloudItems.push(it); m.setColorAt(i, _c1.setHex(nat.cloud).multiplyScalar(0.92 + R() * 0.08)); }
      W.group.add(m); this.cloudMeshes.push(m);
    });
    this.moveClouds(0);
    // sun (or moon) glow
    if (!this.sunSprite) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true })); sky.add(this.sunSprite);
    }
    // motes: pollen by day, fireflies by night
    const N = 150, pos = new Float32Array(N * 3), g = new THREE.BufferGeometry(); this.moteBase = []; for (let i = 0; i < N; i++) this.moteBase.push(R() * 60, R() * 11, R() * 60, R() * TAU);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); W.disp.push(g);
    if (!this.moteTex) { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); this.moteTex = new THREE.CanvasTexture(c); }
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ map: this.moteTex, color: nat.motes, size: th.night ? 0.2 : 0.12, transparent: true, opacity: th.night ? 0.95 : 0.6, depthWrite: false, blending: th.night ? THREE.AdditiveBlending : THREE.NormalBlending })); this.motes.frustumCulled = false; W.group.add(this.motes);
  },
  placeSun() { const th = W.theme, s = this.sunSprite; if (!s) return; s.position.copy(W.sunDir).multiplyScalar(1300); s.scale.setScalar(th.night ? 300 : 520); s.material.color.setHex(th.night ? 0xcfd8ff : th.sun); },
  moveClouds(dt) {
    for (const c of this.cloudItems) { c.x += c.v * dt; if (c.x > 1250) c.x -= 2500; _qq.setFromAxisAngle(_yy, c.rot); _mm.compose(_pp.set(c.x, c.y, c.z), _qq, _ss.set(c.s, c.s * 0.62, c.s * 0.8)); c.m.setMatrixAt(c.i, _mm); }
    for (const m of this.cloudMeshes) m.instanceMatrix.needsUpdate = true;
  },
  update(dt) {
    if (!W.group || !W.theme) return; this.uTime.value += dt; const cam = camera.position, t = this.uTime.value; this.uCam.value.copy(cam);
    this.ct -= dt;
    if (this.ct <= 0) { this.ct = 0.3; const far = (scene.fog ? scene.fog.far : 2000) + 30; for (const c of this.chunks) { const v = Math.hypot(c.x - cam.x, c.z - cam.z) - c.r < far; for (const m of c.ms) m.visible = v; } }
    GroundCover.update(cam);
    for (const s of this.spin) s.o.rotation[s.ax] += s.v * dt;
    for (const f of this.fires) { const k = 0.85 + 0.22 * Math.sin(t * 9 + f.ph) + 0.1 * Math.sin(t * 23 + f.ph); f.o.scale.set(1 + (k - 1) * 0.4, k, 1 + (k - 1) * 0.4); }
    this.moveClouds(dt);
    if (this.motes) {
      const show = GroundCover.shown; this.motes.visible = show;
      if (show) { const a = this.motes.geometry.attributes.position.array, B = this.moteBase; for (let i = 0, n = B.length / 4; i < n; i++) { const ph = B[i * 4 + 3], bx = B[i * 4] + t * 0.5 + Math.sin(t * 0.6 + ph) * 1.4, bz = B[i * 4 + 2] + Math.cos(t * 0.5 + ph) * 1.4; a[i * 3] = cam.x + ((((bx - cam.x) % 60) + 60) % 60) - 30; a[i * 3 + 1] = cam.y - 4 + B[i * 4 + 1] + Math.sin(t * 0.9 + ph) * 0.5; a[i * 3 + 2] = cam.z + ((((bz - cam.z) % 60) + 60) % 60) - 30; } this.motes.geometry.attributes.position.needsUpdate = true; }
    }
  },
};
