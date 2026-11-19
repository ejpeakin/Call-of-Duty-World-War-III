// =====================================================================
//  Actors: data, poses, instanced bot bodies, cosmetic player rig
// =====================================================================
const actors = []; let player = null; let nextId = 1;
const NAME_A = ['Turbo', 'Pixel', 'Rusty', 'Neon', 'Sly', 'Mega', 'Frosty', 'Lucky', 'Silent', 'Wild', 'Cosmic', 'Salty', 'Captain', 'Sneaky', 'Goofy', 'Shadow', 'Blaze', 'Mossy', 'Quantum', 'Sir', 'Dizzy', 'Crispy', 'Atomic', 'Velvet'];
const NAME_B = ['Otter', 'Llama', 'Noodle', 'Falcon', 'Badger', 'Taco', 'Wizard', 'Moose', 'Panda', 'Comet', 'Pickle', 'Viper', 'Yeti', 'Gecko', 'Ninja', 'Biscuit', 'Raccoon', 'Kraken', 'Waffle', 'Lynx', 'Muffin', 'Ferret', 'Toucan', 'Walrus'];
const usedNames = new Set();   // names already in this match (lower case), so every name is used once
function botName() {
  for (let k = 0; k < 60; k++) { let n = pick(NAME_A) + pick(NAME_B); if (Math.random() < 0.45 || k > 20) n += rndi(1, 99); if (!usedNames.has(n.toLowerCase())) { usedNames.add(n.toLowerCase()); return n; } }
  let n; do { n = 'Player' + rndi(100, 9999); } while (usedNames.has(n.toLowerCase())); usedNames.add(n.toLowerCase()); return n;
}

function newActor(o) {
  const a = {
    id: nextId++, name: 'Player', team: 0, isPlayer: false, npc: false, boss: false, alive: true,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0,
    hp: 100, maxHp: 100, shield: 0, over: 0, overMax: 0,
    state: 'bus', onGround: false, inWater: false, height: 1.9, radius: 0.42, scale: 1,
    inv: [{ kind: 'pick' }, null, null, null, null, null], slot: 0,
    ammo: { light: 0, medium: 0, heavy: 0, shells: 0, rockets: 0 }, mats: { wood: 0, brick: 0, metal: 0 }, mat: 'wood',
    kills: 0, dmgDealt: 0, fireCD: 0, reloadT: 0, useT: 0, useDur: 0, pickCD: 0, pickAnim: 0, slowT: 0, mantleT: 0,
    lastDmgT: -99, lastAttacker: null, walkPhase: 0, emote: null, emoteT: 0, chests: 0, aliveTime: 0, blocked: false, blockTop: 0,
    input: { f: 0, r: 0, jump: false, sprint: false, fire: false, ads: false }, look: null, ri: -1, ai: null,
    respawnT: 0, vehicle: null, invuln: 0, placement: 0, jumpCD: 0, mantleCD: 0, landT: 0, lastShotT: -99, mFrom: 0, mTo: 0, mdx: 0, mdz: 0, _gk: null,
  };
  return Object.assign(a, o);
}

// ---------------------------------------------------------------- poses (shared by instanced bots and the player rig)
const POSE = { body: 0, bob: 0, legL: [0, 0], legR: [0, 0], aL: [0, 0, 0], aR: [0, 0, 0], kL: 0, kR: 0, eL: 0, eR: 0, head: 0, twist: 0, gun: false, pick: false, glider: false, held: null };
function emotePose(id, t, P) {
  const s = Math.sin(t * 6);
  if (id === 'groove') { P.twist = s * 0.35; P.bob = Math.abs(s) * 0.1; P.aL[0] = -2.2 + s * 0.6; P.aR[0] = -2.2 - s * 0.6; P.aL[2] = 0.3; P.aR[2] = -0.3; P.eL = P.eR = -0.9; P.legL[0] = s * 0.3; P.legR[0] = -s * 0.3; P.kL = 0.3 + Math.max(0, s) * 0.5; P.kR = 0.3 + Math.max(0, -s) * 0.5; P.head = s * 0.15; }
  else if (id === 'robot') { const k = Math.floor(t * 4) % 4; P.twist = [0.4, 0, -0.4, 0][k]; P.aL[0] = -Math.PI / 2; P.eL = -Math.PI / 2; P.aR[0] = [-Math.PI / 2, -0.2, -Math.PI / 2, -2.8][k]; P.eR = [-Math.PI / 2, -0.1, -Math.PI / 2, 0][k]; P.aR[2] = [0, -0.3, 0, 0][k]; P.head = [0.2, -0.2, 0.2, -0.2][k]; P.bob = k % 2 ? 0.04 : 0; P.kL = P.kR = k % 2 ? 0.25 : 0.05; }
  else if (id === 'jacks') { const j = Math.abs(Math.sin(t * 5)); P.bob = j * 0.4; P.aL[2] = 0.2 + 2.7 * j; P.aR[2] = -(0.2 + 2.7 * j); P.eL = P.eR = -0.1; P.legL[1] = 0.3 * j; P.legR[1] = -0.3 * j; P.kL = P.kR = 0.4 * (1 - j); }
  else { P.aR[0] = -2.9; P.aR[2] = -(0.3 + Math.sin(t * 9) * 0.45); P.eR = -0.5 + Math.sin(t * 9) * 0.3; P.aL[0] = -0.1; P.twist = Math.sin(t * 2) * 0.1; P.bob = Math.abs(Math.sin(t * 2)) * 0.03; }
}
function computePose(a, P, t) {
  const sp = Math.hypot(a.vel.x, a.vel.z);
  P.body = 0; P.bob = 0; P.twist = 0; P.legL[0] = P.legL[1] = P.legR[0] = P.legR[1] = 0;
  P.aL[0] = 0; P.aL[1] = 0; P.aL[2] = 0.1; P.aR[0] = 0; P.aR[1] = 0; P.aR[2] = -0.1;
  P.kL = P.kR = 0.06; P.eL = P.eR = -0.18;
  P.head = -a.pitch * 0.5; P.gun = false; P.pick = false; P.glider = false; P.held = null;
  if (a.state === 'sky') { P.body = 1.25 + (a.dive || 0) * 0.8; P.aL[0] = -0.3; P.aR[0] = -0.3; P.aL[2] = 1.35; P.aR[2] = -1.35; P.eL = P.eR = -0.35; P.legL[0] = 0.25; P.legR[0] = -0.15 + Math.sin(t * 9) * 0.12; P.kL = 0.55; P.kR = 0.3; P.head = -0.9; return P; }
  if (a.crawl && a.alive && a.state === 'ground') { P.body = 1.35; P.bob = -0.55; P.aL[0] = -2.6 + Math.sin(a.walkPhase) * 0.4; P.aR[0] = -2.6 - Math.sin(a.walkPhase) * 0.4; P.legL[0] = 0.2; P.legR[0] = -0.1; P.kL = P.kR = 0.4; P.head = -1.0; return P; }
  if (a.state === 'glide') { P.body = 0.15; P.aL[0] = -Math.PI + 0.15; P.aR[0] = -Math.PI + 0.15; P.aL[2] = 0.22; P.aR[2] = -0.22; P.eL = P.eR = -0.12; P.legL[0] = 0.2 + Math.sin(t * 3) * 0.1; P.legR[0] = 0.1 - Math.sin(t * 3) * 0.1; P.kL = 0.35; P.kR = 0.25; P.glider = true; return P; }
  const run = Math.min(1, sp / 6.5), sw = Math.sin(a.walkPhase) * 0.75 * run;
  if (a.onGround || a.inWater) {
    P.legL[0] = sw; P.legR[0] = -sw; P.bob = Math.abs(Math.cos(a.walkPhase)) * 0.05 * run;
    P.kL = 0.08 + Math.max(0, sw) * 1.1 + run * 0.12; P.kR = 0.08 + Math.max(0, -sw) * 1.1 + run * 0.12;
  } else { P.legL[0] = 0.5; P.legR[0] = -0.3; P.kL = 0.95; P.kR = 0.45; }
  if (a.emote) { emotePose(a.emote, a.emoteT, P); return P; }
  if (a.mantleT > 0) { P.aL[0] = -2.6; P.aR[0] = -2.6; P.eL = P.eR = -0.4; P.legL[0] = 0.9; P.kL = 1.2; return P; }
  const it = a.inv[a.slot];
  if (!it || it.kind === 'pick') {
    P.pick = true;
    if (a.pickAnim > 0) { const k = 1 - a.pickAnim / 0.32; P.aR[0] = k < 0.3 ? lerp(-0.5, -2.7, k / 0.3) : lerp(-2.7, -0.3, (k - 0.3) / 0.7); P.eR = -0.8; }
    else { P.aR[0] = -0.4 + sw * 0.4; P.eR = -0.45; }
    P.aL[0] = -sw * 0.6; P.eL = -0.25;
  } else if (it.kind === 'weapon') {
    P.gun = true; const p = a.pitch;
    P.aR[0] = -Math.PI / 2 - p + 0.35; P.aR[1] = 0.15; P.eR = -0.5; P.aL[0] = -Math.PI / 2 - p + 0.25; P.aL[1] = -0.6; P.eL = -0.55;
    if (a.reloadT > 0) P.aL[0] += Math.sin(t * 14) * 0.35;
  } else {
    P.held = it.hid; P.aR[0] = -0.6; P.eR = -1.2; P.aL[0] = -sw * 0.6;
    if (a.useT > 0) { P.aR[0] = -1.2; P.aR[1] = 0.5; P.eR = -1.9; P.head = 0.3; }
  }
  return P;
}

// ---------------------------------------------------------------- body geometry (shared by the instanced bots and the detailed rig)
// Skeleton (metres, feet at 0): hips 0.95, knee 0.51, shoulders 1.48, head centre 1.79.
const BODY_SCALE = 1.1;   // every character is drawn (and hit) 10% larger than the base skeleton
const SK = { hipY: 0.95, hipX: 0.1, thigh: 0.44, shin: 0.42, shY: 0.53, shX: 0.235, upper: 0.29, fore: 0.26, headY: 0.84 };
function limbGeo(r0, r1, len, seg = 9, N = 3) {
  const pts = [];
  for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r1), -len + Math.sin(a) * r1)); }
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r0), Math.sin(a) * r0)); }
  return new THREE.LatheGeometry(pts, seg);
}
// Muscled limb from y=0 (joint) down to y=-len: radius eases rTop -> rBot with a muscle bulge at `at` (0 = bottom, 1 = top).
// `dir` pushes the bulge forward (+1, quads/biceps) or back (-1, calves); `k` is how much it leans that way.
function muscleLimb(rTop, rBot, len, bulge, at, dir = 0, k = 0, seg = 14) {
  const bump = t => Math.exp(-((t - at) ** 2) / 0.035), r = t => lerp(rBot, rTop, t) + bulge * bump(t), pts = [];
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + i / 4 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r(0)), -len + Math.sin(a) * r(0))); }
  for (let i = 1; i < 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r(t), -len + t * len)); }
  for (let i = 0; i <= 4; i++) { const a = i / 4 * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a) * r(1)), Math.sin(a) * r(1))); }
  const g = new THREE.LatheGeometry(pts, seg), pa = g.attributes.position;
  if (dir) for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i), t = clamp((pa.getY(i) + len) / len, 0, 1); if (z * dir > 0) pa.setZ(i, z * (1 + k * bump(t))); }
  g.computeVertexNormals(); return g;
}
function latheGeo(profile, seg, sx, sz) { const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(Math.max(0.0001, p[0]), p[1])), seg); g.scale(sx, 1, sz); return g; }
const TORSO_PROFILE = [[0, -0.06], [0.13, -0.05], [0.175, 0.02], [0.17, 0.14], [0.16, 0.26], [0.185, 0.38], [0.205, 0.47], [0.19, 0.55], [0.12, 0.6], [0.06, 0.62], [0, 0.63]];
function torsoR(y) { const P = TORSO_PROFILE; for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const k = (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1]); return lerp(P[i - 1][0], P[i][0], k); } return 0; }
function mergeGeo(list) {   // [geometry, ...] -> one non-indexed geometry
  const P = [], N = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g;
}
const RG = {};
function rigGeo() {
  if (RG.ready) return RG;
  RG.thigh = muscleLimb(0.088, 0.06, SK.thigh, 0.017, 0.62, 1, 0.22); RG.shin = muscleLimb(0.062, 0.042, SK.shin, 0.017, 0.72, -1, 0.35);
  RG.shoe = new THREE.SphereGeometry(1, 10, 8); RG.shoe.scale(0.062, 0.05, 0.128); RG.shoe.translate(0, -SK.shin - 0.035, 0.045);
  RG.upper = muscleLimb(0.066, 0.046, SK.upper, 0.013, 0.5, 1, 0.25); RG.fore = muscleLimb(0.05, 0.036, SK.fore, 0.011, 0.76, 1, 0.15);
  RG.kneeCap = new THREE.SphereGeometry(0.058, 12, 8); RG.elbowCap = new THREE.SphereGeometry(0.046, 10, 8);
  RG.hand = new THREE.SphereGeometry(1, 8, 6); RG.hand.scale(0.042, 0.066, 0.032); RG.hand.translate(0, -SK.fore - 0.045, 0.006);
  RG.torso = latheGeo(TORSO_PROFILE, 14, 1.12, 0.66);
  RG.hips = latheGeo([[0, -0.13], [0.14, -0.12], [0.185, -0.04], [0.19, 0.05], [0.182, 0.1], [0, 0.11]], 14, 1.12, 0.7);
  RG.neck = limbGeo(0.05, 0.054, 0.13, 8); RG.neck.translate(0, 0.73, 0);
  const h = new THREE.SphereGeometry(1, 18, 14), hp = h.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
    if (y < 0) { x *= 1 + y * 0.32; z *= 1 + y * 0.12; }
    if (z > 0.3) z *= 0.96;
    hp.setXYZ(i, x * 0.125, y * 0.155, z * 0.14);
  }
  h.computeVertexNormals(); RG.head = h;
  RG.hair = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI * 0.53); RG.hair.scale(0.134, 0.166, 0.15); RG.hair.rotateX(-0.32); RG.hair.translate(0, 0.008, -0.008);
  const eye = () => { const g = new THREE.SphereGeometry(1, 6, 5); g.scale(0.014, 0.017, 0.008); return g; };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  RG.face = mergeGeo([eye().translate(-0.046, 0.018, 0.128), eye().translate(0.046, 0.018, 0.128), box(0.045, 0.01, 0.01, -0.047, 0.05, 0.124), box(0.045, 0.01, 0.01, 0.047, 0.05, 0.124), box(0.045, 0.008, 0.01, 0, -0.07, 0.12)]);
  RG.pack = new THREE.BoxGeometry(0.32, 0.4, 0.15); RG.pack.translate(0, 0.38, -0.2);
  RG.gun = new THREE.BoxGeometry(0.1, 0.16, 0.8); RG.gun.translate(0, 0, 0.25);
  { const D = deltaParts(); RG.glider = mergeGeo([D.outer, D.centre, ...D.tubes.slice(0, 3)]); }
  RG.ready = true; return RG;
}

