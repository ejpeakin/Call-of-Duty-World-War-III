// =====================================================================
//  Wind trails streaming off glider wingtips, and off hands and feet while skydiving
// =====================================================================
const Trails = {
  N: 28, max: 24, list: new Map(), mat: null,
  init() {
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  },
  make() {
    const N = this.N, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 8 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 8 * 3), 3));
    const idx = [];
    for (let s = 0; s < 4; s++) { const o = s * N * 2; for (let i = 0; i < N - 1; i++) { const a = o + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    g.setIndex(idx);
    const m = new THREE.Mesh(g, this.mat); m.frustumCulled = false; m.renderOrder = 7; scene.add(m);
    return { m, pts: [[], [], [], []], rx: 1, rz: 0, oy: 0.7 };
  },
  drop(a, t) { scene.remove(t.m); t.m.geometry.dispose(); this.list.delete(a); },
  clear() { for (const [a, t] of this.list) this.drop(a, t); },
  update() {
    const cp = camera.position;
    for (const a of actors) {
      const near = a.alive && a.pos.distanceToSquared(cp) < 170 * 170, gliding = near && a.state === 'glide', falling = near && a.state === 'sky';
      let t = this.list.get(a);
      if (!t) { if (!(gliding || falling) || this.list.size >= this.max) continue; t = this.make(); this.list.set(a, t); }
      if (falling) {
        const pts = this.limbs(a), cap = a === Cam.view ? 10 : this.N;
        for (let k = 0; k < 4; k++) {
          const [x, y, z] = pts[k], P = t.pts[k], h = P[0];
          if (!h || (h[0] - x) ** 2 + (h[1] - y) ** 2 + (h[2] - z) ** 2 > 0.16) P.unshift([x, y, z]); else { h[0] = x; h[1] = y; h[2] = z; }
          while (P.length > cap) P.pop();
        }
        t.rx = -Math.cos(a.yaw); t.rz = Math.sin(a.yaw); t.oy = 0; t.own = a === Cam.view;
      } else if (gliding) {
        const s = a.scale * BODY_SCALE, rx = -Math.cos(a.yaw), rz = Math.sin(a.yaw), hy = a.pos.y + 3.22 * s, span = 1.72 * s;
        for (let k = 0; k < 2; k++) {
          const sg = k ? 1 : -1, x = a.pos.x + rx * span * sg, z = a.pos.z + rz * span * sg, P = t.pts[k], h = P[0];
          const cap = a === Cam.view ? 9 : this.N;
          if (!h || (h[0] - x) ** 2 + (h[1] - hy) ** 2 + (h[2] - z) ** 2 > 0.16) P.unshift([x, hy, z]);
          else { h[0] = x; h[1] = hy; h[2] = z; }
          while (P.length > cap) P.pop();
        }
        t.rx = rx; t.rz = rz; t.oy = 0.7; t.own = a === Cam.view; t.pts[2].pop(); t.pts[3].pop();
      } else for (const P of t.pts) P.pop();
      if (!t.pts.some(P => P.length)) { this.drop(a, t); continue; }
      this.write(t);
    }
    for (const [a, t] of this.list) if (!actors.includes(a)) this.drop(a, t);
  },
  // hands and feet of a skydiver: read from the animated body when there is one, otherwise from the dive pose
  limbs(a) {
    const R = a === player && PlayerRig && PlayerRig.skinned ? PlayerRig : a._cm, out = [];
    if (R && R.root.visible) {
      for (const o of [R.mHandL, R.mHandR, R.B.ball_l, R.B.ball_r]) { o.getWorldPosition(_trV); out.push([_trV.x, _trV.y, _trV.z]); }
      return out;
    }
    const K = (CharModel.K || 1.06), s = BODY_SCALE * (a.scale || 1), tilt = 0.08 + (a.dive || 0) * 1.05, h = 1.3, ct = Math.cos(tilt), st = Math.sin(tilt), cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    for (const [px, py, pz] of [[0.53, 1.27, 0.07], [-0.53, 1.27, 0.07], [0.1, 1.24, -0.86], [-0.1, 1.24, -0.86]]) {
      const by = py * K - h, bz = pz * K, y = by * ct - bz * st + h, z = by * st + bz * ct, x = px * K;
      out.push([a.pos.x + (x * cy + z * sy) * s, a.pos.y + y * s, a.pos.z + (-x * sy + z * cy) * s]);
    }
    return out;
  },
  write(t) {
    const N = this.N, pos = t.m.geometry.attributes.position, col = t.m.geometry.attributes.color, pa = pos.array, ca = col.array;
    const ox = t.rx * 0.7, oz = t.rz * 0.7, oy = t.oy, cp = camera.position;
    for (let k = 0; k < 4; k++) {
      const P = t.pts[k], L = P.length, base = k * N * 2;
      for (let i = 0; i < N; i++) {
        if (!L) { const v0 = (base + i * 2) * 3; pa.fill(0, v0, v0 + 6); col.array.fill(0, v0, v0 + 6); continue; }
        const p = P[Math.min(i, L - 1)], f = i < L ? 1 - i / Math.max(1, L - 1) : 0, w = (t.own ? 0.06 : 0.1) * f;
        const cd = Math.sqrt((p[0] - cp.x) ** 2 + (p[1] - cp.y) ** 2 + (p[2] - cp.z) ** 2), near = clamp((cd - 4) / 10, 0, 1);
        const c = (t.own ? 0.6 : 0.8) * f * f * near;
        const v0 = (base + i * 2) * 3, v1 = v0 + 3;
        pa[v0] = p[0] - ox * w; pa[v0 + 1] = p[1] - oy * w; pa[v0 + 2] = p[2] - oz * w;
        pa[v1] = p[0] + ox * w; pa[v1 + 1] = p[1] + oy * w; pa[v1 + 2] = p[2] + oz * w;
        ca[v0] = ca[v1] = c * 0.88; ca[v0 + 1] = ca[v1 + 1] = c * 0.94; ca[v0 + 2] = ca[v1 + 2] = c;
      }
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  },
};
const _trV = new THREE.Vector3();
