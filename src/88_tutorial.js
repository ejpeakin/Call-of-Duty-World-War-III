// =====================================================================
//  Opening title screen, and the guided tutorial match
// =====================================================================
const Opening = {
  on: false, t: 0, out: 0,
  // automated test browsers skip it so they can press buttons straight away
  start() {
    if (navigator.webdriver && !window.__wantIntro) { this.afterwards(); return; }
    this.on = true; this.t = 0; $('opening').hidden = false; $('lobby').classList.add('intro');
    const go = e => { if (!this.on || this.out) return; if (e && e.type === 'keydown' && (e.ctrlKey || e.metaKey || e.altKey)) return; this.close(); };
    $('opening').addEventListener('click', go); addEventListener('keydown', go); addEventListener('touchstart', go, { passive: true });
  },
  close() {
    if (!this.on || this.out) return; this.out = 0.001; Sfx.init();
    // a little fanfare: rising arpeggio over a warm chord
    [392, 523, 659, 784, 1046].forEach((f, i) => Sfx.tone(f, i === 4 ? 0.9 : 0.18, 'triangle', 0.13, 0, 0.05 + i * 0.09));
    [196, 262, 330].forEach(f => Sfx.tone(f, 1.3, 'sine', 0.07, 0, 0.45));
    $('opening').classList.add('leaving'); $('lobby').classList.remove('intro');
    setTimeout(() => { $('opening').hidden = true; this.on = false; this.afterwards(); }, 650);
  },
  // brand-new players are offered the tutorial once
  afterwards() { if (!Profile.d.tutDone && !Profile.d.matches && !Profile.d.tutAsked && !(navigator.webdriver && !window.__wantIntro)) { Profile.d.tutAsked = true; Profile.save(); $('tutAsk').hidden = false; } },
  // the camera swoops in from high above the stage while the title shows, then eases into the lobby view
  cam(cam, dt) {
    if (this.on && !this.out) {
      this.t += dt; if (Input.pad.hit.length) this.close();
      const k = Math.min(1, this.t / 4), e = 1 - Math.pow(1 - k, 3), a = 2.6 - e * 2.1 + Math.sin(this.t * 0.3) * 0.08 * k, r = lerp(16, 7.4, e), y = lerp(9, 2.2, e);
      cam.position.set(Math.sin(a) * r + 1.3, y, Math.cos(a) * r); cam.lookAt(1.3, lerp(1.6, 1.2, e), 0);
      return true;
    }
    if (this.out) {
      if (!this.fromP) { this.fromP = cam.position.clone(); this.fromQ = cam.quaternion.clone(); this.bt = 0; }
      this.bt = Math.min(1, this.bt + dt / 0.9); const e = this.bt * this.bt * (3 - 2 * this.bt);
      Lobby.place(); const tp = cam.position.clone(), tq = cam.quaternion.clone();
      cam.position.lerpVectors(this.fromP, tp, e); cam.quaternion.copy(this.fromQ).slerp(tq, e);
      if (this.bt >= 1) { this.out = 0; this.fromP = null; Lobby.place(); }
      return true;
    }
    return false;
  },
};

