// =====================================================================
//  Physics: ground, collision, movement, mantling, water
// =====================================================================
const GRAV = 28, JUMP = 9.4, STEP = 0.6;
const _cands = [], _cands2 = [], _cands3 = [];

function rampY(c, x, z) {
  let p;
  if (c.dir === 0) p = (x - c.minX) / (c.maxX - c.minX);
  else if (c.dir === 1) p = (c.maxX - x) / (c.maxX - c.minX);
  else if (c.dir === 2) p = (z - c.minZ) / (c.maxZ - c.minZ);
  else p = (c.maxZ - z) / (c.maxZ - c.minZ);
  return c.y0 + clamp(p, 0, 1) * c.rise;
}
// highest walkable surface at (x,z) that is not above feet height y (+step)
function groundAt(x, z, y, r = 0.3, skip) {
  let g = groundH(x, z);
  Grid.query(x - r, z - r, x + r, z + r, _cands);
  for (const c of _cands) {
    if (c.dead || c === skip) continue;
    if (c.kind === 'ramp') {
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      const ry = rampY(c, x, z); if (ry <= y + 1.3 && ry > g) g = ry; continue;
    }
    if (x + r < c.minX || x - r > c.maxX || z + r < c.minZ || z - r > c.maxZ) continue;
    if (c.maxY <= y + STEP && c.maxY > g) g = c.maxY;
  }
  return g;
}
function topSurface(x, z) { return groundAt(x, z, 1e4, 0.2); }
function bodyFree(x, z, y, h) {
  const r = 0.35; Grid.query(x - r, z - r, x + r, z + r, _cands3);
  for (const c of _cands3) {
    if (c.dead || c.kind === 'ramp') continue;
    if (x + r < c.minX || x - r > c.maxX || z + r < c.minZ || z - r > c.maxZ) continue;
    if (c.maxY > y + 0.05 && c.minY < y + h) return false;
  }
  return true;
}
function collideXZ(a) {
  const r = a.radius * a.scale, feet = a.pos.y, head = feet + a.height * a.scale;
  Grid.query(a.pos.x - r - 0.2, a.pos.z - r - 0.2, a.pos.x + r + 0.2, a.pos.z + r + 0.2, _cands2);
  for (let iter = 0; iter < 2; iter++) {
    for (const c of _cands2) {
      if (c.dead || c.kind === 'ramp' || c === a.vehicleCol) continue;
      if (c.maxY <= feet + STEP || c.minY >= head) continue;
      const cx = clamp(a.pos.x, c.minX, c.maxX), cz = clamp(a.pos.z, c.minZ, c.maxZ);
      const dx = a.pos.x - cx, dz = a.pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d; a.pos.x += nx * (r - d); a.pos.z += nz * (r - d);
        const vn = a.vel.x * nx + a.vel.z * nz; if (vn < 0) { a.vel.x -= vn * nx; a.vel.z -= vn * nz; }
      } else {
        const pl = a.pos.x - c.minX, pr = c.maxX - a.pos.x, pb = a.pos.z - c.minZ, pf = c.maxZ - a.pos.z; const m = Math.min(pl, pr, pb, pf);
        if (m === pl) a.pos.x = c.minX - r; else if (m === pr) a.pos.x = c.maxX + r; else if (m === pb) a.pos.z = c.minZ - r; else a.pos.z = c.maxZ + r;
      }
      a.blocked = true; if (c.maxY > a.blockTop) a.blockTop = c.maxY;
    }
  }
}

