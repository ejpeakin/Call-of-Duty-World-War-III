// =====================================================================
//  Combat: raycasts, firing, damage, eliminations, rockets, harvest, heals
// =====================================================================
const HIT = { t: 0, type: null, obj: null, head: false, x: 0, y: 0, z: 0 };
function rayAABB(c, ox, oy, oz, ix, iy, iz) {
  let t1 = (c.minX - ox) * ix, t2 = (c.maxX - ox) * ix; let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (c.minY - oy) * iy; t2 = (c.maxY - oy) * iy; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (c.minZ - oz) * iz; t2 = (c.maxZ - oz) * iz; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < 0 || tmin > tmax || tmin < 0) return -1;
  return tmin;
}
function rayRamp(c, ox, oy, oz, dx, dy, dz) {
  if (c.cone) {   // pyramid: step through its box until the ray dips below the surface, then narrow it down
    let t0 = 0, t1 = 1e9;
    for (const [o, d, lo, hi] of [[ox, dx, c.minX, c.maxX], [oy, dy, c.minY, c.maxY], [oz, dz, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
      let a = (lo - o) / d, b = (hi - o) / d; if (a > b) { const q = a; a = b; b = q; } t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 > t1) return -1;
    const under = t => { const y = oy + dy * t; return y <= rampY(c, ox + dx * t, oz + dz * t); };
    let prev = t0; if (under(t0)) return t0;
    for (let i = 1; i <= 16; i++) { const t = t0 + (t1 - t0) * i / 16; if (under(t)) { let a = prev, b = t; for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (under(m)) b = m; else a = m; } return b; } prev = t; }
    return -1;
  }
  const k = c.rise / (c.dir < 2 ? (c.maxX - c.minX) : (c.maxZ - c.minZ));
  let u0, ux = 0, uz = 0;
  if (c.dir === 0) { u0 = -c.minX; ux = 1; } else if (c.dir === 1) { u0 = c.maxX; ux = -1; } else if (c.dir === 2) { u0 = -c.minZ; uz = 1; } else { u0 = c.maxZ; uz = -1; }
  const den = dy - k * (ux * dx + uz * dz); if (Math.abs(den) < 1e-6) return -1;
  const t = (c.y0 + k * (u0 + ux * ox + uz * oz) - oy) / den;
  if (t < 0) return -1;
  const x = ox + dx * t, z = oz + dz * t;
  if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) return -1;
  return t;
}
function rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
  if (!(maxT > 0) || !(oy === oy) || oy < groundH(ox, oz) - 0.5) return -1;
  const step = 1.5; let tp = 0;
  for (let t = step, guard = 0; guard < 2000; t += step, guard++) {
    const tt = Math.min(t, maxT); const y = oy + dy * tt;
    if (y > W.maxH + 2 && dy >= 0) return -1;
    if (y < groundH(ox + dx * tt, oz + dz * tt)) {
      let a = tp, b = tt;
      for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (oy + dy * m < groundH(ox + dx * m, oz + dz * m)) b = m; else a = m; }
      return b;
    }
    tp = tt; if (tt >= maxT) return -1;
  }
  return -1;
}
function raySphere(cx, cy, cz, r, ox, oy, oz, dx, dy, dz) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz; const tca = lx * dx + ly * dy + lz * dz; const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1; const thc = Math.sqrt(r * r - d2); const t = tca - thc; return t >= 0 ? t : (tca + thc >= 0 ? 0 : -1);
}
const _ra = { t: 0, head: false };
function rayActor(a, ox, oy, oz, dx, dy, dz, maxT) {
  const s = a.scale * BODY_SCALE, cx = a.pos.x, cy = a.pos.y + 1.1 * s, cz = a.pos.z;
  const wx = cx - ox, wy = cy - oy, wz = cz - oz, pr = wx * dx + wy * dy + wz * dz;
  if (pr < -2 || pr > maxT + 2) return null;
  const px = wx - dx * pr, py = wy - dy * pr, pz = wz - dz * pr; if (px * px + py * py + pz * pz > 2.6 * s * s) return null;
  let bt = maxT, head = false, hit = false, t;
  if (a.state === 'sky') { t = raySphere(cx, a.pos.y + 1.0, cz, 1.0, ox, oy, oz, dx, dy, dz); if (t >= 0 && t < bt) { _ra.t = t; _ra.head = false; return _ra; } return null; }
  t = raySphere(cx, a.pos.y + 0.5 * s, cz, 0.42 * s, ox, oy, oz, dx, dy, dz); if (t >= 0 && t < bt) { bt = t; hit = true; }
  t = raySphere(cx, a.pos.y + 1.25 * s, cz, 0.5 * s, ox, oy, oz, dx, dy, dz); if (t >= 0 && t < bt) { bt = t; hit = true; }
  t = raySphere(cx, a.pos.y + 1.8 * s, cz, 0.21 * s, ox, oy, oz, dx, dy, dz); if (t >= 0 && t < bt) { bt = t; hit = true; head = true; }
  if (!hit) return null; _ra.t = bt; _ra.head = head; return _ra;
}
function raycast(ox, oy, oz, dx, dy, dz, maxT, shooter, withActors) {
  let best = maxT, type = null, obj = null, head = false;
  const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
  const s = ++Grid.stamp;
  let cx = Math.floor(ox / CS), cz = Math.floor(oz / CS);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1, adx = Math.abs(dx), adz = Math.abs(dz);
  const tdx = adx > 1e-9 ? CS / adx : 1e9, tdz = adz > 1e-9 ? CS / adz : 1e9;
  let tmx = adx > 1e-9 ? (dx > 0 ? (cx + 1) * CS - ox : ox - cx * CS) / adx : 1e9;
  let tmz = adz > 1e-9 ? (dz > 0 ? (cz + 1) * CS - oz : oz - cz * CS) / adz : 1e9;
  for (let guard = 0; guard < 400; guard++) {
    const arr = Grid.map.get(Grid.key(cx, cz));
    if (arr) for (const c of arr) {
      if (c._s === s) continue; c._s = s; if (c.dead) continue;
      const t = c.kind === 'ramp' ? rayRamp(c, ox, oy, oz, dx, dy, dz) : rayAABB(c, ox, oy, oz, ix, iy, iz);
      if (t >= 0 && t < best) { best = t; type = 'col'; obj = c; }
    }
    const tExit = Math.min(tmx, tmz);
    if (best <= tExit || tExit > maxT) break;
    if (tmx < tmz) { cx += sx; tmx += tdx; } else { cz += sz; tmz += tdz; }
  }
  const tt = rayTerrain(ox, oy, oz, dx, dy, dz, best); if (tt >= 0 && tt < best) { best = tt; type = 'terrain'; obj = null; }
  if (withActors) for (const a of actors) {
    if (!a.alive || a === shooter || a.state === 'bus' || a.vehicle) continue;
    if (shooter && a.team === shooter.team) continue;
    const r = rayActor(a, ox, oy, oz, dx, dy, dz, best); if (r) { best = r.t; type = 'actor'; obj = a; head = r.head; }
  }
  if (withActors) { const cr = Creatures.ray(ox, oy, oz, dx, dy, dz, best); if (cr) { best = cr.t; type = 'creature'; obj = cr.c; head = false; } }
  HIT.t = best; HIT.type = type; HIT.obj = obj; HIT.head = head; HIT.x = ox + dx * best; HIT.y = oy + dy * best; HIT.z = oz + dz * best;
  return HIT;
}
function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz); if (d < 0.01) return true;
  const h = raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.4, null, false); return !h.type;
}