const Tutorial = {
  on: false, i: 0, t: 0, done: 0, data: {}, home: null, deadT: 0,
  start() {
    $('tutAsk').hidden = true; Sfx.init(); Net.inMatch = false;
    Match.start({ mode: 'tutorial', build: true, ranked: false, theme: 'greenvale' });
  },
  // called from Match.setup instead of the bus: put the player on the ground beside a tree near a town
  setup() {
    const p = W.pois[0]; let best = null, bd = 1e9;
    for (const hv of W.harv) { if (hv.kind !== 'tree' || hv.dead) continue; const d = Math.hypot(hv.x - p.x, hv.z - p.z); if (d < p.r + 12 || d > p.r + 90) continue; if (d < bd) { bd = d; best = hv; } }
    const tx = best ? best.x : p.x + p.r + 20, tz = best ? best.z : p.z, ang = Math.atan2(p.z - tz, p.x - tx), sx = tx + Math.cos(ang) * 5, sz = tz + Math.sin(ang) * 5;
    player.state = 'ground'; player.pos.set(sx, groundH(sx, sz) + 0.2, sz); player.vel.set(0, 0, 0); player.yaw = Math.atan2(tx - sx, tz - sz); player.pitch = -0.1; player.shield = 0;
    this.home = player.pos.clone(); this.on = true; this.i = -1; this.t = 0; this.deadT = 0; this.next();
    Bus.active = false; if (Bus.mesh) Bus.mesh.visible = false; $('tutBox').hidden = false; $('tutEnd').hidden = true;
  },
  stop() { this.on = false; $('tutBox').hidden = true; $('tutEnd').hidden = true; },
  ahead(d, side = 0, yaw = player.yaw) { const a = player, fx = Math.sin(yaw), fz = Math.cos(yaw), x = a.pos.x + fx * d + fz * side, z = a.pos.z + fz * d - fx * side; return { x, z, y: groundH(x, z) }; },
  // the direction closest to where the player looks with a clear view, dry flat ground and room for everything placed there
  clearYaw(dists, sides = [0]) {
    const a = player, ey = a.pos.y + 1.6;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2, Math.PI]) {
      const yaw = a.yaw + off; let ok = true;
      for (const d of dists) for (const s of sides) { const p = this.ahead(d, s, yaw); if (p.y < W.waterY + 0.4 || Math.abs(groundH(p.x + 1, p.z) - p.y) > 1.2 || !losClear(a.pos.x, ey, a.pos.z, p.x, p.y + 1.2, p.z) || nearSite(p.x, p.z, -6)) { ok = false; break; } }
      if (ok) return yaw;
    }
    return a.yaw;
  },
  pad() { return Input.pad.on; },
  k(act) { return '<kbd>' + esc(Keys.of(act)) + '</kbd>'; },
  steps: [
    { title: 'Look around', text: T => T.pad() ? 'Move the <kbd>right stick</kbd> to look around.' : 'Move the mouse to look around. Click the game first if it does not respond.',
      begin(T) { T.data.yaw = player.yaw; T.data.turn = 0; },
      track(T) { T.data.turn += Math.abs(angDiff(T.data.yaw, player.yaw)); T.data.yaw = player.yaw; },
      check(T) { return T.data.turn > 3; }, bar: T => Math.min(1, T.data.turn / 3) },
    { title: 'Walk', text: T => T.pad() ? 'Push the <kbd>left stick</kbd> to walk around.' : 'Walk with ' + T.k('forward') + T.k('left') + T.k('back') + T.k('right') + '.',
      begin(T) { T.data.walk = 0; T.data.last = player.pos.clone(); },
      track(T) { T.data.walk += Math.min(5, Math.hypot(player.pos.x - T.data.last.x, player.pos.z - T.data.last.z)); T.data.last.copy(player.pos); },
      check(T) { return T.data.walk > 14; }, bar: T => Math.min(1, T.data.walk / 14) },
    { title: 'Sprint and jump', text: T => T.pad() ? 'Click the <kbd>left stick</kbd> to sprint, and press <kbd>A</kbd> to jump. Jump twice.' : 'Hold ' + T.k('sprint') + ' while walking to sprint, and press ' + T.k('jump') + ' to jump. Jump twice. Watch the yellow stamina bar.',
      begin(T) { T.data.jumps = 0; T.data.ground = player.onGround; },
      track(T) { if (T.data.ground && !player.onGround && player.vel.y > 0) T.data.jumps++; T.data.ground = player.onGround; },   // any take-off from the ground
      check(T) { return T.data.jumps >= 2; }, bar: T => Math.min(1, T.data.jumps / 2) },
    { title: 'Harvest materials', text: T => 'Walk up to a tree and hit it with your harvesting tool (' + (T.pad() ? '<kbd>RT</kbd>' : T.k('fire')) + '). Collect 30 wood.',
      begin(T) { switchSlot(player, 0); T.data.w0 = player.mats.wood; },
      check(T) { return player.mats.wood - T.data.w0 >= 30; }, bar: T => Math.min(1, (player.mats.wood - T.data.w0) / 30) },
    { title: 'Build a wall', text: T => T.pad() ? 'Press <kbd>B</kbd> for build mode, then <kbd>RT</kbd> to place a wall.' : 'Press ' + T.k('wall') + ' to pick a wall, then ' + T.k('fire') + ' to place it.',
      begin(T) { T.data.b0 = Build.pieces.filter(p => p.owner === player && p.type === 'wall').length; if (player.mats.wood < 40) player.mats.wood = 40; },
      check(T) { return Build.pieces.filter(p => p.owner === player && p.type === 'wall').length > T.data.b0; } },
    { title: 'Build a ramp and climb it', text: T => (T.pad() ? 'Press <kbd>RB</kbd> to switch to a ramp and place it with <kbd>RT</kbd>' : 'Press ' + T.k('ramp') + ' for a ramp and place it with ' + T.k('fire')) + ', then walk up it.',
      begin(T) { T.data.r0 = Build.pieces.filter(p => p.owner === player && p.type === 'ramp').length; if (player.mats.wood < 40) player.mats.wood = 40; T.data.y0 = groundH(player.pos.x, player.pos.z); },
      check(T) { const n = Build.pieces.filter(p => p.owner === player && p.type === 'ramp').length > T.data.r0; if (n && !T.data.placed) T.data.placed = true; return T.data.placed && player.pos.y - groundH(player.pos.x, player.pos.z) > 1.2 && player.onGround; } },
    { title: 'Put the build tools away', text: T => T.pad() ? 'Press <kbd>B</kbd> again to leave build mode.' : 'Press ' + T.k('build') + ' or ' + T.k('slot1') + ' to leave build mode.',
      check() { return !Build.active; } },
    { title: 'Open the chest', text: T => 'A chest just appeared in front of you. Walk up to it and press ' + (T.pad() ? '<kbd>X</kbd>' : T.k('use')) + ' to open it.',
      begin(T) { const c = T.ahead(9, 0, T.clearYaw([9])); T.data.chest = addChest('chest', c.x, c.y, c.z, player.yaw + Math.PI, null, true); FX.burst(c.x, c.y + 1, c.z, 0xffd84a, 20, 4, 0.8, 0.12, -1); },
      check(T) { return T.data.chest.opened; } },
    { title: 'Pick up a weapon', text: T => 'Loot spilled out of the chest. Walk over the ammo to grab it, and press ' + (T.pad() ? '<kbd>X</kbd>' : T.k('use')) + ' on the weapon to pick it up.',
      check() { return player.inv.some(it => it && it.kind === 'weapon'); } },
    { title: 'Hit the targets', text: T => 'Three targets popped up. Aim with ' + (T.pad() ? '<kbd>LT</kbd>' : T.k('ads')) + ' and fire with ' + (T.pad() ? '<kbd>RT</kbd>' : T.k('fire')) + '. Knock all three down.',
      begin(T) {
        const s = player.inv.findIndex((it, i) => i > 0 && it && it.kind === 'weapon'); if (s > 0) switchSlot(player, s);
        const w = player.inv[player.slot]; if (w && w.kind === 'weapon') player.ammo[wstat(w).ammo] = Math.max(player.ammo[wstat(w).ammo], 90);
        const ty = T.clearYaw([17, 19, 21], [-5, 0, 5]);
        T.data.targets = [-5, 0, 5].map((side, i) => {
          const c = T.ahead(17 + i * 2, side, ty), d = newActor({ name: 'Target', team: -1, npc: true, hp: 100, maxHp: 100, state: 'ground', onGround: true, ri: i, look: { outfit: 'ranger', body: 'man', shirt: 0xd8202e, pants: 0xf2f2f2, skin: 0xc49a74, sleeve: 0xf2f2f2, hat: 0xd8202e, pack: 0xf2f2f2, glider: 0, gun: 0 } });
          d.pos.set(c.x, c.y + 0.2, c.z); d.yaw = player.yaw + Math.PI; BotRig.setLook(d.ri, d.look); actors.push(d); FX.burst(c.x, c.y + 1, c.z, 0xff4050, 16, 4, 0.8, 0.12, -1); return d;
        });
      },
      check(T) { return T.data.targets.every(d => !d.alive); }, bar: T => T.data.targets.filter(d => !d.alive).length / 3 },
    { title: 'Reload', text: T => 'Press ' + (T.pad() ? '<kbd>X</kbd>' : T.k('reload')) + ' to reload your weapon.',
      begin(T) { const w = player.inv[player.slot]; if (w && w.kind === 'weapon') { const st = wstat(w); if (w.mag >= st.mag) w.mag = Math.floor(st.mag / 2); player.ammo[st.ammo] = Math.max(player.ammo[st.ammo], 60); } HUD.dirty = true; },
      check() { return player.reloadT > 0; } },
    { title: 'Drink a shield', text: T => { const s = player.inv.findIndex(it => it && it.kind === 'heal'); return 'You got two Shield Vials. Switch to them (' + (T.pad() ? '<kbd>LB</kbd> / <kbd>RB</kbd>' : T.k('slot' + (s > 0 ? s + 1 : 3))) + ') and hold ' + (T.pad() ? '<kbd>RT</kbd>' : T.k('fire')) + ' to drink one.'; },
      begin() { player.shield = 0; giveItem(player, { kind: 'heal', hid: 'mini', count: 2 }); HUD.dirty = true; },
      check() { return player.shield >= 20; } },
    { title: 'Check the map', text: T => 'Press ' + (T.pad() ? '<kbd>D-pad up</kbd>' : T.k('map')) + ' to open the full map, then close it again. In a real match the purple storm shrinks toward a safe circle on the map, so stay inside it.',
      begin(T) { T.data.seen = false; },
      track(T) { if (!$('bigmap').hidden) T.data.seen = true; },
      check(T) { return T.data.seen && $('bigmap').hidden; } },
    { title: 'Skydive', text: T => 'Real matches start on the Battle Bus. You are falling now: look down and push ' + (T.pad() ? 'the <kbd>left stick</kbd>' : T.k('forward')) + ' to dive faster. Your glider opens by itself near the ground.',
      begin(T) { Build.active = false; player.state = 'sky'; player.pos.y = groundH(player.pos.x, player.pos.z) + 170; player.vel.set(0, -8, 0); player.pitch = -0.9; },
      check() { return player.state === 'ground' && player.onGround; } },
  ],
  next() {
    this.i++; this.t = 0; this.data = {}; this.passT = 0;
    if (this.i >= this.steps.length) { this.finish(); return; }
    const S = this.steps[this.i]; if (S.begin) S.begin(this);
    this.show(); if (this.i > 0) Sfx.tone(880, 0.12, 'triangle', 0.12, 0, 0);
  },
  show() {
    const S = this.steps[this.i];
    $('tutStep').textContent = 'Step ' + (this.i + 1) + ' of ' + this.steps.length;
    $('tutTitle').textContent = S.title; $('tutText').innerHTML = S.text(this); $('tutBox').classList.remove('passed');
    $('tutFill').style.width = '0%'; $('tutBar').style.display = S.bar ? '' : 'none';
  },
  update(dt) {
    if (!this.on || Match.state !== 'play' || !player) return;
    if (!player.alive) {   // nothing is meant to hurt you here, but if it happens: back on your feet at the start
      this.deadT += dt; if (this.deadT > 2) { this.deadT = 0; player.alive = true; player.hp = 100; player._dissolveAt = 0; player.state = 'ground'; player.pos.copy(this.home); player.vel.set(0, 0, 0); Match.recount(); HUD.dirty = true; }
      return;
    }
    if (this.i < 0 || this.i >= this.steps.length) return;
    const S = this.steps[this.i]; this.t += dt; if (S.track) S.track(this);
    if (this.passT > 0) { this.passT -= dt; if (this.passT <= 0) this.next(); return; }
    if (this.t > 0.6 && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) $('tutText').innerHTML = S.text(this);   // keep key names current
    if (S.bar) $('tutFill').style.width = Math.round(S.bar(this) * 100) + '%';
    if (this.t > 0.4 && S.check(this)) { this.passT = 0.9; $('tutBox').classList.add('passed'); $('tutFill').style.width = '100%'; Sfx.tone(660, 0.1, 'triangle', 0.14, 0, 0); Sfx.tone(990, 0.22, 'triangle', 0.14, 0, 0.1); }
  },
  finish() {
    Profile.d.tutDone = true; Profile.save();
    $('tutBox').hidden = true; $('tutEnd').hidden = false; $('clickHint').hidden = true; Match.paused = false;
    if (document.pointerLockElement) document.exitPointerLock();
    [523, 659, 784, 1046].forEach((f, i) => Sfx.tone(f, i === 3 ? 0.8 : 0.16, 'triangle', 0.14, 0, i * 0.11));
    if (player && player.state === 'ground') { player.emote = Profile.d.eq.emote; player.emoteT = 0; }
  },
  init() {
    $('tutBtn').addEventListener('click', () => this.start());
    $('tutAskGo').addEventListener('click', () => this.start());
    $('tutAskNo').addEventListener('click', () => { $('tutAsk').hidden = true; });
    $('tutSkip').addEventListener('click', () => { Profile.d.tutDone = true; Profile.save(); this.stop(); Match.toLobby(); });
    $('tutDone').addEventListener('click', () => { this.stop(); Match.toLobby(); });
  },
};
