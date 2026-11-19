// =====================================================================
//  Engine: renderer, scene, sky, materials, particles, tracers
// =====================================================================
let renderer, scene, camera, sun, hemi, sky, stars, waterMesh, stormMesh, SOFT_GL = false;
// a message bar for when the 3D view cannot draw, so a black screen always says why
// The browser can hand the page a graphics context that is already switched off: Chrome does this for a
// site after the graphics card crashed there. Everything then 'works' but nothing is drawn, so say so.
const GL_BLOCKED = 'Your browser has switched off 3D graphics for this website, so the game cannot draw. This usually happens after the graphics card hiccups once. To fix it: close every Chrome window (or restart the computer), open the game again, and reload. If it is still blank, open chrome://settings/system and turn on "Use graphics acceleration when available".';
function checkGL() {
  let lost = false; try { lost = !renderer || renderer.getContext().isContextLost(); } catch (e) { lost = true; }
  if (lost) { showProblem(GL_BLOCKED); const el = document.getElementById('problemBar'); if (el) el.dataset.gl = '1'; }
  return !lost;
}
function showProblem(msg) {
  let el = document.getElementById('problemBar');
  if (!el) { el = document.createElement('div'); el.id = 'problemBar'; el.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:99;max-width:min(560px,calc(100vw - 32px));background:#3a0f1c;border:1px solid #ff6a7a;color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5)'; document.body.appendChild(el); }
  if (el.dataset.msg === msg) return; el.dataset.msg = msg; el.textContent = msg;
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const MAT = {};
const GEO = {};
const _matCache = {};
function lam(hex) { return _matCache[hex] || (_matCache[hex] = new THREE.MeshLambertMaterial({ color: hex })); }
function basic(hex) { const k = 'b' + hex; return _matCache[k] || (_matCache[k] = new THREE.MeshBasicMaterial({ color: hex })); }

function makeTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (kind === 'wood') {
    g.fillStyle = '#a8743f'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#9a6836' : '#b47e47'; g.fillRect(0, i * 32, 128, 30);
      g.fillStyle = 'rgba(80,45,15,.35)'; for (let k = 0; k < 6; k++) g.fillRect(Math.random() * 128, i * 32 + 4 + Math.random() * 22, 30 + Math.random() * 50, 1);
      g.fillStyle = '#6a4220'; g.fillRect(0, i * 32 + 30, 128, 2);
      g.fillStyle = '#5a3818'; g.fillRect(8, i * 32 + 13, 3, 3); g.fillRect(117, i * 32 + 13, 3, 3);
    }
  } else if (kind === 'brick') {
    g.fillStyle = '#d6c4ac'; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let k = -1; k < 4; k++) {
      const x = k * 32 + (r % 2 ? 16 : 0); const s = 150 + Math.random() * 40;
      g.fillStyle = `rgb(${s + 20},${s * 0.45},${s * 0.32})`; g.fillRect(x + 1, r * 16 + 1, 30, 14);
    }
  } else {
    g.fillStyle = '#8d99a6'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#7a8692'; g.fillRect(4, 4, 56, 56); g.fillRect(68, 68, 56, 56);
    g.strokeStyle = '#5d6772'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 124); g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
    g.fillStyle = '#c8d0d8'; for (const [x, y] of [[8, 8], [56, 8], [8, 56], [56, 56], [72, 72], [120, 72], [72, 120], [120, 120]]) { g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

// Graphics quality. 'auto' starts at full quality and, only if a match actually runs slowly, gives up the things that
// are least noticeable first: shadows, then the small ground plants, then a little resolution (never below 75%).
// 'fast' is the lighter look chosen on purpose; 'pretty' never steps down.
const GFX = {
  fast: false, base: 1, pr: 1, tWin: 0, nWin: 0, steps: 0,
  lowPower: /CrOS/.test(navigator.userAgent) || IS_TOUCH,
  pick() { return (Profile.d.gfx || 'auto') === 'fast' || !!Profile.d.perf || SOFT_GL; },
  shadows() { return !!Profile.d.shadows && !this.fast && !SOFT_GL; },
  apply() {
    this.fast = this.pick(); const dpr = window.devicePixelRatio || 1;
    this.base = SOFT_GL ? 0.6 : Profile.d.perf ? Math.min(dpr, 1) * 0.8 : this.fast ? Math.min(dpr, 1) * 0.9 : Math.min(dpr, IS_TOUCH ? 1.25 : 1.5);
    this.pr = this.base; this.steps = 0; renderer.setPixelRatio(this.pr); renderer.setSize(innerWidth, innerHeight);
    if (sun) sun.castShadow = Match.state === 'play' ? this.shadows() : false;
  },
  // called every frame with the time since the last one: if a match stays under ~30 fps for 4 seconds, take one step down
  watch(dt) {
    if (Match.state !== 'play' || Match.paused || document.hidden || dt > 1.5) { this.tWin = this.nWin = 0; return; }   // a long gap is a tab switch or a load, not a slow frame
    this.tWin += dt; this.nWin++; if (this.tWin < 4) return;
    const fps = this.nWin / this.tWin; this.tWin = this.nWin = 0;
    if (fps >= 30 || (Profile.d.gfx || 'auto') === 'pretty') return;
    if (!Profile.d.perf && !this.tipped) { this.tipped = true; HUD.toast('Running slowly? Turn on Performance Mode in Settings.'); }
    if (sun && sun.castShadow) { sun.castShadow = false; this.steps++; return; }
    if (!GroundCover.thin) { GroundCover.thinOut(); this.steps++; return; }
    const floor = Math.min(this.base, 0.75);
    if (this.pr > floor + 0.01) { this.pr = Math.max(floor, this.pr * 0.9); this.steps++; renderer.setPixelRatio(this.pr); renderer.setSize(innerWidth, innerHeight); }
  },
};
// Performance Mode (Settings): one switch for Chromebooks and other slow computers. No shadows, no grass or
// pollen, fewer particles and tracers, a shorter view distance, fewer detailed characters and loot models,
// still clouds and a still lobby.
const Perf = {
  get on() { return !!(Profile.d && Profile.d.perf); },
  set(v) { Profile.d.perf = !!v; Profile.save(); GFX.apply(); },
};
// what the camera can see this frame, so far-away or off-screen things can skip work
const View = {
  fr: new THREE.Frustum(), m: new THREE.Matrix4(), s: new THREE.Sphere(), far: 2000,
  update() { camera.updateMatrixWorld(); this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.fr.setFromProjectionMatrix(this.m); this.far = scene.fog ? scene.fog.far : 2000; },
  sees(x, y, z, r) { this.s.center.set(x, y, z); this.s.radius = r; return this.fr.intersectsSphere(this.s); },
};
function initEngine() {
  const canvas = $('fdView'), g0 = Profile.d.gfx || 'auto';
  renderer = new THREE.WebGLRenderer({ canvas, antialias: g0 !== 'fast' && !Profile.d.perf, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  // no graphics acceleration (software drawing): fewer pixels and no shadows, or every frame takes seconds
  try { const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info'), name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''; SOFT_GL = /swiftshader|llvmpipe|software|basic render/i.test(name) && !window.__testGL; if (/UHD Graphics|HD Graphics [0-9]|ADL-N|JSL|Mali-G[0-5]|PowerVR/i.test(name)) GFX.lowPower = true; } catch (e) { /* unknown: assume a real GPU */ }
  GFX.apply();
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); checkGL(); });
  canvas.addEventListener('webglcontextrestored', () => { const el = document.getElementById('problemBar'); if (el && el.dataset.gl) el.remove(); });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1700);
  hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 0.6); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.castShadow = true;
  sun.shadow.mapSize.set(IS_TOUCH || GFX.fast ? 1024 : 2048, IS_TOUCH || GFX.fast ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 420;
  sun.shadow.bias = -0.0007; scene.add(sun); scene.add(sun.target);
  // sky dome (vertex gradient)
  const sg = new THREE.SphereGeometry(1500, 32, 16);
  sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sg.attributes.position.count * 3), 3));
  sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; scene.add(sky);
  // stars
  const sp = []; for (let i = 0; i < 900; i++) { const a = Math.random() * TAU, e = Math.random() * 1.3 + 0.1; sp.push(Math.cos(a) * Math.cos(e) * 1400, Math.sin(e) * 1400, Math.sin(a) * Math.cos(e) * 1400); }
  const stg = new THREE.BufferGeometry(); stg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(stg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
  stars.visible = false; scene.add(stars);
  // storm wall
  const stormMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlash: { value: 0 } }, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec2 vUv; varying float vY; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vY=w.y; gl_Position=projectionMatrix*viewMatrix*w; }',
    // dark purple storm wall: slow swirling bands, brightened briefly by lightning (uFlash)
    fragmentShader: 'uniform float uTime; uniform float uFlash; varying vec2 vUv; varying float vY; void main(){ float s=sin(vUv.x*420.0+vY*0.06+uTime*1.6)*0.5+0.5; float s2=sin(vUv.x*150.0-uTime*0.8+vY*0.13)*0.5+0.5; float s3=sin(vUv.x*60.0+vY*0.035-uTime*0.35)*0.5+0.5; float k=s*s2*0.75+s3*0.25; vec3 c=mix(vec3(0.10,0.02,0.24),vec3(0.36,0.12,0.62),k); c+=vec3(0.55,0.45,0.95)*uFlash*(0.4+0.6*s3); float a=0.42+0.26*k+0.25*uFlash; a*=smoothstep(330.0,150.0,vY); gl_FragColor=vec4(c,a); }',
  });
  stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), stormMat);
  stormMesh.renderOrder = 5; stormMesh.visible = false; scene.add(stormMesh);

  MAT.wood = new THREE.MeshLambertMaterial({ map: makeTex('wood') });
  MAT.brick = new THREE.MeshLambertMaterial({ map: makeTex('brick') });
  MAT.metal = new THREE.MeshLambertMaterial({ map: makeTex('metal') });
  MAT.ghost = new THREE.MeshBasicMaterial({ color: 0x4fb2ff, transparent: true, opacity: 0.3, depthWrite: false });
  MAT.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.3, depthWrite: false });
  // blueprint outline drawn on top of the see-through piece
  MAT.ghostLine = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.95, depthWrite: false });
  MAT.ghostLineBad = new THREE.LineBasicMaterial({ color: 0xff8a94, transparent: true, opacity: 0.95, depthWrite: false });
  MAT.batch = new THREE.MeshLambertMaterial({ vertexColors: true });
  MAT.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  // ground: vertex colours times a fine grain texture, so it reads as earth up close instead of flat paint
  { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), im = g.createImageData(256, 256), r = mulberry32(99);
    for (let i = 0; i < 256 * 256; i++) { const v = 205 + r() * 50 - (r() < 0.06 ? 38 : 0) + (r() < 0.04 ? 14 : 0); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = Math.min(255, v); im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); g.globalAlpha = 0.5; g.drawImage(c, 0, 0, 128, 128, 0, 0, 256, 256); g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    MAT.terrain = new THREE.MeshLambertMaterial({ vertexColors: true, map: t }); }
  MAT.beam = {}; for (let r = 0; r < RARITY.length; r++) MAT.beam[r] = new THREE.MeshBasicMaterial({ color: RARITY[r].hex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });

  const S2 = Math.hypot(T, TH);   // build pieces follow the tile size in 70_build.js
  GEO.wall = new THREE.BoxGeometry(T, TH, 0.3);
  GEO.floor = new THREE.BoxGeometry(T, 0.25, T);
  GEO.rampX = new THREE.BoxGeometry(S2, 0.25, T);
  GEO.rampZ = new THREE.BoxGeometry(T, 0.25, S2);
  GEO.cone = new THREE.ConeGeometry(T / Math.SQRT2, CONE_H, 4, 1).rotateY(Math.PI / 4).translate(0, CONE_H / 2, 0); GEO.cone.computeVertexNormals();
  GEO.unit = new THREE.BoxGeometry(1, 1, 1);
  GEO.beam = new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6).translate(0, 1.6, 0);
  GEO.ring = new THREE.RingGeometry(0.35, 0.55, 18).rotateX(-Math.PI / 2);
  GEO.rocket = new THREE.CylinderGeometry(0.09, 0.12, 0.7, 6).rotateX(Math.PI / 2);
  FX.init();
  window.addEventListener('resize', onResize);
}
function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (Lobby.cam) { Lobby.cam.aspect = innerWidth / innerHeight; Lobby.cam.updateProjectionMatrix(); Lobby.place(); }
}
function setSky(top, hor) {
  const pos = sky.geometry.attributes.position, col = sky.geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 1500; const t = clamp(y * 1.7, 0, 1);
    _c1.copy(hor).lerp(top, Math.pow(t, 0.8)); if (y < 0) _c1.copy(hor).multiplyScalar(0.85);
    col.setXYZ(i, _c1.r, _c1.g, _c1.b);
  }
  col.needsUpdate = true;
}

