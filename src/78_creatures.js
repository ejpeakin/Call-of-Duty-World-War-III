// =====================================================================
//  Creatures: sharks that hunt swimmers, seagulls circling overhead
// =====================================================================
const Creatures = {
  tpl: {}, list: [], respawnQ: [],
  load() {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils || typeof CREATURE_GLB === 'undefined') return;
    const loader = new THREE.GLTFLoader();
    for (const [k, b64] of Object.entries(CREATURE_GLB)) {
      const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      loader.parse(u.buffer, '', g => {
        g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        this.tpl[k] = g;
        if (Match.state === 'play' && !this.list.some(c => c.kind === k)) this.spawnKind(k);
      }, e => console.warn('Could not load the ' + k + ' model', e));
    }
  },
  clear() { for (const c of this.list) scene.remove(c.obj); this.list = []; this.respawnQ = []; },
  spawn() { this.clear(); for (const k of Object.keys(this.tpl)) this.spawnKind(k); },
  make(kind, scale) {
    const g = this.tpl[kind], obj = THREE.SkeletonUtils.clone(g.scene); obj.scale.setScalar(scale);
    const mixer = new THREE.AnimationMixer(obj), clips = {};
    for (const a of g.animations) clips[a.name] = mixer.clipAction(a);
    scene.add(obj);
    return { kind, obj, mixer, clips, cur: null, curA: null, alive: true };
  },
  play(c, name, speed = 1, once = false) {
    const a = c.clips[name]; if (!a) return;
    a.timeScale = speed;
    if (c.cur === name) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.enabled = true; a.play();
    if (c.curA) c.curA.crossFadeTo(a, 0.25, false);
    c.curA = a; c.cur = name;
  },
  deepSpot(nearX, nearZ, rad) {
    for (let i = 0; i < 300; i++) {
      let x, z;
      if (nearX === undefined) { const a = Math.random() * TAU, d = W.R * (0.55 + Math.random() * 0.6); x = Math.cos(a) * d; z = Math.sin(a) * d; }
      else { const a = Math.random() * TAU, d = Math.random() * rad; x = nearX + Math.cos(a) * d; z = nearZ + Math.sin(a) * d; }
      if (Math.abs(x) > W.half - 20 || Math.abs(z) > W.half - 20) continue;
      if (groundH(x, z) < W.waterY - 3) return { x, z };
    }
    return null;
  },
  spawnShark() {
    const p = this.deepSpot(); if (!p) return;
    const c = this.make('shark', 0.8);
    Object.assign(c, { x: p.x, z: p.z, hx: p.x, hz: p.z, yaw: Math.random() * TAU, hp: 250, biteCD: 0, hitT: 0, wp: null, deadT: 0, target: null });
    this.play(c, 'Swim_Horizontal'); this.list.push(c);
  },
  spawnKind(k) {
    if (k === 'shark') { for (let i = 0; i < 10; i++) this.spawnShark(); return; }
    // seagull flocks circling over the island
    for (let f = 0; f < 4; f++) {
      const a = Math.random() * TAU, d = Math.random() * W.R * 0.7, cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      const alt = Math.max(W.waterY, 0) + 55 + Math.random() * 70, rad = 35 + Math.random() * 50, spd = (0.18 + Math.random() * 0.1) * (Math.random() < 0.5 ? -1 : 1);
      for (let i = 0; i < 4; i++) {
        const c = this.make('gull', 0.85);
        Object.assign(c, { cx, cz, alt: alt + (Math.random() - 0.5) * 8, rad: rad + (Math.random() - 0.5) * 12, ang: Math.random() * TAU, spd: spd * (0.9 + Math.random() * 0.2), flapT: Math.random() * 4 });
        this.play(c, 'Glide'); this.list.push(c);
      }
    }
  },
  damage(c, dmg, src, h) {
    if (!c.alive || c.kind !== 'shark') return;
    c.hp -= dmg; c.hitT = 0.4; this.play(c, 'Hit', 1.4, true);
    if (src === player) { HUD.hitmark(false); Sfx.hit(false); if (h) HUD.dmgNum(h.x, h.y + 0.4, h.z, Math.round(dmg), 'hp'); }
    if (src && src.alive) c.target = src;
    if (c.hp <= 0) {
      c.alive = false; c.deadT = 8; this.play(c, 'Dead_Floating', 1);
      if (src === player) { Match.sharkKills = (Match.sharkKills || 0) + 1; HUD.toast('Shark defeated · +2,000 XP', true); }
      this.respawnQ.push(30);
    }
  },
  blast(x, y, z, r, dmg) { for (const c of this.list) if (c.kind === 'shark' && c.alive) { const d = Math.hypot(c.x - x, W.waterY - 0.6 - y, c.z - z); if (d < r + 1.5) this.damage(c, dmg * (1 - d / (r + 1.5) * 0.5), null); } },
  // ray test used by the weapon raycast: sharks are a sphere around their body
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    for (const c of this.list) {
      if (c.kind !== 'shark' || !c.alive) continue;
      const t = raySphere(c.x + Math.sin(c.yaw) * 0.6, W.waterY - 0.55, c.z + Math.cos(c.yaw) * 0.6, 1.3, ox, oy, oz, dx, dy, dz);
      if (t >= 0 && t < bt) { bt = t; best = c; }
    }
    return best ? { c: best, t: bt } : null;
  },
  update(dt) {
    const cam = camera.position;
    for (let i = this.respawnQ.length - 1; i >= 0; i--) { this.respawnQ[i] -= dt; if (this.respawnQ[i] <= 0) { this.respawnQ.splice(i, 1); this.spawnShark(); } }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (c.kind === 'gull') {
        c.ang += c.spd * dt; c.flapT -= dt;
        if (c.flapT <= 0) { if (c.cur === 'Glide') { this.play(c, 'Flap', 1); c.flapT = 1.2 + Math.random() * 1.5; } else { this.play(c, 'Glide', 1); c.flapT = 2.5 + Math.random() * 4; } }
        const x = c.cx + Math.cos(c.ang) * c.rad, z = c.cz + Math.sin(c.ang) * c.rad, y = c.alt + Math.sin(c.ang * 3) * 2;
        const vx = -Math.sin(c.ang) * c.spd, vz = Math.cos(c.ang) * c.spd;
        c.obj.position.set(x, y, z); c.obj.rotation.set(0, Math.atan2(vx, vz), -Math.sign(c.spd) * 0.25, 'YXZ');
      } else {
        if (!c.alive) {
          c.deadT -= dt; c.obj.position.y = W.waterY - 0.3; c.obj.rotation.z = Math.min(Math.PI, c.obj.rotation.z + dt * 2);
          if (c.deadT <= 0) { scene.remove(c.obj); this.list.splice(i, 1); }
          c.mixer.update(dt); continue;
        }
        c.biteCD -= dt; c.hitT -= dt;
        // pick the nearest swimmer near this shark's patch of water
        let tgt = c.target && c.target.alive && c.target.inWater ? c.target : null, bd = 32 * 32;
        if (!tgt) for (const a of actors) {
          if (!a.alive || !a.inWater) continue;
          const d2 = (a.pos.x - c.x) ** 2 + (a.pos.z - c.z) ** 2;
          if (d2 < bd && (a.pos.x - c.hx) ** 2 + (a.pos.z - c.hz) ** 2 < 70 * 70) { bd = d2; tgt = a; }
        }
        c.target = tgt;
        let gx, gz, speed;
        if (tgt) { gx = tgt.pos.x; gz = tgt.pos.z; speed = 7.5; }
        else {
          if (!c.wp || (c.wp.x - c.x) ** 2 + (c.wp.z - c.z) ** 2 < 9) c.wp = this.deepSpot(c.hx, c.hz, 28) || { x: c.hx, z: c.hz };
          gx = c.wp.x; gz = c.wp.z; speed = 3.2;
        }
        const want = Math.atan2(gx - c.x, gz - c.z), turn = (tgt ? 2.6 : 1.2) * dt;
        c.yaw += clamp(angDiff(c.yaw, want), -turn, turn);
        const dist = Math.hypot(gx - c.x, gz - c.z);
        if (!(tgt && dist < 2.2) && c.hitT <= 0) {
          const nx = c.x + Math.sin(c.yaw) * speed * dt, nz = c.z + Math.cos(c.yaw) * speed * dt;
          if (groundH(nx, nz) < W.waterY - 1.6) { c.x = nx; c.z = nz; } else { c.yaw += Math.PI * 0.6 * dt * 4; c.wp = null; }
        }
        if (tgt && dist < 2.9 && c.biteCD <= 0) {
          this.play(c, 'Bite', 2.4, true); c.biteCD = 1.6;
          damageActor(tgt, 22, null, { shark: true, x: tgt.pos.x, y: tgt.pos.y + 1.6, z: tgt.pos.z });
          FX.burst(tgt.pos.x, W.waterY, tgt.pos.z, 0xd0f0ff, 12, 4, 0.6, 0.12);
          if (tgt === player) { Cam.shake = Math.max(Cam.shake, 0.3); Sfx.noise(0.3, 400, 0.6, 0.5, 'lowpass'); }
        } else if (c.biteCD < 1.0 && c.hitT <= 0) this.play(c, 'Swim_Horizontal', tgt ? 1.7 : 1);
        c.obj.position.set(c.x, W.waterY - 0.75 + Math.sin(gameTime * 1.3 + i) * 0.05, c.z); c.obj.rotation.set(0, c.yaw, 0);
      }
      if ((c.obj.position.x - cam.x) ** 2 + (c.obj.position.z - cam.z) ** 2 < 280 * 280) { c.obj.visible = true; c.mixer.update(dt); } else c.obj.visible = false;
    }
  },
};
