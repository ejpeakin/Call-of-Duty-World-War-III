// =====================================================================
//  Input (keyboard, mouse, touch), camera, player control
// =====================================================================
const Input = {
  keys: {}, pressed: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, wheel: 0, locked: false,
  touch: { on: false, mx: 0, mz: 0, fire: false, ads: false, jump: false, stickId: null, lookId: null, sx: 0, sy: 0, lx: 0, ly: 0 },
  init() {
    const cv = $('game');
    addEventListener('keydown', e => {
      if (Match.state !== 'play') return;
      if (!this.keys[e.code]) this.pressed.add(e.code);
      this.keys[e.code] = true;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' && !IS_TOUCH && !this.locked) togglePause();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.lmb = this.rmb = false; });
    addEventListener('mousemove', e => { if (Match.state === 'play' && !Match.paused && (this.locked || this.lmb || this.rmb || this.free)) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    cv.addEventListener('mousedown', e => {
      if (Match.state !== 'play' || Match.paused) return;
      Sfx.init();
      if (!this.locked && !IS_TOUCH) this.requestLock();
      if (e.button === 0) this.lmb = true; if (e.button === 2) this.rmb = true;
      if (!player || !player.alive) this.pressed.add('Click');
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { if (Match.state === 'play') { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      $('clickHint').hidden = this.locked || IS_TOUCH || Match.state !== 'play' || Match.paused || !$('death').hidden;
      if (!this.locked && Match.state === 'play' && !Match.paused && !IS_TOUCH && $('death').hidden && $('results').hidden && !Match.ending) togglePause(true);
    });
    document.addEventListener('pointerlockerror', () => { this.free = true; $('clickHint').hidden = true; });
    this.initTouch();
  },
  requestLock() {
    if (IS_TOUCH || this.touch.on) return;
    const cv = $('game');
    try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { this.free = true; }); } catch (e) { this.free = true; }
    setTimeout(() => { if (!this.locked && Match.state === 'play' && !Match.paused && !this.free) $('clickHint').hidden = false; }, 400);
  },
  initTouch() {
    const t = this.touch, ui = $('touchUI'), stick = $('stick'), knob = stick.querySelector('i');
    const enable = () => { if (t.on) return; t.on = true; ui.hidden = false; };
    if (IS_TOUCH) enable();
    addEventListener('touchstart', () => { if (Match.state === 'play') enable(); }, { passive: true });
    const cv = $('game');
    cv.addEventListener('touchstart', e => {
      for (const tc of e.changedTouches) {
        if (tc.clientX < innerWidth * 0.42 && t.stickId === null) { t.stickId = tc.identifier; t.sx = tc.clientX; t.sy = tc.clientY; stick.style.display = 'block'; stick.style.left = t.sx + 'px'; stick.style.top = t.sy + 'px'; }
        else if (t.lookId === null) { t.lookId = tc.identifier; t.lx = tc.clientX; t.ly = tc.clientY; if (!player || !player.alive) this.pressed.add('Click'); }
      }
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === t.stickId) {
          let dx = tc.clientX - t.sx, dy = tc.clientY - t.sy; const d = Math.hypot(dx, dy), m = 50;
          if (d > m) { dx *= m / d; dy *= m / d; }
          t.mx = dx / m; t.mz = -dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (tc.identifier === t.lookId) { this.mdx += (tc.clientX - t.lx) * 2.2; this.mdy += (tc.clientY - t.ly) * 2.2; t.lx = tc.clientX; t.ly = tc.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === t.stickId) { t.stickId = null; t.mx = t.mz = 0; stick.style.display = 'none'; knob.style.transform = ''; }
        if (tc.identifier === t.lookId) t.lookId = null;
      }
    };
    cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
    const btn = (id, down, up) => {
      const el = $(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); Sfx.init(); down(); el._tid = e.changedTouches[0].identifier; el._lx = e.changedTouches[0].clientX; el._ly = e.changedTouches[0].clientY; }, { passive: false });
      el.addEventListener('touchmove', e => { e.preventDefault(); for (const tc of e.changedTouches) if (tc.identifier === el._tid && id === 'tFire') { this.mdx += (tc.clientX - el._lx) * 2.2; this.mdy += (tc.clientY - el._ly) * 2.2; el._lx = tc.clientX; el._ly = tc.clientY; } }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); if (up) up(); }, { passive: false });
    };
    btn('tFire', () => { t.fire = true; }, () => { t.fire = false; });
    btn('tAim', () => { t.ads = !t.ads; $('tAim').style.background = t.ads ? 'rgba(58,168,255,.5)' : ''; });
    btn('tJump', () => { t.jump = true; this.pressed.add('Space'); }, () => { t.jump = false; });
    btn('tReload', () => this.pressed.add('KeyR'));
    btn('tUse', () => this.pressed.add('KeyE'));
    btn('tBuild', () => this.pressed.add('TouchBuild'));
    btn('tMap', () => this.pressed.add('KeyM'));
    btn('tPause', () => togglePause());
  },
};

