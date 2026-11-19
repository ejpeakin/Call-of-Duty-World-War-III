// =====================================================================
//  Loot: floor pickups, chests, inventory rules, interaction, vehicles
// =====================================================================
const _pkCache = {};
function pickupModel(it) {
  let key, build;
  if (it.kind === 'weapon') { key = 'w' + it.wid + it.rarity; build = () => { const g = gunModel(it, 0x2c2c33, true); g.scale.setScalar(1.25); return g; }; }
  else if (it.kind === 'heal') { key = 'h' + it.hid; build = () => { const g = heldModel(it.hid); g.scale.setScalar(1.7); return g; }; }
  else if (it.kind === 'ammo') { key = 'a' + it.ammo; build = () => { const g = new THREE.Group(); const m = new THREE.Mesh(GEO.unit, lam(AMMO[it.ammo].color)); m.scale.set(0.42, 0.26, 0.3); g.add(m); const s = new THREE.Mesh(GEO.unit, lam(0x2a2a30)); s.scale.set(0.44, 0.06, 0.32); s.position.y = 0.1; g.add(s); return g; }; }
  else if (it.kind === 'tag') { key = 'tag'; build = () => {
    const g = new THREE.Group(), card = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), new THREE.MeshBasicMaterial({ color: 0x3ff0d0 })); card.position.y = 0.25; g.add(card);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.07), new THREE.MeshBasicMaterial({ color: 0x0b2a30 })); band.position.y = 0.42; g.add(band);
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff })); dot.position.y = 0.14; g.add(dot);
    g.scale.setScalar(1.3); return g; }; }
  else { key = 'm' + it.mat; build = () => { const g = new THREE.Group(); const m = new THREE.Mesh(GEO.unit, MAT[it.mat]); m.scale.set(0.6, 0.18, 0.4); g.add(m); const m2 = m.clone(); m2.position.set(0.1, 0.18, 0.05); m2.rotation.y = 0.4; g.add(m2); return g; }; }
  if (!_pkCache[key]) _pkCache[key] = build();
  return _pkCache[key].clone();
}
function pickupMesh(it) {
  const g = new THREE.Group(); g.add(pickupModel(it));
  if (it.kind === 'weapon' || it.kind === 'heal' || it.kind === 'tag') {
    const r = itemRarity(it);
    const beam = new THREE.Mesh(GEO.beam, MAT.beam[r]); beam.position.y = -0.3; g.add(beam);
    const ring = new THREE.Mesh(GEO.ring, MAT.beam[r]); ring.position.y = -0.28; g.add(ring);
  }
  return g;
}

const Pickups = {
  list: [], byId: new Map(), nid: 0,
  clear() { for (const p of this.list) if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh); this.list = []; this.byId.clear(); this.nid = 0; this.pool.clear(); },
  spawn(item, x, y, z, o = {}) {
    // in a shared match the host owns the loot on the ground: guests ask for a drop instead of making one
    if (Net.guest && !Net.applying) { if (!Net.building) Net.emit({ k: 'drop', item, x, y, z, pop: o.pop ? [o.pop.x, o.pop.y + 1, o.pop.z] : 0 }); return { item, x, y, z, alive: false }; }
    const p = { item, x, y, z, alive: true, mesh: null, path: o.path ? o.path.slice() : null, claim: null, t: Math.random() * 6, fails: 0, age: 0, ttl: o.ttl || (item.kind === 'tag' ? TAG_TTL : 0), drop: !!(o.pop || o.drop), pop: o.pop ? { x: o.pop.x, y: o.pop.y + 1, z: o.pop.z } : null };
    p.id = o.id || ++this.nid; this.byId.set(p.id, p);
    this.list.push(p);
    if (Net.hosting && !Net.building) Net.emit({ k: 'pk+', id: p.id, item, x, y, z, pop: p.pop ? [p.pop.x, p.pop.y, p.pop.z] : 0, ttl: p.ttl });
    return p;
  },
  remove(p) {
    if (p.alive && p.id && Net.inMatch && !Net.applying) Net.emit({ k: Net.isHost ? 'pk-' : 'take', id: p.id });
    if (p.id) this.byId.delete(p.id);
    if (p.alive && p.item.kind === 'tag') Reboot.tagGone(p);
    p.alive = false; this.give(p); },
  // loot models are reused instead of rebuilt each time one comes into view (less garbage, fewer hitches)
  pool: new Map(),
  mkey(it) { return it.kind + ':' + (it.wid || it.hid || it.ammo || it.mat || '') + ':' + (it.rarity == null ? '' : it.rarity); },
  take(it) { const L = this.pool.get(this.mkey(it)); return (L && L.pop()) || pickupMesh(it); },
  give(p) {
    const m = p.mesh; if (!m) return; p.mesh = null; if (m.parent) m.parent.remove(m);
    const k = this.mkey(p.item); let L = this.pool.get(k); if (!L) this.pool.set(k, L = []); if (L.length < 6) L.push(m);
  },
  update(dt) {
    const cp = camera.position, p_time = performance.now() / 1000, pf = Perf.on;
    // 4 times a second: only the closest loot within range gets a 3D model (80 at most, 28 in Performance Mode)
    this.pt = (this.pt || 0) - dt;
    if (this.pt <= 0) {
      this.pt = 0.25; const cap = pf ? 28 : 80, rad = pf ? 70 : 115, near = this._near || (this._near = []); near.length = 0;
      for (const p of this.list) { if (!p.alive) continue; p._want = false; const d2 = (p.x - cp.x) ** 2 + (p.z - cp.z) ** 2; if (d2 < rad * rad) near.push(p), p._d2 = d2; }
      near.sort((a, b) => a._d2 - b._d2); for (let i = 0; i < near.length && i < cap; i++) near[i]._want = true;
    }
    // keep memory in check (the host or a solo game decides): loot dropped by players disappears after a while
    // when no real player is near it, and there is a hard cap on how much loot can lie around
    this.gc = (this.gc || 0) - dt;
    if (this.gc <= 0 && !Net.guest && Match.state === 'play') {
      this.gc = 2; const life = pf ? 90 : 150, cap = pf ? 380 : 560, people = actors.filter(a => !a.ai && a.alive);
      const watched = p => people.some(a => (a.pos.x - p.x) ** 2 + (a.pos.z - p.z) ** 2 < 45 * 45);
      for (const p of this.list) if (p.alive && p.drop && p.item.kind !== 'tag' && p.age > life && !watched(p)) this.remove(p);
      const alive = this.list.filter(p => p.alive && p.item.kind !== 'tag');
      if (alive.length > cap) { alive.sort((a, b) => (b.drop - a.drop) || (b.age - a.age)); let n = alive.length - cap; for (const p of alive) { if (n <= 0) break; if (!watched(p)) { this.remove(p); n--; } } }
    }
    for (const p of this.list) {
      if (!p.alive) continue; p.t += dt; p.age += dt;
      if (p.ttl && p.age > p.ttl) { this.remove(p); continue; }
      if (p._want) {
        if (!p.mesh) { p.mesh = this.take(p.item); W.group.add(p.mesh); }
        if (p.pop && p.age < 0.5) { const k = p.age / 0.5; p.mesh.position.set(lerp(p.pop.x, p.x, k), lerp(p.pop.y, p.y + 0.4, k) + Math.sin(k * Math.PI) * 1.6, lerp(p.pop.z, p.z, k)); }   // dropped loot bursts out of the eliminated player
        else p.mesh.position.set(p.x, p.y + 0.4 + Math.sin(p.t * 2) * 0.08, p.z);
        p.mesh.children[0].rotation.y = p.t * 0.9;
      } else if (p.mesh) this.give(p);
    }
    if (this.list.length > 700) this.list = this.list.filter(p => p.alive);
    // chests: skip drawing the far ones (they are a few pixels across beyond ~170 m)
    this.ct = (this.ct || 0) - dt;
    if (this.ct <= 0) { this.ct = 0.25; const cd = Math.min(pf ? 110 : 170, View.far + 10); for (const c of W.chests) if (c.mesh && !c.falling) { const d2 = (c.x - cp.x) ** 2 + (c.z - cp.z) ** 2; c.mesh.visible = d2 < cd * cd; } }
    // chests wobble, sparkle and spin a star until someone opens them; then the lid springs up
    for (const c of W.chests) {
      const m = c.mesh; if (!m || !m.visible || c.falling) continue; const u = m.userData, s0 = u.s0 || 1;
      if (c.opened) {
        if (u.openT == null || u.openT >= 1) continue;
        u.openT = Math.min(1, u.openT + dt / 0.5); const q = u.openT - 1, e = 1 + 2.70158 * q * q * q + 1.70158 * q * q;
        u.lid.rotation.x = -1.9 * e; m.position.y = c.y + Math.sin(u.openT * Math.PI) * 0.22; m.scale.setScalar(s0 * (1 + Math.sin(u.openT * Math.PI) * 0.12));
        continue;
      }
      const d2 = (c.x - cp.x) ** 2 + (c.z - cp.z) ** 2; if (d2 > (pf ? 40 * 40 : 75 * 75) || !View.sees(c.x, c.y + 0.8, c.z, 1.6)) continue;
      const t = p_time + c.x * 0.7, sq = Math.sin(t * 3.2);
      if (u.hitT > 0) { u.hitT = Math.max(0, u.hitT - dt); m.rotation.z = Math.sin(u.hitT * 60) * u.hitT * 0.5; } else if (m.rotation.z) m.rotation.z = 0;   // shot: a quick rattle
      m.scale.set(s0 * (1 - sq * 0.03), s0 * (1 + sq * 0.045), s0 * (1 - sq * 0.03));
      if (u.star) { u.star.rotation.y = t * 2.2; u.star.position.y = 1.3 + Math.sin(t * 2.4) * 0.09; u.star.scale.setScalar(0.85 + Math.sin(t * 5) * 0.15); u.lock.rotation.y = t * 1.5; }
      if (!pf && d2 < 35 * 35 && Math.random() < dt * 1.4) FX.burst(c.x + rnd(-0.6, 0.6), c.y + 0.5 + Math.random() * 0.9, c.z + rnd(-0.6, 0.6), c.kind === 'exotic' ? 0x9ffff5 : 0xfff0a0, 1, 0.5, 0.6, 0.06, 1);
    }
  },
};