// ---------------------------------------------------------------- instanced bodies for everyone except the player
const BotRig = {
  max: 0, parts: [],
  init(max) {
    this.max = max; const G = rigGeo();
    const mk = (geo, key, fixed) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
      m.frustumCulled = false; m.castShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < max; i++) { m.setMatrixAt(i, ZERO_M); m.setColorAt(i, _c1.setHex(fixed != null ? fixed : 0xffffff)); }
      scene.add(m); this.parts.push({ m, key, fixed }); return m;
    };
    this.thighL = mk(G.thigh, 'pants'); this.thighR = mk(G.thigh, 'pants'); this.shinL = mk(G.shin, 'pants'); this.shinR = mk(G.shin, 'pants');
    this.shoeL = mk(G.shoe, 'shoe', 0x22222a); this.shoeR = mk(G.shoe, 'shoe', 0x22222a);
    this.hips = mk(G.hips, 'pants'); this.torso = mk(G.torso, 'shirt'); this.neck = mk(G.neck, 'skin');
    this.upperL = mk(G.upper, 'sleeve'); this.upperR = mk(G.upper, 'sleeve'); this.foreL = mk(G.fore, 'sleeve'); this.foreR = mk(G.fore, 'sleeve');
    this.handL = mk(G.hand, 'skin'); this.handR = mk(G.hand, 'skin');
    this.head = mk(G.head, 'skin'); this.face = mk(G.face, 'face', 0x1c1612); this.hair = mk(G.hair, 'hat');
    this.pack = mk(G.pack, 'pack'); this.gun = mk(G.gun, 'gun'); this.gunPart = this.parts[this.parts.length - 1]; this.glider = mk(G.glider, 'glider'); this.glider.material.side = THREE.DoubleSide;
  },
  // Bots that are on screen are packed into the first slots each frame, so only they are drawn (not all 112 slots).
  looks: [], gunHex: [], dirty: [], owner: [],
  setLook(i, look) { this.looks[i] = look; this.dirty[i] = 1; },
  setGun(i, hex) { this.gunHex[i] = hex; this.dirty[i] = 1; },
  hide(i) {},
  hideAll() { for (const p of this.parts) p.m.count = 0; this.owner.length = 0; },
  update(t) {
    const camP = camera.position, P = POSE;
    const mR = new THREE.Matrix4(), mH = new THREE.Matrix4(), mT = new THREE.Matrix4(), mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), mL = new THREE.Matrix4(), mO = new THREE.Matrix4();
    const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    const local = (x, y, z, rx, ry, rz) => { e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e); return mL.compose(p.set(x, y, z), q, s); };
    let n = 0, recolor = false; const far = Math.min(430, View.far + 20), far2 = far * far;
    for (const a of actors) {
      if (a.ri < 0) continue; const ai = a.ri;
      if (a._cm || (!a.alive && !(a._dissolveAt > Match.time)) || a.state === 'bus' || a.pos.distanceToSquared(camP) > far2) continue;
      if (!View.sees(a.pos.x, a.pos.y + 1.2, a.pos.z, 2.6)) continue;   // off-screen: no pose work, nothing to draw
      const i = n++;
      computePose(a, P, t);
      const it = a.inv[a.slot]; const gk = it && it.kind === 'weapon' ? it.rarity : -1;
      if (a._gk !== gk) { a._gk = gk; this.setGun(ai, gk >= 0 ? RARITY[gk].hex : 0x444444); }
      if (this.owner[i] !== ai || this.dirty[ai]) {
        this.owner[i] = ai; this.dirty[ai] = 0; recolor = true; const look = this.looks[ai] || {};
        for (const pt of this.parts) { if (pt.fixed != null) continue; pt.m.setColorAt(i, _c1.setHex(pt === this.gunPart ? (this.gunHex[ai] == null ? 0x444444 : this.gunHex[ai]) : look[pt.key] == null ? 0x888888 : look[pt.key])); }
      }
      e.set(P.body, a.yaw, 0, 'YXZ'); q.setFromEuler(e); mR.compose(p.set(a.pos.x, a.pos.y + P.bob, a.pos.z), q, s.setScalar(a.scale * BODY_SCALE)); s.set(1, 1, 1);
      mH.multiplyMatrices(mR, local(0, SK.hipY, 0, 0, 0, 0)); this.hips.setMatrixAt(i, mH);
      for (const [side, leg, k, th, sh, so] of [[1, P.legL, P.kL, this.thighL, this.shinL, this.shoeL], [-1, P.legR, P.kR, this.thighR, this.shinR, this.shoeR]]) {
        mA.multiplyMatrices(mH, local(SK.hipX * side, 0, 0, leg[0], 0, leg[1])); th.setMatrixAt(i, mA);
        mB.multiplyMatrices(mA, local(0, -SK.thigh, 0, k, 0, 0)); sh.setMatrixAt(i, mB); so.setMatrixAt(i, mB);
      }
      mT.multiplyMatrices(mH, local(0, 0, 0, 0, P.twist, 0)); this.torso.setMatrixAt(i, mT); this.neck.setMatrixAt(i, mT); this.pack.setMatrixAt(i, mT);
      for (const [side, arm, el, up, fo, ha] of [[1, P.aL, P.eL, this.upperL, this.foreL, this.handL], [-1, P.aR, P.eR, this.upperR, this.foreR, this.handR]]) {
        mA.multiplyMatrices(mT, local(SK.shX * side, SK.shY, 0, arm[0], arm[1], arm[2])); up.setMatrixAt(i, mA);
        mB.multiplyMatrices(mA, local(0, -SK.upper, 0, el, 0, 0)); fo.setMatrixAt(i, mB); ha.setMatrixAt(i, mB);
      }
      mA.multiplyMatrices(mT, local(0, SK.headY, 0, P.head, 0, 0)); this.head.setMatrixAt(i, mA); this.face.setMatrixAt(i, mA); this.hair.setMatrixAt(i, mA);
      if (P.gun) { mO.multiplyMatrices(mR, local(-0.19, 1.5 + 0.52 * Math.sin(a.pitch), 0.5 * Math.cos(a.pitch) - 0.02, -a.pitch, 0, 0)); this.gun.setMatrixAt(i, mO); } else this.gun.setMatrixAt(i, ZERO_M);
      if (P.glider) { mO.multiplyMatrices(mR, local(0, 3.2, 0, 0.12, 0, 0)); this.glider.setMatrixAt(i, mO); } else this.glider.setMatrixAt(i, ZERO_M);
    }
    for (const pt of this.parts) { pt.m.count = n; pt.m.instanceMatrix.needsUpdate = true; if (recolor) pt.m.instanceColor.needsUpdate = true; }
  },
};
function randomLook() {
  const o = pick(COS.outfit.filter(c => !c.personal)), bp = pick(COS.backpack.filter(b => b.c)), gl = pick(COS.glider.filter(g => g.id !== 'umbrella'));
  return { outfit: o.id, body: Math.random() < 0.5 ? 'woman' : 'man', shirt: o.shirt, pants: o.pants, skin: o.skin, sleeve: o.sleeve, hat: o.hair != null ? o.hair : o.hatC, pack: bp.c, glider: gl.c, gun: 0x444444 };
}

