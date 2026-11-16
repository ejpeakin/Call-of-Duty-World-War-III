// =====================================================================
//  Elimination effect: a small drone drops in over the body, scans it with a blue beam, flashes,
//  and the body breaks up into little blue blocks that float away. The drone then flies off.
// =====================================================================
const DISSOLVE_T = 0.95;   // seconds from elimination to the flash (the body stays until then)
const ElimFX = {
  list: [], cubeGeo: null, cubeMat: null, coneMat: null, flashMat: null, droneGeo: null, droneMat: null, ledMat: null, rotorGeo: null,
  init() {
    this.cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    this.cubeMat = new THREE.MeshLambertMaterial({ color: 0x5fc4ff, emissive: 0x1f6cff, emissiveIntensity: 0.9, transparent: true, opacity: 1 });
    this.coneMat = new THREE.MeshBasicMaterial({ color: 0x3fa8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    // drone body: a rounded hull, four arms with motor pods, a lens and a blue light ring underneath
    const L = [], B = (w, h, d, x, y, z, hex, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); L.push([g, hex]); };
    const Cy = (r, h, x, y, z, hex, r2 = r, s = 14) => { const g = new THREE.CylinderGeometry(r2, r, h, s); g.translate(x, y, z); L.push([g, hex]); };
    B(0.34, 0.1, 0.42, 0, 0, 0, 0x2a2e36); B(0.28, 0.06, 0.3, 0, 0.075, -0.02, 0x3a404c);
    { const g = new THREE.SphereGeometry(0.13, 14, 8, 0, TAU, 0, Math.PI / 2); g.scale(1, 0.55, 1.2); g.translate(0, 0.1, 0.02); L.push([g, 0x464e5c]); }
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      B(0.05, 0.035, 0.36, sx * 0.17, 0.01, sz * 0.17, 0x1d2027, Math.atan2(sx, sz));
      Cy(0.05, 0.08, sx * 0.3, 0.03, sz * 0.3, 0x15171c); Cy(0.012, 0.05, sx * 0.3, 0.09, sz * 0.3, 0x8a909a, 0.012, 8);
      Cy(0.03, 0.06, sx * 0.3, -0.06, sz * 0.3, 0x2a2e36, 0.02, 8);
    }
    Cy(0.06, 0.06, 0, -0.07, 0.12, 0x101216); { const g = new THREE.SphereGeometry(0.04, 12, 8); g.translate(0, -0.09, 0.12); L.push([g, 0x0a0a0c]); }
    const P = [], N = [], C = [], c = new THREE.Color();
    for (const [g0, hex] of L) { const g = g0.toNonIndexed(); c.setHex(hex); const pa = g.attributes.position.array, na = g.attributes.normal.array; for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2]); N.push(na[i], na[i + 1], na[i + 2]); C.push(c.r, c.g, c.b); } g.dispose(); g0.dispose(); }
    this.droneGeo = new THREE.BufferGeometry(); this.droneGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); this.droneGeo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); this.droneGeo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    this.droneMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x444444 });
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0x4fc8ff });
    this.rotorGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.008, 18);
    this.rotorMat = new THREE.MeshBasicMaterial({ color: 0xcfd6e0, transparent: true, opacity: 0.35, depthWrite: false });
  },
  clear() { for (const f of this.list) this.drop(f); this.list = []; },
  drop(f) { scene.remove(f.drone); if (f.cubes) { scene.remove(f.cubes); f.cubes.material.dispose(); } scene.remove(f.cone); f.cone.material.dispose(); scene.remove(f.flash); f.flash.material.dispose(); },
  makeDrone() {
    const g = new THREE.Group(), body = new THREE.Mesh(this.droneGeo, this.droneMat); body.castShadow = true; g.add(body);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 6, 28), this.ledMat); ring.rotation.x = Math.PI / 2; ring.position.y = -0.055; g.add(ring);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), this.ledMat); eye.position.set(0, -0.1, 0.12); g.add(eye);
    g.userData.rotors = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const r = new THREE.Mesh(this.rotorGeo, this.rotorMat); r.position.set(sx * 0.3, 0.12, sz * 0.3); g.add(r); g.userData.rotors.push(r); }
    g.scale.setScalar(1.25); scene.add(g); return g;
  },
  // eliminated: start the drone if the camera is close enough to see it
  start(t) {
    const cp = camera.position, d = Math.hypot(t.pos.x - cp.x, t.pos.z - cp.z);
    t._dissolveAt = Match.time + DISSOLVE_T;
    if (d > 170 || this.list.length >= 8 || !this.cubeGeo) { t._dissolveAt = 0; return false; }
    const s = (t.scale || 1) * BODY_SCALE, top = t.pos.y + 2.1 * s;
    const f = { t: 0, a: t, x: t.pos.x, y: t.pos.y, z: t.pos.z, top, s, drone: this.makeDrone(), cubes: null, cone: null, flash: null, flashed: false, side: Math.random() < 0.5 ? -1 : 1 };
    f.cone = new THREE.Mesh(new THREE.ConeGeometry(0.85 * s, 1, 24, 1, true), this.coneMat.clone()); f.cone.renderOrder = 9; scene.add(f.cone);
    f.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), this.flashMat.clone()); f.flash.renderOrder = 9; f.flash.visible = false; scene.add(f.flash);
    f.drone.position.set(f.x + f.side * 6, top + 9, f.z + 3);
    this.list.push(f); return true;
  },
  // points across the body at the moment of the flash: from the animated model when there is one, else a body-shaped cloud
  sample(f, n) {
    const a = f.a, R = a === player && PlayerRig && PlayerRig.skinned ? PlayerRig : a._cm, out = [], v = new THREE.Vector3();
    if (R && R.root.visible && R.mesh) {
      for (const m of [R.shirt, R.mesh]) {
        if (!m) continue; const cnt = m.geometry.attributes.position.count, k = m === R.shirt ? Math.round(n * 0.7) : n - out.length;
        for (let i = 0; i < k; i++) { m.boneTransform(Math.floor(Math.random() * cnt), v); v.applyMatrix4(m.matrixWorld); out.push([v.x, v.y, v.z]); }
      }
      return out;
    }
    const s = f.s, cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
    for (let i = 0; i < n; i++) {
      let lx, ly, lz;
      if (i < n * 0.14) { const u = Math.random() * TAU, w = Math.acos(2 * Math.random() - 1); lx = Math.sin(w) * Math.cos(u) * 0.12; ly = 1.8 + Math.cos(w) * 0.14; lz = Math.sin(w) * Math.sin(u) * 0.13; }
      else { const u = Math.random() * TAU, r = 0.2 * Math.sqrt(Math.random()); ly = Math.random() * 1.62; lx = Math.cos(u) * r * (ly > 0.95 ? 1.15 : 0.85); lz = Math.sin(u) * r * 0.65; if (ly < 0.95) lx += (Math.random() < 0.5 ? -1 : 1) * 0.1; }
      out.push([a.pos.x + (lx * cy + lz * sy) * s, f.y + ly * s, a.pos.z + (-lx * sy + lz * cy) * s]);
    }
    return out;
  },
  dissolve(f) {
    const N = 110, pts = this.sample(f, N), m = new THREE.InstancedMesh(this.cubeGeo, this.cubeMat.clone(), pts.length);
    m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    f.bits = pts.map(([x, y, z]) => ({ x, y, z, vx: rnd(-0.5, 0.5), vy: rnd(0.5, 1.9), vz: rnd(-0.5, 0.5), sz: rnd(0.055, 0.11), r: rnd(0, TAU), rs: rnd(-6, 6), delay: Math.max(0, (y - f.y) / (2 * f.s)) * 0.25 }));
    f.cubes = m; scene.add(m); this.place(f, 0);
    FX.burst(f.x, f.y + 1.1 * f.s, f.z, 0x6fd0ff, 18, 3, 0.6, 0.1, -1);
    if (Sfx.vol(f.x, f.y, f.z) > 0.05) { const v = Sfx.vol(f.x, f.y, f.z); Sfx.tone(1700, 0.25, 'sine', 0.14 * v, -900); Sfx.tone(600, 0.35, 'triangle', 0.1 * v, 700, 0.05); Sfx.noise(0.3, 3000, 1.5, 0.12 * v); }
  },
  place(f, age) {
    const m = f.cubes, M = _efM, Q = _efQ, E = _efE, P = _efP, S = _efS;
    f.bits.forEach((b, i) => {
      const t = Math.max(0, age - b.delay), k = Math.min(1, t / 1.25);
      P.set(b.x + b.vx * t, b.y + b.vy * t + 0.6 * t * t, b.z + b.vz * t); E.set(b.r + b.rs * t, b.r * 0.7 + b.rs * t * 0.6, 0); Q.setFromEuler(E);
      S.setScalar(b.sz * (1 - k * k) + 1e-4); M.compose(P, Q, S); m.setMatrixAt(i, M);
    });
    m.instanceMatrix.needsUpdate = true; m.material.opacity = 1 - Math.max(0, (age - 0.9) / 0.6);
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]; f.t += dt; const T = f.t, d = f.drone, hover = new THREE.Vector3(f.x, f.top + 1.15, f.z);
      for (const r of d.userData.rotors) r.rotation.y += dt * 60;
      if (T < 0.7) { const k = T / 0.7, e = 1 - (1 - k) * (1 - k); d.position.set(lerp(f.x + f.side * 6, hover.x, e), lerp(f.top + 9, hover.y, e), lerp(f.z + 3, hover.z, e)); d.rotation.set(0.25 * (1 - e), f.side * (1 - e) * 0.8, -0.3 * f.side * (1 - e)); }
      else if (T < 2.3) { d.position.set(hover.x, hover.y + Math.sin(T * 6) * 0.04, hover.z); d.rotation.set(0, d.rotation.y + dt * 0.6, 0); }
      else { const k = (T - 2.3) / 0.8; d.position.set(hover.x - f.side * k * k * 7, hover.y + k * k * 12, hover.z); d.rotation.set(-0.3 * k, d.rotation.y, 0.25 * f.side * k); }
      // scan beam from the drone down over the body, brightest just before the flash
      const beam = T < 0.55 ? 0 : T < DISSOLVE_T ? (T - 0.55) / (DISSOLVE_T - 0.55) : Math.max(0, 1 - (T - DISSOLVE_T) / 0.5);
      const top = d.position.y - 0.12, len = Math.max(0.1, top - f.y);
      f.cone.visible = beam > 0.01; f.cone.position.set(d.position.x, f.y + len / 2, d.position.z); f.cone.scale.set(1, len, 1); f.cone.material.opacity = 0.26 * beam;
      if (!f.flashed && T >= DISSOLVE_T) { f.flashed = true; this.dissolve(f); }
      if (f.flashed) { const k = (T - DISSOLVE_T) / 0.35; f.flash.visible = k < 1; if (k < 1) { f.flash.position.set(f.x, f.y + 1.1 * f.s, f.z); f.flash.scale.setScalar(0.4 + k * 1.6); f.flash.material.opacity = 0.75 * (1 - k); } }
      if (f.cubes) this.place(f, T - DISSOLVE_T);
      if (T > 3.2) { this.drop(f); this.list.splice(i, 1); }
    }
  },
};
const _efM = new THREE.Matrix4(), _efQ = new THREE.Quaternion(), _efE = new THREE.Euler(), _efP = new THREE.Vector3(), _efS = new THREE.Vector3();