function physicsActor(a, dt) {
  if (!a.alive || a.state === 'bus' || a.vehicle) return;
  const inp = a.input;
  a.jumpCD -= dt;
  if (a.mantleT > 0) {
    a.mantleT -= dt; const k = 1 - Math.max(0, a.mantleT) / 0.3;
    a.pos.y = lerp(a.mFrom, a.mTo, Math.min(1, k * 1.7)); a.pos.x += a.mdx * dt * (k > 0.55 ? 1 : 0.2); a.pos.z += a.mdz * dt * (k > 0.55 ? 1 : 0.2);
    if (a.mantleT <= 0) { a.vel.set(a.mdx * 0.4, 0, a.mdz * 0.4); a.onGround = true; a.pos.y = a.mTo; }
    return;
  }
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
  const press = inp.jump && !a._jumpPrev; a._jumpPrev = inp.jump;   // a fresh press of jump (not held)
  if (a.stamina == null) a.stamina = 100;
  let mx = sy * inp.f - cy * inp.r, mz = cy * inp.f + sy * inp.r;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  let speed, accel;
  if (a.state === 'sky') {
    const dive = inp.f > 0.3; a.dive = lerp(a.dive || 0, dive ? 1 : 0, Math.min(1, dt * 4));   // hold forward to tip nose-down and fall faster
    speed = dive ? 24 : 20; accel = 2.5; a.vel.y = lerp(a.vel.y, dive ? -62 : -40, Math.min(1, dt * 1.5));
  }
  else if (a.state === 'glide') { speed = 17; accel = 2.2; a.vel.y = lerp(a.vel.y, -8.5, Math.min(1, dt * 3)); }
  else {
    // stamina: sprinting drains it, it refills shortly after you stop; run dry and you can't sprint until a quarter is back
    const sprint = inp.sprint && inp.f > 0.3 && !inp.ads && !a.exhausted && !a.inWater && Math.hypot(a.vel.x, a.vel.z) > 1;
    if (sprint && a.onGround) { a.stamina = Math.max(0, a.stamina - 22 * dt); a.stamRest = 0.9; if (a.stamina <= 0) a.exhausted = true; }
    else { a.stamRest = (a.stamRest || 0) - dt; if (a.stamRest <= 0) a.stamina = Math.min(100, a.stamina + 20 * dt); }
    if (a.exhausted && a.stamina >= 25) a.exhausted = false;
    speed = sprint ? (Match.build ? 8.4 : 8.9) : 6.0;
    if (inp.ads) speed = 4.0;
    if (a.useT > 0) speed = Math.min(speed, 3.0);
    if (a.inWater) speed *= 0.6;
    if (a.slowT > 0) speed *= 0.5;
    if (a.boss) speed *= 0.8;
    accel = a.onGround || a.inWater ? 14 : 3.5;
    a.vel.y -= GRAV * dt;
  }
  const k = Math.min(1, accel * dt);
  a.vel.x += (mx * speed - a.vel.x) * k; a.vel.z += (mz * speed - a.vel.z) * k;
  if (inp.jump && a.state === 'ground' && (a.onGround || a.inWater) && a.jumpCD <= 0) {
    a.vel.y = a.inWater ? 6 : JUMP; a.onGround = false; a.jumpCD = 0.3; a.emote = null;
  } else if (press && a.state === 'ground' && !a.onGround && !a.inWater && a.jumpCD <= 0.15 && (a.wallJumps || 0) < 2) {
    if (wallJump(a)) return;
  }
  if (a.onGround) a.wallJumps = 0;
  const wasGround = a.onGround, prevY = a.pos.y;
  const hs = Math.hypot(a.vel.x, a.vel.z);
  const n = Math.min(5, Math.max(1, Math.ceil(hs * dt / 0.3)));
  a.blocked = false; a.blockTop = -1e9;
  for (let i = 0; i < n; i++) { a.pos.x += a.vel.x * dt / n; a.pos.z += a.vel.z * dt / n; collideXZ(a); }
  a.pos.x = clamp(a.pos.x, -W.half + 3, W.half - 3); a.pos.z = clamp(a.pos.z, -W.half + 3, W.half - 3);
  if (a.onGround) a.walkPhase += hs * dt * 1.7;
  // mantle (no-build parkour)
  if (!Match.build && a.blocked && a.state === 'ground' && inp.f > 0.4 && (inp.jump || !a.onGround) && a.mantleCD <= 0) {
    const top = a.blockTop, rel = top - a.pos.y;
    if (rel > 0.6 && rel < 2.8) {
      const fx = sy, fz = cy, tx = a.pos.x + fx * 0.9, tz = a.pos.z + fz * 0.9;
      if (groundAt(tx, tz, top + 0.1, 0.2) >= top - 0.15 && bodyFree(tx, tz, top + 0.05, a.height)) {
        a.mantleT = 0.3; a.mFrom = a.pos.y; a.mTo = top + 0.02; a.mdx = fx * 3; a.mdz = fz * 3; a.vel.set(0, 0, 0); a.mantleCD = 0.5; a.emote = null;
        return;
      }
    }
  }
  a.mantleCD -= dt;
  a.pos.y += a.vel.y * dt;
  // ceiling
  if (a.vel.y > 0) {
    const hh = a.height * a.scale, top = a.pos.y + hh, r = a.radius * 0.8;
    Grid.query(a.pos.x - r, a.pos.z - r, a.pos.x + r, a.pos.z + r, _cands2);
    for (const c of _cands2) {
      if (c.dead || c.kind === 'ramp') continue;
      if (a.pos.x + r < c.minX || a.pos.x - r > c.maxX || a.pos.z + r < c.minZ || a.pos.z - r > c.maxZ) continue;
      if (c.minY >= prevY + hh - 0.05 && c.minY < top) { a.pos.y = c.minY - hh - 0.01; a.vel.y = 0; break; }
    }
  }
  const g = groundAt(a.pos.x, a.pos.z, Math.max(a.pos.y, prevY), a.radius * 0.7);
  const snap = wasGround && a.vel.y <= 0 && a.pos.y - g < 0.7 && a.state === 'ground';
  if (a.pos.y <= g || snap) {
    if (a.state === 'sky' || a.state === 'glide') { a.state = 'ground'; onLand(a); }
    else if (!wasGround && !a.inWater && a.vel.y < -23) damageActor(a, (-a.vel.y - 23) * 4.5, null, { raw: true, fall: true });
    a.pos.y = g; if (a.vel.y < 0) a.vel.y = 0; a.onGround = true;
  } else a.onGround = false;
  // water
  a.inWater = false;
  const floatY = W.waterY - 1.05;
  if (g < floatY && a.pos.y < floatY) {
    if (a.state === 'sky' || a.state === 'glide') { a.state = 'ground'; onLand(a); }
    a.pos.y = floatY; if (a.vel.y < 0) a.vel.y = 0; a.inWater = true; a.onGround = false;
  }
  if (!Number.isFinite(a.pos.x + a.pos.y + a.pos.z + a.vel.x + a.vel.y + a.vel.z)) { a.vel.set(0, 0, 0); a.pos.set(clamp(a.pos.x || 0, -W.half, W.half), 0, clamp(a.pos.z || 0, -W.half, W.half)); a.pos.y = topSurface(a.pos.x, a.pos.z); }
  // auto-glider
  if (a.state === 'sky' && a.pos.y - g < GLIDER_AUTO) a.state = 'glide';   // the glider opens by itself this high above the ground
}
function onLand(a) {
  a.vel.x *= 0.4; a.vel.z *= 0.4; a.landT = Match.time;
  if (Match.mode !== 'rumble' && !Match.firstLander && !a.npc) { Match.firstLander = a; if (a === player) HUD.banner('First to land!', '+500 XP', 2.5); }
  if (a === player) { Sfx.noise(0.15, 300, 1, 0.3, 'lowpass'); HUD.dirty = true; }
}