// ---------------------------------------------------------------- inventory rules
function giveItem(a, it) {
  if (it.kind === 'ammo') { a.ammo[it.ammo] = Math.min(999, a.ammo[it.ammo] + it.count); return null; }
  if (it.kind === 'mats') { const add = Math.min(it.count, 999 - a.mats[it.mat]); a.mats[it.mat] += add; it.count -= add; return it.count > 0 ? it : null; }
  if (it.kind === 'heal') {
    const H = HEALS[it.hid];
    for (let i = 1; i < 6 && it.count > 0; i++) { const s = a.inv[i]; if (s && s.kind === 'heal' && s.hid === it.hid && s.count < H.stack) { const m = Math.min(H.stack - s.count, it.count); s.count += m; it.count -= m; } }
    if (it.count <= 0) return null;
    for (let i = 1; i < 6; i++) if (!a.inv[i]) { const c = Math.min(it.count, H.stack); a.inv[i] = { kind: 'heal', hid: it.hid, count: c }; it.count -= c; if (it.count <= 0) return null; }
    return it;
  }
  if (it.kind === 'weapon') { for (let i = 1; i < 6; i++) if (!a.inv[i]) { a.inv[i] = it; return null; } return it; }
  return it;
}
function weaponScore(w) { return w.rarity + ({ shock: 1.4, katana: 2.0, ar: 2.2, shotgun: 2.1, smg: 1.6, sniper: 1.5, rocket: 1.2, pistol: 0.4 }[WEAPONS[w.wid].type] || 1) + (w.rarity >= 5 ? 3 : 0); }
function botConsiderWeapon(a, w) {
  let same = -1, worst = -1, worstScore = 1e9, empty = -1, nW = 0;
  for (let i = 1; i < 6; i++) {
    const s = a.inv[i]; if (!s) { if (empty < 0) empty = i; continue; }
    if (s.kind !== 'weapon') continue; nW++;
    const sc = weaponScore(s); if (WEAPONS[s.wid].type === WEAPONS[w.wid].type) same = i; if (sc < worstScore) { worstScore = sc; worst = i; }
  }
  if (same >= 0) { if (weaponScore(w) > weaponScore(a.inv[same])) { const old = a.inv[same]; a.inv[same] = w; return old; } return w; }
  if (empty >= 0 && nW < 3) { a.inv[empty] = w; return null; }
  if (worst >= 0 && weaponScore(w) > worstScore) { const old = a.inv[worst]; a.inv[worst] = w; return old; }
  return w;
}
function botGive(a, items, dropAt) {
  for (const it of items) {
    let left;
    if (it.kind === 'weapon') left = botConsiderWeapon(a, it);
    else if (it.kind === 'ammo') left = null;
    else left = giveItem(a, it);
    if (left && dropAt && player && Math.hypot(dropAt.x - player.pos.x, dropAt.z - player.pos.z) < 110) Pickups.spawn(left, dropAt.x + rnd(-1, 1), dropAt.y, dropAt.z + rnd(-1, 1), { drop: true });
  }
  if (Math.random() < 0.7) a.mats[pick(MAT_ORDER)] += rndi(20, 50);
}