// ---------------------------------------------------------------- camera
const Cam = {
  fwd: new THREE.Vector3(0, 0, 1), t0: 0, ready: false, kick: 0, kickOff: 0, shake: 0, scoped: false, view: null, spYaw: 0, spPitch: 0,
  update(dt) {
    const a = viewTarget(); this.view = a; if (!a) return;
    const it = a.inv[a.slot];
    this.scoped = a === player && a.alive && a.input.ads && it && it.kind === 'weapon' && wstat(it).scope && a.state === 'ground' && !a.vehicle && !Build.active;
    this.kickOff = this.kickOff * Math.max(0, 1 - dt * 10) + this.kick; this.kick = 0;
    if (a.state === 'bus') {
      const yaw = player.yaw, pitch = clamp(player.pitch, -1.2, 0.5), cp = Math.cos(pitch);
      const fx = Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(yaw) * cp;
      camera.position.set(Bus.pos.x - fx * 34, Bus.pos.y - fy * 34 + 8, Bus.pos.z - fz * 34);
      camera.lookAt(Bus.pos.x, Bus.pos.y + 5, Bus.pos.z); this.ready = false; this.fov(dt, 70); return;
    }
    let yaw = a.yaw, pitch = a.pitch;
    if (a !== player) { this.spYaw += angDiff(this.spYaw, a.yaw) * Math.min(1, dt * 5); this.spPitch = lerp(this.spPitch, a.pitch, Math.min(1, dt * 5)); yaw = this.spYaw; pitch = this.spPitch; }
    else { this.spYaw = yaw; this.spPitch = pitch; }
    pitch = clamp(pitch + this.kickOff, -1.5, 1.5);
    const cp = Math.cos(pitch), fx = Math.sin(yaw) * cp, fy = Math.sin(pitch), fz = Math.cos(yaw) * cp;
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let dist, side, up, py;
    if (a.vehicle) { const lg = (a.vehicle.mesh.userData.halfLen || 2.25) > 3; dist = lg ? 13.5 : 10; side = 0; up = lg ? 1.6 : 1.0; py = 2.5; }
    else if (a.state === 'sky' || a.state === 'glide') { dist = 7.5; side = 0; up = 1.2; py = 1.5; }
    else if (this.scoped) { dist = 0; side = 0; up = 0; py = 1.72; }
    else if (a === player && a.input.ads) { dist = 2.0; side = 0.72; up = 0.12; py = 1.62; }
    else { dist = 3.5; side = 0.82; up = 0.28; py = 1.62; }
    if (innerHeight > innerWidth * 1.2 && !this.scoped) { dist *= 1.35; side *= 0.6; }
    if (a.emote && a === player) { dist = 4.2; side = 0; }
    const s = a.scale * BODY_SCALE, px = a.pos.x + rx * side * 0.35, pyy = a.pos.y + py * s, pz = a.pos.z + rz * side * 0.35;
    let cx = px - fx * dist + rx * side * 0.65, cy = pyy - fy * dist + up, cz = pz - fz * dist + rz * side * 0.65;
    const ddx = cx - px, ddy = cy - pyy, ddz = cz - pz, dl = Math.hypot(ddx, ddy, ddz);
    if (dl > 0.05) {
      const h = raycast(px, pyy, pz, ddx / dl, ddy / dl, ddz / dl, dl + 0.3, null, false);
      if (h.type && a.vehicle && h.obj === a.vehicle.col) { /* ignore own car */ }
      else if (h.type && a.vehicle && h.t < 3.7) { cx = px - fx * 2.5; cy = pyy + 4.5; cz = pz - fz * 2.5; }
      else if (h.type) { const t = Math.max(0.25, h.t - 0.3); cx = px + ddx / dl * t; cy = pyy + ddy / dl * t; cz = pz + ddz / dl * t; }
    }
    cy = Math.max(cy, groundH(cx, cz) + 0.35);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); const k = this.shake * 0.6; cx += rnd(-k, k); cy += rnd(-k, k); cz += rnd(-k, k); }
    camera.position.set(cx, cy, cz);
    camera.lookAt(cx + fx, cy + fy, cz + fz);
    this.fwd.set(fx, fy, fz);
    this.t0 = Math.max(0, (px - cx) * fx + (pyy - cy) * fy + (pz - cz) * fz);
    this.ready = a === player;
    const sprint = a.input.sprint && a.input.f > 0 && a.state === 'ground';
    this.fov(dt, this.scoped ? 22 : (a === player && a.input.ads && !a.vehicle) ? 58 : sprint ? 80 : a.vehicle ? 80 : 75);
  },
  fov(dt, target) { if (Math.abs(camera.fov - target) > 0.1) { camera.fov = lerp(camera.fov, target, Math.min(1, dt * 12)); camera.updateProjectionMatrix(); } },
};
function viewTarget() {
  if (!player) return null;
  if (player.alive || (Match.mode === 'rumble')) return player;
  let s = Match.spectate;
  if (!s || !s.alive) {
    s = actors.find(a => a.alive && !a.npc && a.team === player.team) || actors.find(a => a.alive && !a.npc) || null;
    Match.spectate = s;
  }
  return s || player;
}
function cycleSpectate() {
  const list = actors.filter(a => a.alive && !a.npc); if (!list.length) return;
  const i = list.indexOf(Match.spectate); Match.spectate = list[(i + 1) % list.length];
}