// ---------------------------------------------------------------- detailed cosmetic rig (player + lobby)
function mergedBoxes(list) {
  const P = [], N = [], C = [], m = new THREE.Matrix4(), e = new THREE.Euler(), c = new THREE.Color();
  for (const [w, h, d, x, y, z, rx, rz, hex] of list) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); m.makeRotationFromEuler(e.set(rx, 0, rz)).setPosition(x, y, z); g.applyMatrix4(m);
    c.setHex(hex); const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2]); N.push(na[i], na[i + 1], na[i + 2]); C.push(c.r, c.g, c.b); }
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.castShadow = true; return mesh;
}
// Merge coloured geometries into one vertex-coloured mesh: [[geometry, hex], ...]
function mergedColored(list) {
  const P = [], N = [], C = [], c = new THREE.Color();
  for (const [g0, hex] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0; c.setHex(hex);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2]); N.push(na[i], na[i + 1], na[i + 2]); C.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.castShadow = true; return mesh;
}
// Small seeded RNG so the hair looks the same every time the model is built.
function seededRand(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Flat text decal (used for the "999" on the jacket and the pendant).
// Psychedelic tie-dye swirl (red, orange, magenta, violet, blue), shared by every tie-dye skin.
let _tieDyeMat = null;
function tieDyeMat() {
  if (_tieDyeMat) return _tieDyeMat;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), col = new THREE.Color();
  const stops = [0xff2a3a, 0xff7a1a, 0xffd23a, 0xff2fb0, 0x8a3dff, 0x2a6fff, 0xff2a3a];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, dx = u - 0.5, dy = v - 0.55, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) / TAU + 0.5;
    let t = (a * 2 + r * 5 + Math.sin(u * TAU * 2) * 0.08 + Math.sin(v * TAU * 3) * 0.06) % 1; if (t < 0) t += 1;
    const k = t * (stops.length - 1), i0 = Math.floor(k), f = k - i0;
    col.setHex(stops[i0]).lerp(_c2.setHex(stops[i0 + 1]), f * f * (3 - 2 * f));
    const i = (y * S + x) * 4; img.data[i] = col.r * 255; img.data[i + 1] = col.g * 255; img.data[i + 2] = col.b * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 1);
  return (_tieDyeMat = new THREE.MeshLambertMaterial({ map: tex }));
}
let CHAIN_Z = 0.012, BACK_Z = -0.205, COLLAR = [0.082, 0.112, 0.085, 0.682, 0.005];   // collar: top radius, bottom radius, height, y, z
// big block print for the back of a shirt (e.g. 999), dark letters with an outline
function backPrint(txt, w, h, fill = '#111114', edge = '#e8731e') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d'); let fs = 190; const font = () => { x.font = '900 ' + fs + 'px "Arial Black", Impact, "Helvetica Neue", sans-serif'; }; font();
  while (x.measureText(txt).width > 450 && fs > 70) { fs -= 10; font(); }   // longer words shrink to fit
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = 22; x.strokeStyle = edge; x.strokeText(txt, 256, 138); x.fillStyle = fill; x.fillText(txt, 256, 138);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}
function textDecal(txt, w, h, color = '#e8e8ee', font) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'); x.font = font || 'italic 700 92px "Brush Script MT", "Segoe Script", cursive';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = color; x.fillText(txt, 128, 68);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }));
}
// Freeform dreads: locks radiate from the scalp and droop, dark roots with blonde ends (built inside the 0.6-scaled hat group).
function dreadsModel(o, head, noCap) {
  // smooth, tapered locks that grow out of the scalp and fall with gravity (dark roots, coloured tips)
  const L = [], root = o.hatC, tip = o.tip || 0xcfa552, cy = -0.008, rnd = seededRand(o.hairSeed || 999);
  const mid = new THREE.Color(root).lerp(new THREE.Color(tip), 0.45).getHex();
  const cap = new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI * 0.56); cap.scale(0.228, 0.285, 0.255); cap.rotateX(-0.22); cap.translate(0, cy + 0.01, -0.01);
  if (!noCap) L.push([cap, root]);   // on the uploaded body the scalp is painted instead
  const RX = 0.235, RY = 0.29, RZ = 0.262, CZ = -0.01, V = THREE.Vector3;
  // keep a point outside the head (and a little off the neck below it)
  const outside = p => {
    if (p.y > -0.18) { const e = (p.x / RX) ** 2 + (p.y / RY) ** 2 + ((p.z - CZ) / RZ) ** 2, k = 1.03; if (e < k) { const s = Math.sqrt(k / Math.max(e, 0.05)); p.x *= s; p.z = CZ + (p.z - CZ) * s; } }
    else { const hr = Math.hypot(p.x, p.z - CZ), mn = 0.15; if (hr < mn) { const s = mn / Math.max(hr, 0.01); p.x *= s; p.z = CZ + (p.z - CZ) * s; } }
    return p;
  };
  // a tube along pts whose radius runs r0 -> r1 (TubeGeometry gives one radius; scale each ring)
  const tube = (pts, r0, r1, hex) => {
    if (pts.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(pts), n = Math.max(2, pts.length - 1), R = 5, g = new THREE.TubeGeometry(curve, n, 1, R, false), P = g.attributes.position;   // thin locks: few sides keep many of them cheap
    for (let j = 0; j <= n; j++) { const c = curve.getPointAt(j / n), r = r0 + (r1 - r0) * j / n; for (let k = 0; k <= R; k++) { const i = j * (R + 1) + k; P.setXYZ(i, c.x + (P.getX(i) - c.x) * r, c.y + (P.getY(i) - c.y) * r, c.z + (P.getZ(i) - c.z) * r); } }
    L.push([g, hex]);
  };
  const lock = (p, n, len, r, side, front, o2 = {}) => {
    const pts = [p.clone().addScaledVector(n, -0.012)]; let pos = p.clone().addScaledVector(n, 0.016); pts.push(pos.clone());
    const dir = n.clone(); dir.y += o2.lift ?? (front ? 0.0 : 0.08); if (front) dir.x += side * (o2.sweep ?? 0.9); dir.normalize();
    const steps = 6, st = len / steps, out = new V(n.x, 0, n.z).normalize(), d0 = o2.droop0 ?? 0.55, d1 = o2.droop ?? 0.45, fl = o2.flare ?? 0.04;
    for (let k = 0; k < steps; k++) {
      dir.y -= k === 0 ? d0 : d1; dir.addScaledVector(out, fl); dir.x += (rnd() - 0.5) * 0.08; dir.z += (rnd() - 0.5) * 0.08; dir.normalize();
      pos = o2.free ? pos.clone().addScaledVector(dir, st) : outside(pos.clone().addScaledVector(dir, st)); pts.push(pos.clone());
    }
    const full = new THREE.CatmullRomCurve3(pts), S = full.getPoints(20), cut1 = o2.cut1 ?? 13, cut2 = o2.cut2 ?? 15, r1 = r * (o2.taper ?? 0.72);
    const rAt = i => r + (r1 - r) * i / 20;
    tube(S.slice(0, cut1 + 1), rAt(0), rAt(cut1), root);
    tube(S.slice(cut1, cut2 + 1), rAt(cut1), rAt(cut2), mid);
    tube(S.slice(cut2), rAt(cut2), rAt(20), tip);
    const e = S[20]; L.push([new THREE.SphereGeometry(r1, 5, 4).translate(e.x, e.y, e.z), tip]);
  };
  if (o.knot) {   // top-knot style: a tied bundle on the crown with short gold spikes fanning out, short chunky locks all around
    const top = new V(0, cy + 0.01 + RY * 0.96, CZ - 0.03), up = new V(0, 1, 0.12).normalize(), stemTop = top.clone().addScaledVector(up, 0.1);
    tube([top.clone().addScaledVector(up, -0.03), top.clone().addScaledVector(up, 0.03), stemTop], 0.05, 0.034, root);                       // gathered hair
    { const band = new THREE.TorusGeometry(0.038, 0.011, 6, 16); band.rotateX(Math.PI / 2 - 0.12); band.translate(stemTop.x, stemTop.y - 0.022, stemTop.z); L.push([band, 0x060607]); }   // hair tie
    for (let i = 0; i < 10; i++) {   // the spikes: up and out like a little palm tree
      const a = i / 10 * TAU + rnd() * 0.35, sp = 0.45 + rnd() * 0.3, d = new V(Math.sin(a) * sp, 1, Math.cos(a) * sp - 0.1).normalize();
      lock(stemTop.clone().addScaledVector(d, 0.01), d, 0.17 + rnd() * 0.06, 0.016 + rnd() * 0.003, 1, false, { free: true, lift: 0.35, droop0: 0.1, droop: 0.15, flare: 0.1, cut1: 4, cut2: 6, taper: 0.75 });
    }
    const rings = [[0.42, 11], [0.72, 15], [1.0, 18], [1.24, 19], [1.46, 17]];
    for (const [phi, n] of rings) for (let i = 0; i < n; i++) {
      const th = (i + rnd() * 0.5) / n * TAU, sp = Math.sin(phi), cp = Math.cos(phi), sx = Math.sin(th), cz = Math.cos(th);
      if (phi > 1.1 && cz > 0.2) continue;                                   // keep the face and temples clear
      const p = new V(RX * 0.97 * sp * sx, cy + 0.01 + RY * 0.97 * cp, CZ + RZ * 0.97 * sp * cz);
      const nrm = new V(p.x / (RX * RX), (p.y - cy) / (RY * RY), (p.z - CZ) / (RZ * RZ)).normalize();
      const front = cz > 0.4 && phi < 1.1, back = cz < -0.3;
      const len = front ? 0.13 + rnd() * 0.04 : back ? 0.24 + rnd() * 0.07 : 0.19 + rnd() * 0.07;
      lock(p, nrm, len, 0.015 + rnd() * 0.003, sx >= 0 ? 1 : -1, front, { lift: front ? -0.1 : 0.04, sweep: 0.5, droop0: 0.48, droop: 0.4, flare: 0.07, cut1: 13, cut2: 15, taper: 0.8 });   // black roots, gold only at the ends
    }
    head.add(mergedColored(L)); return;
  }
  // roots in rings from the crown down to the hairline; theta = 0 is the face
  const rings = [[0.12, 8], [0.36, 16], [0.6, 22], [0.84, 27], [1.06, 31], [1.27, 33], [1.47, 33]];   // many thin locks, packed close
  for (const [phi, n] of rings) for (let i = 0; i < n; i++) {
    const th = (i + rnd() * 0.55) / n * TAU, sp = Math.sin(phi), cp = Math.cos(phi), sx = Math.sin(th), cz = Math.cos(th);
    if (phi > 1.05 && cz > 0.15) continue;                                  // keep the face and temples clear
    const p = new V(RX * 0.97 * sp * sx, cy + 0.01 + RY * 0.97 * cp, CZ + RZ * 0.97 * sp * cz);
    const nrm = new V(p.x / (RX * RX), (p.y - cy) / (RY * RY), (p.z - CZ) / (RZ * RZ)).normalize();
    const front = cz > 0.35 && phi > 0.35, back = cz < -0.3;
    const len = 0.5 * (front ? 0.16 + rnd() * 0.05 : back ? 0.42 + rnd() * 0.12 : phi < 0.6 ? 0.34 + rnd() * 0.08 : 0.36 + rnd() * 0.1);   // half length
    lock(p, nrm, len, 1.05 * (0.0085 + rnd() * 0.002), sx >= 0 ? 1 : -1, front);   // 5% thicker
  }
  head.add(mergedColored(L));
}
// Big afro: a round cloud of curls framing the face (built in the 0.6-scaled hat group, like the dreads)
function afroModel(o, head) {
  const L = [], rnd = seededRand(o.hairSeed || 4242), col = o.hair ?? o.hatC;
  let puff = (cx, cy, cz, rx, ry, rz, n) => {
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), b = 1 + 0.06 * Math.sin(x * 11 + y * 7) * Math.sin(y * 9 - z * 8) + 0.03 * Math.sin(z * 17 + x * 5); p.setXYZ(i, cx + x * rx * b, cy + y * ry * b, cz + z * rz * b); }
    g.computeVertexNormals(); L.push([g, col]);
  };
  const k = o.afroSize || 1;                         // < 1: a tighter afro that sits closer to the head
  const puff0 = puff, lz = o.lineup ? -0.085 : 0, ly = o.lineup ? 0.035 : 0;   // a lineup needs the forehead clear: sit the afro further back
  puff = (cx, cy, cz, rx, ry, rz) => puff0(cx, cy + ly, cz + lz, rx, ry, rz);
  puff(0, 0.17 - (1 - k) * 0.12, -0.09 + (1 - k) * 0.08, 0.36 * k, 0.3 * k, 0.33 * k);   // crown
  for (const sx of [-1, 1]) puff(sx * (0.2 - (1 - k) * 0.08), 0.0, -0.07 + (1 - k) * 0.04, 0.17 * Math.max(0.85, k), 0.2 * k, 0.18 * k);   // sides over the ears
  puff(0, -0.01, -0.2 + (1 - k) * 0.08, 0.26 * k, 0.24 * k, 0.2 * k);   // back
  head.add(mergedColored(L));
}
// Huge spiky hair: long cones out of the scalp, dark at the roots and coloured at the tips
function spikesModel(o, head) {
  const L = [], rnd = seededRand(o.hairSeed || 777), root = o.hatC, tip = o.tip || root, cy = -0.008;
  const UP = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), rm = new THREE.Matrix4();
  const cone = (a, dir, len, r0, r1, hex) => { const g = new THREE.CylinderGeometry(r1, r0, len, 7); g.translate(0, len / 2, 0); g.applyMatrix4(rm.makeRotationFromQuaternion(q.setFromUnitVectors(UP, dir))); g.translate(a.x, a.y, a.z); L.push([g, hex]); };
  const cap = new THREE.SphereGeometry(1, 16, 9, 0, TAU, 0, Math.PI * 0.5); cap.scale(0.222, 0.276, 0.25); cap.rotateX(-0.42); cap.translate(0, cy + 0.02, -0.02); L.push([cap, root]);
  const rings = [[0, 1], [0.38, 7], [0.78, 11], [1.15, 13], [1.48, 10]];
  for (const [phi, n] of rings) for (let i = 0; i < n; i++) {
    const th = (i + rnd() * 0.5) / n * TAU + phi, sp = Math.sin(phi), cp = Math.cos(phi), sx = Math.sin(th), cz = Math.cos(th);
    if (phi > 1.0 && cz > 0.25) continue;                               // keep the face clear
    const at = new THREE.Vector3(0.2 * sp * sx, cy + 0.01 + 0.25 * cp, -0.012 + 0.23 * sp * cz);
    const dir = new THREE.Vector3(sp * sx * 1.1 + (rnd() - 0.5) * 0.3, cp + 0.45 + (rnd() - 0.5) * 0.25, sp * cz * 1.1 - 0.25 + (rnd() - 0.5) * 0.3).normalize();
    const S = o.spikeScale || 1, len = (0.42 + rnd() * 0.22 - (phi > 1.3 ? 0.12 : 0)) * S, r0 = (0.06 + rnd() * 0.015) * (1 + (S - 1) * 0.45), split = 0.55;
    cone(at, dir, len * split, r0, r0 * 0.5, root);
    cone(at.clone().addScaledVector(dir, len * split - 0.004), dir, len * (1 - split), r0 * 0.5, 0.004, tip);
  }
  head.add(mergedColored(L));
}
function hatModel(o, head, hs, skn) {
  if (o.hat === 'dreads') { dreadsModel(o, head, skn); return; }
  if (o.hat === 'afro') { afroModel(o, head); return; }
  if (o.hat === 'spikes') { spikesModel(o, head); return; }
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; head.add(m); return m; };
  const c = o.hatC, top = 0.25 * hs[1];
  switch (o.hat) {
    case 'cap': add(new THREE.BoxGeometry(0.54, 0.16, 0.54), lam(c), 0, top + 0.05, 0); add(new THREE.BoxGeometry(0.5, 0.05, 0.3), lam(c), 0, top - 0.01, 0.36); break;
    case 'bun': add(new THREE.BoxGeometry(0.53, 0.12, 0.53), lam(c), 0, top + 0.02, -0.01); add(new THREE.SphereGeometry(0.16, 10, 8), lam(c), 0, top + 0.08, -0.26); break;
    case 'leaves': add(new THREE.IcosahedronGeometry(0.34, 0), lam(c), 0, top + 0.14, 0); break;
    case 'helmet': add(new THREE.BoxGeometry(0.62, 0.62, 0.62), lam(c), 0, 0.03, 0); add(new THREE.BoxGeometry(0.48, 0.24, 0.05), basic(0x5ab8ff), 0, 0.04, 0.32); break;
    case 'antenna': for (const sx of [-0.13, 0.13]) { add(new THREE.BoxGeometry(0.04, 0.38, 0.04), lam(0x333344), sx, top + 0.19, 0); add(new THREE.SphereGeometry(0.07, 8, 6), basic(c), sx, top + 0.4, 0); } break;
    case 'horns': for (const sx of [-1, 1]) { const g = new THREE.ConeGeometry(0.075, 0.396, 10).translate(0, 0.188, 0); const m = add(g, lam(c), sx * 0.12, top - 0.07, 0.02); m.rotation.z = -sx * 0.55; m.rotation.x = -0.12; } break;   // two horns straight out of the head
    case 'headphones': {
      const band = new THREE.TorusGeometry(0.29, 0.035, 8, 24, Math.PI); add(band, lam(0x18181c), 0, top - 0.08, 0);
      for (const sx of [-1, 1]) { const cup = add(new THREE.CylinderGeometry(0.11, 0.11, 0.09, 18), lam(0x18181c), sx * 0.29, top - 0.2, 0); cup.rotation.z = Math.PI / 2; const pad = add(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 18), basic(c), sx * 0.345, top - 0.2, 0); pad.rotation.z = Math.PI / 2; }
      break;
    }
    case 'tophat': add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 14), lam(c), 0, top + 0.02, 0); add(new THREE.CylinderGeometry(0.22, 0.22, 0.42, 14), lam(c), 0, top + 0.24, 0); add(new THREE.CylinderGeometry(0.225, 0.225, 0.07, 14), lam(0xd4a72c), 0, top + 0.09, 0); break;
    case 'crown': add(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10), basic(c), 0, top + 0.04, 0); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(new THREE.ConeGeometry(0.06, 0.2, 5), basic(c), Math.cos(a) * 0.24, top + 0.16, Math.sin(a) * 0.24); } break;
    case 'toast': add(new THREE.BoxGeometry(0.5 * hs[0] + 0.08, 0.5 * hs[1] + 0.08, 0.18), lam(c), 0, 0, -0.06); break;
    case 'fedora': {   // short-brim fedora, tipped forward a touch, with a band and a creased crown
      const g = new THREE.Group(); g.position.set(0, top - 0.06, 0.01); g.rotation.x = 0.1; head.add(g);
      const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
      const brim = put(new THREE.CylinderGeometry(0.37, 0.37, 0.022, 24), lam(c), 0, 0, 0); brim.scale.set(1, 1, 1.1);
      put(new THREE.CylinderGeometry(0.205, 0.245, 0.235, 20), lam(c), 0, 0.125, 0);
      put(new THREE.CylinderGeometry(0.248, 0.25, 0.055, 20), lam(o.band ?? 0xd4a72c), 0, 0.04, 0);
      put(new THREE.BoxGeometry(0.04, 0.02, 0.28), lam(new THREE.Color(c).multiplyScalar(0.6).getHex()), 0, 0.238, 0);   // crease along the top
      break;
    }
  }
}
// ---------------------------------------------------------------- detailed back bling and harvesting tools
// Each one is merged into a single coloured mesh (plus one glowing mesh) and cached, so they stay cheap to draw.
const KIT_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: 0x2a2a2a });
const KIT_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
const _kitCache = new Map(), _km = new THREE.Matrix4(), _ke = new THREE.Euler();
function kitModel(key, build) {
  let c = _kitCache.get(key);
  if (!c) {
    const L = [], E = [];
    const tf = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { if (rx || ry || rz) g.applyMatrix4(_km.makeRotationFromEuler(_ke.set(rx, ry, rz))); g.translate(x, y, z); return g; };
    const rrect = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2); s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
    const K = {
      box: (w, h, d, x, y, z, hex, rx, ry, rz, glow) => (glow ? E : L).push([tf(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), hex]),
      rbox: (w, h, d, r, x, y, z, hex, rx, ry, rz) => { const b = Math.min(r * 0.5, d * 0.3); const g = new THREE.ExtrudeGeometry(rrect(w - 2 * b, h - 2 * b, r), { depth: d - 2 * b, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 4 }); g.translate(0, 0, -(d - 2 * b) / 2); L.push([tf(g, x, y, z, rx, ry, rz), hex]); },
      cyl: (r0, r1, h, x, y, z, hex, rx, ry, rz, seg = 16, glow) => (glow ? E : L).push([tf(new THREE.CylinderGeometry(r1, r0, h, seg), x, y, z, rx, ry, rz), hex]),
      sph: (r, x, y, z, hex, sx = 1, sy = 1, sz = 1, glow) => { const g = new THREE.SphereGeometry(r, 16, 12); g.scale(sx, sy, sz); (glow ? E : L).push([tf(g, x, y, z), hex]); },
      tor: (R, r, x, y, z, hex, rx, ry, rz, arc = TAU, glow) => (glow ? E : L).push([tf(new THREE.TorusGeometry(R, r, 8, 24, arc), x, y, z, rx, ry, rz), hex]),
      oct: (sx, sy, sz, x, y, z, hex, rx, ry, rz, glow) => { const g = new THREE.OctahedronGeometry(1, 0); g.scale(sx, sy, sz); (glow ? E : L).push([tf(g, x, y, z, rx, ry, rz), hex]); },
      tube: (pts, r, hex) => { const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))); L.push([new THREE.TubeGeometry(curve, 20, r, 8, false), hex]); },
      geo: (g, hex, glow) => (glow ? E : L).push([g, hex]),
    };
    build(K);
    const merge = list => { if (!list.length) return null; const P = [], N = [], C = [], col = new THREE.Color(); for (const [g0, hex] of list) { const g = g0.index ? g0.toNonIndexed() : g0; col.setHex(hex); const pa = g.attributes.position.array, na = g.attributes.normal.array; for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2]); N.push(na[i], na[i + 1], na[i + 2]); C.push(col.r, col.g, col.b); } if (g !== g0) g.dispose(); g0.dispose(); } const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); out.computeBoundingSphere(); return out; };
    c = { main: merge(L), glow: merge(E) }; _kitCache.set(key, c);
  }
  const g = new THREE.Group();
  if (c.main) { const m = new THREE.Mesh(c.main, KIT_MAT); m.castShadow = true; g.add(m); }
  if (c.glow) g.add(new THREE.Mesh(c.glow, KIT_GLOW));
  return g;
}
const sh = (hex, k) => { _c2.setHex(hex); _c2.setRGB(Math.min(1, _c2.r * k), Math.min(1, _c2.g * k), Math.min(1, _c2.b * k)); return _c2.getHex(); };
function packModel(id, torso) {
  const b = cosById('backpack', id); if (id === 'none') return;
  const c = b.c, metal = 0x9aa0a8, strap = 0x26241f, Z = -0.34;
  const m = kitModel('pack:' + id, K => {
    if (id === 'ruck') {
      K.rbox(0.46, 0.56, 0.24, 0.07, 0, 0, Z, c); K.rbox(0.465, 0.09, 0.25, 0.04, 0, -0.25, Z, sh(c, 0.72));          // body, reinforced base
      K.rbox(0.48, 0.13, 0.27, 0.05, 0, 0.285, Z - 0.008, sh(c, 0.86));                                                  // lid
      for (const sx of [-1, 1]) {
        K.box(0.036, 0.34, 0.012, sx * 0.12, 0.13, Z - 0.143, strap); K.box(0.052, 0.04, 0.02, sx * 0.12, 0.03, Z - 0.148, metal); K.box(0.02, 0.012, 0.022, sx * 0.12, 0.03, Z - 0.152, 0x5a5f68);   // lid straps + buckles
        K.tube([[sx * 0.13, 0.24, -0.22], [sx * 0.14, 0.33, -0.17], [sx * 0.15, 0.36, -0.08]], 0.022, strap);              // shoulder straps over the top
        K.box(0.03, 0.42, 0.02, sx * 0.235, -0.02, Z, sh(c, 0.8));                                                         // compression straps on the sides
      }
      K.rbox(0.34, 0.24, 0.07, 0.035, 0, -0.08, Z - 0.145, sh(c, 0.92)); K.box(0.3, 0.008, 0.012, 0, 0.032, Z - 0.183, 0x2a2a2a); K.box(0.016, 0.04, 0.01, 0.1, 0.012, Z - 0.188, metal);   // front pocket, zip, pull
      K.box(0.36, 0.012, 0.012, 0, -0.2, Z - 0.183, sh(c, 0.6));                                                         // pocket seam
      K.box(0.09, 0.2, 0.15, 0.275, -0.12, Z, sh(c, 0.78)); K.cyl(0.045, 0.045, 0.27, 0.28, -0.03, Z, 0x2f7fd8); K.cyl(0.03, 0.03, 0.04, 0.28, 0.12, Z, 0x1a1a1e);   // bottle pocket + bottle + cap
      K.cyl(0.078, 0.078, 0.5, 0, 0.43, Z + 0.01, 0x4a6a3a, 0, 0, Math.PI / 2); for (const x of [-0.15, 0.15]) K.tor(0.081, 0.011, x, 0.43, Z + 0.01, strap, 0, Math.PI / 2, 0);   // bedroll
      K.tor(0.035, 0.006, -0.25, -0.05, Z - 0.05, 0xd0d4da, 0, Math.PI / 2, 0); K.tor(0.04, 0.008, 0, 0.36, Z + 0.06, strap, 0, 0, 0, Math.PI);   // carabiner, haul loop
    } else if (id === 'tank') {
      for (const sx of [-1, 1]) {
        const x = sx * 0.14;
        K.cyl(0.12, 0.12, 0.5, x, 0, Z, c, 0, 0, 0, 20); K.sph(0.12, x, 0.25, Z, c, 1, 0.6, 1); K.sph(0.12, x, -0.25, Z, sh(c, 0.85), 1, 0.6, 1);
        for (const y of [-0.13, 0.13]) K.tor(0.123, 0.013, x, y, Z, 0x3a3f48, Math.PI / 2, 0, 0);
        K.box(0.1, 0.13, 0.012, x, 0.02, Z - 0.118, 0xffd23a); for (const k of [-1, 1]) K.box(0.02, 0.14, 0.004, x + k * 0.025, 0.02, Z - 0.125, 0x1a1a1e, 0, 0, 0.5);   // hazard label
        K.cyl(0.026, 0.026, 0.07, x, 0.36, Z, metal); K.tor(0.042, 0.009, x, 0.4, Z, 0xc0392b, Math.PI / 2, 0, 0); K.box(0.07, 0.008, 0.008, x, 0.4, Z, 0xc0392b);   // valve + handwheel
        K.cyl(0.07, 0.045, 0.1, x, -0.36, Z, 0x2a2e36); K.tor(0.05, 0.01, x, -0.415, Z, 0x4fd0ff, Math.PI / 2, 0, 0, TAU, true);   // nozzle + glow ring
      }
      K.rbox(0.2, 0.5, 0.05, 0.02, 0, 0, Z + 0.1, 0x2a2e36);                                                              // harness plate
      K.cyl(0.055, 0.055, 0.025, 0, 0.17, Z - 0.075, 0xf2f2f2, Math.PI / 2, 0, 0); K.tor(0.056, 0.009, 0, 0.17, Z - 0.088, metal); K.box(0.004, 0.04, 0.004, 0.01, 0.18, Z - 0.09, 0xd8202e, 0, 0, -0.6);   // gauge
      K.tube([[0.14, 0.38, Z], [0.07, 0.42, Z - 0.05], [0, 0.22, Z - 0.075]], 0.012, 0x1a1a1e); K.tube([[-0.14, 0.38, Z], [-0.07, 0.43, Z - 0.04], [0, 0.32, Z - 0.06]], 0.012, 0x1a1a1e);
    } else if (id === 'shell') {
      const A = 0.42, Bv = 0.46, C = 0.21, cz = -0.3;
      K.sph(1, 0, 0.02, cz, sh(c, 0.85), A, Bv, C);
      const plates = [[0, 0]]; for (let i = 0; i < 6; i++) plates.push([0.55 * Math.cos(i / 6 * TAU + 0.5), 0.55 * Math.sin(i / 6 * TAU + 0.5)]); for (let i = 0; i < 8; i++) plates.push([0.88 * Math.cos(i / 8 * TAU), 0.88 * Math.sin(i / 8 * TAU)]);
      plates.forEach(([u, v], i) => {
        const nz = -Math.sqrt(Math.max(0.05, 1 - u * u - v * v)), px = u * A, py = 0.02 + v * Bv, pz = cz + nz * C;
        const n = new THREE.Vector3(u / A, v / Bv, nz / C).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n), r = i === 0 ? 0.13 : i < 7 ? 0.11 : 0.085;
        for (const [rr, hh, off, col] of [[r, 0.02, 0.0, sh(c, 0.6)], [r * 0.86, 0.035, 0.012, sh(c, 1.18)]]) { const g = new THREE.CylinderGeometry(rr, rr * 1.05, hh, 6); g.applyQuaternion ? 0 : 0; g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q)); g.translate(px + n.x * off, py + n.y * off, pz + n.z * off); K.geo(g, col); }
      });
      K.geo(new THREE.TorusGeometry(1, 0.07, 8, 40).scale(A, Bv, 0.45).translate(0, 0.02, cz + 0.02), 0xc8b46a);         // rim
      for (const sx of [-1, 1]) K.tube([[sx * 0.13, 0.36, -0.24], [sx * 0.14, 0.4, -0.15], [sx * 0.15, 0.36, -0.08]], 0.022, strap);
    } else if (id === 'crate') {
      const wood = 0xb07a3a, dark = 0x6a4420, W2 = 0.26, H2 = 0.25, D2 = 0.17, cz = -0.38;
      K.box(W2 * 2 - 0.02, H2 * 2 - 0.02, D2 * 2 - 0.02, 0, 0.02, cz, sh(wood, 0.6));
      for (let i = 0; i < 4; i++) { const y = -H2 + 0.08 + i * 0.122; K.box(W2 * 2 - 0.06, 0.105, 0.025, 0, y + 0.02, cz - D2, i % 2 ? wood : sh(wood, 1.1)); K.box(W2 * 2 - 0.06, 0.105, 0.025, 0, y + 0.02, cz + D2, wood); K.box(0.025, 0.105, D2 * 2 - 0.06, -W2, y + 0.02, cz, sh(wood, 0.95)); K.box(0.025, 0.105, D2 * 2 - 0.06, W2, y + 0.02, cz, sh(wood, 0.95)); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box(0.05, H2 * 2 + 0.02, 0.05, sx * (W2 - 0.005), 0.02, cz + sz * (D2 - 0.005), dark); for (const sy of [-1, 1]) { K.box(0.1, 0.012, 0.012, sx * (W2 - 0.04), 0.02 + sy * (H2 - 0.02), cz + sz * (D2 + 0.01), metal); K.box(0.012, 0.1, 0.012, sx * (W2 + 0.01), 0.02 + sy * (H2 - 0.04), cz + sz * (D2 - 0.03), metal); K.sph(0.01, sx * (W2 - 0.06), 0.02 + sy * (H2 - 0.02), cz + sz * (D2 + 0.018), 0x5a5f68); } }
      K.box(W2 * 2 + 0.03, 0.06, D2 * 2 + 0.03, 0, 0.02 + H2 + 0.02, cz, sh(wood, 0.8)); K.box(W2 * 2 + 0.035, 0.02, D2 * 2 + 0.035, 0, 0.02 + H2 - 0.015, cz, c, 0, 0, 0, true);   // lid + glowing seam
      K.box(0.06, 0.09, 0.02, 0, 0.02 + H2 - 0.04, cz - D2 - 0.02, metal); K.box(0.07, 0.06, 0.03, 0, 0.02 + H2 - 0.11, cz - D2 - 0.03, 0xd4a72c); K.tor(0.022, 0.007, 0, 0.02 + H2 - 0.065, cz - D2 - 0.03, 0xb8bec6, 0, 0, 0, Math.PI);   // hasp + padlock
      for (const sx of [-1, 1]) { K.tor(0.06, 0.013, sx * (W2 + 0.015), 0.06, cz, 0xc8a86a, Math.PI / 2, 0, -sx * Math.PI / 2, Math.PI); for (const dz of [-0.06, 0.06]) K.box(0.03, 0.04, 0.03, sx * (W2 + 0.012), 0.06, cz + dz, metal); }   // rope handles
    } else if (id === 'boombox') {
      const cz = -0.32;
      K.rbox(0.66, 0.36, 0.2, 0.05, 0, 0.02, cz, c); K.box(0.6, 0.3, 0.012, 0, 0.02, cz - 0.1, sh(c, 1.5));                // body, front panel
      for (const sx of [-1, 1]) {
        const x = sx * 0.18, fz = cz - 0.108;
        K.tor(0.128, 0.01, x, 0.0, fz, 0xc8ccd4); K.cyl(0.122, 0.122, 0.012, x, 0.0, fz, 0x0c0c10, Math.PI / 2, 0, 0, 28);
        K.cyl(0.1, 0.05, 0.04, x, 0.0, fz - 0.012, 0x34343c, -Math.PI / 2, 0, 0, 24); K.sph(0.034, x, 0.0, fz - 0.03, 0x8a8f9a, 1, 1, 0.6);
        for (let i = 0; i < 3; i++) K.tor(0.065 + i * 0.012, 0.003, x, 0.0, fz - 0.025 + i * 0.006, 0x24242a);
      }
      K.box(0.15, 0.1, 0.012, 0, 0.06, cz - 0.11, 0x101418); for (const x of [-0.035, 0.035]) K.cyl(0.018, 0.018, 0.01, x, 0.06, cz - 0.118, 0xf2f2f2, Math.PI / 2, 0, 0);   // tape window + reels
      const eqc = [0x2fe7ff, 0x7cff4f, 0xffe14a, 0xff7a2a, 0xff3fa6, 0x9b6bff, 0x2fe7ff];
      eqc.forEach((col, i) => { const h = 0.02 + 0.045 * Math.abs(Math.sin(i * 1.7 + 0.4)); K.box(0.014, h, 0.006, -0.06 + i * 0.02, -0.06 + h / 2, cz - 0.11, col, 0, 0, 0, true); });
      for (let i = 0; i < 6; i++) K.box(0.035, 0.018, 0.03, -0.12 + i * 0.048, 0.2, cz - 0.04, i === 5 ? 0xd8202e : 0x8a8f9a);   // buttons along the top
      for (const x of [0.22, 0.27]) K.cyl(0.018, 0.018, 0.03, x, 0.2, cz + 0.03, 0xc8ccd4);
      K.tor(0.21, 0.018, 0, 0.2, cz + 0.04, 0x1a1a1e, 0, 0, 0, Math.PI); for (const sx of [-1, 1]) K.box(0.04, 0.04, 0.04, sx * 0.21, 0.2, cz + 0.04, 0x8a8f9a);   // handle
      K.cyl(0.006, 0.004, 0.5, -0.36, 0.38, cz + 0.05, 0xc8ccd4, 0, 0, 0.55); K.sph(0.012, -0.5, 0.6, cz + 0.05, 0xc8ccd4);   // antenna
    }
  });
  torso.add(m);
}
function pickModel(id, parent) {
  const pc = cosById('pickaxe', id), wood = 0x7a4a26, leather = 0x2a1a10, metal = 0x5a5f68;
  const m = kitModel('pick:' + id, K => {
    const R = Math.PI / 2;
    if (id === 'pick') {
      K.cyl(0.03, 0.026, 0.98, 0, 0, 0.43, wood, R, 0, 0, 12); for (let z = 0.03; z < 0.66; z += 0.12) K.box(0.004, 0.058, 0.08, 0.025, 0, z + 0.04, sh(wood, 0.75));   // handle + grain
      for (let i = 0; i < 7; i++) K.tor(0.032, 0.008, 0, 0, -0.02 + i * 0.032, leather, 0, 0, 0);                           // leather wrap
      K.cyl(0.04, 0.036, 0.05, 0, 0, -0.07, metal, R); K.sph(0.03, 0, 0, -0.1, metal, 1, 1, 0.6);                           // pommel
      K.cyl(0.044, 0.044, 0.12, 0, 0, 0.88, metal, R); for (const x of [-1, 1]) K.sph(0.009, x * 0.045, 0, 0.86, 0xc8ccd4);  // collar + rivets
      K.box(0.09, 0.15, 0.15, 0, 0, 0.94, 0x4a4f58);                                                                       // head socket
      const head = (u0, u1, grow, col) => {                                                                                 // crescent in the y-z plane, extruded across x
        const zc = u => 0.95 - 0.85 * u * u, th = u => { const a = Math.abs(u) / 0.47; return 0.058 * Math.pow(1 - a, 0.75) + (u > 0 ? 0.003 : 0.03) * a + grow; };
        const top = [], bot = []; for (let i = 0; i <= 24; i++) { const u = lerp(u0, u1, i / 24); top.push([u, zc(u) + th(u)]); bot.push([u, zc(u) - th(u) * (u > 0 ? 0.6 : 1)]); }
        const sp = new THREE.Shape(); sp.moveTo(...top[0]); for (const q of top.slice(1)) sp.lineTo(...q); for (const q of bot.reverse()) sp.lineTo(...q); sp.closePath();
        const w = 0.05 + grow * 2, g = new THREE.ExtrudeGeometry(sp, { depth: w, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 2 });
        g.translate(0, 0, -w / 2); g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)); K.geo(g, col);
      };
      head(-0.47, 0.47, 0, pc.c); head(0.33, 0.47, 0.004, sh(pc.c, 1.35)); head(-0.47, -0.36, 0.004, sh(pc.c, 1.35));    // head + polished tips
      K.box(0.094, 0.01, 0.155, 0, 0.08, 0.94, 0xc8ccd4); K.box(0.094, 0.01, 0.155, 0, -0.08, 0.94, 0xc8ccd4);           // polished bands
    } else if (id === 'wrench') {
      const steel = 0xc4c9d0;
      K.rbox(0.03, 0.07, 0.8, 0.012, 0, 0, 0.4, steel); K.cyl(0.036, 0.036, 0.03, 0, 0, -0.01, steel, 0, 0, R); K.cyl(0.014, 0.014, 0.034, 0, 0, -0.01, 0x18181c, 0, 0, R);   // handle, round end, hang hole
      K.rbox(0.042, 0.088, 0.36, 0.016, 0, 0, 0.16, pc.c); for (let z = 0.0; z < 0.34; z += 0.04) K.box(0.044, 0.088, 0.008, 0, 0, z, sh(pc.c, 0.75));   // rubber grip with ridges
      K.box(0.04, 0.17, 0.13, 0, 0.0, 0.86, steel); K.box(0.04, 0.06, 0.13, 0, 0.055, 0.98, steel); K.box(0.036, 0.05, 0.11, 0, -0.06, 0.97, sh(steel, 0.9));   // head, fixed jaw, moving jaw
      K.cyl(0.024, 0.024, 0.06, 0, -0.03, 0.86, 0x8a8f9a, 0, 0, R); for (let i = 0; i < 5; i++) K.tor(0.025, 0.004, -0.024 + i * 0.012, -0.03, 0.86, 0x6a6f78, 0, R, 0);   // adjusting screw
    } else if (id === 'baguette') {
      const loafR = t => 0.075 * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.32), prof = []; for (let i = 0; i <= 24; i++) { const t = i / 24; prof.push(new THREE.Vector2(Math.max(0.001, loafR(t)), -0.12 + t * 1.2)); }
      const g = new THREE.LatheGeometry(prof, 16); g.rotateX(R); g.scale(1, 0.85, 1); K.geo(g, 0xc8863a);
      for (let i = 0; i < 6; i++) { const z = 0.2 + i * 0.14; K.box(0.022, 0.014, 0.12, 0, loafR((z + 0.12) / 1.2) * 0.85 - 0.003, z, 0xf2d79c, 0, 0.5, 0); }                 // scoring cuts
      K.cyl(0.082, 0.082, 0.22, 0, 0, 0.02, 0xe8dcc0, R, 0, 0, 16); K.tor(0.083, 0.007, 0, 0, 0.06, 0xd8202e);              // paper wrap + stripe
    } else if (id === 'crystal') {
      K.cyl(0.03, 0.03, 0.66, 0, 0, 0.27, 0x222233, R, 0, 0, 10); for (const z of [0.0, 0.2, 0.4]) K.tor(0.033, 0.009, 0, 0, z, 0xd4a72c);
      K.oct(0.03, 0.03, 0.03, 0, 0, -0.08, pc.c, 0, 0, 0, true);                                                           // glowing pommel gem
      K.box(0.05, 0.2, 0.05, 0, 0, 0.62, 0xd4a72c); K.box(0.06, 0.06, 0.08, 0, 0, 0.62, 0xb8862a);                          // guard
      K.oct(0.07, 0.38, 0.11, 0, 0.12, 0.9, pc.c, 0.35, 0, 0.12); K.oct(0.035, 0.3, 0.06, 0, 0.12, 0.9, 0xd8fffa, 0.35, 0, 0.12, true);   // main crystal + core
      K.oct(0.045, 0.2, 0.07, 0.02, -0.13, 0.86, sh(pc.c, 1.25), -0.6, 0, -0.2); K.oct(0.035, 0.16, 0.05, -0.02, 0.0, 1.07, sh(pc.c, 0.8), 1.2, 0, 0.3); K.oct(0.03, 0.12, 0.045, 0.03, 0.3, 0.74, sh(pc.c, 1.1), 1.6, 0, 0);
    } else if (id === 'axe') {   // an electric guitar held by the neck: the body is the striking end
      K.box(0.05, 0.06, 0.62, 0, 0, 0.3, 0x3a2414); for (let i = 1; i < 10; i++) K.box(0.052, 0.003, 0.004, 0, 0.031, 0.02 + i * 0.058, 0xd8d0b0);   // neck + frets
      K.box(0.07, 0.03, 0.16, 0, 0, -0.06, 0x1a1a1e); for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) K.cyl(0.008, 0.008, 0.04, sx * 0.05, 0, -0.1 + i * 0.04, 0xd8dce4, 0, 0, R);   // headstock + tuners
      for (let i = 0; i < 6; i++) K.box(0.0025, 0.002, 0.74, -0.0125 + i * 0.005, 0.034, 0.36, 0xd8dce4);                 // strings
      const g = new THREE.Shape(); g.moveTo(0, 0); g.bezierCurveTo(0.24, -0.02, 0.26, 0.2, 0.14, 0.24); g.bezierCurveTo(0.24, 0.32, 0.22, 0.52, 0.04, 0.5); g.bezierCurveTo(-0.16, 0.56, -0.24, 0.32, -0.12, 0.26); g.bezierCurveTo(-0.26, 0.18, -0.2, -0.04, 0, 0);
      const bg = new THREE.ExtrudeGeometry(g, { depth: 0.07, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }); bg.rotateX(R); bg.translate(0, 0.008, 0.56); K.geo(bg, pc.c);
      K.box(0.08, 0.02, 0.22, 0, 0.045, 0.78, 0xf2f2f2); for (const z of [0.72, 0.82]) { K.box(0.06, 0.016, 0.03, 0, 0.056, z, 0x1a1a1e); for (let i = 0; i < 6; i++) K.cyl(0.003, 0.003, 0.004, -0.0125 + i * 0.005, 0.066, z, 0xd8dce4); }   // pickguard + pickups
      K.box(0.06, 0.02, 0.025, 0, 0.05, 0.92, 0xb8bec6); for (const [x, z] of [[0.08, 0.86], [0.1, 0.94]]) K.cyl(0.016, 0.016, 0.02, x, 0.05, z, 0x1a1a1e);   // bridge + knobs
    }
  });
  parent.add(m);
}
// Tube between two points (for glider frames)
function tubeGeo(a, b, r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}
function triGeo(pts) {   // flat triangles from a list of [x,y,z] triples
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals(); return g;
}
// Delta-wing hang glider: billowed sail (outer panels + centre panel), leading edges, keel and a control bar.
// Glider-local space: y up, z forward; the frame hangs down to the hands about 1 m below the sail.
function deltaParts(span = 1.95, nose = 1.25, tail = 0.75) {
  const N = [0, 0.06, nose], LT = [-span, 0.2, -0.55], RT = [span, 0.2, -0.55], K = [0, -0.04, -tail], LB = [-span * 0.45, -0.13, -0.18], RB = [span * 0.45, -0.13, -0.18];
  return {
    outer: triGeo([N, LT, LB, LT, K, LB, N, RB, RT, RT, RB, K]),
    centre: triGeo([K, N, LB, N, K, RB]),
    tubes: [tubeGeo(N, LT, 0.028), tubeGeo(N, RT, 0.028), tubeGeo(N, K, 0.025), tubeGeo([0, -0.02, 0.15], [-0.42, -1.0, 0.3], 0.018), tubeGeo([0, -0.02, 0.15], [0.42, -1.0, 0.3], 0.018), tubeGeo([-0.42, -1.0, 0.3], [0.42, -1.0, 0.3], 0.02), tubeGeo([-span * 0.6, 0.15, -0.3], [0, -0.02, 0.15], 0.008), tubeGeo([span * 0.6, 0.15, -0.3], [0, -0.02, 0.15], 0.008)],
  };
}
function gliderModel(id, parent) {
  const gc = cosById('glider', id);
  if (id === 'umbrella') {
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    add(new THREE.ConeGeometry(1.7, 0.6, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 0, 0.1, 0);
    add(new THREE.SphereGeometry(0.1, 8, 6), basic(0xffe066), 0, 0.45, 0);
    add(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), lam(0xffe066), 0, -0.7, 0);
    return;
  }
  const L = [], frame = 0x2a2c33;
  if (id === 'kite') {
    // diamond kite with crossed spars and a ribbon tail
    const T = [0, 0.05, 1.45], R = [1.35, 0.12, 0], Bm = [0, 0.02, -1.6], Lf = [-1.35, 0.12, 0], C = [0, -0.16, 0];
    L.push([triGeo([T, Lf, C, Bm, R, C]), gc.c], [triGeo([T, C, R, Bm, C, Lf]), 0x2fe0d0]);
    L.push([tubeGeo(T, Bm, 0.025), frame], [tubeGeo(Lf, R, 0.025), frame], [tubeGeo([0, -0.02, 0.15], [-0.42, -1.0, 0.3], 0.018), frame], [tubeGeo([0, -0.02, 0.15], [0.42, -1.0, 0.3], 0.018), frame], [tubeGeo([-0.42, -1.0, 0.3], [0.42, -1.0, 0.3], 0.02), frame]);
    for (let i = 0; i < 5; i++) L.push([new THREE.BoxGeometry(0.16, 0.012, 0.22).translate(Math.sin(i * 1.3) * 0.12, -0.02, -1.75 - i * 0.28), i % 2 ? 0x2fe0d0 : gc.c]);
  } else if (id === 'vinyl') {
    const disc = new THREE.CylinderGeometry(1.75, 1.75, 0.03, 48); L.push([disc, gc.c]);
    for (let r = 0.75; r < 1.7; r += 0.16) L.push([new THREE.TorusGeometry(r, 0.012, 3, 64).rotateX(Math.PI / 2).translate(0, 0.018, 0), 0x2c2c34]);
    L.push([new THREE.CylinderGeometry(0.55, 0.55, 0.035, 32).translate(0, 0.005, 0), 0xff3fa6], [new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12).translate(0, 0.01, 0), 0xf2f2f2]);
    L.push([tubeGeo([0, -0.02, 0.15], [-0.42, -1.0, 0.3], 0.018), frame], [tubeGeo([0, -0.02, 0.15], [0.42, -1.0, 0.3], 0.018), frame], [tubeGeo([-0.42, -1.0, 0.3], [0.42, -1.0, 0.3], 0.02), frame]);
  } else {
    const D = id === 'gold' ? deltaParts(2.25, 1.15, 0.9) : deltaParts();
    L.push([D.outer, gc.c], [D.centre, id === 'gold' ? 0xfff2c4 : 0xf4f6fa]);
    for (const t of D.tubes) L.push([t, id === 'gold' ? 0xb8862a : frame]);
  }
  const m = mergedColored(L); m.material.side = THREE.DoubleSide; parent.add(m);
}
function heldModel(hid) {
  const g = new THREE.Group(); const h = HEALS[hid];
  if (hid === 'medkit') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.12), lam(0xffffff)); g.add(b); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.13), basic(0xe03030)); g.add(c1); const c2 = c1.clone(); c2.scale.set(0.3, 3, 1); g.add(c2); }
  else if (hid === 'bandage') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 10), lam(0xf2f2f2)); m.rotation.z = Math.PI / 2; g.add(m); }
  else { const m = new THREE.Mesh(new THREE.CylinderGeometry(hid === 'mini' ? 0.07 : 0.1, hid === 'mini' ? 0.09 : 0.12, hid === 'mini' ? 0.2 : 0.3, 10), new THREE.MeshLambertMaterial({ color: h.color, emissive: 0x0a2a6a })); g.add(m); }
  return g;
}