// ---------------------------------------------------------------- chests
function chestLoot(kind) {
  if (kind === 'ammo') { const k = pick(Object.keys(AMMO)), k2 = pick(Object.keys(AMMO)); const o = [{ kind: 'ammo', ammo: k, count: Math.round(AMMO[k].pick * 1.5) }, { kind: 'ammo', ammo: k2, count: AMMO[k2].pick }]; if (Math.random() < 0.25) o.push(rollHeal()); return o; }
  if (kind === 'exotic') { const id = pick(['frostbite', 'kicker']); return [makeWeapon(id, 6), ammoFor(id, 2.5)]; }
  if (kind === 'supply') {   // blue supply drop: the best loot on the island
    const roll = (t, not) => { let w; for (let i = 0; i < 8; i++) { w = rollWeapon(t); const ty = WEAPONS[w.wid].type; if (ty !== 'pistol' && ty !== not) break; } return w; };
    const w = roll([{ w: 1, r: 4 }]), w2 = roll(RAR_SUPPLY, WEAPONS[w.wid].type);   // one legendary for sure, plus a second epic-or-better gun of another kind (no pistols)
    return [w, w2, ammoFor(w.wid, 2.5), ammoFor(w2.wid, 2),
      { kind: 'heal', hid: 'shield', count: 3 }, { kind: 'heal', hid: 'mini', count: 6 }, { kind: 'heal', hid: 'medkit', count: 2 },
      ...MAT_ORDER.map(m => ({ kind: 'mats', mat: m, count: 150 }))];
  }
  const w = rollWeapon(RAR_CHEST); const o = [w, ammoFor(w.wid)];
  if (Math.random() < 0.7) o.push(rollHeal());
  if (Math.random() < 0.6) o.push({ kind: 'mats', mat: 'wood', count: 30 });
  return o;
}
// the opening moment: the lid springs up and the glow switches off
function chestPop(c) {
  const u = c.mesh.userData; u.openT = 0; u.lock.visible = false; if (u.star) u.star.visible = false; if (u.beam) u.beam.visible = false;
}
function openChest(c, a) {
  if (c.opened) return;
  if (Net.guest && !Net.applying) {   // the host opens it, so everyone sees the same loot
    if (c.asked > Match.time) return; c.asked = Match.time + 1.5; a.chests++; Net.emit({ k: 'chest', x: c.x, z: c.z });
    if (a === player && !Profile.ticket() && (Math.random() < TICKET_CHANCE || window.__forceTicket)) Ticket.found(c);
    if (a === player) ChestSkin.roll(c);
    return;
  }
  c.opened = true; c.claim = null; if (!Net.applying) a.chests++;
  chestPop(c);
  if (Net.hosting) Net.emit({ k: 'chest', x: c.x, z: c.z, by: a.id });
  if (Net.guest) { if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 110) { FX.burst(c.x, c.y + 0.8, c.z, c.kind === 'exotic' ? 0x2fe0d0 : 0xffd84a, 16, 3, 0.8, 0.12, -1); if (Sfx.vol(c.x, c.y, c.z) > 0.3) Sfx.chest(); } return; }
  const items = chestLoot(c.kind);
  if (c.katana) { c.katana = false; items.unshift(makeWeapon('katana', 4)); }   // one of this match's five Japanese Katanas
  const near = player && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 110;
  if (a === player || !a.ai) {
    const fx = Math.sin(c.rot || 0), fz = Math.cos(c.rot || 0);
    const per = 5;
    items.forEach((it, i) => { const row = Math.floor(i / per), inRow = Math.min(per, items.length - row * per), sp = (i % per - (inRow - 1) / 2) * 0.75, fd = 1.3 + row * 0.8; const x = c.x + fx * fd + fz * sp, z = c.z + fz * fd - fx * sp; Pickups.spawn(it, x, Math.max(c.y, groundAt(x, z, c.y + 0.6)), z); });
  } else botGive(a, items, near ? { x: c.x, y: c.y, z: c.z } : null);
  if (near) { FX.burst(c.x, c.y + 0.8, c.z, c.kind === 'exotic' ? 0x2fe0d0 : 0xffd84a, 16, 3, 0.8, 0.12, -1); if (Sfx.vol(c.x, c.y, c.z) > 0.3) Sfx.chest(); }
  if (a === player) HUD.dirty = true;
  // Music Concert Ticket: one per season, a tiny chance in any chest you open
  if (a === player && !Profile.ticket() && (Math.random() < TICKET_CHANCE || window.__forceTicket)) Ticket.found(c);
  // Play Carti: a 1 in 1,000 chest find, once per player
  if (a === player) ChestSkin.roll(c);
}
function playerTakePickup(p) {
  const it = p.item, a = player;
  if (it.kind === 'tag') { Reboot.take(a, p); return; }
  if (it.kind === 'weapon') {
    const left = giveItem(a, it);
    if (left) {
      const s = a.slot === 0 ? 1 : a.slot; const old = a.inv[s]; a.inv[s] = it; a.slot = s;
      if (old) Pickups.spawn(old, a.pos.x + Math.sin(a.yaw) * 1.2, a.pos.y, a.pos.z + Math.cos(a.yaw) * 1.2, { drop: true });
    } else if (a.slot === 0) { const idx = a.inv.indexOf(it); if (idx > 0) a.slot = idx; }
    Pickups.remove(p);
  } else if (it.kind === 'heal') {
    const left = giveItem(a, it);
    if (!left) Pickups.remove(p);
    else {
      const s = a.slot === 0 ? 1 : a.slot; const old = a.inv[s];
      if (old && !(old.kind === 'heal' && old.hid === it.hid)) { a.inv[s] = { kind: 'heal', hid: it.hid, count: Math.min(it.count, HEALS[it.hid].stack) }; it.count -= a.inv[s].count; Pickups.spawn(old, a.pos.x + Math.sin(a.yaw) * 1.2, a.pos.y, a.pos.z + Math.cos(a.yaw) * 1.2, { drop: true }); if (it.count <= 0) Pickups.remove(p); }
      else HUD.toast('No room for more ' + HEALS[it.hid].name);
    }
  } else { if (!giveItem(a, it)) Pickups.remove(p); }
  a.reloadT = 0; Sfx.pickup(); HUD.dirty = true;
}

