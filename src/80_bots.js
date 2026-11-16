// =====================================================================
//  Bots: drop, loot, rotate with the storm, fight, heal, build cover
// =====================================================================
const PREF_RANGE = { shotgun: 6, smg: 12, pistol: 14, ar: 26, sniper: 70, rocket: 30 };
function initBotAI(a, skill) {
  a.ai = {
    t: Math.random() * 0.4, mode: 'idle', target: null, lastSeen: -99, seen: new THREE.Vector3(), loot: null, roam: null,
    stuckT: 0, last: new THREE.Vector3(), stuckN: 0, detourT: 0, detour: new THREE.Vector3(), strafe: 1, strafeT: 0, react: 0, skill,
    err: 0.032 + (1 - skill) * 0.06, burstT: 1, pauseT: 0, buildCD: 0, switchCD: 0, jumpAt: 1e9, drop: new THREE.Vector3(), deployH: 40, wantYaw: 0, wantPitch: 0,
    openT: 0, aimH: 1.25, home: null, investigate: null, healCD: 0,
  };
}
function busJump(a) {
  if (a.state !== 'bus') return;
  a.state = 'sky'; a.pos.copy(Bus.pos); a.pos.y -= 2.5; a.pos.x += rnd(-1.5, 1.5); a.pos.z += rnd(-1.5, 1.5);
  a.vel.set(Bus.dir.x * 10, -8, Bus.dir.z * 10); a.yaw = Math.atan2(Bus.dir.x, Bus.dir.z);
  if (a === player) { Sfx.noise(0.6, 900, 0.5, 0.25); HUD.dirty = true; for (const m of actors) if (m.ai && m.leader === player && m.state === 'bus') m.ai.jumpAt = Match.time + 0.3 + Math.random() * 0.8; }
}
function invCount(a) { let w = 0, h = 0; for (let i = 1; i < 6; i++) { const s = a.inv[i]; if (!s) continue; if (s.kind === 'weapon') w++; else if (s.kind === 'heal') h++; } return { w, h }; }
function botWants(a, w) {
  let nW = 0, worst = 1e9, empty = false;
  for (let i = 1; i < 6; i++) { const s = a.inv[i]; if (!s) { empty = true; continue; } if (s.kind !== 'weapon') continue; nW++; if (WEAPONS[s.wid].type === WEAPONS[w.wid].type) return weaponScore(w) > weaponScore(s); worst = Math.min(worst, weaponScore(s)); }
  if (nW < 3 && empty) return true; return weaponScore(w) > worst;
}
function botWantsHeal(a, h) {
  for (let i = 1; i < 6; i++) { const s = a.inv[i]; if (!s) return true; if (s.kind === 'heal' && s.hid === h.hid && s.count < HEALS[h.hid].stack) return true; }
  return false;
}
function botBestSlot(a, dist) {
  let best = -1, bs = -1;
  for (let i = 1; i < 6; i++) {
    const s = a.inv[i]; if (!s || s.kind !== 'weapon') continue;
    const t = WEAPONS[s.wid].type, d = dist;
    let sc = t === 'shotgun' ? (d < 10 ? 10 : d < 20 ? 4 : 0.2) : t === 'smg' ? (d < 18 ? 8 : d < 35 ? 5 : 1) : t === 'ar' ? (d < 8 ? 5 : d < 70 ? 9 : 7) :
      t === 'sniper' ? (d > 45 ? 10 : d > 22 ? 4 : 0.5) : t === 'rocket' ? (d > 8 && d < 70 ? 6.5 : 0) : 3;
    sc += s.rarity * 0.5 + (s.rarity >= 5 ? 2 : 0); if (s.mag <= 0) sc -= 2;
    if (sc > bs) { bs = sc; best = i; }
  }
  return best;
}
function hasHeal(a, kind) {
  for (let i = 1; i < 6; i++) { const s = a.inv[i]; if (s && s.kind === 'heal' && healUseful(a, s) && (kind === 'any' || (kind === 'sh' ? HEALS[s.hid].sh : HEALS[s.hid].hp))) return i; }
  return -1;
}
function zonePoint(frac) {
  const z = Storm.safe();
  for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * z.r * frac; const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r; if (groundH(x, zz) > W.waterY + 0.5 || i === 7) return { x, y: 0, z: zz }; }
}
function botAlert(t, src) {
  if (!t.ai || !src || !src.alive) return; const ai = t.ai;
  if (t.npc && ai.home && src.pos.distanceTo(ai.home) > 70) return;
  if (!ai.target || ai.target === src || !ai.target.alive || Math.random() < 0.5) { ai.target = src; ai.lastSeen = Match.time; ai.seen.copy(src.pos); ai.react = Math.min(ai.react, 0.25); ai.t = Math.min(ai.t, 0.08); }
}
function findLoot(a) {
  let best = null, bs = 1e9; const z = Storm.safe(), urgent = Storm.urgent();
  const ok = (x, zz) => !urgent || Math.hypot(x - z.x, zz - z.z) < z.r * 0.92;
  const lead = a.leader && a.leader.alive ? a.leader : null;
  for (const c of W.chests) {
    if (c.opened || c.noBot || c.falling || c.fails > 2 || (c.claim && c.claim !== a && c.claim.alive)) continue;
    if (lead && Math.hypot(c.x - lead.pos.x, c.z - lead.pos.z) > 30) continue;
    const d = Math.hypot(c.x - a.pos.x, c.z - a.pos.z) - (c.kind === 'supply' ? 30 : c.kind === 'exotic' ? 12 : 6);
    if (d < bs && d < 70 && ok(c.x, c.z)) { bs = d; best = { kind: 'chest', obj: c }; }
  }
  for (const p of Pickups.list) {
    if (!p.alive || p.fails > 2 || (p.claim && p.claim !== a && p.claim.alive)) continue;
    const k = p.item.kind; if (k !== 'weapon' && k !== 'heal') continue;
    const dx = p.x - a.pos.x, dz = p.z - a.pos.z; if (dx * dx + dz * dz > 2500) continue;
    if (k === 'weapon' ? !botWants(a, p.item) : !botWantsHeal(a, p.item)) continue;
    if (lead && Math.hypot(p.x - lead.pos.x, p.z - lead.pos.z) > 30) continue;
    const d = Math.sqrt(dx * dx + dz * dz); if (d < bs && ok(p.x, p.z)) { bs = d; best = { kind: 'pickup', obj: p }; }
  }
  if (best) {
    best.obj.claim = a; best.path = (best.obj.path || []).map(q => ({ x: q.x, y: q.y, z: q.z }));
    const o = best.obj;
    if (Math.hypot(o.x - a.pos.x, o.z - a.pos.z) < 8 && Math.abs(o.y - a.pos.y) < 1.5 && losClear(a.pos.x, a.pos.y + 1, a.pos.z, o.x, o.y + 0.5, o.z)) best.path = [];
  }
  return best;
}
function moveTo(a, p, dt, sprint) {
  const ai = a.ai, inp = a.input;
  let tx = p.x, tz = p.z;
  if (ai.detourT > 0) { ai.detourT -= dt; tx = ai.detour.x; tz = ai.detour.z; }
  const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.7 && ai.detourT <= 0) { inp.f = 0; inp.r = 0; return 'arrived'; }
  const w = Math.atan2(dx, dz); ai.wantYaw = w; ai.wantPitch = 0;
  const diff = w - a.yaw; inp.f = Math.cos(diff); inp.r = -Math.sin(diff); inp.sprint = sprint && d > 8;
  ai.stuckT += dt;
  if (ai.stuckT > 0.8) {
    const moved = Math.hypot(a.pos.x - ai.last.x, a.pos.z - ai.last.z); ai.last.copy(a.pos); ai.stuckT = 0;
    if (moved < 1.0 && !a.inWater) {
      ai.stuckN++; inp.jump = true;
      if (ai.stuckN >= 2) { const side = Math.random() < 0.5 ? 1 : -1, ang = w + side * (Math.PI / 2 + rnd(-0.5, 0.5)); ai.detour.set(a.pos.x + Math.sin(ang) * 7, 0, a.pos.z + Math.cos(ang) * 7); ai.detourT = 1.1; }
      if (ai.stuckN > 5) { ai.stuckN = 0; return 'stuck'; }
    } else ai.stuckN = 0;
  }
  return null;
}
function updateBot(a, dt) {
  const ai = a.ai, inp = a.input; inp.jump = false; inp.fire = false; inp.ads = false; inp.sprint = false;
  if (a.state === 'bus') { if (Match.time >= ai.jumpAt) busJump(a); return; }
  if (a.state === 'sky' || a.state === 'glide') {
    let tx = ai.drop.x, tz = ai.drop.z;
    if (a.leader && a.leader.alive && a.leader.state !== 'bus') { tx = a.leader.pos.x + ai.drop.x * 0.02; tz = a.leader.pos.z + ai.drop.z * 0.02; }
    const dx = tx - a.pos.x, dz = tz - a.pos.z, d = Math.hypot(dx, dz);
    a.yaw = Math.atan2(dx, dz); inp.f = d > 3 ? 1 : 0; inp.r = 0;
    if (a.state === 'sky' && a.pos.y - groundAt(a.pos.x, a.pos.z, a.pos.y) < ai.deployH) a.state = 'glide';
    return;
  }
  if (a.vehicle) { inp.f = 0; inp.r = 0; Vehicles.exit(a, false); return; }
  ai.buildCD -= dt; ai.switchCD -= dt; ai.healCD -= dt;
  ai.t -= dt;
  if (ai.t <= 0) { const far = player && a.pos.distanceToSquared(player.pos) > 230 * 230; ai.t = (far ? 0.7 : 0.26) + Math.random() * 0.15; botDecide(a); }
  inp.f = 0; inp.r = 0;
  if (a.useT > 0) { if (ai.mode === 'fight') { a.useT = 0; } else { lookAround(a, dt); return; } }
  switch (ai.mode) {
    case 'fight': botFight(a, dt); break;
    case 'zone': { const z = Storm.safe(); const p = ai.zonePt || (ai.zonePt = zonePoint(0.45)); if (moveTo(a, p, dt, true) || Math.hypot(a.pos.x - z.x, a.pos.z - z.z) < z.r * 0.55) { ai.zonePt = null; ai.mode = 'roam'; } break; }
    case 'loot': botLoot(a, dt); break;
    case 'heal': botHeal(a); break;
    case 'investigate': if (!ai.investigate || moveTo(a, ai.investigate, dt, true)) { ai.investigate = null; ai.mode = 'roam'; } break;
    case 'follow': { const l = a.leader; const d = Math.hypot(l.pos.x - a.pos.x, l.pos.z - a.pos.z); if (d > 9) moveTo(a, l.pos, dt, d > 16); else lookAround(a, dt); break; }
    case 'guard': { if (Math.hypot(ai.home.x - a.pos.x, ai.home.z - a.pos.z) > 5) moveTo(a, ai.home, dt, false); else lookAround(a, dt); break; }
    case 'flee': { const t = ai.target; if (t) { const ang = Math.atan2(a.pos.x - t.pos.x, a.pos.z - t.pos.z); moveTo(a, { x: a.pos.x + Math.sin(ang) * 10, z: a.pos.z + Math.cos(ang) * 10 }, dt, true); } break; }
    default: { if (!ai.roam || moveTo(a, ai.roam, dt, false) === 'arrived' || Math.random() < dt * 0.05) ai.roam = zonePoint(0.75); }
  }
  const turn = (ai.mode === 'fight' ? 2.5 + ai.skill * 5 : 6) * dt;
  a.yaw += clamp(angDiff(a.yaw, ai.wantYaw), -turn, turn);
  a.pitch += clamp(ai.wantPitch - a.pitch, -turn, turn);
}
function lookAround(a, dt) { const ai = a.ai; if (Math.random() < dt * 0.6) ai.wantYaw = a.yaw + rnd(-1.5, 1.5); ai.wantPitch = 0; }
function botDecide(a) {
  const ai = a.ai, now = Match.time;
  if (ai.target && (!ai.target.alive || ai.target.state === 'bus' || ai.target.state === 'sky')) ai.target = null;
  const range = a.npc ? 48 : (botHasType(a, 'sniper') ? 100 : 60);
  let best = null, bd = range * range;
  for (const o of actors) {
    if (o === a || !o.alive || o.team === a.team || o.state === 'bus' || o.state === 'sky' || o.vehicle) continue;
    const d2 = o.pos.distanceToSquared(a.pos); if (d2 < bd) { bd = d2; best = o; }
  }
  if (best) {
    const vis = losClear(a.pos.x, a.pos.y + 1.6 * a.scale, a.pos.z, best.pos.x, best.pos.y + 1.3, best.pos.z);
    if (vis) { if (ai.target !== best) { ai.react = 0.45 + (1 - ai.skill) * 0.7; ai.aimH = Math.random() < ai.skill * 0.3 ? 1.95 : 1.2; } ai.target = best; ai.lastSeen = now; ai.seen.copy(best.pos); }
  }
  if (ai.target && ai.target !== best && now - ai.lastSeen > 0.5) {
    const t = ai.target; if (losClear(a.pos.x, a.pos.y + 1.6 * a.scale, a.pos.z, t.pos.x, t.pos.y + 1.3, t.pos.z)) { ai.lastSeen = now; ai.seen.copy(t.pos); }
  }
  if (ai.target && now - ai.lastSeen > 5) ai.target = null;
  if (a.npc) {
    if (ai.target && ai.target.pos.distanceTo(ai.home) > 70) ai.target = null;
    ai.mode = ai.target ? 'fight' : 'guard'; return;
  }
  const slot = botBestSlot(a, 20), hasGun = slot >= 0;
  const z = Storm.safe(), dz = Math.hypot(a.pos.x - z.x, a.pos.z - z.z);
  const inStorm = Math.hypot(a.pos.x - Storm.cx, a.pos.z - Storm.cz) > Storm.r - 1;
  const needZone = (dz > z.r * 0.82 - 3 && (Storm.urgent() || inStorm)) || (inStorm && Storm.state !== 'idle');
  if (ai.target && hasGun && !(inStorm && a.hp < 45)) { ai.mode = 'fight'; return; }
  if (ai.target && !hasGun) {
    const d = ai.target.pos.distanceTo(a.pos);
    if (d < 3.5 && (a.lastAttacker === ai.target && now - a.lastDmgT < 2 || Math.random() < 0.15)) { ai.mode = 'fight'; return; }
    if (!needZone) {
      if (!ai.loot || ai.loot.done || (ai.loot.kind === 'chest' && ai.loot.obj.opened) || (ai.loot.kind === 'pickup' && !ai.loot.obj.alive)) ai.loot = findLoot(a);
      if (ai.loot) { ai.mode = 'loot'; return; }
      if (d < 18) { ai.mode = 'flee'; return; }
    }
  }
  if (needZone) { if (ai.mode !== 'zone') ai.zonePt = null; ai.mode = 'zone'; return; }
  if (((a.shield < 70 && hasHeal(a, 'sh') > 0) || (a.hp < 75 && hasHeal(a, 'hp') > 0)) && now - a.lastDmgT > 2.5 && ai.healCD <= 0) { ai.mode = 'heal'; return; }
  const c = invCount(a);
  if ((c.w < 2 || c.h < 1 || (c.w < 3 && Math.random() < 0.5)) && Storm.phase < 4) {
    if (!ai.loot || ai.loot.done || (ai.loot.kind === 'chest' && ai.loot.obj.opened) || (ai.loot.kind === 'pickup' && !ai.loot.obj.alive)) ai.loot = findLoot(a);
    if (ai.loot) { ai.mode = 'loot'; return; }
  }
  if (!ai.target) {
    for (const o of actors) {
      if (o === a || !o.alive || o.team === a.team || now - o.lastShotT > 1.5) continue;
      if (o.pos.distanceToSquared(a.pos) < 85 * 85) { ai.investigate = { x: o.pos.x + rnd(-6, 6), y: 0, z: o.pos.z + rnd(-6, 6) }; ai.mode = 'investigate'; return; }
    }
  }
  if (a.leader && a.leader.alive && a.leader.state === 'ground') { ai.mode = 'follow'; return; }
  if (ai.mode !== 'roam') ai.roam = null;
  ai.mode = 'roam';
}
function botHasType(a, t) { for (let i = 1; i < 6; i++) { const s = a.inv[i]; if (s && s.kind === 'weapon' && WEAPONS[s.wid].type === t) return true; } return false; }
function botLoot(a, dt) {
  const ai = a.ai, L = ai.loot;
  if (!L || L.done || (L.kind === 'chest' && L.obj.opened) || (L.kind === 'pickup' && !L.obj.alive)) { ai.loot = null; ai.mode = 'roam'; ai.t = 0; return; }
  const o = L.obj;
  if (L.path.length) {
    const q = L.path[0];
    if (Math.hypot(q.x - a.pos.x, q.z - a.pos.z) < 1.3 && Math.abs(q.y - a.pos.y) < 2.5) { L.path.shift(); return; }
    if (moveTo(a, q, dt, true) === 'stuck') { o.fails = (o.fails || 0) + 1; o.claim = null; ai.loot = null; ai.mode = 'roam'; }
    return;
  }
  const d = Math.hypot(o.x - a.pos.x, o.z - a.pos.z);
  if (d < 1.6 && Math.abs(o.y - a.pos.y) < 2.2) {
    a.input.f = 0; a.input.r = 0;
    if (L.kind === 'chest') { ai.openT += dt; if (ai.openT > 0.5) { openChest(o, a); ai.openT = 0; L.done = true; } }
    else { const it = o.item; Pickups.remove(o); botGive(a, [it], { x: o.x, y: o.y, z: o.z }); L.done = true; }
  } else {
    ai.openT = 0;
    if (moveTo(a, o, dt, d > 6) === 'stuck') { o.fails = (o.fails || 0) + 1; o.claim = null; ai.loot = null; ai.mode = 'roam'; }
  }
}
function botHeal(a) {
  const ai = a.ai;
  let s = -1;
  if (a.shield < 70) s = hasHeal(a, 'sh');
  if (s < 0 && a.hp < 75) s = hasHeal(a, 'hp');
  if (s < 0) { ai.mode = 'roam'; ai.healCD = 2; return; }
  if (a.slot !== s) { switchSlot(a, s); return; }
  if (a.useT <= 0 && a.fireCD <= 0) startUse(a);
  ai.healCD = 1;
}
function botFight(a, dt) {
  const ai = a.ai, t = ai.target, inp = a.input, now = Match.time;
  if (!t || !t.alive) { ai.target = null; ai.mode = 'roam'; return; }
  const visible = now - ai.lastSeen < 0.6;
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
  if (ai.switchCD <= 0) { const s = botBestSlot(a, dist); switchSlot(a, s >= 0 ? s : 0); ai.switchCD = 1.3; }
  const it = a.inv[a.slot];
  const ex = a.pos.x, ey = a.pos.y + 1.62 * a.scale, ez = a.pos.z;
  const lead = dist / 260;
  const ax = t.pos.x + t.vel.x * lead, ay = t.pos.y + ai.aimH * t.scale, az = t.pos.z + t.vel.z * lead;
  ai.wantYaw = Math.atan2(ax - ex, az - ez); ai.wantPitch = Math.atan2(ay - ey, Math.hypot(ax - ex, az - ez));
  if (!visible) {
    if (moveTo(a, ai.seen, dt, true) === 'arrived') ai.target = null;
    ai.wantYaw = Math.atan2(ax - ex, az - ez);
    if (now - a.lastDmgT > 2 && (a.shield < 50 || a.hp < 50) && hasHeal(a, 'any') > 0) { ai.mode = 'heal'; ai.target = null; }
    return;
  }
  const type = it && it.kind === 'weapon' ? WEAPONS[it.wid].type : 'melee';
  const pref = a.npc ? 18 : (PREF_RANGE[type] || 3);
  ai.strafeT -= dt; if (ai.strafeT <= 0) { ai.strafe = Math.random() < 0.8 ? -ai.strafe : ai.strafe; ai.strafeT = 0.5 + Math.random() * 1.2; }
  if (a.blocked && Math.random() < dt * 3) ai.strafe = -ai.strafe;
  const mf = dist > pref + 6 ? 1 : dist < pref - 4 ? -0.7 : 0;
  const w = Math.atan2(dx, dz), sm = a.npc && a.boss ? 0.3 : 0.85;
  const mx = Math.sin(w) * mf + Math.cos(w) * ai.strafe * sm, mz = Math.cos(w) * mf - Math.sin(w) * ai.strafe * sm;
  inp.f = mx * Math.sin(a.yaw) + mz * Math.cos(a.yaw); inp.r = -mx * Math.cos(a.yaw) + mz * Math.sin(a.yaw);
  if (a.npc && ai.home && Math.hypot(a.pos.x - ai.home.x, a.pos.z - ai.home.z) > 14) { const hw = Math.atan2(ai.home.x - a.pos.x, ai.home.z - a.pos.z); inp.f = Math.cos(hw - a.yaw); inp.r = -Math.sin(hw - a.yaw); }
  if (Math.random() < dt * 0.6 && !a.npc) inp.jump = true;
  ai.react -= dt;
  if (it && it.kind === 'weapon') {
    const st = wstat(it);
    if (ai.react <= 0 && dist <= st.range * 1.05) {
      const err = Math.abs(angDiff(a.yaw, ai.wantYaw)) + Math.abs(ai.wantPitch - a.pitch);
      if (err < (dist < 10 ? 0.3 : 0.08)) {
        if (ai.pauseT > 0) ai.pauseT -= dt;
        else { inp.fire = true; inp.ads = dist > 22; ai.burstT -= dt; if (ai.burstT <= 0) { ai.pauseT = 0.45 + Math.random() * 0.9; ai.burstT = 0.7 + Math.random() * 1.1; } }
      }
    }
  } else if (dist < 3.2) inp.fire = true;
  if (Match.build && !a.npc && ai.buildCD <= 0 && now - a.lastDmgT < 0.5 && MAT_ORDER.some(m => a.mats[m] >= 10) && Math.random() < 0.35 + ai.skill * 0.4 && player && a.pos.distanceToSquared(player.pos) < 170 * 170) {
    botBuildCover(a, t); ai.buildCD = 1.8 + Math.random() * 2.5;
  }
}
function botBuildCover(a, t) {
  const y0 = a.yaw, p0 = a.pitch; a.yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z); a.pitch = 0;
  const type = (t.pos.y > a.pos.y + 3 && Math.random() < 0.6) ? 'ramp' : 'wall';
  if (!a.mats[a.mat] || a.mats[a.mat] < 10) a.mat = MAT_ORDER.find(m => a.mats[m] >= 10) || 'wood';
  Build.place(a, Build.compute(a, type));
  if (type === 'ramp') a.input.f = 1;
  a.yaw = y0; a.pitch = p0;
}