// skinned = true builds only what sits on top of the uploaded body model (face, hair, hats, chain, hood, pack, tools);
// clothes and boots are painted onto the model by CharModel instead.
function buildCharacter(eq, skinned) {
  let o = cosById('outfit', eq.outfit); const G = rigGeo(), SKN = !!skinned;
  if (eq.body === 'man' && o.hat === 'bun' && !o.personal) o = Object.assign({}, o, { hat: 'none' });   // the man version keeps short hair
  const FEM = !o.personal && (eq.body || 'woman') === 'woman';
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const M = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, typeof mat === 'number' ? lam(mat) : mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const R = { root, body, eq: Object.assign({}, eq), gunKey: null, heldKey: null };
  const hip = new THREE.Group(); hip.position.y = SK.hipY; body.add(hip);
  if (!SKN) M(G.hips, o.pants, 0, 0, 0, hip);
  // studded belt around the waist
  if (o.studBelt && !SKN) {
    M(latheGeo([[0.19, 0.055], [0.193, 0.075], [0.19, 0.095]], 16, 1.12 * 1.02, 0.7 * 1.02), 0x111114, 0, 0, 0, hip);
    const studs = [];
    for (let i = 0; i < 11; i++) { const a = (i / 10 - 0.5) * 2.4, x = Math.sin(a) * 0.19 * 1.14, z = Math.cos(a) * 0.19 * 0.72; studs.push([new THREE.SphereGeometry(0.008, 6, 4).translate(x, 0.075, z), 0xd8dce4]); }
    hip.add(mergedColored(studs));
  }
  for (const side of SKN ? [] : [1, -1]) {
    const leg = new THREE.Group(); leg.position.set(SK.hipX * side, 0, 0); hip.add(leg); M(G.thigh, o.pants, 0, 0, 0, leg);
    // cargo pants: a flapped pocket on the outside of each thigh
    if (o.cargo) {
      const pc = new THREE.Color(o.pants).multiplyScalar(0.82).getHex();
      M(B(0.032, 0.12, 0.095), pc, side * 0.082, -0.25, 0.004, leg); M(B(0.038, 0.028, 0.1), pc, side * 0.086, -0.18, 0.004, leg);
      M(new THREE.SphereGeometry(0.006, 6, 4), 0x2a2a2e, side * 0.103, -0.18, 0.04, leg);
    }
    const knee = new THREE.Group(); knee.position.y = -SK.thigh; leg.add(knee); M(G.kneeCap, o.pants, 0, 0, 0.008, knee); M(G.shin, o.pants, 0, 0, 0, knee); M(G.shoe, o.shoes ?? 0x22222a, 0, 0, 0, knee);
    if (o.boots) { M(new THREE.CylinderGeometry(0.056, 0.061, 0.17, 14), o.shoes, 0, -SK.shin + 0.06, 0.004, knee); M(new THREE.TorusGeometry(0.056, 0.008, 6, 14), new THREE.Color(o.shoes).multiplyScalar(0.75).getHex(), 0, -SK.shin + 0.145, 0.004, knee).rotation.x = Math.PI / 2; M(B(0.13, 0.022, 0.27), 0x2a1a10, 0, -SK.shin - 0.072, 0.045, knee); }
    R[side > 0 ? 'legL' : 'legR'] = leg; R[side > 0 ? 'kneeL' : 'kneeR'] = knee;
  }
  const torso = new THREE.Group(); hip.add(torso); R.torso = torso;
  const leatherMat = o.leather ? new THREE.MeshPhongMaterial({ color: o.jacket, shininess: 70, specular: 0x5a5a66, side: THREE.DoubleSide }) : null;
  const shirtMat = o.tiedye ? tieDyeMat() : o.shirt, sleeveMat = o.tiedye ? tieDyeMat() : o.leather ? leatherMat : o.sleeve;
  // tailored suit: white shirt in a V, thin tie, lapels, two buttons, pocket square
  if (o.suit && !SKN) {
    const fz = y => torsoR(y) * 0.66 + 0.004;
    const shirtV = M(B(0.085, 0.2, 0.01), 0xf2f2f4, 0, 0.5, fz(0.5), torso); shirtV.rotation.x = -0.12;
    M(B(0.026, 0.19, 0.012), o.tieC, 0, 0.47, fz(0.47) + 0.006, torso); M(B(0.034, 0.03, 0.014), o.tieC, 0, 0.575, fz(0.575) + 0.006, torso);
    for (const sx of [-1, 1]) { const lap = M(B(0.03, 0.24, 0.012), 0x0c0c10, sx * 0.055, 0.48, fz(0.48) + 0.008, torso); lap.rotation.z = sx * 0.32; }
    for (const y of [0.3, 0.22]) M(new THREE.SphereGeometry(0.008, 6, 4), 0x0a0a0c, 0.02, y, fz(y) + 0.004, torso);
    M(B(0.04, 0.018, 0.008), 0xf2f2f4, 0.13, 0.46, fz(0.46) - 0.004, torso);
  }
  // open leather jacket with silver zip edges and studded shoulders
  if (o.leather && !SKN) {
    const JX = 1.12 * 1.09, JZ = 0.66 * 1.13, GAP = 0.5;
    const open = (pts, gap, sx, sz) => { const g = new THREE.LatheGeometry(pts, 22, gap, TAU - gap * 2); g.scale(sx, 1, sz); return g; };
    const prof = []; for (let y = -0.04; y <= 0.6001; y += 0.02) prof.push(new THREE.Vector2(Math.max(0.0001, torsoR(y) * 1.02), y));
    M(open(prof, GAP, JX, JZ), leatherMat, 0, 0, 0, torso);
    M(open([[0.1, 0.55], [0.124, 0.59], [0.13, 0.64], [0.112, 0.665]].map(p => new THREE.Vector2(p[0], p[1])), 0.75, 1.25, 1.0), leatherMat, 0, 0, 0, torso);
    for (const sx of [-1, 1]) {
      const r = torsoR(0.3) * 1.02, px = sx * JX * r * Math.sin(GAP), pz = JZ * r * Math.cos(GAP);
      M(B(0.008, 0.56, 0.01), 0xc8ccd4, px, 0.27, pz + 0.004, torso);
      const st = [];
      for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) { const x = sx * (0.12 + i * 0.03), y = 0.535 - Math.abs(x) * 0.08, z = -0.035 + k * 0.06; st.push([new THREE.SphereGeometry(0.009, 6, 4).translate(x, y + 0.02, z), 0xdfe3ea]); }
      torso.add(mergedColored(st));
    }
  }
  if (!SKN) { M(G.torso, shirtMat, 0, 0, 0, torso); M(G.neck, o.skin, 0, 0, 0, torso); }
  else if (o.collar) { const cl = M(new THREE.CylinderGeometry(COLLAR[0], COLLAR[1], COLLAR[2], 22, 1, true), new THREE.MeshLambertMaterial({ color: o.leather ? o.jacket : o.shirt, side: THREE.DoubleSide }), 0, COLLAR[3], COLLAR[4], torso); cl.userData.collar = true; }   // a neat collar hides the jagged neck seam of the uploaded body
  // hoodie: hood bunched behind the neck plus two drawstrings
  if (o.hoodie) {
    const hood = M(new THREE.TorusGeometry(0.085, 0.045, 8, 18), shirtMat, 0, 0.6, -0.045, torso); hood.rotation.x = Math.PI / 2 - 0.35; hood.scale.set(1.35, 1.15, 1);
    if (!SKN) for (const sx of [-1, 1]) M(B(0.008, 0.13, 0.008), 0xf4f4f4, sx * 0.04, 0.5, torsoR(0.5) * 0.66 + 0.012, torso);
  }
  const front = y => torsoR(y) * 0.66;
  if (o.visor && !SKN) M(B(0.12, 0.04, 0.01), basic(o.visor), 0, 0.42, front(0.42) + 0.004, torso);
  if (o.id === 'tycoon' && !SKN) { M(B(0.045, 0.26, 0.012), 0x1a1a1a, 0, 0.36, front(0.36) + 0.004, torso); M(B(0.16, 0.035, 0.012), 0xd4a72c, 0, 0.02, front(0.02) + 0.004, torso); }
  // open puffer jacket: quilted rolls built into the profile, open down the front over the tee
  if (o.puffer) {
    const JX = 1.12 * 1.16, JZ = 0.66 * 1.2, GAP = 0.42, jc = o.jacket ?? o.shirt, ROW = 0.105;
    const jmat = new THREE.MeshLambertMaterial({ color: jc, side: THREE.DoubleSide });
    const puffR = y => torsoR(y) * (1 + 0.06 * Math.abs(Math.sin(Math.PI * (y + 0.05) / ROW)));
    const prof = []; for (let y = -0.05; y <= 0.6001; y += 0.0105) prof.push(new THREE.Vector2(Math.max(0.0001, puffR(y)), y));
    const open = (pts, gap, sx, sz) => { const g = new THREE.LatheGeometry(pts, 22, gap, TAU - gap * 2); g.scale(sx, 1, sz); return g; };
    M(open(prof, GAP, JX, JZ), jmat, 0, -0.005, 0, torso);
    // stand-up collar
    const colPts = [[0.1, 0.56], [0.118, 0.6], [0.122, 0.655], [0.108, 0.69], [0.094, 0.68]].map(p => new THREE.Vector2(p[0], p[1]));
    M(open(colPts, 0.6, 1.2, 1.0), jmat, 0, 0, 0, torso);
    // plackets with zipper teeth down both open edges
    for (const s of [-1, 1]) {
      const r = puffR(0.3), px = s * JX * r * Math.sin(GAP), pz = JZ * r * Math.cos(GAP);
      M(B(0.022, 0.56, 0.02), jc, px, 0.29, pz, torso); M(B(0.006, 0.54, 0.008), 0x8a8d96, px - s * 0.012, 0.29, pz + 0.008, torso);
    }
    // "999" on the left chest
    const tx = 0.16, ty = 0.44, rr = puffR(ty), tz = JZ * rr * Math.sqrt(Math.max(0, 1 - (tx / (JX * rr)) ** 2));
    const logo = textDecal('999', 0.085, 0.042); logo.position.set(tx, ty, tz + 0.008); logo.rotation.y = Math.atan2(tx / (JX * JX), tz / (JZ * JZ)); torso.add(logo);
  }
  // big print across the back of the shirt
  if (o.back) { const bp = backPrint(o.back, SKN ? 0.3 / 0.7 : 0.3, 0.15, o.backFill || '#111114', o.backEdge || '#e8731e'); bp.position.set(0, 0.4, SKN ? BACK_Z : -torsoR(0.36) * 0.66 - 0.006); bp.rotation.y = Math.PI; torso.add(bp); }
  // chunky silver chain hanging in a U, with a 999 pendant
  if (o.chain) {
    const links = [], N = 19, W = 0.07, TOP = 0.61, DROP = 0.11;
    for (let i = 0; i < N; i++) {
      const a = lerp(-Math.PI / 2, Math.PI / 2, i / (N - 1)), x = W * Math.sin(a), y = TOP - DROP * Math.cos(a);
      const z = front(y) * Math.sqrt(Math.max(0, 1 - (x / (1.12 * Math.max(0.05, torsoR(y)))) ** 2)) + 0.016 + (SKN ? CHAIN_Z : 0);   // sits on the shirt of the uploaded body
      const g = new THREE.TorusGeometry(0.0105, 0.0045, 5, 8); g.scale(1.35, 1, 1);
      if (i % 2) g.rotateX(Math.PI / 2);
      g.rotateZ(Math.atan2(DROP * Math.sin(a), W * Math.cos(a))); g.translate(x, y, z);
      links.push([g, o.chain === 'gold' ? (i % 2 ? 0xc9962a : 0xf2d27a) : (i % 2 ? 0xc4cad2 : 0xeef1f5)]);
    }
    torso.add(mergedColored(links));
    const py = TOP - DROP - 0.035, pz = front(py) + 0.02 + (SKN ? CHAIN_Z : 0);
    if (o.chain === 'gold') {   // crescent moon pendant
      const moon = new THREE.Shape(); moon.absarc(0, 0, 0.032, Math.PI * 0.35, Math.PI * 1.65, false); moon.absarc(0.016, 0, 0.026, Math.PI * 1.55, Math.PI * 0.45, true);
      const mg = new THREE.ExtrudeGeometry(moon, { depth: 0.008, bevelEnabled: false }); const pm = M(mg, new THREE.MeshPhongMaterial({ color: 0xf0c64a, shininess: 80, specular: 0x8a6a20 }), 0, py - 0.005, pz - 0.004, torso); pm.rotation.z = -0.3;
    } else {
      M(B(0.122, 0.058, 0.008), 0xd9dee5, 0, py, pz - 0.002, torso);                  // silver rim
      M(B(0.108, 0.045, 0.006), 0x1e2127, 0, py, pz + 0.002, torso);                  // dark face
      const pend = textDecal('999', 0.1, 0.05, '#f4f6f8', '900 100px "Arial Black", Impact, sans-serif'); pend.position.set(0, py, pz + 0.0065); torso.add(pend);
      for (const sx of [-1, 1]) M(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8).rotateX(Math.PI / 2), 0xeef1f5, sx * 0.052, py + 0.022, pz + 0.004, torso);   // bails the chain hangs from
    }
  }
  if (o.chestLogo) {   // small print on the left of the chest
    const y = 0.5, lx = 0.085, lz = front(y) * Math.sqrt(Math.max(0, 1 - (lx / (1.12 * Math.max(0.05, torsoR(y)))) ** 2)) + 0.012 + (SKN ? CHAIN_Z : 0);
    const d = textDecal(o.chestLogo, 0.07, 0.035, o.chestLogoC || '#1b1d22', '900 100px "Arial Black", Impact, sans-serif'); d.position.set(lx, y, lz); d.rotation.y = Math.atan2(lx, 0.25) * 0.6; torso.add(d);
  }
  if (SKN) R.elbowR = new THREE.Group();
  for (const side of SKN ? [] : [1, -1]) {
    const sh = new THREE.Group(); sh.position.set(SK.shX * side, SK.shY, 0); sh.rotation.order = 'YXZ'; torso.add(sh);
    const up = M(G.upper, sleeveMat, 0, 0, 0, sh);
    const el = new THREE.Group(); el.position.y = -SK.upper; sh.add(el);
    const fo = M(G.fore, sleeveMat, 0, 0, 0, el); M(G.hand, o.skin, 0, 0, 0, el); const ec = M(G.elbowCap, sleeveMat, 0, 0, -0.006, el); if (o.puffer) ec.scale.setScalar(1.3);
    if (o.puffer) { up.scale.set(1.4, 1, 1.4); fo.scale.set(1.32, 1, 1.32); }
    R[side > 0 ? 'armL' : 'armR'] = sh; R[side > 0 ? 'elbowL' : 'elbowR'] = el;
  }
  const head = new THREE.Group(); head.position.set(0, SK.headY, 0); torso.add(head); R.head = head;
  const hs = o.head || [1, 1, 1], boxHead = !!o.head;
  let faceZ = 0;
  if (boxHead) { M(B(0.5 * hs[0] * 0.6, 0.5 * hs[1] * 0.6, 0.5 * hs[2] * 0.6), o.skin, 0, 0, 0, head); faceZ = 0.25 * hs[2] * 0.6; }
  else if (!SKN) M(G.head, o.skin, 0, 0, 0, head);
  if (o.hat !== 'helmet') {
    const iris = o.visor && o.id === 'nightwarden' ? basic(o.visor) : lam(0x2e2016);
    for (const sx of [-1, 1]) {
      const wz = boxHead ? faceZ + 0.004 : 0.122;
      const w = M(new THREE.SphereGeometry(0.021, 10, 8), o.id === 'nightwarden' ? 0x101014 : 0xf4f1ea, sx * 0.046, 0.018, wz, head); w.scale.set(1, 0.75, 0.55);
      M(new THREE.SphereGeometry(0.0115, 8, 6), iris, sx * 0.046, 0.018, wz + 0.009, head);
      if (o.shiesty) { if (!boxHead) { const ear = M(new THREE.SphereGeometry(1, 8, 6), o.shiesty, sx * 0.124, 0, -0.005, head); ear.scale.set(0.02, 0.037, 0.028); } continue; }
      const br = M(B(0.046, FEM ? 0.0055 : 0.011, 0.012), o.hair != null ? o.hair : 0x2a1a10, sx * 0.047, FEM ? 0.056 : 0.052, boxHead ? faceZ + 0.006 : 0.124, head); br.rotation.z = sx * (FEM ? 0.2 : 0.12);
      if (FEM && !boxHead) { const lash = M(B(0.036, 0.006, 0.008), 0x120c0a, sx * 0.048, 0.031, 0.13, head); lash.rotation.z = -sx * 0.18; }
      if (!boxHead) { const ear = M(new THREE.SphereGeometry(1, 8, 6), o.skin, sx * 0.124, 0, -0.005, head); ear.scale.set(0.018, 0.035, 0.026); }
    }
    if (!boxHead) { const n = M(B(0.024, 0.05, 0.03), new THREE.MeshLambertMaterial({ color: o.shiesty ?? new THREE.Color(o.skin).multiplyScalar(0.92) }), 0, -0.015, 0.138, head); n.rotation.x = 0.22; if (o.shiesty) { n.scale.set(0.9, 0.85, 0.5); n.position.z = 0.13; } }
    if (o.shiesty) { /* mouth hidden under the mask */ }
    else if (FEM && !boxHead) { M(B(0.044, 0.008, 0.012), 0xb0405a, 0, -0.066, 0.121, head); M(B(0.038, 0.007, 0.012), 0x9a3048, 0, -0.075, 0.12, head); }
    else M(B(0.05, 0.009, 0.01), o.id === 'toast' ? 0x5a3010 : 0x6a3030, 0, -0.07, boxHead ? faceZ + 0.004 : 0.121, head);
  }
  // thin moustache, soul patch and light chin strip
  // thin moustache with light stubble
  if (o.mustache) {
    M(B(0.06, 0.008, 0.01), 0x120c08, 0, -0.051, 0.133, head);
    const stub = M(new THREE.SphereGeometry(1, 12, 8, 0, TAU, Math.PI * 0.71, Math.PI * 0.2), new THREE.MeshLambertMaterial({ color: new THREE.Color(o.skin).multiplyScalar(0.72) }), 0, -0.004, 0.004, head);
    stub.scale.set(0.127, 0.157, 0.142);
  }
  // face tattoos: a teardrop under the left eye, a star on the right cheek, three short lines over the left brow
  if (o.faceTats === 'uzi' && !boxHead) {   // a small heart on the left cheek, three dots under the right eye, a diamond between the brows
    const ink = new THREE.MeshLambertMaterial({ color: 0x15101a });
    const heart = new THREE.Shape(); heart.moveTo(0, -0.011); heart.bezierCurveTo(-0.016, 0.0, -0.012, 0.013, 0, 0.005); heart.bezierCurveTo(0.012, 0.013, 0.016, 0.0, 0, -0.011);
    const h = M(new THREE.ShapeGeometry(heart), ink, 0.072, -0.032, 0.117, head); h.rotation.y = 0.55;
    for (let i = 0; i < 3; i++) { const d = M(new THREE.CircleGeometry(0.0034, 8), ink, -0.04 - (i % 2) * 0.012, -0.004 - (i === 2 ? 0.01 : 0), 0.131, head); d.rotation.y = -0.3; }
    const dm = M(new THREE.CircleGeometry(0.008, 4), ink, 0, 0.06, 0.137, head); dm.rotation.z = Math.PI / 4;
    // more ink, laid onto the curve of the face: a star on the temple, a cross on the other cheekbone, lines beside the
    // eye, a lightning bolt on the jaw, small script under the eye, a dotted line along the jaw and a ring on the chin
    const at = (m, x, y, dz = 0.0025) => { const z = Math.sqrt(Math.max(1e-4, 0.0196 - x * x - y * y * 0.75)) + dz; m.position.set(x, y, z); m.rotation.set(-Math.atan2(y, z) * 0.7, Math.atan2(x, z), m.rotation.z); return m; };
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.0045 : 0.011; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    at(M(new THREE.ShapeGeometry(star), ink, 0, 0, 0, head), 0.084, 0.046);
    for (const [w, h2] of [[0.0035, 0.018], [0.012, 0.0035]]) at(M(new THREE.PlaneGeometry(w, h2), ink, 0, 0, 0, head), -0.078, -0.026);
    for (let i = 0; i < 3; i++) { const l = at(M(new THREE.PlaneGeometry(0.012, 0.003), ink, 0, 0, 0, head), -0.09, 0.034 - i * 0.008); l.rotation.z = 0.25; }   // three lines beside the eye
    const bolt = new THREE.Shape(); bolt.moveTo(0.003, 0.014); bolt.lineTo(-0.006, 0.0); bolt.lineTo(0.0, 0.0); bolt.lineTo(-0.004, -0.014); bolt.lineTo(0.007, 0.003); bolt.lineTo(0.001, 0.003); bolt.lineTo(0.006, 0.014);
    at(M(new THREE.ShapeGeometry(bolt), ink, 0, 0, 0, head), 0.066, -0.074);
    for (let i = 0; i < 5; i++) at(M(new THREE.PlaneGeometry(0.0022, i % 2 ? 0.0065 : 0.0045), ink, 0, 0, 0, head), 0.03 + i * 0.0065, -0.008 - (i % 2) * 0.001);
    for (let i = 0; i < 4; i++) at(M(new THREE.CircleGeometry(0.0026, 6), ink, 0, 0, 0, head), -0.056 - i * 0.009, -0.066 - i * 0.008);
    at(M(new THREE.RingGeometry(0.0045, 0.0072, 14), ink, 0, 0, 0, head), 0, -0.104, 0.004);
  } else if (o.faceTats && !boxHead) {
    const ink = new THREE.MeshLambertMaterial({ color: 0x15101a });
    const drop = new THREE.Shape(); drop.moveTo(0, 0.012); drop.bezierCurveTo(0.006, 0.002, 0.008, -0.006, 0, -0.01); drop.bezierCurveTo(-0.008, -0.006, -0.006, 0.002, 0, 0.012);
    const t = M(new THREE.ShapeGeometry(drop), ink, 0.05, -0.012, 0.131, head); t.rotation.y = 0.32;
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.0055 : 0.013; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const s = M(new THREE.ShapeGeometry(star), ink, -0.074, -0.03, 0.117, head); s.rotation.y = -0.55;
    for (let i = 0; i < 3; i++) { const l = M(new THREE.PlaneGeometry(0.004, 0.018), ink, 0.058 + i * 0.01, 0.075, 0.124 - i * 0.004, head); l.rotation.set(-0.15, 0.36, -0.25); }
    // more ink: a second teardrop, a small cross, a star on the forehead, a web on the temple, dots on the cheekbone, a chin line
    const t2 = M(new THREE.ShapeGeometry(drop), ink, -0.05, -0.012, 0.131, head); t2.rotation.y = -0.32;
    for (const [w, h2] of [[0.004, 0.02], [0.014, 0.004]]) { const c = M(new THREE.PlaneGeometry(w, h2), ink, 0.078, -0.058, 0.112, head); c.rotation.y = 0.58; }
    const s2 = M(new THREE.ShapeGeometry(star), ink, -0.04, 0.095, 0.124, head); s2.rotation.set(-0.35, -0.25, 0); s2.scale.setScalar(0.75);
    for (let i = 0; i < 4; i++) { const a = -0.3 + i * 0.35, sp = M(new THREE.PlaneGeometry(0.0025, 0.028), ink, -0.104 + Math.cos(a) * 0.004, 0.045 + Math.sin(a) * 0.004, 0.08, head); sp.rotation.set(0, -1.05, a + 0.6); }
    for (const r of [0.012, 0.022]) { const arc = M(new THREE.RingGeometry(r, r + 0.0025, 12, 1, 0.4, 1.3), ink, -0.106, 0.04, 0.078, head); arc.rotation.y = -1.05; }
    for (let i = 0; i < 4; i++) { const d = M(new THREE.CircleGeometry(0.0026, 6), ink, -0.082 - i * 0.008, -0.002 - i * 0.004, 0.105 - i * 0.008, head); d.rotation.y = -0.75; }
    const chin = M(new THREE.PlaneGeometry(0.003, 0.022), ink, 0, -0.118, 0.111, head); chin.rotation.x = -0.5;
  }
  // silver hoop earring
  if (o.earring) { const hoop = M(new THREE.TorusGeometry(0.013, 0.0028, 6, 14), 0xe2e6ec, 0.13, -0.035, 0.0, head); hoop.rotation.y = Math.PI / 2; }
  // round tinted sunglasses
  if (o.shades) {
    const lens = new THREE.MeshLambertMaterial({ color: o.shades, emissive: new THREE.Color(o.shades).multiplyScalar(0.25) });
    for (const sx of [-1, 1]) {
      const l = M(new THREE.CylinderGeometry(0.027, 0.027, 0.006, 18), lens, sx * 0.047, 0.02, 0.143, head); l.rotation.x = Math.PI / 2;
      const rim = M(new THREE.TorusGeometry(0.027, 0.0035, 6, 18), 0x15151a, sx * 0.047, 0.02, 0.145, head); rim.rotation.y = 0;
      const arm = M(B(0.004, 0.004, 0.13), 0x15151a, sx * 0.088, 0.025, 0.08, head); arm.rotation.y = sx * 0.12;
    }
    M(B(0.026, 0.005, 0.005), 0x15151a, 0, 0.027, 0.146, head);
  }
  if (o.beard && !SKN) {   // built-in body: neat chinstrap along the jaw, thin moustache and a small goatee (the uploaded body paints it on)
    const bc = new THREE.MeshLambertMaterial({ color: 0x1a120c }), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const strap = new THREE.CatmullRomCurve3([V3(-0.118, -0.005, 0.03), V3(-0.112, -0.06, 0.06), V3(-0.08, -0.105, 0.092), V3(-0.035, -0.128, 0.112), V3(0, -0.132, 0.116), V3(0.035, -0.128, 0.112), V3(0.08, -0.105, 0.092), V3(0.112, -0.06, 0.06), V3(0.118, -0.005, 0.03)]);
    M(new THREE.TubeGeometry(strap, 28, 0.0075, 6, false), bc, 0, 0, 0, head);
    M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(-0.032, -0.056, 0.131), V3(0, -0.05, 0.139), V3(0.032, -0.056, 0.131)]), 10, 0.0045, 5, false), bc, 0, 0, 0, head);
    const gt = M(new THREE.SphereGeometry(1, 10, 8), bc, 0, -0.112, 0.117, head); gt.scale.set(0.018, 0.016, 0.008);
  }
  if (SKN) { /* hair is painted onto the model's scalp */ }
  else if (o.hat === 'slick') { const h = M(G.hair, new THREE.MeshPhongMaterial({ color: o.hair, shininess: 35, specular: 0x262626 }), 0, 0.006, -0.006, head); h.scale.set(1.02, 1.06, 1.04); }
  else if (!boxHead && !['helmet', 'dreads', 'toast'].includes(o.hat)) M(G.hair, o.hair != null ? o.hair : 0x2a1a10, 0, 0, 0, head);
  // caps and buns shaped for the rounded head
  if (!boxHead && o.hat === 'cap') {
    const crown = M(new THREE.SphereGeometry(1, 18, 9, 0, TAU, 0, Math.PI / 2), o.hatC, 0, 0.03, -0.004, head); crown.scale.set(0.141, 0.135, 0.156); crown.rotation.x = -0.12;
    const brim = M(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 18, 1, false, -Math.PI / 2, Math.PI), o.hatC, 0, 0.055, 0.1, head); brim.scale.set(1, 1, 0.9); brim.rotation.x = 0.12;
    M(new THREE.SphereGeometry(0.012, 6, 4), o.hatC, 0, 0.165, -0.01, head);
  } else if (!boxHead && o.hat === 'bun') {
    const bun = M(new THREE.SphereGeometry(0.075, 14, 10), o.hatC, 0, 0.16, -0.075, head); bun.scale.set(1, 0.85, 0.95);
    const tie = M(new THREE.TorusGeometry(0.05, 0.011, 6, 16), 0xe85d75, 0, 0.115, -0.07, head); tie.rotation.x = Math.PI / 2 - 0.5;
  }
  const hg = new THREE.Group(); hg.scale.setScalar(0.6); hg.position.y = (boxHead ? 0.25 * hs[1] * 0.6 : 0.155) - 0.25 * hs[1] * 0.6; head.add(hg);
  if (boxHead || !['cap', 'bun'].includes(o.hat)) hatModel(o, hg, hs, SKN);
  const pg = new THREE.Group(); pg.scale.setScalar(0.7); pg.position.set(0, 0.38, o.puffer ? -0.03 : 0); torso.add(pg); packModel(eq.backpack, pg); R.pack = pg;
  R.gun = new THREE.Group(); body.add(R.gun);
  R.pick = new THREE.Group(); R.pick.position.set(0, -SK.fore - 0.05, 0.02); R.pick.scale.setScalar(0.85); R.elbowR.add(R.pick); pickModel(eq.pickaxe, R.pick);
  R.glider = new THREE.Group(); R.glider.position.set(0, 3.2, 0); body.add(R.glider); gliderModel(eq.glider, R.glider); R.glider.visible = false;
  R.held = new THREE.Group(); R.held.position.set(0, -SK.fore - 0.06, 0.07); R.held.scale.setScalar(0.75); R.elbowR.add(R.held);
  return R;
}
function animateCharacter(R, a, P) {
  R.root.position.set(a.pos.x, a.pos.y + P.bob, a.pos.z); R.root.rotation.y = a.yaw; R.root.scale.setScalar((a.scale || 1) * BODY_SCALE);
  R.body.rotation.x = P.body;
  R.legL.rotation.set(P.legL[0], 0, P.legL[1]); R.legR.rotation.set(P.legR[0], 0, P.legR[1]);
  R.kneeL.rotation.x = P.kL; R.kneeR.rotation.x = P.kR;
  R.torso.rotation.y = P.twist;
  R.armL.rotation.set(P.aL[0], P.aL[1], P.aL[2], 'YXZ'); R.armR.rotation.set(P.aR[0], P.aR[1], P.aR[2], 'YXZ');
  R.elbowL.rotation.x = P.eL; R.elbowR.rotation.x = P.eR;
  R.head.rotation.x = P.head;
  const it = a.inv[a.slot];
  const gk = P.gun && it && it.kind === 'weapon' ? it.wid + it.rarity + R.eq.wrap : null;
  if (gk !== R.gunKey) { R.gunKey = gk; while (R.gun.children.length) R.gun.remove(R.gun.children[0]); if (gk) { const gm = gunModel(it, cosById('wrap', R.eq.wrap).c); gm.scale.setScalar(0.85); R.gun.add(gm); } }
  R.gun.visible = P.gun;
  if (P.gun) { const p = a.pitch; R.gun.position.set(-0.19, 1.5 + 0.52 * Math.sin(p), 0.5 * Math.cos(p) - 0.02); R.gun.rotation.x = -p; }
  const hk = P.held || null;
  if (hk !== R.heldKey) { R.heldKey = hk; while (R.held.children.length) R.held.remove(R.held.children[0]); if (hk) R.held.add(heldModel(hk)); }
  R.pick.visible = P.pick; R.glider.visible = P.glider; R.held.visible = !!P.held;
}