// ---------------------------------------------------------------- aiming + firing
const AIM = { o: new THREE.Vector3(), d: new THREE.Vector3(), t0: 0 };
function aimRay(a, out) {
  if (a === player && Cam.ready) { out.o.copy(camera.position); out.d.copy(Cam.fwd); out.t0 = Cam.t0; }
  else {
    out.o.set(a.pos.x, a.pos.y + 1.62 * a.scale, a.pos.z); const cp = Math.cos(a.pitch);
    out.d.set(Math.sin(a.yaw) * cp, Math.sin(a.pitch), Math.cos(a.yaw) * cp); out.t0 = 0;
  }
}
function muzzlePos(a, out) {
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw), sp = Math.sin(a.pitch), cp = Math.cos(a.pitch), s = a.scale * BODY_SCALE;
  const fw = 0.5 * cp + 0.75;
  return out.set(a.pos.x + (sy * fw - 0.19 * cy) * s, a.pos.y + (1.5 + 0.52 * sp + 0.75 * sp) * s, a.pos.z + (cy * fw + 0.19 * sy) * s);
}
const _up = new THREE.Vector3(0, 1, 0), _su = new THREE.Vector3(), _sv = new THREE.Vector3();
function coneDir(d, spread, out) {
  out.copy(d); if (spread <= 0) return out;
  _su.crossVectors(d, _up); if (_su.lengthSq() < 1e-6) _su.set(1, 0, 0); _su.normalize(); _sv.crossVectors(_su, d);
  const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * spread;
  return out.addScaledVector(_su, Math.cos(a) * r).addScaledVector(_sv, Math.sin(a) * r).normalize();
}
function fireWeapon(a) {
  const it = a.inv[a.slot]; const st = wstat(it);
  if (st.melee) { slash(a, it, st); return; }
  if (it.mag <= 0) { startReload(a); return; }
  it.mag--; a.fireCD = 1 / st.rate; a.emote = null; a.lastShotT = Match.time;
  aimRay(a, AIM);
  const moving = Math.hypot(a.vel.x, a.vel.z) > 1.5;
  let spread = a.input.ads ? st.ads : st.spread;
  if (moving) spread *= 1.35; if (!a.onGround && !a.inWater) spread *= 1.6;
  if (a.ai) spread += a.ai.err;
  if (a === player && st.scope && a.input.ads) spread = 0;
  const mz = muzzlePos(a, _v3);
  if (st.proj) {
    const d = coneDir(AIM.d, spread, _v2);
    let tx, ty, tz;
    if (a === player) { const h = raycast(AIM.o.x + AIM.d.x * AIM.t0, AIM.o.y + AIM.d.y * AIM.t0, AIM.o.z + AIM.d.z * AIM.t0, d.x, d.y, d.z, st.range, a, true); tx = h.x; ty = h.y; tz = h.z; }
    else { tx = mz.x + d.x * 100; ty = mz.y + d.y * 100; tz = mz.z + d.z * 100; }
    const dd = _v1.set(tx - mz.x, ty - mz.y, tz - mz.z).normalize();
    Rockets.spawn(a, mz, dd, st);
  } else {
    const n = st.pellets || 1, hits = [], tcol = it.rarity >= 5 ? RARITY[it.rarity].hex : 0xfff1a8, r1 = v => Math.round(v * 10) / 10;
    for (let i = 0; i < n; i++) {
      const d = coneDir(AIM.d, spread, _v2);
      const ox = AIM.o.x + AIM.d.x * AIM.t0, oy = AIM.o.y + AIM.d.y * AIM.t0, oz = AIM.o.z + AIM.d.z * AIM.t0;
      const h = raycast(ox, oy, oz, d.x, d.y, d.z, st.range, a, true);
      if (i < 3 || i % 3 === 0) { FX.tracer(mz.x, mz.y, mz.z, h.x, h.y, h.z, tcol); if (hits.length < 4) hits.push([r1(h.x), r1(h.y), r1(h.z)]); }
      applyHit(a, st, h, d, n);
    }
    if (Net.inMatch && !a.remote) { muzzlePos(a, _v3); Net.emit({ k: 'shot', id: a.id, m: [r1(_v3.x), r1(_v3.y), r1(_v3.z)], h: hits, ty: st.type, c: tcol }, a.pos, NET_RANGE); }
  }
  Sfx.shot(st.type, a.pos.x, a.pos.y, a.pos.z);
  FX.burst(mz.x, mz.y, mz.z, 0xffd27a, 2, 1.5, 0.06, 0.12, 0);
  if (a === player) { Cam.kick += st.type === 'sniper' ? 0.05 : st.type === 'shotgun' ? 0.045 : st.type === 'rocket' ? 0.04 : 0.012; HUD.dirty = true; }
}
// Japanese Katana: one swing cuts everyone in front of you within reach (and builds in the way)
function slash(a, it, st) {
  a.fireCD = 1 / st.rate; a.emote = null; a.lastShotT = Match.time; a.slashT = 0.28; a.slashSide = -(a.slashSide || 1);
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), s = a.scale || 1, ey = a.pos.y + 1.3 * s, R = st.range * s; let hits = 0;
  for (const t of actors) {
    if (t === a || !t.alive || t.state === 'bus' || t.vehicle || t.team === a.team) continue;
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, d = Math.hypot(dx, dz), ts = t.scale || 1;
    if (d > R + 0.45 * ts || Math.abs(t.pos.y - a.pos.y) > 2.2 * Math.max(s, ts)) continue;
    if (d > 0.35 && (dx * fx + dz * fz) / d < 0.45) continue;   // about 63 degrees either side of where you face
    if (!losClear(a.pos.x, ey, a.pos.z, t.pos.x, t.pos.y + 1.1 * ts, t.pos.z)) continue;
    damageActor(t, st.dmg, a, { x: t.pos.x, y: t.pos.y + 1.6 * ts, z: t.pos.z, w: WEAPONS[it.wid].name });
    FX.burst(t.pos.x, t.pos.y + 1.2 * ts, t.pos.z, t.shield > 0 ? 0x5ab8ff : 0xff4050, 8, 4, 0.4, 0.09); hits++;
  }
  // builds, cars, rocks and creatures straight ahead
  const cp = Math.cos(a.pitch), h = raycast(a.pos.x, ey, a.pos.z, fx * cp, Math.sin(a.pitch), fz * cp, R + 0.4, a, false);
  if (h.type === 'col') { const c = h.obj; if (c.piece) Build.damage(c.piece, st.dmg * st.struct, a); else if (c.harv && c.harv.vehicle) Vehicles.damage(c.harv.vehicle, st.dmg * 0.4); FX.burst(h.x, h.y, h.z, MATS[c.mat] ? MATS[c.mat].color : 0xcccccc, 5, 3, 0.35, 0.08); }
  { const cr = Creatures.ray(a.pos.x, ey, a.pos.z, fx, 0, fz, R + 0.6); if (cr) Creatures.damage(cr.c, st.dmg, a, { x: a.pos.x + fx * cr.t, y: ey, z: a.pos.z + fz * cr.t }); }
  FX.slash(a.pos.x + fx * 0.3, ey - 0.15, a.pos.z + fz * 0.3, a.yaw, a.slashSide);
  if (a === player || Sfx.vol(a.pos.x, a.pos.y, a.pos.z) > 0.2) { Sfx.noise(0.14, 3600, 1.5, 0.16, 'highpass'); if (hits) Sfx.tone(1900, 0.09, 'triangle', 0.07, -700); }
  if (a === player) { Cam.kick += 0.015; HUD.dirty = true; }
  if (Net.inMatch && !a.remote && !Net.applying) Net.emit({ k: 'sl', id: a.id, s: a.slashSide }, a.pos, NET_RANGE);
}
function applyHit(a, st, h, d, pellets) {
  if (h.type === 'actor') {
    const t = h.obj; let dmg = st.dmg;
    if (h.t > st.range * 0.5) dmg *= lerp(1, 0.7, (h.t - st.range * 0.5) / (st.range * 0.5));
    if (h.head && !(a.ai && !t.ai)) dmg *= st.head;   // bots do not get headshot bonuses on real players
    damageActor(t, dmg, a, { head: h.head, x: h.x, y: h.y, z: h.z, w: WEAPONS[a.inv[a.slot].wid].name });
    if (st.slow) t.slowT = st.slow;
    if (st.knock) { t.vel.x += d.x * st.knock / pellets * 1.2; t.vel.z += d.z * st.knock / pellets * 1.2; t.vel.y = Math.max(t.vel.y, 7); t.onGround = false; }
    FX.burst(h.x, h.y, h.z, t.shield > 0 ? 0x5ab8ff : 0xff4050, 3, 3, 0.3, 0.07);
  } else if (h.type === 'col') {
    const c = h.obj;
    if (c.piece) Build.damage(c.piece, st.dmg * st.struct, a);
    else if (c.harv && c.harv.vehicle) Vehicles.damage(c.harv.vehicle, st.dmg * 0.4);
    FX.burst(h.x, h.y, h.z, MATS[c.mat] ? MATS[c.mat].color : 0x999999, 2, 3, 0.3, 0.07);
  } else if (h.type === 'terrain') FX.burst(h.x, h.y, h.z, 0x8a7a5a, 2, 3, 0.35, 0.08);
  else if (h.type === 'creature') { Creatures.damage(h.obj, st.dmg, a, h); FX.burst(h.x, h.y, h.z, 0xff4050, 3, 3, 0.3, 0.07); }
}
function canReload(a) {
  const it = a.inv[a.slot]; if (!it || it.kind !== 'weapon') return false;
  const st = wstat(it); if (st.melee || it.mag >= st.mag) return false;
  return !a.isPlayer || a.ammo[st.ammo] > 0;
}
function startReload(a) {
  if (a.reloadT > 0 || !canReload(a)) {
    if (a === player) { const it = a.inv[a.slot]; if (it && it.kind === 'weapon' && it.mag <= 0 && a.ammo[wstat(it).ammo] <= 0) HUD.toast('Out of ' + AMMO[wstat(it).ammo].name); }
    return;
  }
  a.reloadT = wstat(a.inv[a.slot]).reload; a.useT = 0;
  if (a === player) Sfx.noise(0.12, 2600, 2, 0.12);
}
function finishReload(a) {
  const it = a.inv[a.slot]; if (!it || it.kind !== 'weapon') return;
  const st = wstat(it); const need = st.mag - it.mag;
  const take = a.isPlayer ? Math.min(need, a.ammo[st.ammo]) : need;
  it.mag += take; if (a.isPlayer) a.ammo[st.ammo] -= take;
  if (a === player) { Sfx.noise(0.06, 3200, 3, 0.14); HUD.dirty = true; }
}
function switchSlot(a, s) {
  if (s === a.slot) return;
  a.slot = s; a.reloadT = 0; a.useT = 0; a.fireCD = Math.max(a.fireCD, 0.22); a.emote = null;
  if (a === player) { HUD.dirty = true; Build.active = false; }
}

