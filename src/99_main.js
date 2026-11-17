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
  Input.init();
  Lobby.init();
  $('resumeBtn').addEventListener('click', () => togglePause());
  $('tkBtn').addEventListener('click', () => Ticket.close());
  $('quitBtn').addEventListener('click', () => { Match.paused = false; $('pause').hidden = true; Match.showResults(); });
  $('specBtn').addEventListener('click', () => { $('death').hidden = true; });
  $('dLobbyBtn').addEventListener('click', () => { Match.showResults(); });
  $('rLobbyBtn').addEventListener('click', () => Match.toLobby());
  $('sensIn').value = Profile.d.sens; $('sensIn').addEventListener('input', e => { Profile.d.sens = +e.target.value; Profile.save(); });
  $('shadowChk').checked = !!Profile.d.shadows; $('shadowChk').addEventListener('change', e => { Profile.d.shadows = e.target.checked; sun.castShadow = e.target.checked; Profile.save(); });
  $('game').addEventListener('click', () => { if (Match.state === 'play' && !Match.paused && !Input.locked) Input.requestLock(); });
  requestAnimationFrame(frame);
}
function frame(now) { requestAnimationFrame(frame); step(now); }
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
  if (Match.state !== 'play' || Match.paused || !$('death').hidden || !$('results').hidden || !$('ticket').hidden) Input.padMenu(dt);
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
    Match.update(dt); Net.update(dt);
    Interact.find();
  }
  Pickups.update(dt); Build.update(dt); FX.update(dt);
  Cam.update(dt);
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
    scene.fog.near = lerp(inStorm ? 25 : th.fogNear, 600, hk); scene.fog.far = lerp(inStorm ? 140 : th.fogFar, 1500, hk);
    scene.fog.color.setHex(inStorm ? 0x1e0a3c : th.fog);
    if (inStorm) { scene.fog.near = Math.min(scene.fog.near, 18); scene.fog.far = Math.min(scene.fog.far, 110); }
    if (hemi) hemi.intensity = th.hemiI * (inStorm ? 0.7 : 1) + Lightning.flash * 0.3 * Lightning.near;
  }
  if (Match.state === 'play' || Match.state === 'results') HUD.update(dt);
  renderer.render(scene, camera);
}
try { boot(); }
catch (e) { console.error(e); document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:#0e0a1f;color:#fff;font:16px system-ui">FortDay needs WebGL to run. Your browser reported: ' + esc(e.message) + '</div>'); }