// ---------------------------------------------------------------- per-frame player control
function setBuildPiece(piece) {
  if (!Match.build) { HUD.toast('Building is off in No-Build mode. Use cover and mantle up ledges instead.'); return; }
  if (Build.active && Build.piece === piece) { Build.active = false; }
  else { Build.active = true; Build.piece = piece; player.useT = 0; player.reloadT = 0; player.emote = null; }
  HUD.dirty = true;
}
function togglePause(force) {
  if (Match.state !== 'play') return;
  Match.paused = force === true ? true : !Match.paused;
  $('pause').hidden = !Match.paused;
  if (Match.paused) { if (document.pointerLockElement) document.exitPointerLock(); $('clickHint').hidden = true; Input.keys = {}; Input.lmb = Input.rmb = false; }
  else Input.requestLock();
}
function updatePlayer(dt) {
  const a = player; if (!a) return;
  const K = Input.keys, P = Input.pressed, tc = Input.touch, inp = a.input;
  const it = a.inv[a.slot];
  const sens = 0.0022 * Profile.d.sens * (inp.ads ? (Cam.scoped ? 0.32 : 0.65) : 1);
  let mdx = Input.mdx, mdy = Input.mdy; Input.mdx = Input.mdy = 0;
  if (K.ArrowLeft) mdx -= 600 * dt; if (K.ArrowRight) mdx += 600 * dt; if (K.ArrowUp) mdy -= 400 * dt; if (K.ArrowDown) mdy += 400 * dt;
  a.yaw -= mdx * sens; a.pitch = clamp(a.pitch - mdy * sens, -1.45, 1.45);
  if (P.has('KeyM')) $('bigmap').hidden = !$('bigmap').hidden;
  if (!a.alive) {
    inp.f = inp.r = 0; inp.fire = inp.jump = inp.ads = false;
    if (P.has('Space') || P.has('Click')) cycleSpectate();
    P.clear(); Input.wheel = 0; return;
  }
  let f = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) + tc.mz, r = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + tc.mx;
  inp.f = clamp(f, -1, 1); inp.r = clamp(r, -1, 1);
  inp.sprint = !!(K.ShiftLeft || K.ShiftRight) || (tc.on && Math.hypot(tc.mx, tc.mz) > 0.92);
  inp.jump = !!K.Space || tc.jump;
  inp.fire = Input.lmb || tc.fire;
  inp.ads = Input.rmb || tc.ads;
  if (a.state === 'bus') { inp.f = inp.r = 0; inp.fire = false; if (P.has('Space')) busJump(a); }
  else if (a.state === 'sky') { if (P.has('Space')) a.state = 'glide'; }
  for (let i = 1; i <= 6; i++) if (P.has('Digit' + i)) { switchSlot(a, i - 1); Build.active = false; }
  if (Input.wheel) {
    const dir = Input.wheel > 0 ? 1 : -1; let s = a.slot;
    for (let k = 0; k < 6; k++) { s = (s + dir + 6) % 6; if (s === 0 || a.inv[s]) break; }
    switchSlot(a, s); Build.active = false;
  }
  if (P.has('KeyR')) startReload(a);
  if (P.has('KeyE')) Interact.use();
  if (P.has('KeyZ')) setBuildPiece('wall');
  if (P.has('KeyX')) setBuildPiece('ramp');
  if (P.has('KeyC')) setBuildPiece('floor');
  if (P.has('KeyQ') && Match.build) { Build.active = !Build.active; HUD.dirty = true; }
  if (P.has('TouchBuild')) { if (!Build.active) setBuildPiece('wall'); else if (Build.piece === 'wall') setBuildPiece('ramp'); else if (Build.piece === 'ramp') setBuildPiece('floor'); else { Build.active = false; HUD.dirty = true; } }
  if (P.has('KeyG') && Match.build) { const i = MAT_ORDER.indexOf(a.mat); a.mat = MAT_ORDER[(i + 1) % 3]; HUD.dirty = true; }
  if (P.has('KeyB') && a.state === 'ground' && !a.vehicle) { a.emote = Profile.d.eq.emote; a.emoteT = 0; Build.active = false; }
  P.clear(); Input.wheel = 0;
  if (a.channel) {
    const c = a.channel.obj; a.channel.t -= dt;
    if (c.opened || Math.hypot(c.x - a.pos.x, c.z - a.pos.z) > 3.4) a.channel = null;
    else if (a.channel.t <= 0) { openChest(c, a); a.channel = null; }
  }
  void it;
}