// ---------------------------------------------------------------- damage + eliminations
const BOT_DMG_TO_PLAYERS = 0.55;
function damageActor(t, dmg, src, o = {}) {
  if (!t.alive || t.invuln > 0 || Match.state !== 'play') return 0;
  if (src && src !== t && src.team === t.team) return 0;
  if (src && src.ai && !t.ai && !o.raw) dmg *= src.boss ? 0.8 : BOT_DMG_TO_PLAYERS;   // bots hit real players softer, so fights last longer
  dmg = Math.max(1, Math.round(dmg));
  if (Net.inMatch && t.remote && !Net.applying) {   // someone else's character: their own game decides what the hit does
    if (src && src.remote) return 0;
    const ev = { k: 'dmg', id: t.id, dmg, src: src ? src.id : 0, o: Net.slim(o) };
    if (!Net.isHost) Net.send('h', ev); else if (t.human) Net.send(t.human, ev); else return 0;
    if (src) src.dmgDealt += dmg;
    if (src === player) { HUD.hitmark(o.head); Sfx.hit(o.head); HUD.dmgNum(o.x !== undefined ? o.x : t.pos.x, o.y !== undefined ? o.y + 0.4 : t.pos.y + 2.2, o.z !== undefined ? o.z : t.pos.z, dmg, o.head ? 'head' : t.shield > 0 ? 'shield' : 'hp'); }
    return dmg;
  }
  let rem = dmg, shieldHit = false;
  if (!o.raw) {
    if (t.over > 0) { const u = Math.min(t.over, rem); t.over -= u; rem -= u; shieldHit = true; }
    if (t.shield > 0 && rem > 0) { const u = Math.min(t.shield, rem); t.shield -= u; rem -= u; shieldHit = true; }
  }
  t.hp -= rem; t.lastDmgT = Match.time;
  if (src && src !== t) { t.lastAttacker = src; src.dmgDealt += dmg; }
  if (src === player && t !== player) {
    HUD.hitmark(o.head); Sfx.hit(o.head);
    HUD.dmgNum(o.x !== undefined ? o.x : t.pos.x, o.y !== undefined ? o.y + 0.4 : t.pos.y + 2.2, o.z !== undefined ? o.z : t.pos.z, dmg, o.head ? 'head' : shieldHit ? 'shield' : 'hp');
  }
  if (t === player) { HUD.hurt(src, dmg, o); Input.rumble(170, clamp(dmg / 50, 0.35, 1), 0.5); }
  if (t.ai && src && src !== t) botAlert(t, src);
  if (t.hp <= 0) { t.hp = 0; eliminate(t, src, o); }
  return dmg;
}
function eliminate(t, src, o) {
  t.alive = false; t.useT = 0; t.reloadT = 0; t.emote = null;
  if (t.vehicle) Vehicles.exit(t, true);
  // the elimination drone takes the body (it stays visible until the flash); too far away to see: it just vanishes
  if (!ElimFX.start(t)) { if (t.ri >= 0) BotRig.hide(t.ri); FX.burst(t.pos.x, t.pos.y + 1.2, t.pos.z, 0x6fd0ff, 16, 4, 0.7, 0.14, -2); }
  if (!Net.inMatch) { if (Match.mode !== 'tutorial') dropLoot(t); }
  else if (!Net.applying) {   // this game owns the character: tell the others, and get its loot onto the ground
    const ev = { k: 'elim', id: t.id, src: src ? src.id : 0, o: Net.slim(o) };
    if (Net.guest) ev.items = lootOf(t); else dropLoot(t);
    Net.emit(ev);
  }
  if (src && src !== t) src.kills++;
  let msg; const was = t === player ? 'were' : 'was';
  if (src && src !== t) msg = `<b>${esc(src.name)}</b> eliminated <b>${esc(t.name)}</b>${o.w ? ' · ' + esc(o.w) : ''}`;
  else if (o.storm) msg = `<b>${esc(t.name)}</b> ${was} lost to the storm`;
  else if (o.fall) msg = `<b>${esc(t.name)}</b> fell too far`;
  else if (o.shark) msg = `<b>${esc(t.name)}</b> ${was} dragged under by a shark`;
  else msg = `<b>${esc(t.name)}</b> ${was} eliminated`;
  HUD.feed(msg, src === player || t === player);
  if (src === player && t !== player) { Sfx.elim(); HUD.toast('Eliminated ' + t.name, true); }
  Match.onElim(t, src, o);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function dropLoot(t) { scatterLoot(lootOf(t), t.pos); }
// everything an actor is carrying, taken off them
function lootOf(t) {
  const items = [];
  const tag = Reboot.tagFor(t); if (tag) items.push(tag);   // Duos/Squads: a Rescue Tag for your team
  if (t.tags && t.tags.length) { for (const g of t.tags) items.push({ kind: 'tag', aid: g.aid, team: g.team, name: g.name }); t.tags = []; }
  for (let i = 1; i < 6; i++) if (t.inv[i]) items.push(t.inv[i]);
  if (t.isPlayer) { for (const k in t.ammo) if (t.ammo[k] > 0) items.push({ kind: 'ammo', ammo: k, count: t.ammo[k] }); }
  else for (let i = 1; i < 6; i++) if (t.inv[i] && t.inv[i].kind === 'weapon') items.push(ammoFor(t.inv[i].wid, 1.5));
  for (const m of MAT_ORDER) if (t.mats[m] > 0) items.push({ kind: 'mats', mat: m, count: t.mats[m] });
  if (t.boss) { items.push({ kind: 'heal', hid: 'shield', count: 2 }, { kind: 'heal', hid: 'medkit', count: 2 }); }
  t.inv = [{ kind: 'pick' }, null, null, null, null, null]; t.slot = 0;
  for (const m of MAT_ORDER) t.mats[m] = 0;
  return items;
}
function scatterLoot(items, pos) {
  const n = items.length;
  items.forEach((it, i) => {
    const a = i / n * TAU + Math.random() * 0.3, r = 1.3 + (n > 6 ? 0.9 : 0.3) + (i % 2) * 0.5;
    const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
    Pickups.spawn(it, x, groundAt(x, z, pos.y + 0.6), z, { pop: pos, ttl: Match.mode === 'rumble' ? 75 : 0 });
  });
}

// ---------------------------------------------------------------- rockets
const Rockets = {
  list: [],
  clear() { for (const r of this.list) scene.remove(r.m); this.list = []; },
  spawn(owner, o, d, st, vis) {   // vis: another player's rocket, shown here but harmless (their game deals the damage)
    const m = new THREE.Mesh(GEO.rocket, lam(0x56625a)); m.position.copy(o); m.lookAt(_v4.copy(o).add(d)); scene.add(m);
    this.list.push({ m, owner, x: o.x, y: o.y, z: o.z, dx: d.x, dy: d.y, dz: d.z, sp: st.proj, life: 4.5, st, vis: !!vis });
    if (Net.inMatch && !vis && !owner.remote) { const w = owner.inv[owner.slot]; if (w && w.kind === 'weapon') Net.emit({ k: 'rk', id: owner.id, o: [o.x, o.y, o.z], d: [d.x, d.y, d.z], wid: w.wid, r: w.rarity }, owner.pos, NET_RANGE); }
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i]; r.life -= dt; const step = r.sp * dt;
      const h = raycast(r.x, r.y, r.z, r.dx, r.dy, r.dz, step, r.owner, true);
      if (h.type || r.life <= 0) { explode(h.type ? h.x : r.x, h.type ? h.y : r.y, h.type ? h.z : r.z, r.owner, r.st, r.vis); scene.remove(r.m); this.list.splice(i, 1); continue; }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step; r.m.position.set(r.x, r.y, r.z);
      FX.burst(r.x - r.dx, r.y - r.dy, r.z - r.dz, 0xcfcfcf, 1, 0.5, 0.5, 0.25, -1);
    }
  },
};
function explode(x, y, z, owner, st, fxOnly) {
  FX.flash(x, y, z, st.splash * 1.1, 0xffa040, 0.5); FX.burst(x, y, z, 0xffa040, 26, 10, 0.8, 0.25, 6); FX.burst(x, y, z, 0x444444, 14, 5, 1.2, 0.35, -1);
  Sfx.boom(x, y, z);
  if (player && player.alive) { const d = Math.hypot(player.pos.x - x, player.pos.z - z); if (d < 40) Cam.shake = Math.max(Cam.shake, (1 - d / 40) * 0.6); }
  if (fxOnly) return;
  for (const a of actors) {
    if (!a.alive || a.state === 'bus') continue;
    if (owner && a !== owner && a.team === owner.team) continue;
    const dx = a.pos.x - x, dy = a.pos.y + 1 - y, dz = a.pos.z - z, d = Math.hypot(dx, dy, dz);
    if (d > st.splash) continue;
    if (!losClear(x, y + 0.3, z, a.pos.x, a.pos.y + 1, a.pos.z)) continue;
    const f = 1 - (d / st.splash) * 0.6;
    damageActor(a, st.dmg * f * (a === owner ? 0.5 : 1), a === owner ? null : owner, { x: a.pos.x, y: a.pos.y + 2, z: a.pos.z, w: 'Thunderclap RPG' });
    const inv = 1 / Math.max(0.5, d); a.vel.x += dx * inv * 9 * f; a.vel.z += dz * inv * 9 * f; a.vel.y += 6 * f; a.onGround = false;
  }
  Build.explode(x, y, z, st.splash + 1.5, st.dmg * st.struct);
  Vehicles.blast(x, y, z, st.splash + 2, st.dmg * 1.5);
  Creatures.blast(x, y, z, st.splash, st.dmg);
}