// ---------------------------------------------------------------- wall jump / climb: press jump again in mid-air next to a wall
function solidHit(x, y, z) {
  Grid.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, _cands3);
  for (const c of _cands3) { if (c.dead || c.kind === 'ramp') continue; if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && y >= c.minY && y <= c.maxY) return c; }
  return null;
}
function wallJump(a) {
  const y = a.pos.y + 1.0, reach = a.radius + 0.45;
  let best = null;
  for (let i = 0; i < 12; i++) {
    const ang = a.yaw + i / 12 * TAU, dx = Math.sin(ang), dz = Math.cos(ang), c = solidHit(a.pos.x + dx * reach, y, a.pos.z + dz * reach);
    if (!c) continue;
    const facing = Math.cos(i / 12 * TAU);   // 1 = wall straight ahead
    if (!best || facing > best.facing) best = { c, dx, dz, facing };
  }
  if (!best) return false;
  // climb: a wall ahead whose top is within reach and has room to stand on
  if (best.facing > 0.5 && a.input.f > 0.3) {
    const top = best.c.maxY, rel = top - a.pos.y;
    if (rel > 0.3 && rel < 3.3) {
      const tx = a.pos.x + best.dx * (reach + 0.5), tz = a.pos.z + best.dz * (reach + 0.5);
      if (groundAt(tx, tz, top + 0.1, 0.2) >= top - 0.15 && bodyFree(tx, tz, top + 0.05, a.height)) {
        a.mantleT = 0.3; a.mFrom = a.pos.y; a.mTo = top + 0.02; a.mdx = best.dx * 3; a.mdz = best.dz * 3; a.vel.set(0, 0, 0); a.mantleCD = 0.5; a.emote = null;
        a.wallJumps = (a.wallJumps || 0) + 1; a.stamina = Math.max(0, (a.stamina ?? 100) - 10);
        if (a === player) Sfx.noise(0.08, 900, 1, 0.12);
        return true;
      }
    }
  }
  if ((a.stamina ?? 100) < 12) return false;
  // kick off the wall: up, and away from it, keeping some sideways speed
  const nx = -best.dx, nz = -best.dz, along = a.vel.x * best.dz - a.vel.z * best.dx;
  a.vel.x = nx * 6.5 + best.dz * along * 0.6; a.vel.z = nz * 6.5 - best.dx * along * 0.6; a.vel.y = JUMP * 1.02;
  a.wallJumps = (a.wallJumps || 0) + 1; a.jumpCD = 0.3; a.stamina = Math.max(0, (a.stamina ?? 100) - 15); a.emote = null;
  if (a === player) { Sfx.noise(0.07, 1400, 1, 0.14); FX.burst && FX.burst(a.pos.x - nx * 0.4, a.pos.y + 1.0, a.pos.z - nz * 0.4, 0xd8d2c4, 8); }
  return false;
}