// ---------------------------------------------------------------- particles + tracers
const FX = {
  max: 420, n: 0, mesh: null, P: [], tracers: [], ti: 0, nums: [], flashes: [],
  init() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.max; i++) { this.mesh.setMatrixAt(i, ZERO_M); this.mesh.setColorAt(i, _c1.setHex(0xffffff)); this.P.push({ life: 0 }); }
    scene.add(this.mesh);
    for (let i = 0; i < 48; i++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 }));
      l.frustumCulled = false; l.visible = false; scene.add(l); this.tracers.push({ l, life: 0 });
    }
    const fg = new THREE.SphereGeometry(1, 14, 10);
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.8, depthWrite: false })); m.visible = false; scene.add(m); this.flashes.push({ m, life: 0, max: 0, r: 1 }); }
  },
  clear() { this.live = true; for (const p of this.P) p.life = 0; for (const t of this.tracers) { t.life = 0; t.l.visible = false; } for (const f of this.flashes) { f.life = 0; f.m.visible = false; } if (this.sl) for (const s of this.sl) { s.life = 0; s.m.visible = false; } },
  burst(x, y, z, hex, n = 8, spd = 4, life = 0.5, size = 0.12, grav = 9) {
    const pf = Perf.on, cap = pf ? 160 : this.max;   // Performance Mode: at most 160 particles, fewer per burst, none far away
    if (camera.position.distanceToSquared(_v4.set(x, y, z)) > (pf ? 110 * 110 : 200 * 200)) return;
    if (pf && n > 1) n = Math.max(1, Math.round(n * 0.4));
    this.live = true;
    for (let k = 0; k < n; k++) {
      const i = this.n % cap; this.n = (i + 1) % cap; const p = this.P[i];
      p.x = x; p.y = y; p.z = z; const a = Math.random() * TAU, e = Math.random() * 1.2 - 0.2;
      const s = spd * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * Math.cos(e) * s; p.vy = Math.sin(e) * s + spd * 0.3; p.vz = Math.sin(a) * Math.cos(e) * s;
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.s = size * (0.6 + Math.random() * 0.8); p.g = grav;
      this.mesh.setColorAt(i, _c1.setHex(hex));
    }
    this.mesh.instanceColor.needsUpdate = true;
  },
  tracer(x0, y0, z0, x1, y1, z1, hex = 0xfff1a8) {
    const pf = Perf.on; if (camera.position.distanceToSquared(_v4.set(x0, y0, z0)) > (pf ? 90 * 90 : 160 * 160)) return;
    const tc = pf ? 16 : this.tracers.length; this.ti %= tc;   // at most 48 tracers at once (16 in Performance Mode); each lasts 0.06 s
    const t = this.tracers[this.ti]; this.ti = (this.ti + 1) % tc;
    const a = t.l.geometry.attributes.position.array; a[0] = x0; a[1] = y0; a[2] = z0; a[3] = x1; a[4] = y1; a[5] = z1;
    t.l.geometry.attributes.position.needsUpdate = true; t.l.material.color.setHex(hex); t.l.visible = true; t.life = 0.06;
  },
  // a pale arc in front of a katana swing
  slash(x, y, z, yaw, side) {
    if (camera.position.distanceToSquared(_v4.set(x, y, z)) > 120 * 120) return;
    if (!this.sl) {
      this.sl = []; const g = new THREE.RingGeometry(0.9, 3.4, 26, 1, -Math.PI / 2 - 1.0, 2.0); g.rotateX(-Math.PI / 2);
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xeef8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); m.visible = false; m.frustumCulled = false; scene.add(m); this.sl.push({ m, life: 0 }); }
    }
    const s = this.sl.find(q => q.life <= 0) || this.sl[0];
    s.m.position.set(x, y, z); s.m.rotation.set(0, yaw, side * 0.38); s.life = 0.2; s.m.visible = true; s.m.scale.setScalar(0.8);
  },
  flash(x, y, z, r, hex = 0xffb040, life = 0.45) {
    const f = this.flashes.find(f => f.life <= 0) || this.flashes[0];
    f.m.position.set(x, y, z); f.m.material.color.setHex(hex); f.life = f.max = life; f.r = r; f.m.visible = true;
  },
  update(dt) {
    if (this.live) {   // skip the whole pass (and the upload to the graphics card) when no particle is alive
      const m = this._m || (this._m = new THREE.Matrix4()); let any = false;
      for (let i = 0; i < this.max; i++) {
        const p = this.P[i];
        if (p.life <= 0) { if (p.max) { this.mesh.setMatrixAt(i, ZERO_M); p.max = 0; } continue; }
        any = true; p.life -= dt; p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const s = p.s * clamp(p.life / p.max * 1.5, 0, 1);
        m.makeScale(s, s, s); m.setPosition(p.x, p.y, p.z); this.mesh.setMatrixAt(i, m);
      }
      this.mesh.instanceMatrix.needsUpdate = true; this.live = any;
    }
    for (const t of this.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.l.visible = false; }
    if (this.sl) for (const s of this.sl) if (s.life > 0) { s.life -= dt; const k = Math.max(0, s.life / 0.2); s.m.material.opacity = 0.6 * k; s.m.scale.setScalar(0.8 + (1 - k) * 0.35); if (s.life <= 0) s.m.visible = false; }
    for (const f of this.flashes) if (f.life > 0) {
      f.life -= dt; const k = 1 - f.life / f.max; f.m.scale.setScalar(f.r * (0.3 + k * 0.9)); f.m.material.opacity = 0.8 * (1 - k);
      if (f.life <= 0) f.m.visible = false;
    }
  },
};
