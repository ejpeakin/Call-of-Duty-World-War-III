// =====================================================================
//  Input (keyboard, mouse, touch), camera, player control
// =====================================================================
const Input = {
  keys: {}, pressed: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, wheel: 0, locked: false,
  touch: { on: false, mx: 0, mz: 0, fire: false, ads: false, jump: false, stickId: null, lookId: null, sx: 0, sy: 0, lx: 0, ly: 0 },
  // game controller (standard layout): sticks move and look, triggers aim and fire, face buttons act
  pad: { gp: null, on: false, mx: 0, mz: 0, lx: 0, ly: 0, fire: false, ads: false, jump: false, sprint: false, prev: [], hit: [], navT: 0, focus: null, lastSlot: 1 },
  pollPad() {
    const pd = this.pad; let gp = null; pd.hit.length = 0;
    try { const list = navigator.getGamepads ? navigator.getGamepads() : []; for (const g of list) if (g && g.connected && g.buttons.length >= 10 && g.axes.length >= 4) { gp = g; break; } } catch (e) { /* not allowed here */ }
    pd.gp = gp;
    if (!gp) { if (pd.on) this.padOff(); return; }
    const dz = v => { const a = Math.abs(v); return a < 0.16 ? 0 : Math.sign(v) * (a - 0.16) / 0.84; };
    const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.35));
    for (let i = 0; i < 17; i++) { const d = b(i); if (d && !pd.prev[i]) pd.hit.push(i); pd.prev[i] = d; }
    pd.mx = dz(gp.axes[0] || 0); pd.mz = -dz(gp.axes[1] || 0); pd.lx = dz(gp.axes[2] || 0); pd.ly = dz(gp.axes[3] || 0);
    pd.fire = b(7); pd.ads = b(6); pd.jump = b(0);
    if (Math.hypot(pd.mx, pd.mz) < 0.25) pd.sprint = false;
    if (!pd.on && (pd.hit.length || Math.abs(pd.mx) + Math.abs(pd.mz) + Math.abs(pd.lx) + Math.abs(pd.ly) > 0.4)) { pd.on = true; $('clickHint').hidden = true; document.body.classList.add('pad'); Sfx.init(); HUD.last = {}; HUD.dirty = true; }
  },
  padOff() { const pd = this.pad; if (!pd.on) return; pd.on = false; pd.mx = pd.mz = pd.lx = pd.ly = 0; pd.fire = pd.ads = pd.jump = pd.sprint = false; document.body.classList.remove('pad'); if (pd.focus) pd.focus.classList.remove('padfocus'); pd.focus = null; HUD.last = {}; HUD.dirty = true; },
  rumble(ms, strong, weak) { const gp = this.pad.gp; if (!this.pad.on || !gp || !gp.vibrationActuator || !gp.vibrationActuator.playEffect) return; try { gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* no rumble */ } },
  // menus: the D-pad or left stick moves a highlight between buttons, A presses it, B goes back, LB / RB change tab
  padMenu(dt) {
    const pd = this.pad; if (!pd.gp) return;
    const root = ['settings', 'tutAsk', 'tutEnd', 'ticket', 'results', 'death', 'pause', 'mpPanel', 'lobby'].map(id => $(id)).find(el => el && !el.hidden); if (!root) return;
    const els = [...root.querySelectorAll('button, [data-id], [data-mode], [data-isl], [data-f], [data-cat], [data-build], [data-body], input')].filter(el => el.offsetParent !== null && !el.disabled && el.getBoundingClientRect().width > 4);
    if (!els.length) return;
    if (!pd.focus || !els.includes(pd.focus)) { if (pd.focus) pd.focus.classList.remove('padfocus'); pd.focus = els.find(el => /readyBtn|resumeBtn|rLobbyBtn|specBtn|tkBtn/.test(el.id)) || els[0]; if (pd.on) pd.focus.classList.add('padfocus'); }
    let dx = 0, dy = 0; pd.navT -= dt;
    for (const i of pd.hit) { if (i === 12) dy = -1; if (i === 13) dy = 1; if (i === 14) dx = -1; if (i === 15) dx = 1; }
    if (!dx && !dy && pd.navT <= 0 && Math.hypot(pd.mx, pd.mz) > 0.6) { if (Math.abs(pd.mx) > Math.abs(pd.mz)) dx = Math.sign(pd.mx); else dy = -Math.sign(pd.mz); }
    if (dx || dy) {
      pd.navT = 0.2; const r = pd.focus.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, bs = 1e9;
      for (const el of els) { if (el === pd.focus) continue; const q = el.getBoundingClientRect(), ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy, along = ex * dx + ey * dy, across = Math.abs(ex * dy) + Math.abs(ey * dx); if (along < 6) continue; const sc = along + across * 2.4; if (sc < bs) { bs = sc; best = el; } }
      if (best) { pd.focus.classList.remove('padfocus'); pd.focus = best; best.classList.add('padfocus'); if (best.scrollIntoView) best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }
    for (const i of pd.hit) {
      if (i === 0) { Sfx.init(); pd.focus.click(); }
      else if (i === 9 && root.id === 'pause') togglePause();
      else if (i === 1 && root.id === 'settings') Settings.close();
      else if (i === 1) { if (root.id === 'pause') togglePause(); else if (root.id === 'death') $('specBtn').click(); else if (root.id === 'lobby') { const t = root.querySelector('#tabs [data-tab="play"], #tabs button'); if (t) t.click(); } }
      else if ((i === 4 || i === 5) && root.id === 'lobby') { const tabs = [...$('tabs').querySelectorAll('button')], cur = tabs.findIndex(t => t.classList.contains('on')), n = tabs[(Math.max(0, cur) + (i === 5 ? 1 : tabs.length - 1)) % tabs.length]; if (n) n.click(); }
    }
    pd.hit.length = 0;   // a press that closed a menu must not also act in the game this frame
  },
  init() {
    const cv = $('fdView');
    addEventListener('keydown', e => {
      this.padOff();
      if (Match.state !== 'play') return;
      if (!this.keys[e.code]) this.press(e.code);
      this.keys[e.code] = true;
      if (Keys.bound(e.code) || ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Escape' && !IS_TOUCH && !this.locked) togglePause();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; this.lmb = this.rmb = false; });
    addEventListener('mousemove', e => { if (Match.state === 'play' && !Match.paused && (this.locked || this.lmb || this.rmb || this.free)) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    cv.addEventListener('mousedown', e => {
      this.padOff();
      if (Match.state !== 'play' || Match.paused) return;
      Sfx.init();
      if (!this.locked && !IS_TOUCH) this.requestLock();
      if (e.button === 0) this.lmb = true; if (e.button === 2) this.rmb = true;
      const mc = 'Mouse' + e.button; if (!this.keys[mc]) this.press(mc); this.keys[mc] = true;
      if (!player || !player.alive) this.pressed.add('Click');
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; this.keys['Mouse' + e.button] = false; });
    cv.addEventListener('auxclick', e => e.preventDefault());
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => { if (Match.state === 'play') { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      $('clickHint').hidden = this.locked || IS_TOUCH || Match.state !== 'play' || Match.paused || !$('death').hidden || !$('tutEnd').hidden;
      if (!this.locked && Match.state === 'play' && !Match.paused && !IS_TOUCH && $('death').hidden && $('results').hidden && $('tutEnd').hidden && !Match.ending) togglePause(true);
    });
    document.addEventListener('pointerlockerror', () => { this.free = true; $('clickHint').hidden = true; });
    this.initTouch();
  },
  // a key or mouse button went down: queue the actions bound to it (under each action's default key name)
  press(code) { for (const a of Keys.actionsFor(code)) this.pressed.add(Keys.token(a)); },
  requestLock() {
    if (IS_TOUCH || this.touch.on || this.pad.on) return;
    const cv = $('fdView');
    try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { this.free = true; }); } catch (e) { this.free = true; }
    setTimeout(() => { if (!this.locked && Match.state === 'play' && !Match.paused && !this.free && $('tutEnd').hidden) $('clickHint').hidden = false; }, 400);
  },
  initTouch() {
    const t = this.touch, ui = $('touchUI'), stick = $('stick'), knob = stick.querySelector('i');
    const enable = () => { if (t.on) return; t.on = true; ui.hidden = false; };
    if (IS_TOUCH) enable();
    addEventListener('touchstart', () => { if (Match.state === 'play') enable(); }, { passive: true });
    const cv = $('fdView');
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

// ---------------------------------------------------------------- settings window (look, graphics and keybinds)
const Settings = {
  wait: null,
  open() { this.render(); $('settings').hidden = false; if (document.pointerLockElement) document.exitPointerLock(); },
  close() { if (!$('settings') || $('settings').hidden) return; this.stop(); $('settings').hidden = true; Lobby.refresh(); HUD.last = {}; HUD.dirty = true; },
  stop() { if (this.wait) { const b = $('kbList').querySelector('[data-kb="' + this.wait + '"]'); if (b) b.classList.remove('wait'); } this.wait = null; $('kbMsg').textContent = ''; },
  render() {
    $('kbList').innerHTML = KEY_ACTIONS.map(([a, label]) => `<span>${esc(label)}</span><button type="button" data-kb="${a}" class="${Keys.get(a) !== KEY_DEF[a] ? 'changed' : ''}">${esc(Keys.of(a))}</button>`).join('');
  },
  take(code) {
    const a = this.wait; if (!a) return;
    const before = KEY_ACTIONS.find(k => k[0] !== a && Keys.get(k[0]) === code);
    Keys.set(a, code); this.wait = null; this.render();
    $('kbMsg').textContent = before ? Keys.name(code) + ' was used for ' + before[1] + ', so that now uses ' + Keys.of(before[0]) + '.' : '';
  },
  init() {
    $('kbList').addEventListener('click', e => {
      const b = e.target.closest('[data-kb]'); if (!b) return; e.stopPropagation();
      if (this.wait === b.dataset.kb) { this.stop(); return; }
      this.stop(); this.wait = b.dataset.kb; b.classList.add('wait'); b.textContent = 'Press a key…'; $('kbMsg').textContent = 'Press a key or mouse button for ' + KEY_ACTIONS.find(k => k[0] === this.wait)[1] + '. Esc cancels.';
    });
    // while waiting for a key, catch it before the game sees it
    addEventListener('keydown', e => {
      if (!this.wait) { if (e.code === 'Escape' && !$('settings').hidden) { e.preventDefault(); e.stopImmediatePropagation(); this.close(); } return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === 'Escape') { this.stop(); this.render(); return; }
      if (e.code) this.take(e.code);
    }, true);
    // a mouse press while waiting becomes the binding (the click that started waiting has already finished)
    addEventListener('mousedown', e => {
      if (!this.wait) return;
      if (e.target.closest && e.target.closest('#kbReset, #setDone')) { this.stop(); this.render(); return; }
      e.preventDefault(); e.stopImmediatePropagation(); this.eat = true; this.take('Mouse' + e.button);
    }, true);
    addEventListener('click', e => { if (this.eat) { this.eat = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    addEventListener('auxclick', e => { if (this.eat) { this.eat = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    addEventListener('contextmenu', e => { if (!$('settings').hidden) e.preventDefault(); }, true);
    $('kbReset').addEventListener('click', () => { Keys.reset(); this.stop(); this.render(); $('kbMsg').textContent = 'All keys are back to the defaults.'; });
    $('setDone').addEventListener('click', () => this.close());
    $('setBtn').addEventListener('click', () => { Sfx.init(); this.open(); });
    $('pauseSetBtn').addEventListener('click', () => this.open());
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
    if (a.crawl && !a.vehicle && a.state === 'ground') { py = 0.6; dist = Math.max(dist, 3.2); up = 0.5; }
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
  if (Match.paused) { if (document.pointerLockElement) document.exitPointerLock(); $('clickHint').hidden = true; Input.keys = {}; Input.lmb = Input.rmb = false; Input.pad.prev[9] = true; }
  else { Settings.close(); Input.requestLock(); }
}
function updatePlayer(dt) {
  const a = player; if (!a) return;
  const K = Input.keys, P = Input.pressed, tc = Input.touch, inp = a.input;
  const it = a.inv[a.slot];
  const sens = 0.0022 * Profile.d.sens * (inp.ads ? (Cam.scoped ? 0.32 : 0.65) : 1);
  let mdx = Input.mdx, mdy = Input.mdy; Input.mdx = Input.mdy = 0;
  if (K.ArrowLeft) mdx -= 600 * dt; if (K.ArrowRight) mdx += 600 * dt; if (K.ArrowUp) mdy -= 400 * dt; if (K.ArrowDown) mdy += 400 * dt;
  a.yaw -= mdx * sens; a.pitch = clamp(a.pitch - mdy * sens, -1.45, 1.45);
  const pd = Input.pad;
  if (pd.on) {
    const ls = (inp.ads ? (Cam.scoped ? 0.3 : 0.6) : 1) * Profile.d.sens, cv = v => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
    a.yaw -= cv(pd.lx) * 3.5 * ls * dt; a.pitch = clamp(a.pitch - cv(pd.ly) * 2.3 * ls * dt, -1.45, 1.45);
    if (a.slot) pd.lastSlot = a.slot;
    for (const i of pd.hit) {
      if (i === 0) P.add('Space');
      else if (i === 1) P.add('KeyQ');
      else if (i === 2) P.add(Interact.cur ? 'KeyE' : 'KeyR');
      else if (i === 3) P.add('Digit' + (a.slot === 0 ? (a.inv[pd.lastSlot] ? pd.lastSlot : 1) + 1 : 1));
      else if (i === 4) { if (Build.active) P.add('KeyG'); else Input.wheel -= 1; }
      else if (i === 5) { if (Build.active) P.add('TouchBuild'); else Input.wheel += 1; }
      else if (i === 8 || i === 12) P.add('KeyM');
      else if (i === 9) { togglePause(); P.clear(); return; }
      else if (i === 10) pd.sprint = !pd.sprint;
      else if (i === 13) P.add('KeyB');
      else if (i === 14) P.add('KeyG');
      else if (i === 15) P.add('TouchBuild');
    }
  }
  if (P.has('KeyM')) $('bigmap').hidden = !$('bigmap').hidden;
  if (!a.alive) {
    inp.f = inp.r = 0; inp.fire = inp.jump = inp.ads = false;
    if (P.has('Space') || P.has('Click')) cycleSpectate();
    P.clear(); Input.wheel = 0; return;
  }
  const H = act => Keys.held(act, K);
  let f = (H('forward') ? 1 : 0) - (H('back') ? 1 : 0) + tc.mz + pd.mz, r = (H('right') ? 1 : 0) - (H('left') ? 1 : 0) + tc.mx + pd.mx;
  inp.f = clamp(f, -1, 1); inp.r = clamp(r, -1, 1);
  inp.sprint = H('sprint') || (tc.on && Math.hypot(tc.mx, tc.mz) > 0.92) || pd.sprint;
  inp.jump = H('jump') || tc.jump || pd.jump;
  inp.fire = H('fire') || tc.fire || pd.fire;
  inp.ads = H('ads') || tc.ads || pd.ads;
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
  if (a.crawl) { P.delete('KeyQ'); P.delete('KeyZ'); P.delete('KeyX'); P.delete('KeyC'); P.delete('TouchBuild'); P.delete('KeyB'); }
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