// ---------------------------------------------------------------- harvesting
function gainMats(a, mat, n, h) {
  const before = a.mats[mat]; a.mats[mat] = Math.min(999, a.mats[mat] + n);
  if (a === player && h) { HUD.dmgNum(h.x, h.y + 0.3, h.z, '+' + (a.mats[mat] - before) + ' ' + MATS[mat].name, 'mat'); HUD.dirty = true; }
}
function swingPick(a) {
  a.pickCD = 0.42; a.pickAnim = 0.32; a.emote = null;
  aimRay(a, AIM);
  const ox = AIM.o.x + AIM.d.x * AIM.t0, oy = AIM.o.y + AIM.d.y * AIM.t0, oz = AIM.o.z + AIM.d.z * AIM.t0;
  const h = raycast(ox, oy, oz, AIM.d.x, AIM.d.y, AIM.d.z, 3.4, a, true);
  if (!h.type) { if (a === player) Sfx.noise(0.07, 900, 1, 0.1); return; }
  if (h.type === 'actor') { damageActor(h.obj, 20, a, { x: h.x, y: h.y, z: h.z, w: 'Harvesting Tool' }); return; }
  if (h.type === 'creature') { Creatures.damage(h.obj, 20, a, h); return; }
  if (h.type === 'terrain') { FX.burst(h.x, h.y, h.z, 0x8a7a5a, 4, 3, 0.4, 0.1); if (a === player) Sfx.noise(0.07, 400, 1, 0.2); return; }
  const c = h.obj, mat = c.mat || 'brick';
  if (a === player || Sfx.vol(h.x, h.y, h.z) > 0.2) Sfx.harvest(mat);
  FX.burst(h.x, h.y, h.z, MATS[mat].color, 6, 4, 0.5, 0.12);
  if (c.piece) { Build.damage(c.piece, 50, a); return; }
  if (c.harv) {
    const hv = c.harv; gainMats(a, hv.mat, hv.yield, h);
    if (hv.vehicle) { Vehicles.damage(hv.vehicle, 50); return; }
    hv.hp -= 50; if (hv.hp <= 0) destroyHarv(hv);
    return;
  }
  if (c.sunk == null) c.sunk = c.minY < groundH((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2) - 1.2;   // foundations sunk into the ground stay
  if (c.tough || c.sunk || c.spent) { if (a === player) Sfx.noise(0.05, 1900, 1, 0.12); return; }   // can't be mined (or already mined out): no materials
  gainMats(a, mat, 4, h);
  if (c.left == null) c.left = staticHits(c);
  if (--c.left <= 0) { if (c.vb && c.vb._mesh) breakStatic(c); else c.spent = true; }
}
// hits a world piece takes before it breaks: wood 4, brick 5, metal 6 (small things fewer)
function staticHits(c) {
  const v = (c.maxX - c.minX) * (c.maxY - c.minY) * (c.maxZ - c.minZ), base = c.mat === 'wood' ? 4 : c.mat === 'metal' ? 6 : 5;
  return v < 0.6 ? Math.max(2, base - 2) : base;
}
// a mined-out wall, roof, floor, prop or stair breaks off: its triangles collapse, its hitbox goes, debris flies
const _dirtyAttrs = new Map();
function breakStatic(c) {
  if (c.dead) return;
  const m = c.vb && c.vb._mesh;
  if (m) { const pos = m.geometry.attributes.position; pos.array.fill(0, c.v0 * 3, c.v1 * 3); const d = _dirtyAttrs.get(pos); if (d) { d[0] = Math.min(d[0], c.v0 * 3); d[1] = Math.max(d[1], c.v1 * 3); } else _dirtyAttrs.set(pos, [c.v0 * 3, c.v1 * 3]); }
  Grid.remove(c);
  const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, cz = (c.minZ + c.maxZ) / 2, mat = MATS[c.mat] ? c.mat : 'brick';
  if (camera.position.distanceToSquared(_v4.set(cx, cy, cz)) < 140 * 140) {
    FX.burst(cx, cy, cz, MATS[mat].color, 16, 4.5, 0.8, 0.2, 9);
    if (Sfx.vol(cx, cy, cz) > 0.15) { Sfx.harvest(mat); Sfx.noise(0.22, mat === 'wood' ? 260 : 180, 2, 0.3); }
  }
  if (Net.inMatch && !Net.applying) { const r2 = v => Math.round(v * 100) / 100; Net.emit({ k: 'sb', x: r2(cx), y: r2(cy), z: r2(cz) }); }
}
// upload only the changed part of each batch, once per frame
function flushStaticBreaks() {
  if (!_dirtyAttrs.size) return;
  for (const [attr, [s, e]] of _dirtyAttrs) { attr.updateRange.offset = s; attr.updateRange.count = e - s; attr.needsUpdate = true; }
  _dirtyAttrs.clear();
}
function destroyHarv(hv) {
  for (const m of hv.meshes) { m.setMatrixAt(hv.idx, ZERO_M); m.instanceMatrix.needsUpdate = true; }
  Grid.remove(hv.col); hv.dead = true;
  if (Net.inMatch && !Net.applying) Net.emit({ k: 'hv', x: Math.round(hv.x * 10) / 10, z: Math.round(hv.z * 10) / 10 });
  FX.burst(hv.x, hv.y + 2, hv.z, MATS[hv.mat].color, 16, 6, 0.8, 0.2);
}

// ---------------------------------------------------------------- healing items
function onCrawl(down) {
  if (down) { Build.active = false; player.emote = null; HUD.banner('You are down!', 'Crawl to cover and use a Med-Kit to get back up', 3); Sfx.tone(180, 0.5, 'sawtooth', 0.12, -60); }
  else { HUD.banner('Back on your feet', '', 1.5); Sfx.tone(520, 0.18, 'triangle', 0.12, 120); }
  HUD.dirty = true;
}
function healUseful(a, it) {
  const h = HEALS[it.hid];
  if (h.hp) return a.hp < h.hpMax;
  return a.shield < h.shMax;
}
function startUse(a) {
  const it = a.inv[a.slot]; if (!it || it.kind !== 'heal') return;
  if (a.crawl && it.hid !== 'medkit') { if (a === player && !a._crawlTold) { a._crawlTold = true; HUD.toast('While you are crawling, only a Med-Kit can heal you'); setTimeout(() => { a._crawlTold = false; }, 1500); } return; }
  if (!healUseful(a, it)) { if (a === player) HUD.toast(HEALS[it.hid].hp ? 'Health is already full enough for this' : 'Shield is already full enough for this'); return; }
  const h = HEALS[it.hid]; a.useT = a.useDur = h.time; a.useSlot = a.slot; a.reloadT = 0; a.emote = null;
}
function finishUse(a) {
  const it = a.inv[a.useSlot]; if (!it || it.kind !== 'heal' || a.slot !== a.useSlot) return;
  const h = HEALS[it.hid];
  if (h.hp) a.hp = Math.min(h.hpMax, a.hp + h.hp);
  if (h.sh) a.shield = Math.min(h.shMax, a.shield + h.sh);
  it.count--; if (it.count <= 0) a.inv[a.useSlot] = null;
  if (a === player) { Sfx.gulp(); HUD.dirty = true; }
  FX.burst(a.pos.x, a.pos.y + 1.2, a.pos.z, h.sh ? 0x5ab8ff : 0x7cff8a, 10, 2, 0.6, 0.1, -2);
}

// ---------------------------------------------------------------- per-actor tick (timers + actions)
function actorTick(a, dt) {
  if (!a.alive) return;
  a.fireCD -= dt; a.pickCD -= dt; if (a.pickAnim > 0) a.pickAnim -= dt; if (a.slashT > 0) a.slashT -= dt; if (a.slowT > 0) a.slowT -= dt; if (a.invuln > 0) a.invuln -= dt;
  if (a.state !== 'bus') a.aliveTime += dt;
  if (a.emote) { a.emoteT += dt; if (Math.abs(a.input.f) > 0.1 || Math.abs(a.input.r) > 0.1 || a.input.fire || a.state !== 'ground') a.emote = null; }
  if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) finishReload(a); }
  if (a.useT > 0) { a.useT -= dt; if (a.useT <= 0) finishUse(a); }
  if (a.overMax > 0 && Match.time - a.lastDmgT > 5 && a.over < a.overMax) a.over = Math.min(a.overMax, a.over + 14 * dt);
  // players at low health fall to the ground and crawl (bots fight on as before)
  if (a.isPlayer) { const c = a.hp <= CRAWL_HP && a.state === 'ground' && !a.vehicle; if (c !== !!a.crawl) { a.crawl = c; if (a === player) onCrawl(c); } }
  if (a.state !== 'ground' || a.vehicle || a.mantleT > 0) return;
  if (a === player && Build.active) return;
  if (a.crawl) { const ci = a.inv[a.slot]; if (ci && ci.kind === 'heal' && a.input.fire && a.useT <= 0) startUse(a); return; }   // crawling: no shooting or harvesting, only healing
  const it = a.inv[a.slot], fire = a.input.fire;
  if (!it || it.kind === 'pick') { if (fire && a.pickCD <= 0) swingPick(a); }
  else if (it.kind === 'weapon') {
    if (fire && a.fireCD <= 0 && a.reloadT <= 0) {
      const st = wstat(it);
      if (st.auto || !a.firedLatch || !a.isPlayer) {
        if (it.mag > 0) fireWeapon(a); else startReload(a);
        a.firedLatch = true;
      }
    }
    if (!fire) a.firedLatch = false;
    if (it.mag <= 0 && a.reloadT <= 0 && !fire && canReload(a)) startReload(a);
  } else if (it.kind === 'heal') { if (fire && a.useT <= 0) startUse(a); }
}