// ---------------------------------------------------------------- interaction (player)
const Interact = {
  cur: null,
  find() {
    const a = player; this.cur = null;
    if (!a || !a.alive || a.state !== 'ground') return null;
    if (a.vehicle) { this.cur = { kind: 'exit', label: 'Leave vehicle', color: '#fff' }; return this.cur; }
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw); let best = null, bs = 1e9;
    const score = (x, y, z, r) => {
      const dx = x - a.pos.x, dz = z - a.pos.z, dy = y - a.pos.y; const d = Math.hypot(dx, dz);
      if (d > r || Math.abs(dy) > 2.2) return -1; const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      return d + (1 - facing) * 0.6;   // closer and in front ranks first; never negative (standing right on top of something counts)
    };
    for (const p of Pickups.list) {
      if (!p.alive || (p.item.kind === 'tag' && p.item.team !== a.team)) continue;
      const dx = p.x - a.pos.x, dz = p.z - a.pos.z; if (dx * dx + dz * dz > 9) continue;
      if (p.item.kind === 'ammo' || p.item.kind === 'mats') {
        if (dx * dx + dz * dz < 2.6 && Math.abs(p.y - a.pos.y) < 2) { const it = p.item; const left = giveItem(a, it); if (!left) Pickups.remove(p); Sfx.pickup(); HUD.dirty = true; HUD.toast('+' + itemName(it)); }
        continue;
      }
      const s = score(p.x, p.y, p.z, 2.6); if (s >= 0 && s < bs) { bs = s; best = { kind: 'pickup', obj: p }; }
    }
    for (const c of W.chests) { if (c.opened || c.falling) continue; const s = score(c.x, c.y, c.z, 2.8); if (s >= 0 && s < bs) { bs = s; best = { kind: 'chest', obj: c }; } }
    if (Reboot.on && a.tags && a.tags.length) for (const tw of Reboot.towers) { const s = score(tw.x, tw.y + 0.4, tw.z, 3.8); if (s >= 0 && s < bs) { bs = s; best = { kind: 'tower', obj: tw }; } }
    for (const v of Vehicles.list) { if (v.wrecked || v.driver) continue; const s = score(v.x, v.y, v.z, 3.4 * CAR_K); if (s >= 0 && s + 0.8 < bs) { bs = s + 0.8; best = { kind: 'car', obj: v }; } }
    if (best) {
      if (best.kind === 'pickup') { const it = best.obj.item; const full = it.kind === 'weapon' && a.inv.slice(1).every(Boolean); best.label = (full ? 'Swap for ' : 'Pick up ') + itemName(it); best.color = RARITY[itemRarity(it)].css; }
      else if (best.kind === 'tower') { const tw = best.obj; best.label = tw.cd > 0 ? 'Comeback Tower recharging \u00b7 ' + Math.ceil(tw.cd) + 's' : 'Bring back ' + a.tags.map(g => Reboot.nameOf(g)).join(' and '); best.color = tw.cd > 0 ? '#ff8a94' : '#3ff0d0'; }
      else if (best.kind === 'chest') { best.label = 'Open ' + { chest: 'Chest', ammo: 'Ammo Box', exotic: 'Exotic Crate', supply: 'Supply Drop' }[best.obj.kind]; best.color = best.obj.kind === 'exotic' ? RARITY[6].css : '#ffd84a'; }
      else { const ec = equippedCar(); best.label = ec && (best.obj.mesh.userData.kind || (best.obj.mesh.userData.premium ? 'midnight' : 'street')) !== ec ? 'Drive as ' + cosById('car', ec).name : 'Drive car'; best.color = ec ? '#ffe066' : '#9fd0ff'; }
    }
    this.cur = best; return best;
  },
  use() {
    const b = this.cur; if (!b) return;
    if (b.kind === 'exit') Vehicles.exit(player, false);
    else if (b.kind === 'pickup') playerTakePickup(b.obj);
    else if (b.kind === 'chest') { player.channel = { t: b.obj.kind === 'ammo' ? 0.25 : 0.45, dur: b.obj.kind === 'ammo' ? 0.25 : 0.45, label: 'Opening', obj: b.obj }; }
    else if (b.kind === 'car') Vehicles.enter(player, b.obj);
    else if (b.kind === 'tower' && b.obj.cd <= 0) player.channel = { t: REBOOT_TIME, dur: REBOOT_TIME, label: 'Bringing back ' + player.tags.map(g => Reboot.nameOf(g)).join(' and '), obj: b.obj, tower: true };
  },
};

