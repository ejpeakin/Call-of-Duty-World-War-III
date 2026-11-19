// =====================================================================
//  Boot + main loop
// =====================================================================
let gameTime = 0, lastFrame = performance.now();
function boot() {
  initEngine();
  BotRig.init(112);
  Build.init();
  Trails.init(); ElimFX.init();
  try { Creatures.load(); } catch (e) { console.warn(e); }
  try { CharModel.load(); } catch (e) { console.warn(e); }
  HUD.init();
  Input.init(); Settings.init(); Tutorial.init(); Inv.init();
  Lobby.init(); Track.init(); Players.init(); Victory.init();
  // back from the $1 checkout: ?bp=CODE in the address unlocks the Battle Pass, then the code is removed from the address
  (async () => {
    let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const c = q.get('bp'); if (!c) return;
    q.delete('bp'); try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) { /* sandboxed */ }
    let r; try { r = await redeemCode(c); } catch (e) { r = { err: 'Could not check your Battle Pass code. Enter it in the Pass tab.' }; }
    Lobby.tab = 'pass'; Lobby.refresh();
    $('bpMsg').textContent = r.err ? r.err : r.pass ? (r.had ? 'You already have the Battle Pass this season.' : 'Thanks for your purchase! Battle Pass unlocked. You are now ' + RANKS[Profile.rankIdx()][0] + '. Press Pick your free skin.') : r.it.name + ' is unlocked and equipped.';
    if (r.pass && !r.had) Sfx.chest();
  })();
  $('resumeBtn').addEventListener('click', () => togglePause());
  $('tkBtn').addEventListener('click', () => Ticket.close());
  $('sfEquip').addEventListener('click', () => ChestSkin.close(true)); $('sfBtn').addEventListener('click', () => ChestSkin.close(false));
  $('quitBtn').addEventListener('click', () => { Match.paused = false; $('pause').hidden = true; if (!Match.hasWinner) { Match.recount(); if (player && player.alive && Match.mode !== 'rumble' && !player.placement) player.placement = Math.max(2, Match.teamsAlive); Match.result = { win: false, left: true }; } Match.showResults(); });
  $('specBtn').addEventListener('click', () => { $('death').hidden = true; });
  $('dLobbyBtn').addEventListener('click', () => { Match.showResults(); });
  $('rLobbyBtn').addEventListener('click', () => Match.toLobby());
  $('sensIn').value = Profile.d.sens; $('sensIn').addEventListener('input', e => { Profile.d.sens = +e.target.value; Profile.save(); });
  $('shadowChk').checked = !!Profile.d.shadows; $('shadowChk').addEventListener('change', e => { Profile.d.shadows = e.target.checked; sun.castShadow = GFX.shadows(); Profile.save(); });
  $('perfChk').checked = !!Profile.d.perf; $('perfChk').addEventListener('change', e => { Perf.set(e.target.checked); $('shadowChk').disabled = e.target.checked; $('gfxNote').textContent = e.target.checked ? 'Performance Mode is on. Edge smoothing turns off after you reload the page.' : 'Performance Mode is off. Edge smoothing comes back after you reload the page.'; });
  $('shadowChk').disabled = !!Profile.d.perf;
  $('gfxSel').value = Profile.d.gfx || 'auto'; $('gfxSel').addEventListener('change', e => { Profile.d.gfx = e.target.value; Profile.save(); GFX.apply(); $('gfxNote').textContent = 'Saved. Grass and edge smoothing change after you reload the page.'; });
  $('fdView').addEventListener('click', () => { if (Match.state === 'play' && !Match.paused && !Input.locked) Input.requestLock(); });
  Opening.start();
  requestAnimationFrame(frame);
  checkGL(); setInterval(checkGL, 3000);
}
let frameErrs = 0, firstFrame = false;
// Diagnostics: open the game with ?diag on the end of the address to see what the browser is doing
const Diag = {
  on: /[?&]diag\b/.test(location.search), frames: 0, slowT: 0, ms: 0, fps: 0, n: 0, t0: performance.now(), errs: [], el: null, gpu: '', drops: 0,
  log(m) { this.errs.push(String(m).slice(0, 140)); if (this.errs.length > 4) this.errs.shift(); },
  // who is hiding the 3D view: an attribute, an inline style, a style rule (and where it came from), or nodes the game did not add
  hider() {
    const cv = $('fdView'), out = []; if (!cv) return 'no #fdView element';
    out.push('hidden attr ' + cv.hasAttribute('hidden') + ' · inline style "' + (cv.getAttribute('style') || '').slice(0, 120) + '"');
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { out.push('sheet (unreadable): ' + (sh.href || '?')); continue; }
      const src = sh.href ? sh.href.replace(/^https?:\/\//, '').slice(0, 60) : sh.ownerNode ? sh.ownerNode.tagName.toLowerCase() + (sh.ownerNode.id ? '#' + sh.ownerNode.id : '') + (sh.ownerNode.parentNode === document.head ? ' in head' : sh.ownerNode.parentNode === document.body ? ' in body' : ' elsewhere') : '?';
      const walk = list => { for (const r of list) { if (r.cssRules && !r.selectorText) { try { if (!r.media || matchMedia(r.media.mediaText).matches) walk(r.cssRules); } catch (e) { /* */ } continue; } if (!r.selectorText || !r.style) continue; let m = false; try { m = cv.matches(r.selectorText); } catch (e) { /* */ } if (m && (r.style.display || r.style.visibility || r.style.opacity)) out.push('rule from ' + src + ': ' + r.selectorText.slice(0, 60) + ' {' + (r.style.display ? 'display:' + r.style.display + (r.style.getPropertyPriority('display') ? '!' : '') : '') + (r.style.visibility ? ' visibility:' + r.style.visibility : '') + (r.style.opacity ? ' opacity:' + r.style.opacity : '') + '}'); } };
      walk(rules);
    }
    const ours = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'CANVAS']), extra = [];
    for (const el of [...document.documentElement.children, ...document.head.children, ...document.body.children]) { if (el === document.head || el === document.body || ours.has(el.tagName) || (el.id && document.querySelector('#' + CSS.escape(el.id)) === el && GAME_IDS.has(el.id))) continue; extra.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '')); }
    for (const el of document.querySelectorAll('style, link[rel=stylesheet]')) if (!el.dataset.fd && el.id !== 'fdStyle' && !(el.href && /fonts\.googleapis/.test(el.href)) && el.parentNode !== document.head) extra.push(el.tagName.toLowerCase() + ' in ' + el.parentNode.tagName.toLowerCase());
    if (extra.length) out.push('added by something else: ' + extra.slice(0, 8).join(', '));
    if (Diag.changes.length) out.push('canvas changed at: ' + Diag.changes.slice(0, 4).join(' | '));
    return out.join('\n');
  },
  changes: [],
  // what is actually on screen where the 3D view should be, and what colour the last frame was there
  screen() {
    const cv = $('fdView'), r = cv.getBoundingClientRect(), cs = getComputedStyle(cv), x = Math.round(innerWidth * 0.3), y = Math.round(innerHeight * 0.5), el = document.elementFromPoint(x, y);
    let px = '?'; try { const gl = renderer.getContext(), p = new Uint8Array(4); renderer.render(Match.state === 'lobby' ? Lobby.scene : scene, Match.state === 'lobby' ? Lobby.cam : camera); gl.readPixels(Math.round(gl.drawingBufferWidth * 0.3), gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); px = [...p].join(','); } catch (e) { px = 'err'; }
    const attrs = (() => { try { const a = renderer.getContext().getContextAttributes(); return (a.alpha ? 'alpha ' : '') + (a.antialias ? 'aa ' : '') + (a.desynchronized ? 'desync ' : '') + (a.powerPreference || ''); } catch (e) { return '?'; } })();
    return (cs.display === 'none' || r.width < 2 ? this.hider() + '\n' : '') + 'canvas ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' at ' + Math.round(r.left) + ',' + Math.round(r.top) + ' · ' + cs.display + '/' + cs.visibility + '/op ' + cs.opacity + ' · on top: ' + (el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '') : 'none') + '\nframe pixel ' + px + ' · ' + attrs + ' · ua ' + navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90);
  },
  tick(ms) {
    this.frames++; this.n++; this.ms = this.ms * 0.9 + ms * 0.1;
    const now = performance.now();
    if (now - this.t0 < 500) return;
    this.fps = Math.round(this.n * 1000 / (now - this.t0)); this.n = 0; this.t0 = now;
    if (!this.on) return;
    if (!this.el) { this.el = document.createElement('pre'); this.el.id = 'diagPanel'; this.el.style.cssText = 'position:fixed;left:8px;top:64px;z-index:98;margin:0;max-width:calc(100vw - 16px);background:rgba(0,0,0,.82);color:#9ff0a8;font:12px/1.4 ui-monospace,monospace;padding:10px 12px;border-radius:8px;pointer-events:none;white-space:pre-wrap'; document.body.appendChild(this.el); }
    if (!this.gpu) try { const gl = renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); this.gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) { this.gpu = '?'; }
    let lost = '?', buf = '?'; try { const gl = renderer.getContext(); lost = gl.isContextLost(); buf = gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight; } catch (e) { /* */ }
    let pads = 0; try { pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean).length; } catch (e) { /* */ }
    this.el.textContent = ['FortDay build ' + BUILD_ID, 'state ' + Match.state + (Match.paused ? ' (paused)' : '') + ' · frames ' + this.frames + ' · ' + this.fps + ' fps · ' + this.ms.toFixed(0) + ' ms/frame', 'graphics ' + this.gpu, 'context lost ' + lost + ' · buffer ' + buf + ' · pixel ratio ' + renderer.getPixelRatio().toFixed(2) + ' · graphics ' + (Profile.d.gfx || 'auto') + (GFX.fast ? ' (fast)' : '') + ' · lowered ' + GFX.steps + 'x', 'window ' + innerWidth + 'x' + innerHeight + ' · dpr ' + (devicePixelRatio || 1) + ' · hidden ' + document.hidden + ' · pads ' + pads + (Input.pad.on ? ' (in use)' : ''), this.screen(), 'character ' + (CharModel.ready ? 'ready' : 'not loaded') + ' · online lib ' + (typeof Peer === 'function' ? 'ok' : 'missing') + ' · net ' + Net.state + (Net.p2p ? ' p2p' : ' relay')].concat(this.errs.length ? ['errors:'].concat(this.errs) : []).join('\n');
  },
};
const GAME_IDS = new Set([...document.querySelectorAll('body > [id]')].map(e => e.id).concat(['problemBar', 'stageWait', 'diagPanel']));
{ const cv = document.getElementById('fdView'), t0 = performance.now(); if (cv && window.MutationObserver) new MutationObserver(ms => { for (const m of ms) Diag.changes.push(m.attributeName + '=' + String(cv.getAttribute(m.attributeName)).slice(0, 50) + ' at ' + Math.round(performance.now() - t0) + 'ms'); if (Diag.changes.length > 8) Diag.changes.length = 8; }).observe(cv, { attributes: true, attributeFilter: ['style', 'hidden', 'class'] }); }
setTimeout(() => { const cv = document.getElementById('fdView'); if (cv && getComputedStyle(cv).display === 'none') { Diag.on = true; showProblem('The 3D view is being hidden on this page, so you cannot see the game. The green box above shows what is hiding it: please send a screenshot of this whole page.'); } }, 6000);
addEventListener('error', e => Diag.log(e.message || e)); addEventListener('unhandledrejection', e => Diag.log('promise: ' + (e.reason && e.reason.message || e.reason)));
function frame(now) {
  requestAnimationFrame(frame);
  const t0 = performance.now(); GFX.watch(Math.max(0, (now - lastFrame) / 1000));
  try {
    step(now);
    Diag.tick(performance.now() - t0);
    if (!firstFrame && checkGL()) {
      // make sure the picture really reached the screen: an opaque pixel in the middle of the frame
      let ok = true; try { const gl = renderer.getContext(), px = new Uint8Array(4); gl.readPixels(gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ok = px[3] > 0 || gl.drawingBufferWidth === 0; } catch (e) { /* cannot tell */ }
      if (ok) { firstFrame = true; const el = $('stageWait'); if (el) el.remove(); }
      else if (++frameErrs > 30) { firstFrame = true; showProblem(GL_BLOCKED); }
    }
  } catch (e) {
    console.error(e); lastFrame = performance.now(); Diag.log(e && e.message ? e.message : e);
    if (++frameErrs <= 3 || frameErrs % 300 === 0) showProblem('Something went wrong drawing the game (' + (e && e.message ? e.message : e) + '). Try reloading the page. If it keeps happening, send a screenshot of this message.');
  }
}
// The host's browser runs the shared match, and browsers stop drawing hidden tabs.
// So while the host's tab is in the background, keep the match moving from a timer.
setInterval(() => {
  if (!document.hidden || !Net.hosting || Match.state !== 'play') return;
  let n = Math.min(24, Math.floor((performance.now() - lastFrame) / 50));
  while (n-- > 0) step(lastFrame + 50);
}, 250);
function step(now) {
  let dt = Math.min(0.05, Math.max(0.0005, (now - lastFrame) / 1000)); lastFrame = now;
  Input.pollPad();
  if (Match.state !== 'play' || Match.paused || !$('death').hidden || !$('results').hidden || !$('ticket').hidden || !$('skinFind').hidden || !$('tutEnd').hidden) Input.padMenu(dt);
  if (Match.state === 'lobby' || Match.state === 'loading') { Lobby.render(dt); return; }
  if (Match.paused && !Net.inMatch) { renderer.render(scene, camera); return; }   // a shared match keeps running while you are in the menu
  gameTime += dt;
  if (Match.state === 'play') {
    if (Match.paused) { if (player) { player.input.f = player.input.r = 0; player.input.fire = player.input.jump = false; } Input.pressed.clear(); Input.mdx = Input.mdy = 0; } else updatePlayer(dt);
    for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (a.ai && a.alive && !a.remote) updateBot(a, dt); }
    for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (a.remote) Net.tickRemote(a, dt); else { actorTick(a, dt); physicsActor(a, dt); } }
    Vehicles.update(dt);
    Creatures.update(dt);
    Rockets.update(dt);
    Match.update(dt); Net.update(dt); Tutorial.update(dt); Reboot.update(dt);
    Interact.find();
  }
  Pickups.update(dt); Build.update(dt); FX.update(dt); flushStaticBreaks();
  Cam.update(dt); View.update();
  const v = Cam.view || player;
  if (PlayerRig && player) {
    const show = (player.alive || player._dissolveAt > Match.time) && player.state !== 'bus' && !player.vehicle && !Cam.scoped;
    PlayerRig.root.visible = show;
    if (show) animateRig(PlayerRig, player, dt, gameTime);
  }
  BotRig.update(gameTime);
  CharPool.update(dt);
  ElimFX.update(dt);
  Trails.update();
  Nature.update(dt);
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  if (v) {
    const f = v.state === 'bus' ? Bus.pos : v.pos;
    sun.position.set(f.x + W.sunDir.x * 160, f.y + W.sunDir.y * 160, f.z + W.sunDir.z * 160); sun.target.position.set(f.x, f.y, f.z);
  }
  stormMesh.material.uniforms.uTime.value = gameTime;
  Lightning.update(dt); stormMesh.material.uniforms.uFlash.value = Lightning.flash;
  if (scene.fog && W.theme) {
    const th = W.theme, hk = clamp((camera.position.y - 60) / 90, 0, 1);
    const inStorm = v && v.alive && Storm.state !== 'idle' && Storm.outside(v.pos.x, v.pos.z) && v.state !== 'bus';
    const fs = Perf.on ? 0.5 : 1;   // Performance Mode: closer fog, so far-away things are skipped
    scene.fog.near = lerp(inStorm ? 25 : th.fogNear * fs, 600 * fs, hk); scene.fog.far = lerp(inStorm ? 140 : th.fogFar * fs, Perf.on ? 1000 : 1500, hk);
    scene.fog.color.setHex(inStorm ? 0x1e0a3c : th.fog);
    if (inStorm) { scene.fog.near = Math.min(scene.fog.near, 18); scene.fog.far = Math.min(scene.fog.far, 110); }
    if (hemi) hemi.intensity = th.hemiI * (inStorm ? 0.7 : 1) + Lightning.flash * 0.3 * Lightning.near;
  }
  if (Match.state === 'play' || Match.state === 'results') { HUD.update(dt); Waypoints.update(); }
  if (Inv.on && (Match.state !== 'play' || Match.paused || !player || !player.alive)) Inv.close();
  renderer.render(scene, camera);
}
try { boot(); }
catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;padding:24px;text-align:center;background:#0e0a1f;color:#fff;font:16px/1.5 system-ui"><b style="font-size:20px">FortDay cannot use 3D graphics in this browser right now.</b><span style="max-width:620px">' + esc(GL_BLOCKED) + '</span><small style="opacity:.6">Browser message: ' + esc(e.message) + '</small></div>'); }
