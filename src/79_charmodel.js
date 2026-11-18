// =====================================================================
//  Character model: the uploaded rigged figure, painted per skin and driven by its own animation clips.
//  Accessories (hair, hats, face, chains, backpacks, pickaxes, guns) ride on its bones.
//  Falls back to the procedural rig (buildCharacter) if the model cannot load.
// =====================================================================
const CharModel = {
  ready: false, gltf: null, clips: {}, K: 1, mats: new Map(), frames: {},
  // Regions of the body and where each one lives in the 256px skin atlas: [x, y, w, h]
  AT: { torso: [0, 0, 128, 128], hips: [128, 0, 128, 64], head: [128, 128, 128, 64], hand: [160, 64, 32, 32], shoe: [192, 64, 32, 32], neck: [224, 64, 32, 32],
        upper: [0, 128, 128, 32], fore: [0, 160, 128, 32], thigh: [0, 192, 128, 32], calf: [0, 224, 128, 32],
        belt: [128, 96, 128, 16], cuff: [128, 112, 32, 16], sock: [160, 112, 32, 16], boot: [128, 192, 128, 64] },
  UPPER: /^(spine_0[123]|neck_01|head|head_leaf|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)/,
  load() {
    if (typeof CHARACTER_GLB === 'undefined' || !THREE.GLTFLoader || !THREE.SkeletonUtils) return;
    const bin = atob(CHARACTER_GLB), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    new THREE.GLTFLoader().parse(u8.buffer, '', g => {
      try { this.prepare(g); this.ready = true; if (typeof Lobby !== 'undefined' && Lobby.scene) Lobby.rebuild(); }
      catch (e) { console.warn('Character model unavailable, using built-in bodies', e); }
    }, e => console.warn('Character model failed to load', e));
  },
  prepare(g) {
    let mesh = null; g.scene.traverse(o => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    if (!mesh) throw new Error('no skinned mesh');
    const geo = mesh.geometry, P = geo.attributes.position, SI = geo.attributes.skinIndex.array, SW = geo.attributes.skinWeight.array, bones = mesh.skeleton.bones;
    let top = 0; for (let i = 0; i < P.count; i++) top = Math.max(top, P.getY(i));
    this.K = 1.945 / top;   // match the height of the built-in bodies so hit boxes, cameras and gliders still line up
    // ---- repaint: sort every vertex into a body region, then give it a UV inside that region of the atlas.
    // Triangles that straddle two regions get their own copies of the odd vertices so colours never smear across the atlas.
    const AT = this.AT, cl = (v, m = 0.03) => Math.min(1 - m, Math.max(m, v)), ang = (a, b) => (Math.atan2(a, b) / Math.PI + 1) / 2;
    const sym = (x, z) => Math.abs(Math.atan2(x, z)) / Math.PI;   // 0 at the front centre, 1 at the back, same on both sides
    const reg = new Array(P.count), idx = geo.index.array, UV0 = geo.attributes.uv, NRM = geo.attributes.normal, ringV = new Uint8Array(P.count);
    for (let i = 0; i < P.count; i++) {
      let bi = 0, bw = -1; for (let k = 0; k < 4; k++) if (SW[i * 4 + k] > bw) { bw = SW[i * 4 + k]; bi = SI[i * 4 + k]; }
      const n = bones[bi].name, y = P.getY(i);
      reg[i] = n === 'head' || n === 'head_leaf' ? 'head' : n === 'neck_01' ? (y < 1.47 ? 'torso' : 'neck')
        : /^(spine|clavicle|pelvis)/.test(n) ? (y < 1.0 ? 'hips' : 'torso') : n.startsWith('upperarm') ? 'upper' : n.startsWith('lowerarm') ? 'fore'
        : n.startsWith('thigh') ? 'thigh' : n.startsWith('calf') ? 'calf' : n.startsWith('foot') || n.startsWith('ball') ? 'shoe' : 'hand';
    }
    // The figure is built from separate pieces (pelvis, abdomen, chest+head, limbs) with joint rings between them.
    // Each piece takes one region (except chest+head), and the rings become the belt, cuffs, ankles and neck.
    const par = Int32Array.from({ length: P.count }, (_, i) => i), root = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let t = 0; t < idx.length; t += 3) { const a = root(idx[t]); par[root(idx[t + 1])] = a; par[root(idx[t + 2])] = a; }
    const comps = new Map();
    for (let i = 0; i < P.count; i++) { const c = root(i); let e = comps.get(c); if (!e) comps.set(c, e = { v: [], blue: 0, y: 0, cnt: {} }); e.v.push(i); if (UV0.getX(i) > 0.75) e.blue++; e.y += P.getY(i); e.cnt[reg[i]] = (e.cnt[reg[i]] || 0) + 1; }
    for (const e of comps.values()) {
      const n = e.v.length, my = e.y / n, top = Object.keys(e.cnt).sort((a, b) => e.cnt[b] - e.cnt[a])[0];
      let r = null;
      if (e.blue > n / 2) {
        if (e.cnt.head || e.cnt.neck) r = 'neck';
        else if (top === 'hips' || top === 'torso') r = my > 1.15 ? 'torso' : my > 1.015 ? 'belt' : 'thigh';
        else if (e.cnt.hand && (e.cnt.fore || 0) > 4) r = 'cuff';
        else if (top === 'upper' || top === 'fore') r = 'fore';
        else if (e.cnt.shoe && e.cnt.calf) r = 'sock';
        else if (top === 'calf' || top === 'thigh') r = 'calf';
        else r = top;
      } else if (!e.cnt.head) r = top;
      if (r) for (const i of e.v) reg[i] = r;
      if (e.blue > n / 2) for (const i of e.v) ringV[i] = 1;
    }
    this.shellGeo = this.buildShirt(P, reg, SI, SW, bones, idx);
    // other builds (woman, slim, average, heavy): the same rig with a reshaped figure, and clothes measured from that figure
    this.variants = { muscular: { shell: this.shellGeo } };
    for (const name in this.BUILDS) {
      const f = this.shapeOf(this.BUILDS[name]), Pf = new THREE.Float32BufferAttribute(new Float32Array(P.array), 3);
      for (let i = 0; i < P.count; i++) { const q = f(P.getX(i), P.getY(i), P.getZ(i), reg[i]); Pf.setXYZ(i, q[0], q[1], q[2]); }
      this.variants[name] = { shell: this.buildShirt(Pf, reg, SI, SW, bones, idx) };
    }
    // Clothes should not show the mannequin's joint grooves: blend each clothed vertex's normal with its neighbours'
    // (across pieces, never with surfaces facing the other way) so the creases at hips, knees and elbows shade smoothly.
    {
      const CLOTH = new Set(['hips', 'belt', 'thigh', 'calf', 'sock', 'torso', 'upper', 'fore', 'hand', 'cuff']), RAD = 0.032, cell = new Map(), key = (x, y, z) => Math.floor(x / RAD) + ',' + Math.floor(y / RAD) + ',' + Math.floor(z / RAD);
      const list = []; for (let i = 0; i < P.count; i++) if (CLOTH.has(reg[i])) { list.push(i); const k = key(P.getX(i), P.getY(i), P.getZ(i)); (cell.get(k) || cell.set(k, []).get(k)).push(i); }
      const nn = new Float32Array(P.count * 3);
      for (const i of list) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = NRM.getX(i), ny = NRM.getY(i), nz = NRM.getZ(i), cx = Math.floor(x / RAD), cy = Math.floor(y / RAD), cz = Math.floor(z / RAD);
        let sx = 0, sy = 0, sz = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
          const L = cell.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)); if (!L) continue;
          for (const j of L) {
            const d = Math.hypot(P.getX(j) - x, P.getY(j) - y, P.getZ(j) - z); if (d > RAD) continue;
            const mx = NRM.getX(j), my = NRM.getY(j), mz = NRM.getZ(j); if (mx * nx + my * ny + mz * nz < -0.35) continue;
            const w = 1 - d / RAD; sx += mx * w; sy += my * w; sz += mz * w;
          }
        }
        const l = Math.hypot(sx, sy, sz) || 1; nn[i * 3] = sx / l; nn[i * 3 + 1] = sy / l; nn[i * 3 + 2] = sz / l;
      }
      for (const i of list) NRM.setXYZ(i, nn[i * 3], nn[i * 3 + 1], nn[i * 3 + 2]);
    }
    const project = (x, y, z, r) => {
      const ax = Math.abs(x); let u = 0.5, v = 0.5;
      if (r === 'torso') { u = sym(x, z); v = (y - 1.0) / 0.53; }
      else if (r === 'hips') { u = sym(x, z); v = (y - 0.84) / 0.24; }
      else if (r === 'upper') { u = ang(z + 0.065, y - 1.447); v = (ax - 0.18) / 0.29; }
      else if (r === 'fore') { u = ang(z + 0.071, y - 1.433); v = (ax - 0.468) / 0.292; }
      else if (r === 'thigh') { u = ang(ax - 0.09, z); v = (y - 0.525) / 0.393; }
      else if (r === 'calf') { u = ang(ax - 0.095, z + 0.026); v = (y - 0.047) / 0.472; }
      else if (r === 'shoe') v = y / 0.2;
      else if (r === 'belt') u = sym(x, z);
      else if (r === 'head') { u = sym(x, z); v = (y - 1.541) / 0.288; }
      const c = AT[r], m = r === 'torso' || r === 'hips' || r === 'belt' || r === 'head' ? 0.004 : 0.03;
      return [(c[0] + cl(u, m) * c[2]) / 256, (c[1] + (1 - cl(v)) * c[3]) / 256];
    };
    const src = { position: P, normal: geo.attributes.normal, skinIndex: geo.attributes.skinIndex, skinWeight: geo.attributes.skinWeight };
    const out = {}; for (const k in src) out[k] = Array.from(src[k].array);
    const uvs = [], vr = reg.slice(), dup = new Map(), nIdx = [];
    // body parts now covered by the shirt and trousers are dropped so they can never poke through the cloth
    // (the belt, the rings at the tops of the legs, wrists and ankles stay to close any gaps)
    const COVERED = new Set(['torso', 'upper', 'fore', 'calf', 'shoe', 'sock', 'hand']), covered = (tr, a, b, c) => COVERED.has(tr) || (tr === 'thigh' && !(ringV[a] && ringV[b] && ringV[c]));
    for (let i = 0; i < P.count; i++) uvs.push(...project(P.getX(i), P.getY(i), P.getZ(i), reg[i]));
    for (let t = 0; t < idx.length; t += 3) {
      const r0 = reg[idx[t]], r1 = reg[idx[t + 1]], r2 = reg[idx[t + 2]], tr = r0 === r1 || r0 === r2 ? r0 : r1 === r2 ? r1 : r0;
      if (covered(tr, idx[t], idx[t + 1], idx[t + 2])) continue;
      for (let k = 0; k < 3; k++) {
        const vi = idx[t + k]; if (reg[vi] === tr) { nIdx.push(vi); continue; }
        const key = vi + ':' + tr; let ni = dup.get(key);
        if (ni == null) {
          ni = vr.length; vr.push(tr); dup.set(key, ni);
          for (const a in src) { const s = src[a].itemSize; for (let j = 0; j < s; j++) out[a].push(src[a].array[vi * s + j]); }
          uvs.push(...project(P.getX(vi), P.getY(vi), P.getZ(vi), tr));
        }
        nIdx.push(ni);
      }
    }
    this.gltfGeo = geo;
    geo.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.skinIndex, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.skinWeight, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(nIdx), 1));
    geo.computeBoundingSphere();
    this.variants.muscular.geo = geo;
    for (const name in this.BUILDS) {
      const f = this.shapeOf(this.BUILDS[name]), g = geo.clone(), pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) { const q = f(pa.getX(i), pa.getY(i), pa.getZ(i), vr[i]); pa.setXYZ(i, q[0], q[1], q[2]); }
      g.computeBoundingSphere(); this.variants[name].geo = g;
    }
    // ---- mount frames: map the built-in body's head / chest / hand spaces onto this model's bones (bind pose)
    const bind = {}; bones.forEach((b, i) => { bind[b.name] = mesh.skeleton.boneInverses[i].clone().invert(); });
    const mk = (bone, pos, scl, rot) => {
      const F = new THREE.Matrix4().compose(new THREE.Vector3(...pos), rot || new THREE.Quaternion(), new THREE.Vector3(...scl));
      const M = bind[bone].clone().invert().multiply(F), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      M.decompose(p, q, s); return { bone, p, q, s };
    };
    const ik = 1 / this.K, handRot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)));
    const handRotL = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1)));
    this.frames = {
      head: mk('head', [0, 1.688, 0.006], [0.087 / 0.125, 0.146 / 0.155, 0.118 / 0.14]),
      torso: mk('spine_03', [0, 0.885, 0.004], [0.7, 0.94, 0.97]),
      handR: mk('hand_r', [-0.8, 1.425, -0.055], [ik, ik, ik], handRot),
      handL: mk('hand_l', [0.8, 1.425, -0.055], [ik, ik, ik], handRotL),
    };
    // ---- split every clip into a lower-body and an upper-body half so guns and swings can play over running legs
    for (const c of g.animations) {
      const L = [], U = [];
      for (const t of c.tracks) (this.UPPER.test(t.name.split('.')[0]) ? U : L).push(t);
      this.clips[c.name] = { L: new THREE.AnimationClip(c.name + '|L', c.duration, L), U: new THREE.AnimationClip(c.name + '|U', c.duration, U), dur: c.duration };
    }
    this.gltf = g;
  },
  // ---- woman figure: narrower waist and shoulders, wider hips, slimmer limbs, a modest chest (bind pose, model units)
  // ---- body builds: the same rig reshaped. Numbers are scale factors on the figure (1 = the uploaded model).
  BUILDS: {
    woman:   { waist: 0.85, waistZ: 0.91, hips: 1.13, shoulders: 0.85, chestX: 1, chestZ: 1, neck: 0.88, arms: 0.82, inset: 0.032, hands: 0.9, thigh: 0.94, calf: 0.95, legOut: 0.028, bust: 0.032, seat: 0.018, belly: 0, k: 0.95 },
    slim:    { waist: 0.84, waistZ: 0.8, hips: 0.96, shoulders: 0.8, chestX: 0.85, chestZ: 0.78, neck: 0.86, arms: 0.7, inset: 0.042, hands: 0.9, thigh: 0.8, calf: 0.84, legOut: 0, bust: 0, seat: 0, belly: 0, k: 0.985 },
    average: { waist: 0.93, waistZ: 0.92, hips: 1.0, shoulders: 0.88, chestX: 0.91, chestZ: 0.85, neck: 0.93, arms: 0.81, inset: 0.026, hands: 0.94, thigh: 0.9, calf: 0.92, legOut: 0, bust: 0, seat: 0, belly: 0, k: 1 },
    heavy:   { waist: 1.24, waistZ: 1.3, hips: 1.1, shoulders: 1.02, chestX: 1.06, chestZ: 1.12, neck: 1.12, arms: 1.06, inset: -0.012, hands: 1.05, thigh: 1.1, calf: 1.05, legOut: 0.016, bust: 0, seat: 0.012, belly: 0.05, k: 1 },
  },
  shapeOf(B) { return (x, y, z, r) => this.reshape(x, y, z, r, B); },
  reshape(x, y, z, r, B) {
    const bell = t => Math.exp(-t * t), sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); }, ax = Math.abs(x), sx = Math.sign(x) || 1;
    if (r === 'torso' || r === 'belt' || r === 'hips' || r === 'neck') {
      const zc = -0.015, wb = bell((y - 1.13) / 0.12), cb = bell((y - 1.33) / 0.11);
      let kx = 1 - (1 - B.waist) * wb, kz = 1 - (1 - B.waistZ) * wb;
      kx *= 1 + (B.chestX - 1) * cb; kz *= 1 + (B.chestZ - 1) * cb;   // chest
      kx *= 1 + (B.hips - 1) * bell((y - 0.93) / 0.09);                 // hips
      kx *= 1 - (1 - B.shoulders) * sm(1.25, 1.5, y);                    // shoulders
      if (r === 'neck') { kx *= B.neck; kz *= B.neck; }
      x *= kx; z = zc + (z - zc) * kz;
      if (B.bust && r === 'torso' && z > 0) z += B.bust * bell((y - 1.315) / 0.06) * bell((ax - 0.075) / 0.045) * Math.min(1, z / 0.08);
      if (B.belly && (r === 'torso' || r === 'belt' || r === 'hips') && z > 0) z += B.belly * bell((y - 1.08) / 0.12) * bell(ax / 0.14) * Math.min(1, z / 0.06);
      if (B.seat && r === 'hips' && z < -0.02) z -= B.seat * bell((y - 0.9) / 0.06) * bell((ax - 0.07) / 0.06);
    } else if (r === 'upper' || r === 'fore' || r === 'cuff' || r === 'hand') {
      const k = r === 'hand' ? B.hands : B.arms, yc = 1.44, zc = -0.068;
      y = yc + (y - yc) * k; z = zc + (z - zc) * k; x -= sx * B.inset;
    } else if (r === 'thigh' || r === 'calf') {
      const k = r === 'thigh' ? B.thigh : B.calf, xc = 0.092, zc = r === 'thigh' ? 0.005 : -0.024;
      x = sx * (xc + (ax - xc) * k + (B.legOut ? 0.43 * B.legOut * (1 - sm(0.55, 0.9, y)) : 0)); z = zc + (z - zc) * k;
      if (r === 'thigh') x += sx * B.legOut * sm(0.6, 0.92, y);
    }
    return [x, y, z];
  },
  womanShape(x, y, z, r) { return this.reshape(x, y, z, r, this.BUILDS.woman); },
  // ---- a smooth shirt that stretches over the figure's chest, shoulders and arms, hiding the joint grooves.
  // Its shape is measured from the body (largest radius around each slice, then filled across the grooves and smoothed);
  // its bone weights are blended from the nearest body vertices so it bends with the spine and arms like cloth.
  buildShirt(P, reg, SI, SW, bones, idx) {
    const AT = this.AT, pos = [], uvs = [], sIdx = [], sWt = [], index = [];
    const ang = (a, b) => (Math.atan2(a, b) / Math.PI + 1) / 2, sym = (x, z) => Math.abs(Math.atan2(x, z)) / Math.PI;
    const toUV = (r, u, v, m) => { const c = AT[r]; u = Math.min(1 - m, Math.max(m, u)); v = Math.min(0.97, Math.max(0.03, v)); return [(c[0] + u * c[2]) / 256, (c[1] + (1 - v) * c[3]) / 256]; };
    const bi = n => bones.findIndex(b => b.name === n);
    const TORSO_B = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'].map(bi));
    const ARM_B = new Set(['clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r'].map(bi));
    // radius grid: rows along the axis, columns around it (last column repeats the first so UVs never wrap)
    const grid = (rows, cols, pts, dh, win, blur = 2) => {
      const R = rows.map(() => new Float32Array(cols + 1).fill(-1));
      for (const [h, th, rho] of pts) {
        const cj = Math.round((th / (2 * Math.PI) + 0.5) * cols);
        for (let i = 0; i < rows.length; i++) { if (Math.abs(h - rows[i]) > dh) continue; for (let dj = -1; dj <= 1; dj++) { const j = ((cj + dj) % cols + cols) % cols; if (rho > R[i][j]) R[i][j] = rho; } }
      }
      for (let pass = 0; pass < 12; pass++) for (let i = 0; i < rows.length; i++) for (let j = 0; j < cols; j++) if (R[i][j] < 0) {   // fill holes from neighbours
        let s = 0, n = 0; for (const [a, b] of [[i - 1, j], [i + 1, j], [i, (j + 1) % cols], [i, (j + cols - 1) % cols]]) if (R[a] && R[a][b] >= 0) { s += R[a][b]; n++; }
        if (n) R[i][j] = s / n;
      }
      const M = R.map((row, i) => row.map((_, j) => { let m = 0; for (let a = Math.max(0, i - win); a <= Math.min(rows.length - 1, i + win); a++) m = Math.max(m, R[a][j]); return m; }));
      for (let pass = 0; pass < blur; pass++) for (let i = 0; i < rows.length; i++) { const row = M[i].slice(); for (let j = 0; j < cols; j++) { const up = M[Math.min(rows.length - 1, i + 1)][j], dn = M[Math.max(0, i - 1)][j]; M[i][j] = (row[j] * 2 + row[(j + 1) % cols] + row[(j + cols - 1) % cols] + up + dn) / 6; } }
      for (const row of M) row[cols] = row[0];
      return M;
    };
    // points spread over the body's triangles (the figure has few vertices on its limbs, so vertices alone give a lumpy outline)
    const surface = cand => {
      const on = new Uint8Array(P.count), out = []; for (const i of cand) on[i] = 1;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (!on[a] || !on[b] || !on[c]) continue;
        const A = [P.getX(a), P.getY(a), P.getZ(a)], B = [P.getX(b), P.getY(b), P.getZ(b)], C = [P.getX(c), P.getY(c), P.getZ(c)];
        const e = Math.max(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]), Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2]));
        const n = Math.min(10, Math.max(1, Math.ceil(e / 0.008)));
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const u = i / n, v = j / n, w = 1 - u - v; out.push([A[0] * u + B[0] * v + C[0] * w, A[1] * u + B[1] * v + C[1] * w, A[2] * u + B[2] * v + C[2] * w]); }
      }
      return out;
    };
    const weights = (x, y, z, cand, allowed) => {
      const best = [];
      for (const i of cand) { const d = (P.getX(i) - x) ** 2 + (P.getY(i) - y) ** 2 + (P.getZ(i) - z) ** 2; if (best.length < 8 || d < best[7][0]) { best.push([d, i]); best.sort((a, b) => a[0] - b[0]); if (best.length > 8) best.pop(); } }
      const acc = new Map();
      for (const [d, i] of best) { const w0 = 1 / (Math.sqrt(d) + 0.01); for (let k = 0; k < 4; k++) { const b = SI[i * 4 + k], w = SW[i * 4 + k] * w0; if (w > 0 && allowed.has(b)) acc.set(b, (acc.get(b) || 0) + w); } }
      let top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); if (!top.length) top = [[[...allowed][0], 1]];
      const t = top.reduce((s, e) => s + e[1], 0); while (top.length < 4) top.push([0, 0]);
      sIdx.push(...top.map(e => e[0])); sWt.push(...top.map(e => e[1] / t));
    };
    const tube = (verts, rowsN, cols, flip) => {   // verts already pushed row by row: (cols + 1) per row
      const base = pos.length / 3 - rowsN * (cols + 1);
      for (let i = 0; i < rowsN - 1; i++) for (let j = 0; j < cols; j++) {
        const a = base + i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
        if (flip) index.push(a, c, b, b, c, d); else index.push(a, b, c, b, d, c);
      }
    };
    // ---- torso: hem just over the belt, up to the shoulders, then in to a collar around the neck
    const ZC = -0.015, TC = 40, rows = [], tPts = [], tCand = [], nPts = [];
    for (let y = 1.062; y <= 1.505; y += 0.0246) rows.push(y);
    for (let i = 0; i < P.count; i++) {
      const r = reg[i], x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const inTorso = r === 'torso' || r === 'belt' || (r === 'upper' && Math.abs(x) < 0.205) || (r === 'neck' && y < 1.53) || (r === 'hips' && y > 1.0);
      if (!inTorso) continue;
      tCand.push(i); if (r === 'neck' && y > 1.47) nPts.push([y, Math.atan2(x, z - ZC), Math.hypot(x, z - ZC)]);
    }
    for (const [x, y, z] of surface(tCand)) if (Math.abs(x) < 0.21) tPts.push([y, Math.atan2(x, z - ZC), Math.hypot(x, z - ZC)]);
    const TR = grid(rows, TC, tPts, 0.016, 2), NR = grid([1.5], TC, nPts, 0.04, 0)[0];
    const ringsY = [...rows, 1.522, 1.545], RN = ringsY.length;
    for (let i = 0; i < RN; i++) for (let j = 0; j <= TC; j++) {
      const th = (j / TC - 0.5) * 2 * Math.PI, y = ringsY[i], rr = i < rows.length ? TR[i][j] + 0.013 : NR[j] + (i === rows.length ? 0.03 : 0.016);
      const x = Math.sin(th) * rr, z = ZC + Math.cos(th) * rr;
      pos.push(x, y, z); uvs.push(...toUV('torso', sym(x, z), (y - 1.0) / 0.53, 0.004)); weights(x, y, z, tCand, TORSO_B);
    }
    tube(null, RN, TC, false);
    // ---- sleeves: from inside the chest out to the wrist, in two parts so the upper/fore textures line up
    for (const side of [1, -1]) {
      const aPts = [], aCand = [], AC = 22;
      for (let i = 0; i < P.count; i++) { const r = reg[i], x = P.getX(i) * side; if (x < 0.1 || !(r === 'upper' || r === 'fore' || r === 'cuff')) continue; aCand.push(i); }
      const axis = ax => [lerp(1.447, 1.433, clamp((ax - 0.18) / 0.56, 0, 1)), lerp(-0.065, -0.071, clamp((ax - 0.18) / 0.56, 0, 1))];
      for (const [px, py, pz] of surface(aCand)) { const ax = px * side, [yc, zc] = axis(ax), dy = py - yc, dz = pz - zc; aPts.push([ax, Math.atan2(dz, dy), Math.hypot(dy, dz)]); }
      const xs = []; for (let ax = 0.14; ax <= 0.7501; ax += 0.0255) xs.push(ax);
      const AR = grid(xs, AC, aPts, 0.016, 2, 3);
      for (const [cell, x0, x1, len] of [['upper', 0.14, 0.468, 0.29], ['fore', 0.468, 0.751, 0.292]]) {
        const segRows = xs.map((ax, i) => [ax, i]).filter(([ax]) => ax >= x0 - 0.013 && ax <= x1 + 0.013);
        for (const [ax, ri] of segRows) for (let j = 0; j <= AC; j++) {
          const ph = (j / AC - 0.5) * 2 * Math.PI, [yc, zc] = axis(ax), rr = AR[ri][j] + 0.01, y = yc + Math.cos(ph) * rr, z = zc + Math.sin(ph) * rr, x = ax * side;
          pos.push(x, y, z); uvs.push(...toUV(cell, ang(z - zc, y - yc), (ax - (cell === 'upper' ? 0.18 : 0.468)) / len, 0.03)); weights(x, y, z, aCand, ARM_B);
        }
        tube(null, segRows.length, AC, side < 0);
      }
    }
    // ---- trouser legs: from the hip down over the knee to the ankle, centred on each leg slice by slice
    const LEG_B = new Set(['pelvis', 'spine_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'].map(bi));
    for (const side of [1, -1]) {
      const lCand = [], LC = 24, ys = [];
      for (let i = 0; i < P.count; i++) { const r = reg[i]; if ((r === 'thigh' || r === 'calf' || r === 'sock') && P.getX(i) * side > 0) lCand.push(i); }
      for (let y = 0.105; y <= 0.9801; y += 0.0255) ys.push(y);
      const S = surface(lCand).map(([x, y, z]) => [x * side, y, z]);
      // centre line: hip, knee and ankle centres joined by straight lines
      const mid = (y0, y1) => { let x0 = 9, x1 = -9, z0 = 9, z1 = -9; for (const [x, y, z] of S) if (y > y0 && y < y1) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [(x0 + x1) / 2, (z0 + z1) / 2]; };
      const K = [[0.13, mid(0.1, 0.16)], [0.52, mid(0.47, 0.57)], [0.86, mid(0.8, 0.9)]];
      const at = y => { const [a, b] = y < 0.52 ? [K[0], K[1]] : [K[1], K[2]], k = (y - a[0]) / (b[0] - a[0]); return [lerp(a[1][0], b[1][0], k), lerp(a[1][1], b[1][1], k)]; };
      const lPts = S.map(([x, y, z]) => { const [xc, zc] = at(y), dx = x - xc, dz = z - zc; return [y, Math.atan2(dx, dz), Math.hypot(dx, dz)]; });
      const LR = grid(ys, LC, lPts, 0.016, 2, 4);
      for (const [cell, y0, y1] of [['calf', 0.047, 0.525], ['thigh', 0.525, 1.0]]) {
        const segRows = ys.map((y, i) => [y, i]).filter(([y]) => y >= y0 - 0.013 && y <= y1 + 0.013);
        for (const [y, ri] of segRows) for (let j = 0; j <= LC; j++) {
          const th = (j / LC - 0.5) * 2 * Math.PI, [xc, zc] = at(y), rr = (LR[ri][j] + 0.008) * (1 - 0.34 * Math.pow(clamp((y - 0.86) / 0.12, 0, 1), 1.5)), xl = xc + Math.sin(th) * rr, z = zc + Math.cos(th) * rr, x = xl * side;
          pos.push(x, y, z); uvs.push(...toUV(cell, ang(xl - (cell === 'thigh' ? 0.09 : 0.095), z + (cell === 'thigh' ? 0 : 0.026)), (y - y0) / (y1 - y0), 0.03)); weights(x, y, z, lCand, LEG_B);
        }
        tube(null, segRows.length, LC, side < 0);
      }
      // ---- boot: one surface around a vertical axis (foot oval at the bottom, ankle and shaft above), closed by a flat sole
      const bCand = []; for (let i = 0; i < P.count; i++) { const r = reg[i]; if (P.getX(i) * side > 0 && (r === 'shoe' || r === 'sock' || (r === 'calf' && P.getY(i) < 0.4))) bCand.push(i); }
      const BS = surface(bCand).map(([x, y, z]) => [x * side, y, z]), BY = [0, 0.011, 0.022, 0.034, 0.048, 0.064, 0.082, 0.1, 0.12, 0.145, 0.17, 0.2, 0.23, 0.26, 0.29, 0.315, 0.34];
      const footC = (() => { let x0 = 9, x1 = -9, z0 = 9, z1 = -9; for (const [x, y, z] of BS) if (y < 0.06) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [(x0 + x1) / 2, (z0 + z1) / 2]; })();
      const bc = y => { const k = clamp((y - 0.07) / 0.08, 0, 1), a = at(Math.max(0.11, y)); return [lerp(footC[0], a[0], k), lerp(footC[1], a[1], k)]; };
      const bPts = BS.map(([x, y, z]) => { const [xc, zc] = bc(y), dx = x - xc, dz = z - zc; return [y, Math.atan2(dx, dz), Math.hypot(dx, dz)]; });
      const BR = grid(BY, LC, bPts, 0.014, 1, 2);
      const legR = (y, j) => { const f = clamp((y - ys[0]) / 0.0255, 0, ys.length - 1.001), i = Math.floor(f), k = f - i; return lerp(LR[i][j], LR[i + 1][j], k) + 0.008; };
      const B_B = new Set(['calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r'].map(bi));
      for (let i = 0; i < BY.length; i++) for (let j = 0; j <= LC; j++) {
        const y = BY[i], th = (j / LC - 0.5) * 2 * Math.PI, [xc, zc] = bc(y);
        let rr = BR[i][j] + (i <= 1 ? 0.016 : 0.011);                         // sole sticks out a little
        if (y >= 0.1) rr = Math.max(rr, legR(y, j) + 0.012 + (i === BY.length - 1 ? 0.004 : 0));   // shaft goes over the trousers
        const xl = xc + Math.sin(th) * rr, z = zc + Math.cos(th) * rr, x = xl * side, yy = Math.max(0, y);
        pos.push(x, yy, z); uvs.push(...toUV('boot', Math.abs(th) / Math.PI, y / 0.34, 0.004)); weights(x, yy, z, bCand, B_B);
      }
      tube(null, BY.length, LC, side < 0);
      { // flat sole under the boot
        const ring0 = pos.length / 3 - BY.length * (LC + 1), c = pos.length / 3, [xc, zc] = bc(0);
        pos.push(xc * side, 0, zc); uvs.push(...toUV('boot', 0.5, 0.01, 0.004)); weights(xc * side, 0, zc, bCand, B_B);
        for (let j = 0; j < LC; j++) { if (side > 0) index.push(c, ring0 + j + 1, ring0 + j); else index.push(c, ring0 + j, ring0 + j + 1); }
      }
    }
    // ---- hands: one smooth surface over the palm and four fingers, and a separate thumb, in place of the stick fingers.
    // They follow the finger bones, so they still curl around grips and open for waves.
    {
      const dom = i => { let b = 0, w = -1; for (let k = 0; k < 4; k++) if (SW[i * 4 + k] > w) { w = SW[i * 4 + k]; b = SI[i * 4 + k]; } return bones[b].name; };
      const setOf = re => new Set(bones.map((b, i) => re.test(b.name) ? i : -1).filter(i => i >= 0));
      const HAND_B = setOf(/^(hand|index|middle|ring|pinky|lowerarm)/), THUMB_B = setOf(/^(hand|thumb)/);
      const ctr = {};   // axis point for each vertex added here (by vertex number), to point every triangle outward
      const addTube = (rings, cand, allowed, capDir) => {
        const base = pos.length / 3, C = rings[0].pts.length;
        for (const r of rings) for (const p of r.pts) { ctr[pos.length / 3] = r.c; pos.push(p[0], p[1], p[2]); uvs.push(...toUV('hand', 0.5, 0.5, 0.03)); weights(p[0], p[1], p[2], cand, allowed); }
        const tri = (a, b, c) => {
          const A = pos.slice(a * 3, a * 3 + 3), Bv = pos.slice(b * 3, b * 3 + 3), Cv = pos.slice(c * 3, c * 3 + 3), m = ctr[a];
          const ux = Bv[0] - A[0], uy = Bv[1] - A[1], uz = Bv[2] - A[2], vx = Cv[0] - A[0], vy = Cv[1] - A[1], vz = Cv[2] - A[2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const gx = (A[0] + Bv[0] + Cv[0]) / 3 - m[0], gy = (A[1] + Bv[1] + Cv[1]) / 3 - m[1], gz = (A[2] + Bv[2] + Cv[2]) / 3 - m[2];
          if (nx * gx + ny * gy + nz * gz >= 0) index.push(a, b, c); else index.push(a, c, b);
        };
        for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < C - 1; j++) { const a = base + i * C + j, b = a + 1, c = a + C, d = c + 1; tri(a, b, c); tri(b, d, c); }
        // rounded cap at the far end
        const last = rings[rings.length - 1], tipC = last.c, tip = [tipC[0] + capDir[0], tipC[1] + capDir[1], tipC[2] + capDir[2]], back = [tipC[0] - capDir[0] * 3, tipC[1] - capDir[1] * 3, tipC[2] - capDir[2] * 3];
        const ti = pos.length / 3; ctr[ti] = back; pos.push(...tip); uvs.push(...toUV('hand', 0.5, 0.5, 0.03)); weights(tip[0], tip[1], tip[2], cand, allowed);
        const l0 = base + (rings.length - 1) * C; for (let j = 0; j < C - 1; j++) tri(ti, l0 + j, l0 + j + 1);
      };
      // a ring of points around an axis point c, in the plane spanned by unit vectors e1, e2, radii from a grid row
      const ring = (c, e1, e2, R, k) => { const pts = []; const C = R.length - 1; for (let j = 0; j <= C; j++) { const ph = (j / C - 0.5) * 2 * Math.PI, rr = R[j] * k; pts.push([c[0] + (Math.cos(ph) * e1[0] + Math.sin(ph) * e2[0]) * rr, c[1] + (Math.cos(ph) * e1[1] + Math.sin(ph) * e2[1]) * rr, c[2] + (Math.cos(ph) * e1[2] + Math.sin(ph) * e2[2]) * rr]); } return { c, pts }; };
      for (const side of [1, -1]) {
        const palm = [], thumb = [];
        for (let i = 0; i < P.count; i++) { if (reg[i] !== 'hand' || P.getX(i) * side < 0.6) continue; (/^thumb/.test(dom(i)) ? thumb : palm).push(i); }
        if (palm.length < 10) continue;
        // palm + fingers: rings along the arm direction (x), centred slice by slice
        const S = surface(palm).map(([x, y, z]) => [x * side, y, z]);
        let xmax = 0; for (const p of S) xmax = Math.max(xmax, p[0]);
        const AC = 22, xs = []; for (let k = 0; k <= 11; k++) xs.push(lerp(0.728, xmax - 0.006, k / 11));
        const cen = xs.map(x0 => { let y0 = 9, y1 = -9, z0 = 9, z1 = -9; for (const [x, y, z] of S) if (Math.abs(x - x0) < 0.014) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return y0 < 9 ? [(y0 + y1) / 2, (z0 + z1) / 2] : null; });
        for (let i = 0; i < cen.length; i++) if (!cen[i]) cen[i] = cen[i - 1] || [1.437, -0.06];
        for (let i = 1; i < cen.length - 1; i++) cen[i] = [(cen[i - 1][0] + cen[i][0] * 2 + cen[i + 1][0]) / 4, (cen[i - 1][1] + cen[i][1] * 2 + cen[i + 1][1]) / 4];
        const at = x => { const f = clamp((x - xs[0]) / (xs[1] - xs[0]), 0, xs.length - 1.001), i = Math.floor(f), k = f - i; return [lerp(cen[i][0], cen[i + 1][0], k), lerp(cen[i][1], cen[i + 1][1], k)]; };
        const pts = S.map(([x, y, z]) => { const [yc, zc] = at(x), dy = y - yc, dz = z - zc; return [x, Math.atan2(dz, dy), Math.hypot(dy, dz)]; });
        const HR = grid(xs, AC, pts, 0.012, 1, 3);
        const rings = xs.map((x, i) => { const [yc, zc] = at(x), taper = 1 - 0.18 * Math.pow(i / (xs.length - 1), 3); return ring([x * side, yc, zc], [0, 1, 0], [0, 0, 1], HR[i], taper * 1.0 + 0.0); });
        for (const r of rings) for (const p of r.pts) { const dx = p[0] - r.c[0], dy = p[1] - r.c[1], dz = p[2] - r.c[2], l = Math.hypot(dx, dy, dz) || 1; p[0] += dx / l * 0.003; p[1] += dy / l * 0.003; p[2] += dz / l * 0.003; }
        addTube(rings, palm, HAND_B, [side * 0.014, 0, 0]);
        // thumb: rings along its own length (principal direction of its points)
        if (thumb.length > 8) {
          const T = surface(thumb); let cx = 0, cy = 0, cz = 0; for (const p of T) { cx += p[0]; cy += p[1]; cz += p[2]; } cx /= T.length; cy /= T.length; cz /= T.length;
          let d = [side, -0.4, 0.6]; for (let it = 0; it < 12; it++) { const nd = [0, 0, 0]; for (const p of T) { const q = [p[0] - cx, p[1] - cy, p[2] - cz], t = q[0] * d[0] + q[1] * d[1] + q[2] * d[2]; nd[0] += q[0] * t; nd[1] += q[1] * t; nd[2] += q[2] * t; } const l = Math.hypot(...nd) || 1; d = nd.map(v => v / l); }
          // point the axis from the palm out to the tip
          { let far = 0, near = 0; for (const p of T) { const t = (p[0] - cx) * d[0] + (p[1] - cy) * d[1] + (p[2] - cz) * d[2]; const r = Math.abs(p[0]) ; if (t > 0) far += r; else near += r; } if (far < near) d = d.map(v => -v); }
          let t0 = 1e9, t1 = -1e9; for (const p of T) { const t = (p[0] - cx) * d[0] + (p[1] - cy) * d[1] + (p[2] - cz) * d[2]; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
          const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]; { const l = Math.hypot(...e1); e1.forEach((v, i) => e1[i] = v / l); }
          const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
          const ts = []; for (let k = 0; k <= 6; k++) ts.push(lerp(t0 + 0.004, t1 - 0.004, k / 6));
          const tc = ts.map(t0_ => { let a = [0, 0, 0], n = 0; for (const p of T) { const t = (p[0] - cx) * d[0] + (p[1] - cy) * d[1] + (p[2] - cz) * d[2]; if (Math.abs(t - t0_) < 0.01) { a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; n++; } } return n ? a.map(v => v / n) : [cx + d[0] * t0_, cy + d[1] * t0_, cz + d[2] * t0_]; });
          const tp = T.map(p => { let best = 0, bd = 1e9; for (let i = 0; i < ts.length; i++) { const t = (p[0] - cx) * d[0] + (p[1] - cy) * d[1] + (p[2] - cz) * d[2], dd = Math.abs(t - ts[i]); if (dd < bd) { bd = dd; best = i; } } const c = tc[best], q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], a = q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2], b = q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2]; return [best, Math.atan2(b, a), Math.hypot(a, b)]; });
          const TR = grid(ts.map((_, i) => i), 14, tp, 0.5, 1, 3);
          const trings = ts.map((_, i) => ring(tc[i], e1, e2, TR[i].map(r => r + 0.003), 1 - 0.2 * Math.pow(i / (ts.length - 1), 3)));
          addTube(trings, thumb, THUMB_B, d.map(v => v * 0.009));
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWt, 4));
    g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  },
  // ---- skin atlas painting
  material(o, key) {
    key = key || o.id; if (this.mats.has(key)) return this.mats.get(key);
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; this.paint(cv.getContext('2d'), o);
    const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    const m = new THREE.MeshLambertMaterial({ map: tex, skinning: true }); this.mats.set(key, m); return m;
  },
  paint(x, o) {
    const AT = this.AT, C = new THREE.Color();
    const hex = (h, k = 1) => '#' + C.setHex(h).multiplyScalar(k).getHexString();
    const fill = (n, col) => { const r = AT[n]; x.fillStyle = col; x.fillRect(r[0], r[1], r[2], r[3]); };
    const rect = (n, u0, v0, u1, v1, col) => { const r = AT[n]; x.fillStyle = col; x.fillRect(r[0] + u0 * r[2], r[1] + (1 - v1) * r[3], (u1 - u0) * r[2], (v1 - v0) * r[3]); };
    const dot = (n, u, v, rad, col) => { const r = AT[n]; x.fillStyle = col; x.beginPath(); x.arc(r[0] + u * r[2], r[1] + (1 - v) * r[3], rad, 0, TAU); x.fill(); };
    const line = (n, pts, w, col) => { const r = AT[n]; x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach(([u, v], i) => x[i ? 'lineTo' : 'moveTo'](r[0] + u * r[2], r[1] + (1 - v) * r[3])); x.stroke(); };
    const poly = (n, pts, col) => { const r = AT[n]; x.fillStyle = col; x.beginPath(); pts.forEach(([u, v], i) => x[i ? 'lineTo' : 'moveTo'](r[0] + u * r[2], r[1] + (1 - v) * r[3])); x.closePath(); x.fill(); };
    const sleeve = o.leather ? o.jacket : (o.sleeve ?? o.shirt), shoes = o.shoes ?? 0x22222a, torsoC = o.leather ? o.jacket : o.shirt;
    fill('torso', hex(torsoC)); fill('hips', hex(o.pants)); fill('thigh', hex(o.pants)); fill('calf', hex(o.pants));
    fill('upper', hex(sleeve)); fill('fore', hex(sleeve));
    for (const n of ['head', 'neck', 'hand']) fill(n, hex(o.skin));
    // hair painted on the scalp: hairline high over the forehead, lower over the ears and nape
    if (o.shiesty) {   // knit ski mask over the whole head and neck, open only across the eyes
      fill('head', hex(o.shiesty)); fill('neck', hex(o.shiesty));
      for (let v = 0.04; v < 1; v += 0.045) line('head', [[0, v], [1, v]], 1, 'rgba(255,255,255,0.05)');
      for (let u = 0.02; u < 1; u += 0.03) line('head', [[u, 0], [u, 1]], 0.6, 'rgba(0,0,0,0.35)');
      rect('head', 0, 0.515, 0.2, 0.635, hex(o.skin)); line('head', [[0, 0.512], [0.205, 0.512], [0.205, 0.638], [0, 0.638]], 2, hex(o.shiesty, 1.4));
    } else if (o.hat !== 'helmet' && !o.head) {
      const hc = o.hat === 'dreads' ? o.hatC : (o.hair ?? 0x2a1a10), pts = [];
      if (o.lineup) {   // sharp shape-up: straight across the forehead, square corners at the temples, clean sideburns
        pts.push([0, 0.74], [0.17, 0.74], [0.175, 0.64], [0.33, 0.64], [0.335, 0.49], [0.42, 0.49], [0.5, 0.6], [0.75, 0.48], [1, 0.38]);
      } else for (let i = 0; i <= 30; i++) { const d = i / 30; pts.push([d, d < 0.5 ? 0.77 - 0.28 * Math.pow(d / 0.5, 1.1) * 0.5 : 0.63 - 0.26 * (d - 0.5) / 0.5]); }
      poly('head', [[0, 1.02], ...pts, [1, 1.02]], hex(hc));
      if (o.lineup) line('head', [[0, 0.74], [0.17, 0.74], [0.175, 0.64], [0.33, 0.64], [0.335, 0.49], [0.42, 0.49]], 1.5, hex(hc, 0.6));
      if (o.hat === 'slick') { line('head', [[0, 0.9], [0.42, 0.9]], 3, 'rgba(255,255,255,0.18)'); line('head', [[0.1, 0.99], [0.16, 0.8]], 1.5, hex(hc, 0.6)); }
    }
    fill('shoe', hex(shoes)); rect('shoe', 0, 0, 1, 0.24, o.boots ? '#24160c' : '#ececee');
    if (o.tiedye) { const img = tieDyeMat().map.image; for (const n of ['torso', 'upper', 'fore']) { const r = AT[n]; x.drawImage(img, r[0], r[1], r[2], r[3]); } }
    if (o.plaid) {   // red-and-black buffalo plaid flannel
      for (const n of ['torso', 'upper', 'fore']) {
        const r = AT[n], st = 10; x.save(); x.beginPath(); x.rect(r[0], r[1], r[2], r[3]); x.clip();
        for (let i = 0; i < r[2]; i += st * 2) { x.fillStyle = 'rgba(10,8,10,0.55)'; x.fillRect(r[0] + i, r[1], st, r[3]); }
        for (let j = 0; j < r[3]; j += st * 2) { x.fillStyle = 'rgba(10,8,10,0.55)'; x.fillRect(r[0], r[1] + j, r[2], st); }
        x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 1; for (let i = st / 2; i < r[2]; i += st * 2) { x.beginPath(); x.moveTo(r[0] + i, r[1]); x.lineTo(r[0] + i, r[1] + r[3]); x.stroke(); }
        x.restore();
      }
      // open front: white tee with a small print, button plackets on both edges
      rect('torso', 0, 0, 0.16, 0.97, hex(o.tee)); line('torso', [[0.16, 0], [0.16, 1]], 2.5, '#5a0a10');
      for (let v = 0.12; v < 0.95; v += 0.13) dot('torso', 0.185, v, 1.6, '#f2e8d0');
      line('torso', [[0.17, 0.995], [0.42, 0.99]], 3, '#8a0e16');   // collar
    }
    // soft light from above, cuffs, hem and a belt so plain outfits still read as clothes
    { const r = AT.torso, gr = x.createLinearGradient(0, r[1], 0, r[1] + r[3]); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)'); x.fillStyle = gr; x.fillRect(r[0], r[1], r[2], r[3]); }
    fill('belt', o.studBelt ? '#101013' : hex(o.pants, 0.5)); fill('cuff', o.tiedye ? '#2a2a30' : hex(sleeve, 0.72)); fill('sock', o.boots ? hex(shoes, 0.8) : hex(o.pants, 0.75));
    if (o.studBelt) for (let i = 0; i < 12; i++) dot('belt', (i + 0.5) / 12, 0.5, 1.8, '#dfe3ea');
    else rect('belt', 0, 0.15, 0.05, 0.85, o.id === 'tycoon' ? '#d4a72c' : '#c9ccd2');
    rect('fore', 0, 0.9, 1, 1, o.tiedye ? 'rgba(0,0,0,0.25)' : hex(sleeve, 0.78));
    // trouser details: fly, slash pockets, back pockets, side seams
    { const sd = hex(o.pants, 0.72);
      line('hips', [[0.035, 0.97], [0.035, 0.42], [0, 0.3]], 1.5, sd);
      line('hips', [[0.2, 0.97], [0.27, 0.78], [0.36, 0.66]], 1.5, sd);
      rect('hips', 0.8, 0.45, 0.93, 0.82, hex(o.pants, 0.9)); line('hips', [[0.8, 0.82], [0.8, 0.45], [0.93, 0.45], [0.93, 0.82], [0.8, 0.82]], 1, sd);
      if (!o.cargo) { line('thigh', [[0.75, 0], [0.75, 1]], 1, hex(o.pants, 0.82)); line('calf', [[0.75, 0], [0.75, 1]], 1, hex(o.pants, 0.82)); } }
    if (o.cargo) {
      rect('thigh', 0.68, 0.3, 0.82, 0.62, hex(o.pants, 0.8)); rect('thigh', 0.67, 0.56, 0.83, 0.66, hex(o.pants, 0.7)); dot('thigh', 0.75, 0.59, 1.6, '#2a2a2e');
      line('thigh', [[0.25, 0], [0.25, 1]], 1, hex(o.pants, 0.85)); line('calf', [[0.25, 0], [0.25, 1]], 1, hex(o.pants, 0.85));
    }
    // black leather boots for everyone: heavy sole with a stitched welt, toe cap, heel, laces up the front, padded collar
    { const B = AT.boot, gr = x.createLinearGradient(B[0], 0, B[0] + B[2], 0);
      fill('boot', '#18181b');
      gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.11)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
      x.fillStyle = gr; x.fillRect(B[0], B[1], B[2], B[3]);
      rect('boot', 0, 0.3, 0.2, 0.36, '#121214'); rect('boot', 0, 0.075, 0.24, 0.3, '#1f1f23');            // toe cap
      rect('boot', 0.8, 0.075, 1, 0.24, '#101012');                                                      // heel counter
      rect('boot', 0, 0, 1, 0.075, '#0b0b0c'); line('boot', [[0, 0.085], [1, 0.085]], 1.2, '#4a4a52');   // sole + welt stitch
      for (let i = 0; i < 7; i++) { const v = 0.38 + i * 0.075; line('boot', [[0, v], [0.075, v + 0.04]], 1.6, '#5a5a62'); dot('boot', 0.08, v + 0.02, 1.3, '#a8acb4'); }
      rect('boot', 0, 0.36, 0.035, 0.93, '#101012');                                                     // tongue
      rect('boot', 0, 0.93, 1, 1, '#2a2a30');                                                            // padded collar
      for (let i = 0; i < 24; i++) line('boot', [[(i + 0.5) / 24, 0.012], [(i + 0.5) / 24, 0.06]], 1, '#151517');   // tread edge
    }
    if (o.sneakers) {   // low white sneakers: jeans hang over the top of the shoe
      const W0 = hex(o.sneakers);
      rect('boot', 0, 0, 1, 1, hex(o.pants)); rect('boot', 0, 0.355, 1, 0.385, hex(o.pants, 0.7));                   // jean hem over the shoe
      rect('boot', 0, 0.075, 1, 0.355, W0);                                                                          // upper
      rect('boot', 0, 0, 1, 0.075, '#cfcfca'); line('boot', [[0, 0.075], [1, 0.075]], 2, '#9a9a96');                // sole
      rect('boot', 0, 0.075, 0.2, 0.18, '#ececea'); rect('boot', 0.82, 0.075, 1, 0.3, '#ececea');                      // toe cap, heel counter
      for (let i = 0; i < 4; i++) { const v = 0.2 + i * 0.035; line('boot', [[0, v], [0.07, v + 0.015]], 1.6, '#a8acb4'); }   // laces
      line('boot', [[0.32, 0.12], [0.5, 0.2], [0.68, 0.26]], 3, '#aeb2bc');                                        // side stripe
      line('boot', [[0.88, 0.3], [0.88, 0.36]], 2, '#d0d0d6');                                                       // heel tab
    }
    rect('calf', 0, 0, 1, 0.06, hex(o.pants, 0.82));
    if (o.jeans) {   // dark denim: faint diagonal weave, orange-brown stitching down the outer seams
      for (const n of ['thigh', 'calf', 'hips']) { const r = AT[n]; x.save(); x.beginPath(); x.rect(r[0], r[1], r[2], r[3]); x.clip(); x.strokeStyle = 'rgba(120,140,190,0.08)'; x.lineWidth = 1; for (let i = -r[3]; i < r[2]; i += 3) { x.beginPath(); x.moveTo(r[0] + i, r[1]); x.lineTo(r[0] + i + r[3], r[1] + r[3]); x.stroke(); } x.restore(); }
      for (const n of ['thigh', 'calf']) line(n, [[0.75, 0], [0.75, 1]], 1, 'rgba(176,112,58,0.7)');
      line('hips', [[0.2, 0.97], [0.27, 0.78], [0.36, 0.66]], 1, 'rgba(176,112,58,0.7)');
    }
    if (o.suit) {
      poly('torso', [[0, 1], [0.17, 1], [0, 0.5]], '#f2f2f4');
      poly('torso', [[0, 0.93], [0.026, 0.93], [0.034, 0.55], [0, 0.5]], hex(o.tieC)); rect('torso', 0, 0.92, 0.036, 0.98, hex(o.tieC, 0.8));
      line('torso', [[0.21, 1], [0, 0.47]], 3, '#08080b');
      for (const v of [0.4, 0.28]) dot('torso', 0, v, 2.4, '#050507');
    }
    if (o.leather) {
      rect('torso', 0, 0, 0.12, 1, hex(o.shirt)); line('torso', [[0.12, 0], [0.12, 1]], 2, '#c8ccd4');
      for (let i = 0; i < 4; i++) dot('torso', 0.4 + i * 0.06, 0.95, 1.6, '#dfe3ea');
      line('upper', [[0, 0.02], [1, 0.02]], 2, '#2a2a30');
    }
    if (o.hoodie) {
      line('torso', [[0.06, 0.95], [0.06, 0.66]], 2, '#f4f4f4');
      rect('torso', 0, 0.06, 0.2, 0.32, 'rgba(0,0,0,0.18)'); line('torso', [[0, 0.32], [0.2, 0.32]], 1.5, 'rgba(0,0,0,0.35)');
    }
    if (o.visor) rect('torso', 0, 0.6, 0.12, 0.68, hex(o.visor));
    if (o.id === 'tycoon') poly('torso', [[0, 0.98], [0.024, 0.98], [0.032, 0.45], [0, 0.4]], '#1a1a1a');
  },
  // ---- build a full character (player, lobby) with every accessory from the built-in rig mounted on bones
  make(eq) {
    const o = cosById('outfit', eq.outfit), R = this.base(this.material(o), true);
    this.setBody(R, this.buildFor(o, eq.body || 'woman'));
    const A = buildCharacter(eq, true);
    R.eq = A.eq; R.gunKey = null; R.heldKey = null;
    A.head.position.set(0, 0, 0); R.mHead.add(A.head);
    A.torso.position.set(0, 0, 0); R.mTorso.add(A.torso); A.pack.position.y -= 0.06; A.pack.position.z += 0.035;
    A.pick.position.set(0, -0.005, 0.02); A.pick.rotation.x = 1.3; R.mHandR.add(A.pick); R.pick = A.pick;
    A.held.position.set(0, -0.015, 0.07); R.mHandL.add(A.held); R.held = A.held;
    R.body.add(A.gun); R.gun = A.gun; R.body.add(A.glider); R.glider = A.glider;
    // box-headed skins (Sir Toastworth): tuck the real head away inside the box
    if (cosById('outfit', eq.outfit).head) { const k = 0.3; R.B.head.scale.setScalar(k); R.mHead.position.multiplyScalar(1 / k); R.mHead.scale.multiplyScalar(1 / k); }
    R.root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    return R;
  },
  // ---- light character for nearby bots: body, face, hair, backpack, plain gun, glider
  makeLite() {
    const G = rigGeo(), R = this.base(this.material(COS.outfit[0]), false);
    R.lite = true;
    R.face = new THREE.Mesh(G.face, lam(0x1c1612)); R.mHead.add(R.face);
    R.pack = new THREE.Mesh(G.pack, lam(0x6b5a3a)); R.pack.position.set(0, -0.05, 0.01); R.mTorso.add(R.pack);
    R.gun = new THREE.Group(); R.gunBox = new THREE.Mesh(G.gun, GUN_MAT); R.gunBox.scale.setScalar(0.85); R.gun.add(R.gunBox); R.body.add(R.gun);
    R.glider = new THREE.Group(); R.glider.position.set(0, 3.2, 0); R.glider.rotation.x = 0.12; R.gliderMesh = new THREE.Mesh(G.glider, lam(0x3aa8ff)); R.glider.add(R.gliderMesh); R.body.add(R.glider);
    R.pick = new THREE.Group(); R.held = new THREE.Group();
    for (const m of [R.face, R.pack, R.gunBox]) m.castShadow = true;
    return R;
  },
  _gliderMats: {},
  buildFor(o, body) { return !o.personal && body === 'woman' ? 'woman' : (o.build || 'average'); },
  setBody(R, build) { const v = this.variants[build] || this.variants.average; R.mesh.geometry = v.geo; R.shirt.geometry = v.shell; R.bodyK = (this.BUILDS[build] || {}).k || 1; R.build = build; },
  setLook(R, look) {
    const o = cosById('outfit', look.outfit || 'ranger');
    this.setBody(R, this.buildFor(o, look.body));
    R.mesh.material = R.shirt.material = this.material(o);
    R.pack.material = lam(look.pack ?? 0x6b5a3a);
    const gc = look.glider ?? 0x3aa8ff; R.gliderMesh.material = this._gliderMats[gc] || (this._gliderMats[gc] = new THREE.MeshLambertMaterial({ color: gc, side: THREE.DoubleSide }));
  },
  base(mat, full) {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const model = THREE.SkeletonUtils.clone(this.gltf.scene); model.scale.setScalar(this.K); body.add(model);
    const R = { root, body, model, skinned: true, B: {}, eq: {} };
    model.traverse(o => { if (o.isBone) R.B[o.name] = o; if (o.isSkinnedMesh) { R.mesh = o; o.material = mat; o.frustumCulled = false; o.castShadow = true; } });
    const mount = f => { const g = new THREE.Group(); g.position.copy(f.p); g.quaternion.copy(f.q); g.scale.copy(f.s); R.B[f.bone].add(g); return g; };
    R.mHead = mount(this.frames.head); R.mTorso = mount(this.frames.torso); R.mHandR = mount(this.frames.handR); R.mHandL = mount(this.frames.handL);
    R.shirt = new THREE.SkinnedMesh(this.shellGeo, mat); R.shirt.bind(R.mesh.skeleton, R.mesh.bindMatrix); R.shirt.frustumCulled = false; R.shirt.castShadow = true; R.mesh.parent.add(R.shirt);
    R.mixer = new THREE.AnimationMixer(model);
    R.L = { set: 'L', cur: null, act: null, acts: {} }; R.U = { set: 'U', cur: null, act: null, acts: {} };
    R.st = { legYaw: 0, lastShot: -99, shootT: 0, pickT: 0, lastPick: 0, aim: 0, fresh: true };
    return R;
  },
  play(R, layer, name, o = {}) {
    const c = this.clips[name]; if (!c) return null;
    let act = layer.acts[name];
    if (!act) { act = layer.acts[name] = R.mixer.clipAction(c[layer.set]); }
    act.timeScale = o.ts ?? 1;
    if (layer.cur === name && !o.restart) return act;
    const prev = layer.act;
    act.reset(); act.setLoop(o.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); act.clampWhenFinished = !!o.once;
    act.time = (o.t0 || 0) * c.dur; act.play();
    const fade = R.st.fresh ? 0 : (o.fade ?? 0.18);
    if (prev && prev !== act) { if (fade > 0) act.crossFadeFrom(prev, fade, false); else prev.stop(); }
    layer.cur = name; layer.act = act; return act;
  },
  TWIST: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01'],
  reset(R) { if (R.pure) this.TWIST.forEach((n, i) => R.B[n].quaternion.copy(R.pure[i])); R.mixer.stopAllAction(); R.L.cur = R.U.cur = null; R.L.act = R.U.act = null; R.st.fresh = true; R.st.legYaw = 0; R.st.rev = false; R.st.vy = null; },
  emoteClip: { groove: 'Dance_Body_Roll', robot: 'Dance_Charleston', jacks: 'Jumping_Jacks', wave: 'Greeting', airguitar: 'Dance_Simple', micdrop: 'Victory' },
  // a crawling player glows red so everyone can see they are hurt
  redTint(R, a) {
    const want = !!(a.crawl && a.alive);
    if (want) {
      const base = R._redBase && R.mesh.material === R._redMat ? R._redBase : R.mesh.material;
      if (!R._redMat || R._redBase !== base) { if (R._redMat) R._redMat.dispose(); R._redBase = base; R._redMat = base.clone(); R._redMat.emissive = new THREE.Color(0x9a0000); }
      R._redMat.emissiveIntensity = 0.55 + 0.35 * Math.sin(performance.now() / 180);
      if (R.mesh.material !== R._redMat) R.mesh.material = R.shirt.material = R._redMat;
    } else if (R._redMat && R.mesh.material === R._redMat) { R.mesh.material = R.shirt.material = R._redBase; }
  },
  animate(R, a, dt) {
    const st = R.st, L = R.L, U = R.U;
    // bots turn smoothly instead of snapping to a new target; the player's body follows the aim exactly
    if (st.vy == null || a.isPlayer || st.fresh) st.vy = a.yaw;
    else { const d = Math.atan2(Math.sin(a.yaw - st.vy), Math.cos(a.yaw - st.vy)); st.vy += d * Math.min(1, dt * 12); }
    R.root.position.set(a.pos.x, a.pos.y, a.pos.z); R.root.rotation.y = st.vy; R.root.scale.setScalar((a.scale || 1) * BODY_SCALE * (R.bodyK || 1));
    const cy = Math.cos(st.vy), sy = Math.sin(st.vy), lx = a.vel.x * cy - a.vel.z * sy, lz = a.vel.x * sy + a.vel.z * cy, sp = Math.hypot(lx, lz);
    const it = a.inv[a.slot], gun = !!it && it.kind === 'weapon', held = (it && it.hid) || null;
    let base = 'Idle_A', ts = 1, full = null, legYaw = 0, aim = false, showGun = false, showPick = false, showHeld = false, glider = false, oy = 0;
    if (!a.alive) full = 'Death_A';
    else if (a.state === 'sky') full = 'Flying_Forward';
    else if (a.state === 'glide') { full = 'Glide'; glider = true; oy = 0.04; }
    else if (a.emote) full = this.emoteClip[a.emote] || 'Dance_Simple';
    else if (a.mantleT > 0) full = 'ClimbUp_1m_RM';
    else if (a.crawl && !a.inWater) { full = 'Crawl'; ts = sp > 0.3 ? clamp(sp / 1.2, 0.6, 1.5) : 0.08; showHeld = !!held && held === 'medkit'; }
    else if (a.inWater) { full = sp > 1 ? 'Swim_Fwd' : 'Swim_Idle'; ts = sp > 1 ? clamp(sp / 2.5, 0.7, 1.6) : 1; oy = sp > 1 ? -0.1 : -0.55; }
    else {
      if (!a.onGround) base = 'Jump_air';
      else if (sp > 0.6) {
        // legs lean toward the run direction (at most ~40 degrees); running backwards switches with hysteresis so it never flip-flops
        let ph = Math.atan2(lx, lz);
        st.rev = st.rev ? Math.abs(ph) > Math.PI / 2 + 0.1 : Math.abs(ph) > Math.PI / 2 + 0.6;
        const rev = st.rev; if (rev) ph = Math.atan2(Math.sin(ph - Math.PI), Math.cos(ph - Math.PI));
        legYaw = clamp(ph, -0.7, 0.7);
        if (sp < 2.6) { base = 'Walk'; ts = clamp(sp / 1.2, 0.7, 1.7); } else if (sp < 5.0) { base = 'Jog'; ts = clamp(sp / 3.6, 0.7, 1.6); } else { base = 'Sprint'; ts = clamp(sp / 5.4, 0.8, 1.6); }
        if (rev) ts = -ts;
      }
      showGun = !!gun; showPick = !it || it.kind === 'pick'; showHeld = !gun && !showPick && !!held;
      aim = gun;
    }
    this.redTint(R, a);
    // ---- lower body
    const once = full === 'ClimbUp_1m_RM' || full === 'Death_A'; if (full === 'Death_A') ts = 1.5;
    if (full) { this.play(R, L, full, { ts, once, fade: 0.15 }); }
    else this.play(R, L, base, { ts, fade: base === 'Jump_air' ? 0.12 : 0.2 });
    if (L.act && !full) L.act.timeScale = ts;
    // ---- upper body
    if (full) { const ua = this.play(R, U, full, { ts, once, fade: 0.15 }); if (ua && L.act) ua.time = L.act.time; }
    else if (gun) {
      if (a.lastShotT !== st.lastShot) { if (!st.fresh) { st.shootT = 0.24; this.play(R, U, 'Pistol_Shoot', { once: true, restart: true, ts: 1.6, fade: 0.05 }); } st.lastShot = a.lastShotT; }
      st.shootT -= dt;
      if (a.reloadT > 0) this.play(R, U, 'Pistol_Reload', { ts: 1.25 });
      else if (st.shootT <= 0) this.play(R, U, 'Pistol_Idle', { fade: 0.15 });
    } else if (showPick && a.pickAnim > st.lastPick + 0.01) {
      st.pickT = 0.44; this.play(R, U, 'Chop_Tree', { once: true, restart: true, ts: 2.1, t0: 0.08, fade: 0.06 });
    } else if (showHeld && a.useT > 0) this.play(R, U, 'Consume', { fade: 0.2 });
    st.lastPick = a.pickAnim; st.pickT -= dt;
    if (!full && !gun && st.pickT <= 0 && !(showHeld && a.useT > 0)) {
      const ua = this.play(R, U, base, { ts, fade: 0.2 }); if (ua && L.act) { ua.time = L.act.time; ua.timeScale = L.act.timeScale; }
    }
    // The mixer only rewrites a bone when its animated value changes, so a held pose (gun stances) would keep last
    // frame's extra twist and bend and pile them up every frame. Put back the pure animation pose first, then animate.
    const TW = this.TWIST;
    if (R.pure) for (let i = 0; i < TW.length; i++) R.B[TW[i]].quaternion.copy(R.pure[i]);
    R.mixer.update(dt); st.fresh = false;
    if (!R.pure) R.pure = TW.map(() => new THREE.Quaternion());
    for (let i = 0; i < TW.length; i++) R.pure[i].copy(R.B[TW[i]].quaternion);
    // ---- turn the legs toward the run direction, keep the chest on the aim, bend the spine to the aim pitch
    st.legYaw += (legYaw - st.legYaw) * Math.min(1, dt * 7);
    st.aim += ((aim ? 1 : 0) - st.aim) * Math.min(1, dt * 12);
    const B = R.B, pitch = a.pitch || 0, Q = _cmQ.copy(B.root.quaternion);
    const turn = (bone, axis, ang) => { if (Math.abs(ang) < 1e-4) return; _cmV.copy(axis).applyQuaternion(_cmQi.copy(Q).conjugate()); _cmQ2.setFromAxisAngle(_cmV, ang); bone.quaternion.premultiply(_cmQ2); };
    turn(B.pelvis, Y_AXIS, st.legYaw); Q.multiply(B.pelvis.quaternion);
    turn(B.spine_01, Y_AXIS, -st.legYaw * 0.5); turn(B.spine_01, X_AXIS, -pitch * 0.34 * st.aim); Q.multiply(B.spine_01.quaternion);
    turn(B.spine_02, Y_AXIS, -st.legYaw * 0.3); turn(B.spine_02, X_AXIS, -pitch * 0.33 * st.aim); Q.multiply(B.spine_02.quaternion);
    turn(B.spine_03, Y_AXIS, -st.legYaw * 0.2); turn(B.spine_03, X_AXIS, -pitch * 0.33 * st.aim); Q.multiply(B.spine_03.quaternion);
    if (!full) turn(B.neck_01, X_AXIS, -pitch * 0.45 * (1 - st.aim));
    // skydiving: lie flat, or tip nose-down into a dive (turning about the chest, not the feet)
    if (a.state === 'sky') { const tilt = 0.08 + (a.dive || 0) * 1.05, h = 1.3; R.body.rotation.x = tilt; R.body.position.set(0, h - h * Math.cos(tilt), -h * Math.sin(tilt)); }
    else { R.body.rotation.x = 0; R.body.position.set(0, oy, 0); }
    R.root.updateMatrixWorld(true);
    // ---- held things
    if (R.lite) {
      const gk = gun ? it.wid + it.rarity : -1; if (R.gunKey !== gk) { R.gunKey = gk; if (gun) R.gunBox.geometry = gunGeo(WEAPONS[it.wid].type, it.rarity, 0x3a3a42, true); }
    } else {
      const gk = gun ? it.wid + it.rarity + R.eq.wrap : null;
      if (gk !== R.gunKey) { R.gunKey = gk; while (R.gun.children.length) R.gun.remove(R.gun.children[0]); if (gk) { const gm = gunModel(it, cosById('wrap', R.eq.wrap).c); gm.scale.setScalar(0.85); gm.traverse(m => { if (m.isMesh) m.castShadow = true; }); R.gun.add(gm); } }
      const hk = showHeld ? held : null;
      if (hk !== R.heldKey) { R.heldKey = hk; while (R.held.children.length) R.held.remove(R.held.children[0]); if (hk) R.held.add(heldModel(hk)); }
    }
    R.gun.visible = showGun;
    if (showGun) {
      R.mHandR.getWorldPosition(_cmV); R.body.worldToLocal(_cmV);
      R.gun.position.set(_cmV.x, _cmV.y + 0.07 * Math.cos(pitch), _cmV.z - 0.07 * Math.sin(pitch)); R.gun.rotation.set(-pitch, 0, 0);
    }
    R.pick.visible = showPick; R.held.visible = showHeld; R.glider.visible = glider;
  },
};
const _cmQ = new THREE.Quaternion(), _cmQi = new THREE.Quaternion(), _cmQ2 = new THREE.Quaternion(), _cmV = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0);