// ---------------------------------------------------------------- vehicles (original logo-free sports car)
const CAR_CAT_COLORS = { 1: 0x111114, 2: 0x1b2633, 3: 0xb8bec6, 4: 0x9aa1aa, 5: 0x18181c, 6: 0x7d828a, 7: 0xe2541a, 8: 0xf2c418, 10: 0xfff3c4, 11: 0xff8a1a, 12: 0xff2030, 13: 0xffb020 };
const CarModel = {
  ready: false, base: null, glowG: null, wheels: [], variants: {}, mat: null, glowMat: null,
  dec(b64, Type) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Type(u.buffer); },
  geo(e) {
    const q = CAR_DATA.q, P = this.dec(e.p, Int16Array), N = this.dec(e.n, Int8Array), I = this.dec(e.i, Uint16Array);
    const pos = new Float32Array(P.length), nor = new Float32Array(N.length);
    for (let i = 0; i < P.length; i++) pos[i] = P[i] * q;
    for (let i = 0; i < N.length; i++) nor[i] = N[i] / 127;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(I, 1));
    g.userData.cat = this.dec(e.c, Uint8Array); g.computeBoundingSphere(); return g;
  },
  colorize(g, paint) {
    const C = g.userData.cat, col = new Float32Array(C.length * 3);
    for (let i = 0; i < C.length; i++) { _c1.setHex(C[i] === 0 ? paint : CAR_CAT_COLORS[C[i]]); col[i * 3] = _c1.r; col[i * 3 + 1] = _c1.g; col[i * 3 + 2] = _c1.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
  },
  init() {
    if (this.ready) return;
    this.base = this.geo(CAR_DATA.body); this.glowG = this.colorize(this.geo(CAR_DATA.glow), 0);
    this.wheels = CAR_DATA.wheels.map(w => ({ g: this.colorize(this.geo(w), 0), at: w.at, front: w.front }));
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.ready = true;
  },
  body(paint) {
    if (!this.variants[paint]) { const g = this.base.clone(); g.userData.cat = this.base.userData.cat; this.variants[paint] = this.colorize(g, paint); }
    return this.variants[paint];
  },
};
const CAR_K = 1.2;            // every car is drawn and collides 20% larger than the baked model
const PREMIUM_BLUE = 0x1d43b0;
// Premium shop car: the uploaded model with its badges removed. Always blue.
function buildPremiumCar() {
  CarModel.init();
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.rotation.order = 'YXZ'; body.scale.setScalar(CAR_K);
  const bm = new THREE.Mesh(CarModel.body(PREMIUM_BLUE), CarModel.mat); bm.castShadow = true; bm.receiveShadow = true; body.add(bm);
  body.add(new THREE.Mesh(CarModel.glowG, CarModel.glowMat));
  const wheels = [];
  for (const w of CarModel.wheels) {
    const p = new THREE.Group(); p.position.set(w.at[0], w.at[1], w.at[2]); p.rotation.order = 'YXZ'; p.userData.front = w.front;
    const m = new THREE.Mesh(w.g, CarModel.mat); m.castShadow = true; p.add(m); body.add(p); wheels.push(p);
  }
  g.userData = { wheels, body, bodyMesh: bm, premium: true };
  return g;
}
// Standard street car parked around the island (free, any colour).
const StreetParts = {};
function buildStreetCar(color) {
  const P = StreetParts;
  if (!P.ready) {
    Object.assign(P, {
      body: new THREE.BoxGeometry(2.1, 0.55, 4.5), hood: new THREE.BoxGeometry(1.96, 0.22, 1.55), cabin: new THREE.BoxGeometry(1.72, 0.6, 1.9),
      roof: new THREE.BoxGeometry(1.6, 0.08, 1.3), wing: new THREE.BoxGeometry(2.0, 0.07, 0.42), strut: new THREE.BoxGeometry(0.08, 0.32, 0.12),
      wheel: new THREE.CylinderGeometry(0.4, 0.4, 0.32, 14).rotateZ(Math.PI / 2), rim: new THREE.CylinderGeometry(0.22, 0.22, 0.34, 8).rotateZ(Math.PI / 2),
      light: new THREE.BoxGeometry(0.42, 0.14, 0.05), stripe: new THREE.BoxGeometry(0.04, 0.1, 3.6), splitter: new THREE.BoxGeometry(2.0, 0.08, 0.35),
      glass: new THREE.MeshLambertMaterial({ color: 0x1b2633, emissive: 0x0a1420 }), ready: true,
    });
  }
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.rotation.order = 'YXZ'; body.scale.setScalar(CAR_K);
  const paint = lam(color), paintMeshes = [];
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; body.add(m); if (mat === paint) paintMeshes.push(m); return m; };
  add(P.body, paint, 0, 0.62, 0); add(P.hood, paint, 0, 0.95, 1.38, -0.1); add(P.cabin, P.glass, 0, 1.18, -0.3); add(P.roof, paint, 0, 1.52, -0.38);
  add(P.splitter, lam(0x1a1a1e), 0, 0.36, 2.25);
  for (const sx of [-0.85, 0.85]) { add(P.strut, lam(0x1a1a1e), sx * 0.9, 1.04, -2.05); add(P.light, basic(0xfff3c4), sx * 0.75, 0.78, 2.26); add(P.light, basic(0xff2a3a), sx * 0.75, 0.82, -2.26); add(P.stripe, lam(0xf4f4f4), sx * 1.24, 0.72, 0); }
  add(P.wing, lam(0x1a1a1e), 0, 1.22, -2.05);
  const wheels = [];
  for (const [x, z] of [[-1.02, 1.45], [1.02, 1.45], [-1.02, -1.45], [1.02, -1.45]]) {
    const w = new THREE.Group(); w.position.set(x, 0.4, z); w.rotation.order = 'YXZ'; w.userData.front = z > 0; body.add(w);
    const t = new THREE.Mesh(P.wheel, lam(0x18181c)); t.castShadow = true; w.add(t); w.add(new THREE.Mesh(P.rim, lam(0xb8bec6))); wheels.push(w);
  }
  g.userData = { wheels, body, paintMeshes, premium: false };
  return g;
}
// Stretch limousine (shop): gloss black, chrome trim, tinted glass with a lit cream-leather interior. Car units x CAR_K.
let _limoParts = null;
function buildLimo() {
  if (!_limoParts) {
    const L = [], G = [], paint = 0x0b0b0f, chrome = 0xd8dde4, trim = 0x16161a, tyre = 0x141416, leather = 0xe8dcc4;
    const B = (w, h, d, x, y, z, hex, rx = 0, list = L) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); list.push([g, hex]); };
    const HL = 3.6;   // half length (car units)
    // body: long lower body with rounded ends, sills, hood and trunk
    B(2.02, 0.5, 2 * HL - 0.4, 0, 0.6, 0, paint); B(1.92, 0.42, 0.3, 0, 0.6, HL - 0.05, paint); B(1.92, 0.42, 0.3, 0, 0.6, -HL + 0.05, paint);
    B(2.06, 0.12, 2 * HL - 1.6, 0, 0.36, 0, trim);                                                     // rocker panels
    B(1.96, 0.16, 1.55, 0, 0.92, HL - 0.95, paint, -0.06); B(1.96, 0.14, 1.15, 0, 0.9, -HL + 0.72, paint, 0.05);   // hood, trunk lid
    for (const sx of [-1, 1]) for (const z of [2.55, -2.62]) { const g = new THREE.CylinderGeometry(0.53, 0.53, 0.08, 18, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); g.translate(sx * 1.0, 0.44, z); L.push([g, trim]); }   // wheel arches
    // cabin: pillars, roof with a sunroof, tinted glass all round
    const cz0 = -HL + 1.45, cz1 = HL - 1.85, cy = 1.24, roofY = 1.58;
    B(1.86, 0.08, cz1 - cz0, 0, roofY, (cz0 + cz1) / 2, paint); B(1.7, 0.05, cz1 - cz0 - 0.3, 0, roofY + 0.05, (cz0 + cz1) / 2, paint);
    B(0.9, 0.02, 1.1, 0, roofY + 0.085, -0.4, 0x10161e);                                                // sunroof glass
    B(0.04, 0.03, 0.9, 0.55, roofY + 0.09, -2.3, trim);                                                  // shark-fin antenna base
    for (const sx of [-1, 1]) {
      for (const z of [cz1, 1.25, 0.05, -1.15, cz0]) B(0.06, roofY - 0.86, 0.13, sx * 0.93, (roofY + 0.86) / 2, z, paint);   // A/B/C/D pillars between the windows
      B(0.03, 0.035, cz1 - cz0, sx * 1.015, 0.87, (cz0 + cz1) / 2, chrome);                                // belt-line chrome
      B(0.02, 0.03, cz1 - cz0 - 0.1, sx * 0.95, roofY - 0.04, (cz0 + cz1) / 2, chrome);                    // window-top chrome
      for (const z of [1.7, 0.6, -0.55, -1.75]) B(0.04, 0.035, 0.18, sx * 1.02, 0.75, z, chrome);         // door handles
      for (const z of [1.18, -0.02, -1.22]) B(0.012, 0.42, 0.012, sx * 1.012, 0.62, z, trim);              // door seams
      B(0.18, 0.1, 0.06, sx * 1.1, 1.0, cz1 - 0.1, chrome); B(0.12, 0.06, 0.03, sx * 1.04, 1.0, cz1 - 0.08, trim);   // mirrors
    }
    for (const sx of [-1, 1]) B(0.02, 0.6, cz1 - cz0, sx * 0.94, cy, (cz0 + cz1) / 2, 0x0c1218, 0, G);      // side glass
    { const g = new THREE.BoxGeometry(1.8, 0.66, 0.03); g.rotateX(-0.62); g.translate(0, 1.25, cz1 + 0.28); G.push([g, 0x0c1218]); }   // windscreen
    { const g = new THREE.BoxGeometry(1.8, 0.62, 0.03); g.rotateX(0.7); g.translate(0, 1.24, cz0 - 0.26); G.push([g, 0x0c1218]); }    // rear window
    // nose: chrome grille with vertical bars, bumpers, lights
    B(1.1, 0.34, 0.06, 0, 0.66, HL + 0.11, chrome); for (let i = 0; i < 9; i++) B(0.025, 0.28, 0.07, -0.44 + i * 0.11, 0.66, HL + 0.12, 0x1a1a1e);
    B(2.0, 0.12, 0.14, 0, 0.38, HL + 0.12, chrome); B(2.0, 0.12, 0.14, 0, 0.4, -HL - 0.12, chrome);
    B(0.06, 0.12, 0.06, 0, 0.88, HL + 0.06, chrome);                                                      // hood ornament
    for (const sx of [-1, 1]) { B(0.12, 0.08, 0.1, sx * 0.6, 0.3, -HL - 0.08, chrome); }                // twin exhaust tips
    // interior: cream leather bench seats facing each other, a bar, purple mood light
    B(1.6, 0.32, 0.55, 0, 0.98, 1.5, leather); B(1.6, 0.45, 0.14, 0, 1.18, 1.2, leather);
    B(0.5, 0.3, 2.0, 0.6, 0.98, -0.2, leather); B(0.14, 0.45, 2.0, 0.84, 1.18, -0.2, leather);
    B(1.6, 0.32, 0.55, 0, 0.98, -1.75, leather); B(1.6, 0.45, 0.14, 0, 1.18, -2.05, leather);
    B(0.5, 0.42, 1.4, -0.62, 1.03, -0.1, 0x2a1810); B(0.48, 0.03, 1.36, -0.62, 1.25, -0.1, 0x8a8f9a);   // bar
    const merge = list => { const P = [], N = [], C = [], c = new THREE.Color(); for (const [g0, hex] of list) { const g = g0.index ? g0.toNonIndexed() : g0; c.setHex(hex); const pa = g.attributes.position.array, na = g.attributes.normal.array; for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2]); N.push(na[i], na[i + 1], na[i + 2]); C.push(c.r, c.g, c.b); } if (g !== g0) g.dispose(); g0.dispose(); } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); out.computeBoundingSphere(); return out; };
    const glow = [];
    for (const sx of [-1, 1]) { B(0.42, 0.11, 0.04, sx * 0.68, 0.74, HL + 0.14, 0xfff6dc, 0, glow); B(0.14, 0.06, 0.04, sx * 0.94, 0.62, HL + 0.12, 0xffb02e, 0, glow); B(0.5, 0.09, 0.04, sx * 0.66, 0.76, -HL - 0.14, 0xff1a2a, 0, glow); }
    B(1.5, 0.025, 0.025, 0, 1.5, -0.2, 0xb35cff, 0, glow);   // mood light along the ceiling
    const wheel = []; { const t = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 22); t.rotateZ(Math.PI / 2); wheel.push([t, tyre]); const r = new THREE.CylinderGeometry(0.3, 0.3, 0.36, 20); r.rotateZ(Math.PI / 2); wheel.push([r, chrome]); for (let i = 0; i < 6; i++) { const s = new THREE.BoxGeometry(0.37, 0.05, 0.42); s.rotateX(i / 6 * Math.PI); wheel.push([s, 0xaab0b8]); } const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.38, 12); hub.rotateZ(Math.PI / 2); wheel.push([hub, chrome]); }
    _limoParts = { body: merge(L), glass: merge(G), glow: merge(glow), wheel: merge(wheel),
      paint: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 95, specular: 0x777777 }),
      glassMat: new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, opacity: 0.62, shininess: 120, specular: 0x9aa6b4, depthWrite: false }),
      glowMat: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  }
  const P = _limoParts, g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.rotation.order = 'YXZ'; body.scale.setScalar(CAR_K);
  const bm = new THREE.Mesh(P.body, P.paint); bm.castShadow = true; bm.receiveShadow = true; body.add(bm);
  const gm = new THREE.Mesh(P.glass, P.glassMat); gm.renderOrder = 2; body.add(gm); body.add(new THREE.Mesh(P.glow, P.glowMat));
  const wheels = [];
  for (const [x, z] of [[-1.0, 2.55], [1.0, 2.55], [-1.0, -2.62], [1.0, -2.62]]) { const w = new THREE.Group(); w.position.set(x, 0.46, z); w.rotation.order = 'YXZ'; w.userData.front = z > 0; const m = new THREE.Mesh(P.wheel, P.paint); m.castShadow = true; w.add(m); body.add(w); wheels.push(w); }
  g.userData = { wheels, body, paintMeshes: [bm], premium: true, kind: 'limo', halfLen: 3.75 };
  return g;
}
// which special car the player has equipped (and owns), if any
function equippedCar() { const id = Profile.d.eq.car; return id !== 'street' && Profile.unlocked(cosById('car', id)) ? id : null; }
function buildCarModel(id) { return id === 'limo' ? buildLimo() : buildPremiumCar(); }
function playerHasPremiumCar() { return !!equippedCar(); }
const Vehicles = {
  list: [],
  clear() { for (const v of this.list) { if (v.mesh.parent) v.mesh.parent.remove(v.mesh); } this.list = []; },
  add(c) {
    const mesh = buildStreetCar(c.color); W.group.add(mesh);
    const v = { x: c.x, y: c.y, z: c.z, yaw: c.rot, pitch: 0, speed: 0, vy: 0, mesh, hp: 420, driver: null, wrecked: false, col: null, spin: 0, steer: 0 };
    this.makeCol(v); this.sync(v); this.list.push(v); return v;
  },
  makeCol(v) {
    if (v.col) Grid.remove(v.col);
    const hl = v.mesh.userData.halfLen || 2.25, s = Math.abs(Math.sin(v.yaw)), c = Math.abs(Math.cos(v.yaw)); const hx = (1.05 * c + hl * s) * CAR_K, hz = (1.05 * s + hl * c) * CAR_K;
    v.col = Grid.add({ minX: v.x - hx, maxX: v.x + hx, minZ: v.z - hz, maxZ: v.z + hz, minY: v.y, maxY: v.y + 1.55 * CAR_K, kind: 'static', mat: 'metal' });
    v.col.harv = { kind: 'car', vehicle: v, mat: 'metal', yield: 8 };
  },
  sync(v) { v.mesh.position.set(v.x, v.y, v.z); v.mesh.rotation.set(v.pitch, v.yaw, 0, 'YXZ'); for (const w of v.mesh.userData.wheels) w.rotation.set(v.spin, w.userData.front ? -v.steer * 0.45 : 0, 0, 'YXZ'); },
  damage(v, d) { if (v.wrecked) return; v.hp -= d; if (v.hp <= 0) this.wreck(v); },
  wreck(v) {
    v.wrecked = true; v.speed = 0;
    FX.flash(v.x, v.y + 1, v.z, 5, 0xff8a3d, 0.6); FX.burst(v.x, v.y + 1, v.z, 0x333333, 24, 6, 1.2, 0.3, -1); Sfx.boom(v.mesh.position.x, v.y, v.z);
    const u = v.mesh.userData; if (u.kind === 'limo') u.paintMeshes.forEach(m => { m.material = lam(0x2a2624); }); else if (u.premium) u.bodyMesh.geometry = CarModel.body(0x2a2624); else u.paintMeshes.forEach(m => { m.material = lam(0x2a2624); });
    if (v.driver) { const d = v.driver; this.exit(d, false); damageActor(d, 30, null, { raw: true }); }
  },
  blast(x, y, z, r, dmg) { for (const v of this.list) { const d = Math.hypot(v.x - x, v.y - y, v.z - z); if (d < r) this.damage(v, dmg * (1 - d / r * 0.5)); } },
  enter(a, v) {
    if (v.driver || v.wrecked) return;
    v.driver = a; a.vehicle = v; a.emote = null; a.useT = 0; a.reloadT = 0; a.vel.set(0, 0, 0);
    const want = a === player ? equippedCar() : null;
    if (want && (v.mesh.userData.kind || (v.mesh.userData.premium ? 'midnight' : 'street')) !== want) {
      const parent = v.mesh.parent; if (parent) parent.remove(v.mesh); v.mesh = buildCarModel(want); W.group.add(v.mesh); this.sync(v); this.makeCol(v);
      FX.burst(v.x, v.y + 1.2, v.z, want === 'limo' ? 0xb35cff : 0x3a7bff, 26, 5, 0.8, 0.16, -1); Sfx.chest();
    }
    if (a === player) { Build.active = false; HUD.dirty = true; HUD.toast('W/S drive · A/D steer · Space brake · E leave'); Sfx.tone(120, 0.4, 'sawtooth', 0.12, 60); }
  },
  exit(a, dead) {
    const v = a.vehicle; if (!v) return; v.driver = null; a.vehicle = null;
    if (dead) return;
    const sx = -Math.cos(v.yaw), sz = Math.sin(v.yaw);
    for (const side of [1, -1]) {
      const x = v.x + sx * 1.9 * CAR_K * side, z = v.z + sz * 1.9 * CAR_K * side, y = groundAt(x, z, v.y + 1.5);
      if (bodyFree(x, z, y, 1.9)) { a.pos.set(x, y, z); break; }
      a.pos.set(v.x, v.y + 1.7, v.z);
    }
    a.vel.set(0, 0, 0); a.state = 'ground'; a.onGround = false;
    if (a === player) HUD.dirty = true;
  },
  update(dt) {
    const cp = camera.position;
    const cd = Math.min(Perf.on ? 90 : 160, View.far + 10), cd2 = cd * cd;   // each car is ~20 parts: far ones are not drawn
    for (const v of this.list) v.mesh.visible = (v.x - cp.x) ** 2 + (v.z - cp.z) ** 2 < cd2;
    for (const v of this.list) {
      const d = v.driver;
      if (!d && Math.abs(v.speed) < 0.05 && v.vy === 0) continue;
      if (d && d.alive && !v.wrecked) {
        const inp = d.input; const thr = inp.f;
        v.speed += thr * (thr * v.speed < 0 ? 34 : 15) * dt;
        if (Math.abs(thr) < 0.1) v.speed *= 1 - 0.9 * dt;
        if (inp.jump) v.speed *= 1 - 3.2 * dt;
        v.yaw -= inp.r * clamp(Math.abs(v.speed) / 7, 0, 1) * 1.9 * dt * Math.sign(v.speed || 1);
        v.steer = lerp(v.steer, inp.r, Math.min(1, dt * 8));
      } else v.speed *= 1 - 1.5 * dt;
      const inWater = v.y < W.waterY - 0.6; v.speed = clamp(v.speed, -10, inWater ? 4 : 31);
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), nx = v.x + fx * v.speed * dt, nz = v.z + fz * v.speed * dt;
      // obstacles: two circles along the car
      let blocked = false;
      const hl = v.mesh.userData.halfLen || 2.25, offs = hl > 3 ? [2.7 * CAR_K, 0, -2.7 * CAR_K] : [1.3 * CAR_K, -1.3 * CAR_K];
      for (const off of offs) {
        const cx = nx + fx * off, cz = nz + fz * off, r = 1.12 * CAR_K;
        Grid.query(cx - r, cz - r, cx + r, cz + r, _cands2);
        for (const c of _cands2) {
          if (c.dead || c === v.col || c.kind === 'ramp') continue;
          if (c.maxY <= v.y + 0.9 || c.minY >= v.y + 1.5 * CAR_K) continue;
          const px = clamp(cx, c.minX, c.maxX), pz = clamp(cz, c.minZ, c.maxZ), dA = (cx - px) ** 2 + (cz - pz) ** 2;
          if (dA < r * r) {
            // already overlapping (e.g. a long car swapped in between houses): let it drive out, never further in
            const bx = v.x + fx * off, bz = v.z + fz * off, qx = clamp(bx, c.minX, c.maxX), qz = clamp(bz, c.minZ, c.maxZ), dB = (bx - qx) ** 2 + (bz - qz) ** 2;
            if (dB < r * r && dA >= dB - 1e-4) continue;
            blocked = true; break;
          }
        }
        if (blocked) break;
      }
      if (blocked) { if (Math.abs(v.speed) > 12) { this.damage(v, Math.abs(v.speed) * 2.5); if (d === player) Cam.shake = 0.4; if (Sfx.vol(v.x, v.y, v.z) > 0.2) Sfx.noise(0.25, 300, 1, 0.5, 'lowpass'); } v.speed *= -0.25; }
      else { v.x = clamp(nx, -W.half + 5, W.half - 5); v.z = clamp(nz, -W.half + 5, W.half - 5); }
      const g = groundAt(v.x, v.z, v.y + 0.9, 0.9, v.col);
      if (g >= v.y - 0.05) { v.y = g; v.vy = 0; } else { v.vy -= GRAV * dt; v.y += v.vy * dt; if (v.y <= g) { v.y = g; v.vy = 0; } }
      if (inWater) { v.y = Math.max(v.y, W.waterY - 0.6); v.vy = 0; }
      const L = (hl > 3 ? 2.6 : 1.6) * CAR_K, hf = groundAt(v.x + fx * L, v.z + fz * L, v.y + 1, 0.3, v.col), hb = groundAt(v.x - fx * L, v.z - fz * L, v.y + 1, 0.3, v.col);
      v.pitch = lerp(v.pitch, -clamp(Math.atan2(hf - hb, 2 * L), -0.5, 0.5), Math.min(1, dt * 8));
      if (!Number.isFinite(v.x + v.y + v.z + v.speed + v.pitch)) { v.speed = 0; v.vy = 0; v.pitch = 0; v.x = clamp(v.x || 0, -W.half, W.half); v.z = clamp(v.z || 0, -W.half, W.half); v.y = topSurface(v.x, v.z); }
      v.spin += v.speed * dt / (0.4 * CAR_K);
      this.sync(v); this.makeCol(v);
      if (d) {
        d.pos.set(v.x, v.y + 0.45, v.z); d.vel.set(fx * v.speed, 0, fz * v.speed); d.onGround = true;
        if (Math.abs(v.speed) > 7) for (const o of actors) {
          if (o === d || !o.alive || o.vehicle || o.state !== 'ground' || o.team === d.team) continue;
          if (Math.hypot(o.pos.x - v.x, o.pos.z - v.z) < (hl > 3 ? 3.6 : 2.3) * CAR_K && Math.abs(o.pos.y - v.y) < 2) {
            damageActor(o, Math.abs(v.speed) * 2.2, d, { w: 'Car', x: o.pos.x, y: o.pos.y + 2, z: o.pos.z });
            o.vel.set(fx * v.speed * 0.6, 7, fz * v.speed * 0.6); o.onGround = false; v.speed *= 0.6;
          }
        }
      }
    }
  },
};

