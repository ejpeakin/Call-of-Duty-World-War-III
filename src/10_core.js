'use strict';
// =====================================================================
//  FORTDAY — core utilities, data tables, profile, audio
// =====================================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a, b) => b === undefined ? Math.random() * (a === undefined ? 1 : a) : a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const pickR = (R, arr) => arr[Math.floor(R() * arr.length)];
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const $ = id => document.getElementById(id);
const hexCss = h => '#' + h.toString(16).padStart(6, '0');
const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || false;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function weighted(list, r = Math.random) { let s = 0; for (const x of list) s += x.w; let v = r() * s; for (const x of list) { v -= x.w; if (v <= 0) return x; } return list[list.length - 1]; }

function makeNoise(seed) {
  const r = mulberry32(seed); const p = new Uint16Array(512); const perm = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = new Float32Array(256); for (let i = 0; i < 256; i++) g[i] = r() * 2 - 1;
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi; const X = xi & 255, Y = yi & 255;
    const a = g[p[p[X] + Y]], b = g[p[p[X + 1] + Y]], c = g[p[p[X] + Y + 1]], d = g[p[p[X + 1] + Y + 1]];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, o = 4) { let s = 0, a = 1, f = 1, n = 0; for (let i = 0; i < o; i++) { s += n2(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
  return { n2, fbm };
}

// ---------------------------------------------------------------- rarity
const RARITY = [
  { name: 'Common', css: '#a3a9b3', hex: 0xa3a9b3, dmg: 1.00, rel: 1.00 },
  { name: 'Uncommon', css: '#4fd05a', hex: 0x4fd05a, dmg: 1.05, rel: 0.95 },
  { name: 'Rare', css: '#3f95ff', hex: 0x3f95ff, dmg: 1.10, rel: 0.90 },
  { name: 'Epic', css: '#b45cff', hex: 0xb45cff, dmg: 1.16, rel: 0.85 },
  { name: 'Legendary', css: '#ffad33', hex: 0xffad33, dmg: 1.22, rel: 0.80 },
  { name: 'Mythic', css: '#ffe066', hex: 0xffe066, dmg: 1, rel: 1 },
  { name: 'Exotic', css: '#2fe0d0', hex: 0x2fe0d0, dmg: 1, rel: 1 },
];

const AMMO = {
  light: { name: 'Light Ammo', short: 'LIGHT', color: 0x9fd0ff, pick: 30 },
  medium: { name: 'Medium Ammo', short: 'MED', color: 0x6fd36f, pick: 30 },
  heavy: { name: 'Heavy Ammo', short: 'HEAVY', color: 0xe0603a, pick: 6 },
  shells: { name: 'Shells', short: 'SHELLS', color: 0xf2c14e, pick: 8 },
  rockets: { name: 'Rockets', short: 'RKT', color: 0xbababa, pick: 2 },
};
const MATS = {
  wood: { name: 'Wood', hp: 150, color: 0xb07a40 },
  brick: { name: 'Brick', hp: 250, color: 0xb5523b },
  metal: { name: 'Metal', hp: 400, color: 0x8d99a6 },
};
const MAT_ORDER = ['wood', 'brick', 'metal'];

// type: model + bot logic; ammo; auto; head = headshot multiplier
const WEAPONS = {
  pistol: { name: 'Sidearm', short: 'PISTOL', type: 'pistol', dmg: 24, rate: 6.5, mag: 16, reload: 1.3, spread: 0.016, ads: 0.006, range: 140, ammo: 'light', auto: false, struct: 1, head: 1.75, minR: 0 },
  smg: { name: 'Buzzsaw SMG', short: 'SMG', type: 'smg', dmg: 16, rate: 11, mag: 30, reload: 2.0, spread: 0.038, ads: 0.024, range: 100, ammo: 'light', auto: true, struct: 1, head: 1.75, minR: 0 },
  ar: { name: 'Trailblazer AR', short: 'RIFLE', type: 'ar', dmg: 30, rate: 5.5, mag: 30, reload: 2.2, spread: 0.026, ads: 0.007, range: 220, ammo: 'medium', auto: true, struct: 1, head: 1.75, minR: 0 },
  shotgun: { name: 'Brawler Pump', short: 'PUMP', type: 'shotgun', dmg: 9.5, pellets: 10, rate: 1.15, mag: 5, reload: 4.2, spread: 0.075, ads: 0.06, range: 42, ammo: 'shells', auto: false, struct: 0.8, head: 1.75, minR: 0 },
  sniper: { name: 'Longshot Bolt', short: 'SNIPER', type: 'sniper', dmg: 105, rate: 0.6, mag: 1, reload: 2.4, spread: 0.06, ads: 0.0, range: 450, ammo: 'heavy', auto: false, struct: 1.2, head: 2.5, scope: true, minR: 1 },
  rocket: { name: 'Thunderclap RPG', short: 'RPG', type: 'rocket', dmg: 95, rate: 0.8, mag: 1, reload: 3.0, spread: 0.012, ads: 0.004, range: 300, ammo: 'rockets', auto: false, proj: 70, splash: 5.5, struct: 5, head: 1, minR: 2 },
  stormcaller: { name: "Warden's Stormcaller", short: 'MYTHIC', type: 'ar', dmg: 38, rate: 7, mag: 40, reload: 1.8, spread: 0.018, ads: 0.004, range: 240, ammo: 'medium', auto: true, struct: 1.2, head: 1.8, mythic: true },
  sledge: { name: "Foreman's Sledge", short: 'MYTHIC', type: 'shotgun', dmg: 11, pellets: 10, rate: 1.7, mag: 8, reload: 3.2, spread: 0.065, ads: 0.05, range: 48, ammo: 'shells', auto: false, struct: 1.5, head: 1.75, mythic: true },
  frostbite: { name: 'Frostbite Rifle', short: 'EXOTIC', type: 'ar', dmg: 44, rate: 2.6, mag: 10, reload: 2.2, spread: 0.02, ads: 0.002, range: 300, ammo: 'heavy', auto: false, struct: 1, head: 2, slow: 2.5, exotic: true },
  kicker: { name: 'Kinetic Kicker', short: 'EXOTIC', type: 'shotgun', dmg: 8, pellets: 10, rate: 1.3, mag: 6, reload: 3.4, spread: 0.07, ads: 0.06, range: 38, ammo: 'shells', auto: false, struct: 1, head: 1.6, knock: 17, exotic: true },
};
const GUN_SIZE = { pistol: [0.1, 0.18, 0.42], smg: [0.12, 0.2, 0.62], ar: [0.12, 0.2, 0.95], shotgun: [0.14, 0.18, 0.92], sniper: [0.11, 0.18, 1.35], rocket: [0.26, 0.26, 1.25] };
const WEAPON_POOL = [{ w: 24, id: 'ar' }, { w: 20, id: 'shotgun' }, { w: 18, id: 'smg' }, { w: 16, id: 'pistol' }, { w: 9, id: 'sniper' }, { w: 5, id: 'rocket' }];
const RAR_FLOOR = [{ w: 38, r: 0 }, { w: 34, r: 1 }, { w: 19, r: 2 }, { w: 7, r: 3 }, { w: 2, r: 4 }];
const RAR_CHEST = [{ w: 16, r: 0 }, { w: 34, r: 1 }, { w: 31, r: 2 }, { w: 14, r: 3 }, { w: 5, r: 4 }];
const RAR_SUPPLY = [{ w: 60, r: 3 }, { w: 40, r: 4 }];

const HEALS = {
  bandage: { name: 'Bandages', short: 'BAND', rarity: 0, time: 2.2, hp: 15, hpMax: 75, stack: 15, pick: 5, color: 0xeeeeee },
  medkit: { name: 'Med-Kit', short: 'MED', rarity: 1, time: 5, hp: 100, hpMax: 100, stack: 3, pick: 1, color: 0xffffff },
  mini: { name: 'Mini Shield Vial', short: 'MINI', rarity: 1, time: 1.2, sh: 25, shMax: 50, stack: 6, pick: 3, color: 0x58b8ff },
  shield: { name: 'Shield Potion', short: 'SHIELD', rarity: 2, time: 3, sh: 50, shMax: 100, stack: 3, pick: 1, color: 0x2a7cff },
};
const HEAL_POOL = [{ w: 30, id: 'bandage' }, { w: 16, id: 'medkit' }, { w: 32, id: 'mini' }, { w: 22, id: 'shield' }];

function makeWeapon(id, r) { return { kind: 'weapon', wid: id, rarity: r, mag: WEAPONS[id].mag }; }
function rollWeapon(table) { const id = weighted(WEAPON_POOL).id; let r = weighted(table).r; r = Math.max(r, WEAPONS[id].minR); return makeWeapon(id, r); }
function rollHeal() { const id = weighted(HEAL_POOL).id; return { kind: 'heal', hid: id, count: HEALS[id].pick }; }
function ammoFor(wid, mult = 1) { const a = WEAPONS[wid].ammo; return { kind: 'ammo', ammo: a, count: Math.round(AMMO[a].pick * mult) }; }
function itemName(it) {
  if (!it) return '';
  if (it.kind === 'weapon') { const w = WEAPONS[it.wid]; return it.rarity >= 5 ? w.name : RARITY[it.rarity].name + ' ' + w.name; }
  if (it.kind === 'heal') return HEALS[it.hid].name + (it.count > 1 ? ' ×' + it.count : '');
  if (it.kind === 'ammo') return AMMO[it.ammo].name + ' ×' + it.count;
  if (it.kind === 'mats') return MATS[it.mat].name + ' ×' + it.count;
  if (it.kind === 'pick') return 'Harvesting Tool';
  return '';
}
function itemRarity(it) { return it.kind === 'weapon' ? it.rarity : it.kind === 'heal' ? HEALS[it.hid].rarity : 0; }
const _stat = {};
function wstat(it) {
  const k = it.wid + it.rarity; let s = _stat[k]; if (s) return s;
  const b = WEAPONS[it.wid]; s = Object.assign({}, b);
  if (it.rarity < 5) { s.dmg = b.dmg * RARITY[it.rarity].dmg; s.reload = b.reload * RARITY[it.rarity].rel; }
  return (_stat[k] = s);
}

// ---------------------------------------------------------------- islands (seasons / chapters)
const THEMES = {
  greenvale: {
    name: 'Greenvale', tag: 'Chapter 1 · Classic suburbs', swatch: 'linear-gradient(160deg,#7fd36a,#2f7d4a)', seed: 1701,
    skyTop: 0x4f9be8, skyHor: 0xcde9ff, fog: 0xc4e2fb, fogNear: 200, fogFar: 640, sun: 0xfff1d6, sunI: 1.0, hemiS: 0xbfd8ff, hemiG: 0x4f6a3a, hemiI: 0.62,
    grass: 0x5a9c45, grass2: 0x47863a, sand: 0xe7d6a0, rock: 0x8a8d93, snow: 0xf3f6f9, snowLine: 48, plaza: 0x9d9a8f, water: 0x2a8dd4, waterY: 0,
    base: 3, rough: 22, mount: 210, mBias: 0, style: 'town', trees: { type: 'mixed', n: 700 }, rocks: 220, cars: true, night: false,
    pois: ['Maple Commons', 'Rustwater Yard', 'Pinecrest Plaza', 'Juniper Junction', 'Saltmarsh Docks', 'Cinder Quarry', 'Lantern Row', 'Briar Hollow', 'Kettle Creek', 'Hearth Hill', 'Copper Fields', 'Willow Bend', 'Old Mill Row', 'Foxglove Farms', 'Gull Point'],
  },
  floodtide: {
    name: 'Floodtide', tag: 'Chapter 2 · Flooded world', swatch: 'linear-gradient(160deg,#58c7e8,#1f5f9a)', seed: 2902,
    skyTop: 0x6aaee0, skyHor: 0xdaf1ff, fog: 0xcfe9f7, fogNear: 180, fogFar: 600, sun: 0xfff6e0, sunI: 0.95, hemiS: 0xcfe6ff, hemiG: 0x3a6a6a, hemiI: 0.65,
    grass: 0x66ad50, grass2: 0x4f9443, sand: 0xf0e2b0, rock: 0x7f8a8f, snow: 0, snowLine: 0, plaza: 0xa8a090, water: 0x2aa3c9, waterY: 4.5,
    base: 1, rough: 26, mount: 130, mBias: 0, style: 'flood', trees: { type: 'palm', n: 420 }, rocks: 140, cars: true, night: false,
    pois: ['Sunken Square', 'Pier Nine', 'Driftwood Isle', 'Mangrove Mile', 'Tidecall Terrace', 'Lighthouse Leap', 'Barnacle Bay', 'Floodgate', 'Coral Quarters', 'Kelp Corner', 'Anchor Arcade', 'Stilt Village', 'Rainfall Row', 'Harbor Heights', 'Seaglass Shore'],
  },
  neon: {
    name: 'Neon Sprawl', tag: 'Chapter 3 · Cyber metropolis', swatch: 'linear-gradient(160deg,#ff2fd0,#2a1b6e 60%,#2fe7ff)', seed: 3303,
    skyTop: 0x0b0824, skyHor: 0x3b1d66, fog: 0x2a1650, fogNear: 140, fogFar: 520, sun: 0xb9a8ff, sunI: 0.55, hemiS: 0x6a5acd, hemiG: 0x1a1030, hemiI: 0.55,
    grass: 0x2f5a5a, grass2: 0x264a52, sand: 0x6b6a7a, rock: 0x4a4e5e, snow: 0, snowLine: 0, plaza: 0x2c2c3a, water: 0x1d3a7a, waterY: 0,
    base: 3, rough: 14, mount: 150, mBias: -0.02, style: 'city', trees: { type: 'neon', n: 320 }, rocks: 120, cars: true, night: true,
    pois: ['Voltage Strip', 'Chrome Heights', 'Holo Bazaar', 'Datacore Docks', 'Pixel Park', 'Neon Spire', 'Glitch Gardens', 'Synth Station', 'Laser Lanes', 'Circuit Court', 'Arcade Alley', 'Bassline Block', 'Grid Garage', 'Vapor Vista', 'Prism Plaza'],
  },
  olympia: {
    name: 'Olympia Rise', tag: 'Chapter 4 · Mythic realm', swatch: 'linear-gradient(160deg,#ffd27a,#e0805a 55%,#7c5bc4)', seed: 4404,
    skyTop: 0x6d7fd6, skyHor: 0xffd7a6, fog: 0xf5d2b0, fogNear: 200, fogFar: 650, sun: 0xffd9a0, sunI: 1.05, hemiS: 0xffe2c4, hemiG: 0x5a6a3a, hemiI: 0.6,
    grass: 0x78ad55, grass2: 0x619445, sand: 0xf1e2bd, rock: 0xb8b2a6, snow: 0xffffff, snowLine: 44, plaza: 0xe8e0cc, water: 0x2f8fc9, waterY: 0,
    base: 4, rough: 26, mount: 330, mBias: 0.02, style: 'temple', trees: { type: 'cypress', n: 560 }, rocks: 260, cars: true, night: false,
    pois: ['Marble Agora', 'Oracle Steps', "Titan's Rest", 'Laurel Grove', 'Ember Forge', 'Siren Shoals', 'Pegasus Peak', 'Golden Stoa', 'Hydra Hollow', 'Lyre Landing', 'Olive Terrace', 'Muse Market', 'Comet Columns', 'Sunrise Shrine', 'Amber Amphitheater'],
  },
  dune: {
    name: 'Dune Reach', tag: 'Chapter 5 · Desert wastes', swatch: 'linear-gradient(160deg,#f6c27a,#b4612f)', seed: 5505,
    skyTop: 0x6fa6d8, skyHor: 0xf7ddb0, fog: 0xf0d6a8, fogNear: 170, fogFar: 600, sun: 0xfff0cf, sunI: 1.1, hemiS: 0xffe7c4, hemiG: 0x8a6a40, hemiI: 0.6,
    grass: 0xd9b276, grass2: 0xcfa065, sand: 0xe8cc94, rock: 0xb0764a, snow: 0, snowLine: 0, plaza: 0xbfa17a, water: 0x3a9ab8, waterY: -5,
    base: 4, rough: 18, mount: 200, mBias: 0, style: 'desert', trees: { type: 'cactus', n: 380 }, rocks: 300, cars: true, night: false,
    pois: ['Dustbowl Depot', 'Mirage Motel', 'Scorpion Gulch', 'Sunscar Mesa', 'Oasis Outpost', 'Rattlesnake Row', 'Bonepit', 'Sandstorm Silo', 'Cactus Crossing', 'Tumbleweed Town', 'Coyote Camp', 'Rustbucket Ranch', 'Dune Diner', 'Canyon Crossroads', 'Saguaro Springs'],
  },
};
const THEME_ORDER = ['greenvale', 'floodtide', 'neon', 'olympia', 'dune'];
// Map rotation: everyone starts on Greenvale. 30 days after a player's first match the next island opens and
// the previous one closes, in THEME_ORDER, starting over after the last.
// ---------------------------------------------------------------- keybinds
// [action, label, default key]. The game reacts to an action's default key name internally, so touch buttons and
// controllers keep working whatever a player binds; Keys translates the real key or mouse button they press.
const KEY_ACTIONS = [
  ['forward', 'Move forward', 'KeyW'], ['back', 'Move back', 'KeyS'], ['left', 'Move left', 'KeyA'], ['right', 'Move right', 'KeyD'],
  ['jump', 'Jump / leave bus / glider', 'Space'], ['sprint', 'Sprint', 'ShiftLeft'],
  ['fire', 'Fire / harvest / build', 'Mouse0'], ['ads', 'Aim down sights', 'Mouse2'], ['reload', 'Reload', 'KeyR'], ['use', 'Pick up / open / drive', 'KeyE'],
  ['slot1', 'Harvesting tool', 'Digit1'], ['slot2', 'Slot 2', 'Digit2'], ['slot3', 'Slot 3', 'Digit3'], ['slot4', 'Slot 4', 'Digit4'], ['slot5', 'Slot 5', 'Digit5'], ['slot6', 'Slot 6', 'Digit6'],
  ['build', 'Build mode on / off', 'KeyQ'], ['wall', 'Build wall', 'KeyZ'], ['ramp', 'Build ramp', 'KeyX'], ['floor', 'Build floor', 'KeyC'], ['material', 'Switch material', 'KeyG'],
  ['emote', 'Emote', 'KeyB'], ['map', 'Full map', 'KeyM'],
];
const KEY_DEF = Object.fromEntries(KEY_ACTIONS.map(k => [k[0], k[2]]));
const Keys = {
  get(act) { const k = Profile.d.keys && Profile.d.keys[act]; return typeof k === 'string' && k ? k : KEY_DEF[act]; },
  token(act) { return KEY_DEF[act]; },
  actionsFor(code) { const out = []; for (const [a] of KEY_ACTIONS) { const k = this.get(a); if (k === code || (k === 'ShiftLeft' && code === 'ShiftRight') || (k === 'ControlLeft' && code === 'ControlRight') || (k === 'AltLeft' && code === 'AltRight')) out.push(a); } return out; },
  held(act, keys) { const k = this.get(act); return !!(keys[k] || (k === 'ShiftLeft' && keys.ShiftRight) || (k === 'ControlLeft' && keys.ControlRight) || (k === 'AltLeft' && keys.AltRight)); },
  bound(code) { return this.actionsFor(code).length > 0; },
  // swap with whatever already used that key, so every action always has a key
  set(act, code) {
    const d = Profile.d; if (!d.keys || typeof d.keys !== 'object') d.keys = {};
    const old = this.get(act); for (const [a] of KEY_ACTIONS) if (a !== act && this.get(a) === code) d.keys[a] = old;
    d.keys[act] = code; Profile.save();
  },
  reset() { Profile.d.keys = {}; Profile.save(); },
  name(code) {
    if (!code) return '—';
    const M = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5', Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', MetaLeft: 'Search', CapsLock: 'Caps Lock', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
    if (M[code]) return M[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
    return code.replace(/([a-z])([A-Z])/g, '$1 $2');
  },
  of(act) { return this.name(this.get(act)); },
};
// at or below this much health a player drops and crawls until a Med-Kit gets them back up
const CRAWL_HP = 25;
const GLIDER_AUTO = 65;   // metres above the ground where the glider opens on its own (was 34)
const MAP_DAYS = 30, DAY_MS = 86400000;
const MapRotation = {
  start() { const f = Profile.d.firstPlay; return Number.isFinite(f) && f > 0 ? f : 0; },
  index(now = Date.now()) { const f = this.start(); return f ? Math.floor(Math.max(0, now - f) / (MAP_DAYS * DAY_MS)) % THEME_ORDER.length : 0; },
  current() { return THEME_ORDER[this.index()]; },
  next() { return THEME_ORDER[(this.index() + 1) % THEME_ORDER.length]; },
  msLeft(now = Date.now()) { const f = this.start(); if (!f) return MAP_DAYS * DAY_MS; const p = MAP_DAYS * DAY_MS; return p - (Math.max(0, now - f) % p); },
  left() { const ms = this.msLeft(), d = Math.floor(ms / DAY_MS); if (d >= 1) return d + (d === 1 ? ' day' : ' days'); const h = Math.max(1, Math.ceil(ms / 3600000)); return h + (h === 1 ? ' hour' : ' hours'); },
  began() { if (!this.start()) { Profile.d.firstPlay = Date.now(); Profile.save(); } },
};

const STYLES = {
  town: { walls: [0xe8e0cf, 0xcfd9e3, 0xf2d9a6, 0xd9c1ad, 0xc4dcbc], roofs: [0xb5483a, 0x3e6fb0, 0x56565e, 0x7a4b2a], found: 0x9a948a, mat: 'wood' },
  flood: { walls: [0xf0eee6, 0xa9d6e5, 0xf4c9a8, 0xd8e8c8], roofs: [0x2c7da0, 0xe07a5f, 0x3d405b], found: 0x6b5a46, mat: 'wood' },
  city: { walls: [0x2a2f45, 0x34304f, 0x1f2a3a, 0x3b3550], roofs: [0x15151f, 0x222233], found: 0x2b2b38, mat: 'metal', neon: [0xff2fd0, 0x2fe7ff, 0xffe14a, 0x7cff4f] },
  temple: { walls: [0xf1ede4, 0xe9e3d6, 0xf6f1e8], roofs: [0xd8a82a, 0xc0603a, 0x2f5fa8], found: 0xcfc8b8, mat: 'brick', columns: true },
  desert: { walls: [0xd9a86c, 0xe3b98a, 0xc98f5a, 0xeed2a8], roofs: [0xb07040, 0x8f5a35, 0xd9a86c], found: 0xa77b52, mat: 'brick' },
};

// ---------------------------------------------------------------- cosmetics (all original, all purely visual)
const COS = {
  outfit: [
    { id: 'rae', build: 'average', hair: 0x1a120c, name: 'Rookie Rae', r: 0, shirt: 0xe85d75, pants: 0x2c3e66, skin: 0x8d5a3b, sleeve: 0xf3f3f3, hat: 'bun', hatC: 0x2b1a12 },
    { id: 'ranger', build: 'average', hair: 0x5a3a1a, name: 'Rookie Ranger', r: 0, shirt: 0x2fa3a0, pants: 0x5b4a3a, skin: 0xe0b48c, sleeve: 0x2fa3a0, hat: 'cap', hatC: 0xff8a3d },
    { id: 'moss', build: 'heavy', hair: 0x3f6a2a, name: 'Moss Golem', r: 1, shirt: 0x4f7a3a, pants: 0x3e2f22, skin: 0x6f9a4c, sleeve: 0x4f7a3a, hat: 'leaves', hatC: 0x8bc34a, unlock: 'tier:3' },
    { id: 'comet', build: 'average', hair: 0x6a4a2a, name: 'Comet Cadet', r: 2, shirt: 0xeeeeee, pants: 0xdddddd, skin: 0xf0c9a0, sleeve: 0xff7a2a, hat: 'helmet', hatC: 0xf4f4f4, unlock: 'tier:6' },
    { id: 'siren', build: 'slim', hair: 0x2be3ff, name: 'Circuit Siren', r: 2, shirt: 0x1b1b3a, pants: 0x2be3ff, skin: 0xc9a0ff, sleeve: 0xff2fd0, hat: 'antenna', hatC: 0x2be3ff, unlock: 'tier:10' },
    { id: 'toast', build: 'average', name: 'Sir Toastworth', r: 3, shirt: 0xc98a3c, pants: 0x6b4a2b, skin: 0xf2d29b, sleeve: 0xc98a3c, hat: 'toast', hatC: 0xb06a2a, head: [1.7, 1.55, 0.5], unlock: 'tier:14' },
    { id: 'nightwarden', build: 'slim', hair: 0x111114, name: 'Play Carti', r: 3, shirt: 0x24242c, pants: 0x1a1a20, skin: 0x2c2c36, sleeve: 0x24242c, hat: 'horns', hatC: 0x17171b, visor: 0xff2840, unlock: 'tier:18' },
    { id: 'tycoon', build: 'heavy', hair: 0x1a1a1a, name: 'Gilt Tycoon', r: 4, shirt: 0xd4a72c, pants: 0xd4a72c, skin: 0xe8c06a, sleeve: 0x1a1a1a, hat: 'tophat', hatC: 0x1a1a1a, unlock: 'tier:25' },
    { id: 'stormborn', build: 'average', hair: 0x0e0e10, name: 'Pluma Peso', r: 4, shirt: 0x141416, pants: 0x17181d, skin: 0xf1cdb0, sleeve: 0x141416, hat: 'none', hoodie: true, jeans: true, shiesty: 0x0e0e10, sneakers: 0xf6f6f4, unlock: 'tier:30' },
    { id: 'nova', build: 'average', name: 'Juice Earth', r: 4, shirt: 0xf3f2ee, pants: 0xe8731e, skin: 0x70482f, sleeve: 0xf3f2ee,
      hat: 'dreads', hatC: 0x1c120c, tip: 0xcfa552, cargo: true, chain: true, beard: true, shoes: 0x6b4423, boots: true, back: '999', personal: true, unlock: 'shop', price: 5000 },
    { id: 'tripy', build: 'slim', name: 'Tripy Red', r: 4, shirt: 0x161618, pants: 0x18181c, skin: 0x8a5a3c, sleeve: 0x161618, hair: 0x6a0c10,
      hat: 'dreads', hatC: 0x6a0c10, tip: 0xff2a2a, hairSeed: 777, hoodie: true, cargo: true, shades: 0x0c0c0e, faceTats: true, personal: true, unlock: 'shop', price: 1500 },
    { id: 'uzi', build: 'slim', name: 'Lil Uzi', r: 4, shirt: 0xff4fa8, jacket: 0x141418, pants: 0x121216, skin: 0x7a4a30, sleeve: 0x141418, hair: 0x141010, shoes: 0xf2f2f2,
      hat: 'spikes', hatC: 0x141010, tip: 0x1c1616, spikeScale: 0.55, hairSeed: 1212, leather: true, studBelt: true, earring: true, faceTats: 'uzi', personal: true, unlock: 'shop', price: 1500 },
    { id: 'headliner', build: 'muscular', name: 'Headliner', r: 4, shirt: 0x1a1426, pants: 0x101018, skin: 0xc68a5e, sleeve: 0xffd84a, hair: 0x2a1a10, hat: 'headphones', hatC: 0xff3fa6,
      jacket: 0xffd84a, leather: true, studBelt: true, unlock: 'shop', price: 1500, music: true },
    { id: 'week', build: 'slim', name: 'The Week', r: 4, shirt: 0x17171c, pants: 0x17171c, skin: 0x6e4630, sleeve: 0x17171c, hair: 0x0e0b0a, shoes: 0x0c0c0e,
      hat: 'afro', afroSize: 0.8, lineup: true, hatC: 0x0e0b0a, suit: true, tieC: 0xb3121e, mustache: true, shades: 0x0a0a0c, personal: true, unlock: 'shop', price: 1500 },
  ],
  backpack: [
    { id: 'none', name: 'No Backpack', r: 0 },
    { id: 'ruck', name: 'Trail Rucksack', r: 0, c: 0x6b5a3a },
    { id: 'tank', name: 'Jet Tank', r: 1, c: 0x9aa4b0, unlock: 'tier:4' },
    { id: 'shell', name: 'Turtle Shell', r: 2, c: 0x3f8a4a, unlock: 'tier:13' },
    { id: 'crate', name: 'Loot Crate', r: 3, c: 0xd9a521, unlock: 'tier:24' },
    { id: 'boombox', name: 'Boombox', r: 3, c: 0x2a2a32, unlock: 'shop', price: 1000, music: true },
  ],
  pickaxe: [
    { id: 'pick', name: 'Standard Pick', r: 0, c: 0x9aa4b0 },
    { id: 'wrench', name: 'Big Wrench', r: 1, c: 0xc0392b, unlock: 'tier:8' },
    { id: 'baguette', name: 'Le Baguette', r: 2, c: 0xd9a35b, unlock: 'tier:17' },
    { id: 'crystal', name: 'Crystal Cleaver', r: 3, c: 0x2fe0d0, unlock: 'tier:23' },
    { id: 'axe', name: 'Electric Axe', r: 4, c: 0xd8202e, unlock: 'shop', price: 1200, music: true },
  ],
  glider: [
    { id: 'sail', name: 'Sky Sail', r: 0, c: 0x3aa8ff },
    { id: 'kite', name: 'Storm Kite', r: 2, c: 0x8b3dff, unlock: 'tier:9' },
    { id: 'gold', name: 'Golden Wing', r: 4, c: 0xffc93d, unlock: 'tier:20' },
    { id: 'vinyl', name: 'Vinyl Glider', r: 3, c: 0x141418, unlock: 'shop', price: 1000, music: true },
    { id: 'umbrella', name: 'Champion Umbrella', r: 5, c: 0xffffff, unlock: 'win' },
  ],
  wrap: [
    { id: 'none', name: 'Factory Finish', r: 0, c: 0x3a3a42 },
    { id: 'carbon', name: 'Carbon Weave', r: 1, c: 0x1c1c1f, unlock: 'tier:2' },
    { id: 'lava', name: 'Lava Flow', r: 2, c: 0xe8481a, unlock: 'tier:12' },
    { id: 'galaxy', name: 'Deep Galaxy', r: 3, c: 0x5a32d6, unlock: 'tier:22' },
    { id: 'chrome', name: 'Liquid Chrome', r: 4, c: 0xdfe6ee, unlock: 'tier:27' },
    { id: 'eq', name: 'Equalizer', r: 3, c: 0x1c1030, unlock: 'shop', price: 800, music: true },
  ],
  car: [
    { id: 'street', name: 'Street Coupe', r: 0 },
    { id: 'midnight', name: 'Good Riddance Car', r: 5, unlock: 'shop', price: 1500, premium: true },
    { id: 'limo', name: 'Stretch Limo', r: 5, unlock: 'shop', price: 2500, premium: true },
  ],
  emote: [
    { id: 'groove', name: 'Groove', r: 0 },
    { id: 'robot', name: 'Robo Bop', r: 1, unlock: 'tier:5' },
    { id: 'jacks', name: 'Jumping Jacks', r: 2, unlock: 'tier:16' },
    { id: 'wave', name: 'Big Wave', r: 3, unlock: 'tier:28' },
    { id: 'airguitar', name: 'Air Guitar', r: 3, unlock: 'shop', price: 600, music: true },
    { id: 'micdrop', name: 'Mic Drop', r: 2, unlock: 'shop', price: 500, music: true },
  ],
};
const COS_CATS = [['outfit', 'Skins'], ['backpack', 'Back Bling'], ['pickaxe', 'Harvest Tool'], ['glider', 'Glider'], ['wrap', 'Weapon Wrap'], ['emote', 'Emote'], ['car', 'Car']];
for (const [cat] of COS_CATS) for (const c of COS[cat]) c.cat = cat;
const RARITY_PRICE = [0, 400, 800, 1200, 1500, 2500, 2000];
// Skin codes: each unlocks one skin. Only a hash of each code is stored here, so the codes cannot be read from the page.
const SKIN_CODES = {"b988f760c06661598b2306f9190cf3e2b49eede966a437b893f9cec8b7da4e94": "outfit:moss", "c9f8ccf00415edf51af71a754d7ff028524b44e8460a6b3ae71782999a660226": "outfit:comet", "6c20490c4a51a9daf0e4a506051bbef481b69064ad73f1dc55c730b4ab67669c": "outfit:siren", "0482d235e2b487cb4bd726f72f61f4bccaf818d6490108418b5bb454e75286a0": "outfit:toast", "d29e86b0e73b5f53bad9eef6e3cac179a1b954cceca8fab647db777288b95123": "outfit:nightwarden", "d415b6c930bf893cab24401df88e72dc4ef49125a8d35fdbb3d22dc5145ba25e": "outfit:tycoon", "b24e8cb0fb398c0acc64c00a5f55ae9b9277e60bb507b1d55388c2a1b5be067b": "outfit:stormborn", "a45886e085b42acdb18940bc409c2d3ba927f3cebcd7f6ad8120cca9a917c400": "outfit:headliner", "7fb23ee2720fbf9744db86140a291c9da1d319b81592f0d64691b2490c78bd26": "outfit:nova", "768389476f280ee7e04103893784363c1d8311b1a1ef76ec7c9c8b6d9125123c": "outfit:tripy", "b6f82df325a16d8401efe178553f6f17bdd69e8c5a82e7dcfb9f41f699165f30": "outfit:uzi", "e9baf6540e4d5eda6e4c4c2b68fd2fe8b2d5c7a6578b203ce98be105e8b03812": "outfit:week"};
async function redeemCode(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 8) return { err: 'Type the whole code, like ABCD-EFGH-JKLM.' };
  if (!window.crypto || !crypto.subtle) return { err: 'This browser cannot check codes. Try Chrome, Edge, Firefox or Safari.' };
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fortday:' + code));
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''), hit = SKIN_CODES[hex];
  if (!hit) return { err: 'That code does not work. Check the letters and try again.' };
  const [cat, id] = hit.split(':'), it = cosById(cat, id); if (!it) return { err: 'That code does not work.' };
  const had = Profile.owns(it); Profile.d.owned[cat + ':' + id] = true; Profile.d.eq[cat] = id; Profile.save();
  return { it, had };
}
function itemPrice(c) { return c.price || RARITY_PRICE[c.r] || 0; }
const COIN = 'FortBux';
const PASS_TIERS = 30, XP_PER_TIER = 5000, XP_PER_LEVEL = 5000, LEVEL_COINS = 100, TICKET_CHANCE = 1 / 10000;
// ---------------------------------------------------------------- seasons: 30 days each, the first is Music Festival 2026
const SEASON_EPOCH = Date.UTC(2026, 10, 16), SEASON_DAYS = 30, SEASON_NAMES = ['Music Festival 2026'];
const Season = {
  id() { return Math.max(0, Math.floor((Date.now() - SEASON_EPOCH) / (SEASON_DAYS * 864e5))); },
  name(id = this.id()) { return SEASON_NAMES[id] || 'Season ' + (id + 1); },
  endsAt(id = this.id()) { return SEASON_EPOCH + (id + 1) * SEASON_DAYS * 864e5; },
  daysLeft() { return Math.max(0, Math.ceil((this.endsAt() - Date.now()) / 864e5)); },
};
const RANKS = [['Bronze', 0], ['Silver', 300], ['Gold', 700], ['Platinum', 1200], ['Diamond', 1800], ['Apex', 2600], ['Legend', 3500]];
function cosById(cat, id) { return COS[cat].find(c => c.id === id) || COS[cat][0]; }
function passRewards() {
  const out = {};
  for (const [cat] of COS_CATS) for (const c of COS[cat]) if (c.unlock && c.unlock.startsWith('tier:')) out[+c.unlock.slice(5)] = { cat, item: c };
  return out;
}

// ---------------------------------------------------------------- profile (per-viewer, localStorage)
const Profile = {
  d: {
    xp: 0, wins: 0, matches: 0, kills: 0, top10: 0, rp: 0, umbrella: false, coins: 0, owned: {},
    eq: { outfit: 'rae', body: 'woman', backpack: 'ruck', pickaxe: 'pick', glider: 'sail', wrap: 'none', emote: 'groove', car: 'street' },
    sens: 1, shadows: !IS_TOUCH, mode: 'solo', build: true, theme: 'greenvale', ranked: false, novaGiven: true,
    season: -1, seasonXp: 0, firstBonus: false, thankSeason: -1, ticketSeason: -1, skinsPaid: true, keys: {}, gfxV: 2,
  },
  load() {
    try {
      const s = localStorage.getItem('stormbreak.v1');
      if (s) { const o = JSON.parse(s); const eq = Object.assign({}, this.d.eq, o.eq || {}); Object.assign(this.d, o); this.d.eq = eq; if (!this.d.owned || typeof this.d.owned !== 'object') this.d.owned = {}; if (!this.d.novaGiven) { this.d.eq.outfit = 'nova'; this.d.novaGiven = true; } if (typeof this.d.coins !== 'number') this.d.coins = 1500;
        // these four skins used to be free: players who already had a save keep them
        // earlier builds could save shadows off or Fast graphics on their own: start everyone from full quality once
        if (o.gfxV !== 2) { this.d.shadows = !IS_TOUCH; this.d.gfx = 'auto'; this.d.gfxV = 2; this.save(); }
        if (!o.skinsPaid) { for (const id of ['nova', 'tripy', 'uzi', 'week']) this.d.owned['outfit:' + id] = true; this.d.skinsPaid = true; this.save(); } }
    } catch (e) { /* storage unavailable */ }
  },
  save() { try { localStorage.setItem('stormbreak.v1', JSON.stringify(this.d)); } catch (e) { /* ignore */ } },
  // season bookkeeping: a new season starts the level track again (earned items stay owned) and ends any ticket
  syncSeason() {
    const d = this.d, id = Season.id();
    if (d.season === id) return;
    if (d.season === -1 && d.xp > 0) {   // profiles from before levels: keep every pass item they had reached
      const old = Math.min(PASS_TIERS, 1 + Math.floor(d.xp / 1000)), rw = passRewards();
      for (let t = 1; t <= old; t++) if (rw[t]) d.owned[rw[t].cat + ':' + rw[t].item.id] = true;
    }
    d.season = id; d.seasonXp = 0;
    for (const [cat] of COS_CATS) if (!this.unlocked(cosById(cat, d.eq[cat]))) d.eq[cat] = COS[cat].find(c => !c.unlock).id;
    if (!d.eq.body) d.eq.body = 'woman';
    this.save();
  },
  ticket() { return this.d.ticketSeason === Season.id(); },
  tier() { return 1 + Math.floor(this.d.seasonXp / XP_PER_LEVEL); },
  // add XP; every level gained pays FortBux and makes that level's pass item yours for good
  addXp(n) {
    const d = this.d, l0 = this.tier(); d.xp += n; d.seasonXp += n; const l1 = this.tier(), got = [];
    if (l1 > l0) { d.coins += (l1 - l0) * LEVEL_COINS; const rw = passRewards(); for (let t = l0 + 1; t <= l1; t++) if (rw[t]) { d.owned[rw[t].cat + ':' + rw[t].item.id] = true; got.push(rw[t].item); } }
    return { l0, l1, coins: (l1 - l0) * LEVEL_COINS, got };
  },
  owns(item) { return !!(this.d.owned[item.cat + ':' + item.id] || (item.cat === 'car' && this.d.owned[item.id])); },
  unlocked(item) {
    const u = item.unlock; if (!u) return true;
    if (this.owns(item)) return true;
    if (this.ticket()) return true;   // Music Concert Ticket: the whole shop for the rest of the season
    if (u === 'win') return !!this.d.umbrella;
    if (u === 'shop') return !!this.d.owned[item.id];
    if (u.startsWith('tier:')) return this.tier() >= +u.slice(5);
    return true;
  },
  rankIdx() { let i = 0; for (let k = 0; k < RANKS.length; k++) if (this.d.rp >= RANKS[k][1]) i = k; return i; },
};
Profile.load(); Profile.syncSeason();

// ---------------------------------------------------------------- audio (synthesised, starts after first click)
const Sfx = {
  ctx: null, out: null, nb: null, live: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C(); this.out = this.ctx.createGain(); this.out.gain.value = 0.42; this.out.connect(this.ctx.destination);
      const n = this.ctx.sampleRate; const b = this.ctx.createBuffer(1, n, n); const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.nb = b;
    } catch (e) { this.ctx = null; }
  },
  vol(x, y, z) {
    if (x === undefined || !camera) return 1;
    const dx = camera.position.x - x, dy = camera.position.y - y, dz = camera.position.z - z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz); return d > 240 ? 0 : 1 / (1 + d / 16);
  },
  noise(dur, freq, q, vol, type = 'bandpass') {
    const c = this.ctx; if (!c || vol < 0.01 || this.live > 18) return;
    this.live++; const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.nb;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.03);
    s.onended = () => { this.live--; };
  },
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
    const c = this.ctx; if (!c || vol < 0.01 || this.live > 18) return;
    this.live++; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.03); o.onended = () => { this.live--; };
  },
  shot(type, x, y, z) {
    const v = this.vol(x, y, z); if (v < 0.02) return;
    const P = { pistol: [0.12, 1900, 0.8, 0.45], smg: [0.08, 2300, 0.9, 0.32], ar: [0.14, 1300, 0.7, 0.45], shotgun: [0.32, 650, 0.5, 0.75], sniper: [0.55, 560, 0.4, 0.85], rocket: [0.5, 260, 0.6, 0.6] }[type] || [0.1, 1500, 1, 0.4];
    this.noise(P[0], P[1], P[2], P[3] * v); this.noise(P[0] * 0.7, 140, 1, P[3] * v * 0.7, 'lowpass');
  },
  hit(head) { this.tone(head ? 1500 : 980, 0.07, 'square', head ? 0.12 : 0.08); },
  boom(x, y, z) { const v = this.vol(x, y, z); this.noise(0.9, 120, 0.7, 0.9 * v, 'lowpass'); this.noise(0.4, 600, 0.5, 0.4 * v); },
  build() { this.noise(0.09, 420, 2, 0.35); this.tone(180, 0.08, 'triangle', 0.12); },
  harvest(mat) { const f = mat === 'wood' ? 520 : mat === 'brick' ? 340 : 1400; this.noise(0.08, f, 3, 0.4); },
  pickup() { this.tone(660, 0.08, 'triangle', 0.15); this.tone(990, 0.1, 'triangle', 0.12, 0, 0.06); },
  chest() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, 0, i * 0.06)); },
  gulp() { this.tone(300, 0.15, 'sine', 0.2, 300); },
  elim() { this.tone(880, 0.12, 'square', 0.1); this.tone(1320, 0.18, 'square', 0.08, 0, 0.08); },
  horn() { this.tone(330, 0.5, 'sawtooth', 0.12); this.tone(415, 0.5, 'sawtooth', 0.1, 0, 0.02); },
  whale() { this.tone(90, 3.0, 'sine', 0.35, 70); this.tone(140, 2.6, 'sine', 0.2, -40, 0.4); },
  storm() { this.noise(1.2, 220, 0.4, 0.14, 'lowpass'); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.16, 0, i * 0.12)); },
};