// One entry point for every rig: the uploaded model when it is ready, the built-in body otherwise.
function makeRig(eq) { return CharModel.ready ? CharModel.make(eq) : buildCharacter(eq); }
function animateRig(R, a, dt, t) { if (R.skinned) CharModel.animate(R, a, dt); else { computePose(a, POSE, t); animateCharacter(R, a, POSE); } }

// ---------------------------------------------------------------- nearby bots borrow a full body from a small pool; far ones stay on the instanced rig
const CharPool = {
  rigs: [], N: 18, near: 85, keep: 100, t: 0,   // in Fast graphics only the closest players get the detailed body
  clear() { for (const R of this.rigs) this.release(R); },
  release(R) { if (R.actor) { R.actor._cm = null; if (R.actor.ri >= 0) BotRig.hide(R.actor.ri); } R.actor = null; R.root.visible = false; },
  update(dt) {
    if (!CharModel.ready) return;
    if (!this.rigs.length) for (let i = 0; i < this.N; i++) { const R = CharModel.makeLite(); R.root.visible = false; R.actor = null; scene.add(R.root); this.rigs.push(R); }
    const cam = camera.position, ok = a => (a.alive || a._dieT > 0) && a.state !== 'bus' && a.ri >= 0;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.2;
      const pf = Perf.on, cap = pf ? 8 : this.N, keep = pf ? 55 : this.keep;
      this.rigs.forEach((R, i) => { if (R.actor && (i >= cap || !ok(R.actor) || R.actor.pos.distanceTo(cam) > keep || !actors.includes(R.actor))) this.release(R); });
      const free = this.rigs.filter((R, i) => !R.actor && i < cap);
      if (free.length) {
        const cand = [];
        const near = Perf.on ? 40 : GFX.fast ? 65 : this.near; for (const a of actors) if (!a._cm && a.alive && ok(a)) { const d = a.pos.distanceTo(cam); if (d < near) cand.push([d, a]); }
        cand.sort((p, q) => p[0] - q[0]);
        for (let i = 0; i < cand.length && free.length; i++) {
          const R = free.pop(), a = cand[i][1]; R.actor = a; a._cm = R; a._dieT = null;
          CharModel.setLook(R, a.look || {}); CharModel.reset(R); R.gunKey = null; R.root.visible = true; BotRig.hide(a.ri);
        }
      }
    }
    for (const R of this.rigs) if (R.actor) {
      const a = R.actor;
      if (a.alive) a._dieT = null;
      else { if (a._dieT == null) a._dieT = a._dissolveAt > Match.time ? a._dissolveAt - Match.time : 0; a._dieT -= dt; if (a._dieT <= 0) { this.release(R); continue; } }
      R._acc = (R._acc || 0) + dt;
      if (!View.sees(a.pos.x, a.pos.y + 1.2, a.pos.z, 2.6) && (R._skip = ((R._skip || 0) + 1) % 4)) continue;   // off-screen: catch up every 4th frame
      CharModel.animate(R, a, R._acc); R._acc = 0;
    }
  },
};