// ---------------------------------------------------------------- the 1 in 1,000 chest skin (Play Carti)
const ChestSkin = {
  roll(c) {
    if (Match.mode === 'tutorial' || Profile.d.owned['outfit:' + CHEST_SKIN]) return;   // once per player
    if (!(Math.random() < CHEST_SKIN_CHANCE || window.__forceSkin)) return;
    window.__forceSkin = false;
    Profile.d.owned['outfit:' + CHEST_SKIN] = true; Profile.d.chestSkinAt = Date.now(); Profile.save();
    for (let i = 0; i < 4; i++) setTimeout(() => FX.burst(c.x, c.y + 1 + i * 0.4, c.z, i % 2 ? 0xd0101e : 0x111111, 26, 6, 1.1, 0.16, -2), i * 120);
    HUD.banner('Something rare is inside...', '', 1.2);
    setTimeout(() => this.show(), 800);
  },
  show() {
    const it = cosById('outfit', CHEST_SKIN); $('sfName').textContent = it.name; $('sfRar').textContent = RARITY[it.r].name + ' outfit';
    if (!$('ticket').hidden) { setTimeout(() => this.show(), 600); return; }   // never on top of the ticket reveal
    if (Match.state === 'play') { Match.paused = true; if (document.pointerLockElement) document.exitPointerLock(); }
    $('skinFind').hidden = false; Sfx.init();
    [392, 466, 587, 698, 587, 784, 932].forEach((f, i) => Sfx.tone(f, i === 6 ? 0.8 : 0.2, 'sawtooth', 0.09, 0, 0.25 + i * 0.13));
    [196, 233, 294].forEach(f => Sfx.tone(f, 1.3, 'sine', 0.08, 0, 1.1));
  },
  close(equip) {
    if (equip) { Profile.d.eq.outfit = CHEST_SKIN; Profile.save(); }
    $('skinFind').hidden = true; if (Match.state === 'play') Match.paused = false; HUD.dirty = true;
    if (equip && Match.state === 'play') HUD.banner('Equipped', 'You will wear it from your next match', 2.2);
  },
};

// ---------------------------------------------------------------- the Music Concert Ticket reveal
const Ticket = {
  found(c) {
    window.__forceTicket = false;
    Profile.d.ticketSeason = Season.id(); Profile.save();
    for (let i = 0; i < 4; i++) setTimeout(() => FX.burst(c.x, c.y + 1 + i * 0.4, c.z, i % 2 ? 0xff7ae0 : 0xffd84a, 26, 6, 1.1, 0.16, -2), i * 120);
    HUD.banner('Something golden is inside...', '', 1.2);
    setTimeout(() => this.show(), 700);
  },
  show() {
    const dl = Season.daysLeft();
    $('tkSeason').textContent = Season.name();
    $('tkDesc').textContent = 'Everything in the Item Shop is yours until ' + Season.name() + ' ends — ' + (dl === 1 ? '1 day' : dl + ' days') + ' left. Equip any skin, glider, wrap or car from your Locker.';
    const conf = $('tkConf'); conf.innerHTML = '';
    const cols = ['#ffd84a', '#ff7ae0', '#7fd8ff', '#ffffff', '#ff8a3c', '#9b6bff'];
    for (let i = 0; i < 70; i++) { const e = document.createElement('i'); e.style.left = (Math.random() * 100) + 'vw'; e.style.background = cols[i % cols.length]; e.style.animationDuration = (2.6 + Math.random() * 3) + 's'; e.style.animationDelay = (-Math.random() * 5) + 's'; e.style.transform = 'rotate(' + Math.random() * 360 + 'deg)'; conf.appendChild(e); }
    if (Match.state === 'play') { Match.paused = true; if (document.pointerLockElement) document.exitPointerLock(); }
    $('ticket').hidden = false; Sfx.init();
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => Sfx.tone(f, i === 6 ? 0.7 : 0.2, 'triangle', 0.16, 0, 0.25 + i * 0.13));
    [262, 330, 392].forEach(f => Sfx.tone(f, 1.2, 'sine', 0.08, 0, 1.1));
  },
  close() { $('ticket').hidden = true; if (Match.state === 'play') Match.paused = false; HUD.dirty = true; },
};
