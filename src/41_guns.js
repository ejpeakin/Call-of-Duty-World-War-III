// =====================================================================
//  Guns: realistic models per weapon type, one merged mesh each (cached geometry), rarity shown as accent parts.
//  Gun space: barrel along +z, y up, the shooting hand's grip at the origin; the gun's right side is -x.
// =====================================================================
const GUN_MAT = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 42, specular: 0x3a3a3a });
const _gunGeo = new Map(), _gm = new THREE.Matrix4(), _ge = new THREE.Euler();
function shadeHex(hex, k) { return _c2.setHex(hex).multiplyScalar(k).getHex(); }
function gunGeo(type, rarity, wrap, simple) {
  const key = type + '|' + rarity + '|' + wrap + '|' + (simple ? 1 : 0);
  if (_gunGeo.has(key)) return _gunGeo.get(key);
  const L = [], seg = simple ? 7 : 14, detail = !simple;
  const rc = RARITY[rarity].hex, body = wrap, dark = 0x1c1d21, metal = 0x2c2f35, poly = 0x25262b, glass = 0x7fd8ff, wood = 0x7a4a26, brass = 0xc8a040;
  const EQ = wrap === 0x1c1030;   // Equalizer wrap: neon bars along the gun
  const acc = EQ ? 0xff3fa6 : rarity > 0 ? rc : dark;
  const B = (w, h, d, x, y, z, hex, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) g.applyMatrix4(_gm.makeRotationFromEuler(_ge.set(rx, ry, rz))); g.translate(x, y, z); L.push([g, hex]); };
  // cylinder: r = back radius, r2 = front radius, along z by default ('y' upright, 'x' sideways)
  const C = (r, len, x, y, z, hex, r2 = r, s = seg, axis = 'z') => { const g = new THREE.CylinderGeometry(r2, r, len, s); if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2); g.translate(x, y, z); L.push([g, hex]); };
  const rail = (y, z0, z1) => { B(0.03, 0.012, z1 - z0, 0, y, (z0 + z1) / 2, dark); if (detail) for (let z = z0 + 0.012; z < z1 - 0.006; z += 0.022) B(0.035, 0.008, 0.009, 0, y + 0.009, z, dark); };
  const trigger = (y, z) => { B(0.009, 0.007, 0.075, 0, y - 0.03, z, dark); B(0.009, 0.034, 0.008, 0, y - 0.014, z + 0.036, dark); B(0.006, 0.028, 0.008, 0, y - 0.01, z - 0.005, metal, 0.35); };
  let shift = 0;
  if (type === 'ar') {
    B(0.066, 0.07, 0.30, 0, 0.035, 0.02, body);                                   // upper receiver
    B(0.058, 0.055, 0.24, 0, -0.025, 0.0, shadeHex(body, 0.82));                  // lower receiver
    if (detail) { B(0.002, 0.022, 0.06, -0.034, 0.04, 0.04, dark); B(0.014, 0.014, 0.03, -0.038, 0.042, -0.02, metal); }   // ejection port, forward assist
    B(0.07, 0.014, 0.026, 0, 0.074, -0.12, metal);                                 // charging handle
    rail(0.077, -0.11, 0.17);
    C(0.037, 0.30, 0, 0.03, 0.32, shadeHex(body, 0.92), 0.037, 8);                 // handguard
    rail(0.069, 0.18, 0.46);
    if (detail) for (let z = 0.22; z < 0.44; z += 0.055) for (const sx of [-1, 1]) B(0.003, 0.013, 0.032, sx * 0.036, 0.03, z, dark);
    C(0.04, 0.014, 0, 0.03, 0.172, acc, 0.04, 8);                                  // rarity ring
    C(0.011, 0.17, 0, 0.03, 0.555, metal);                                         // barrel
    C(0.017, 0.07, 0, 0.03, 0.675, dark);                                          // muzzle brake
    if (detail) for (const z of [0.66, 0.685]) B(0.038, 0.006, 0.01, 0, 0.03, z, 0x0e0e10);
    B(0.01, 0.05, 0.014, 0, 0.1, 0.44, dark); B(0.032, 0.014, 0.022, 0, 0.078, 0.44, dark);   // front sight post
    B(0.046, 0.05, 0.075, 0, 0.118, -0.01, dark); B(0.03, 0.02, 0.05, 0, 0.09, -0.01, dark);  // red-dot sight + mount
    C(0.02, 0.012, 0, 0.122, 0.03, glass); C(0.018, 0.01, 0, 0.122, -0.05, 0x101012);
    B(0.044, 0.07, 0.075, 0, -0.085, 0.07, poly, -0.12); B(0.042, 0.07, 0.072, 0, -0.15, 0.087, poly, -0.26); B(0.042, 0.06, 0.07, 0, -0.205, 0.108, poly, -0.4);   // curved magazine
    B(0.048, 0.015, 0.08, 0, -0.238, 0.124, acc, -0.4);                             // magazine base plate
    B(0.038, 0.115, 0.05, 0, -0.085, -0.075, poly, 0.32);                           // pistol grip
    if (rarity >= 3) for (const sx of [-1, 1]) B(0.003, 0.06, 0.032, sx * 0.02, -0.09, -0.078, rc, 0.32);
    trigger(-0.035, -0.01);
    C(0.017, 0.17, 0, 0.02, -0.21, metal);                                          // buffer tube
    B(0.046, 0.085, 0.15, 0, 0.0, -0.33, poly); B(0.04, 0.03, 0.12, 0, 0.055, -0.33, poly); B(0.05, 0.115, 0.022, 0, -0.01, -0.41, 0x111114);
    if (rarity >= 4) B(0.048, 0.02, 0.15, 0, -0.035, -0.33, rc);
    shift = 0.07;
  } else if (type === 'smg') {
    B(0.06, 0.085, 0.30, 0, 0.02, 0.06, body);
    if (detail) { B(0.002, 0.024, 0.06, -0.031, 0.03, 0.09, dark); C(0.008, 0.03, 0.04, 0.04, -0.02, metal, 0.008, 8, 'x'); }
    rail(0.068, -0.06, 0.19);
    B(0.04, 0.045, 0.06, 0, 0.1, 0.02, dark); C(0.016, 0.01, 0, 0.105, 0.052, glass);   // reflex sight
    C(0.022, 0.16, 0, 0.02, 0.29, dark); C(0.01, 0.03, 0, 0.02, 0.385, metal);           // shroud + muzzle
    B(0.034, 0.17, 0.045, 0, -0.1, 0.1, poly, -0.05); B(0.038, 0.015, 0.05, 0, -0.19, 0.105, acc, -0.05);   // stick magazine
    B(0.036, 0.11, 0.045, 0, -0.07, -0.04, poly, 0.25);
    B(0.03, 0.075, 0.03, 0, -0.045, 0.21, poly);                                   // vertical foregrip
    trigger(-0.02, 0.02);
    B(0.008, 0.008, 0.2, 0.025, 0.03, -0.17, metal); B(0.008, 0.008, 0.2, -0.025, 0.03, -0.17, metal); B(0.058, 0.075, 0.015, 0, 0.0, -0.27, poly);   // wire stock
    if (rarity >= 2) B(0.062, 0.02, 0.1, 0, 0.0, 0.12, rc);
    shift = 0.04;
  } else if (type === 'pistol') {
    B(0.034, 0.042, 0.2, 0, 0.035, 0.06, shadeHex(body, 1.05));                     // slide
    if (detail) { for (let i = 0; i < 5; i++) B(0.036, 0.032, 0.004, 0, 0.036, -0.026 + i * 0.009, dark); B(0.004, 0.013, 0.045, -0.018, 0.04, 0.075, dark); }
    B(0.03, 0.028, 0.17, 0, 0.0, 0.055, poly);                                      // frame
    B(0.014, 0.014, 0.008, 0, 0.062, -0.035, dark); B(0.006, 0.011, 0.008, 0, 0.061, 0.152, dark);   // sights
    if (rarity > 0) { B(0.004, 0.004, 0.002, 0, 0.069, 0.157, rc); }
    C(0.008, 0.015, 0, 0.035, 0.162, 0x101012);
    B(0.032, 0.115, 0.045, 0, -0.065, -0.005, poly, 0.22);                           // grip
    if (detail) for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) B(0.002, 0.006, 0.03, sx * 0.0165, -0.03 - i * 0.015, -0.005 + i * 0.0035, dark, 0.22);
    B(0.034, 0.013, 0.048, 0, -0.125, -0.02, acc, 0.22);
    B(0.008, 0.006, 0.05, 0, -0.03, 0.04, poly); B(0.008, 0.026, 0.008, 0, -0.02, 0.066, poly); B(0.006, 0.024, 0.007, 0, -0.018, 0.03, metal, 0.3);
    shift = 0.0;
  } else if (type === 'shotgun') {
    const fore = wrap === 0x3a3a42 ? wood : shadeHex(body, 0.9);
    B(0.055, 0.075, 0.24, 0, 0.02, 0.02, body);                                     // receiver
    if (detail) B(0.002, 0.03, 0.08, -0.028, 0.025, 0.03, dark);
    C(0.016, 0.52, 0, 0.046, 0.40, metal);                                           // barrel
    C(0.0155, 0.42, 0, 0.004, 0.36, metal);                                          // magazine tube
    B(0.018, 0.05, 0.018, 0, 0.025, 0.6, metal);
    C(0.0062, 0.01, 0, 0.066, 0.655, 0xf0e0a0);                                      // bead sight
    C(0.03, 0.17, 0, 0.012, 0.32, fore);                                             // pump
    if (detail) for (let k = 0; k < 5; k++) C(0.0315, 0.008, 0, 0.012, 0.255 + k * 0.032, shadeHex(fore, 0.72));
    B(0.045, 0.06, 0.14, 0, -0.012, -0.16, wood, 0.12); B(0.046, 0.1, 0.16, 0, -0.042, -0.3, wood, 0.05); B(0.05, 0.115, 0.022, 0, -0.047, -0.385, 0x111114);
    trigger(-0.02, -0.02);
    if (detail) for (let i = 0; i < 4; i++) { C(0.0085, 0.046, 0.034, 0.026, -0.05 + i * 0.022, 0xb02020, 0.0085, 8, 'y'); C(0.009, 0.012, 0.034, -0.003, -0.05 + i * 0.022, brass, 0.009, 8, 'y'); }   // shells on a side saddle
    B(0.058, 0.012, 0.2, 0, 0.06, 0.02, acc);
    shift = 0.1;
  } else if (type === 'katana') {
    const steel = 0xc9ced6, edge = 0xf2f5f8, wrapC = 0x17131a, gold = 0xc8a040;
    C(0.018, 0.27, 0, 0, -0.025, wrapC, 0.017, 8);                                   // handle (tsuka)
    if (detail) for (let z = -0.14; z < 0.1; z += 0.034) B(0.03, 0.03, 0.012, 0, 0, z, acc === dark ? 0x3a2a44 : acc, 0, 0, Math.PI / 4);   // diamond wrap
    C(0.021, 0.022, 0, 0, -0.17, gold);                                                // pommel cap
    { const g = new THREE.CylinderGeometry(0.058, 0.058, 0.012, 14); g.rotateX(Math.PI / 2); g.scale(1, 0.82, 1); g.translate(0, 0.004, 0.118); L.push([g, 0x2a2420]); }   // guard (tsuba)
    C(0.06, 0.004, 0, 0.004, 0.125, acc === dark ? gold : acc, 0.06, 14);              // rarity ring on the guard
    B(0.022, 0.036, 0.032, 0, 0.012, 0.142, gold);                                     // collar (habaki)
    let py = 0.012, pz = 0.158;
    for (let i = 0; i < 6; i++) {                                                     // blade: six segments curving gently up
      const t1 = (i + 1) / 6, len = 0.15, ny = 0.012 + 0.07 * t1 * t1, nz = pz + len, ang = Math.atan2(ny - py, len), h = 0.034 - i * 0.002;
      B(0.008, h, len + 0.004, 0, (py + ny) / 2 + 0.004, (pz + nz) / 2, steel, -ang);
      B(0.009, 0.008, len + 0.004, 0, (py + ny) / 2 - h / 2 + 0.006, (pz + nz) / 2, edge, -ang);   // bright cutting edge
      py = ny; pz = nz;
    }
    B(0.008, 0.024, 0.06, 0, py + 0.004, pz + 0.022, steel, -0.7);                     // tip
  } else if (type === 'sniper') {
    C(0.028, 0.24, 0, 0.03, 0.02, body);                                            // round receiver
    C(0.006, 0.05, -0.045, 0.03, -0.06, metal, 0.006, 8, 'x'); B(0.022, 0.022, 0.022, -0.075, 0.018, -0.06, dark);   // bolt handle + knob
    C(0.012, 0.62, 0, 0.03, 0.45, metal, 0.0105);                                    // barrel
    C(0.017, 0.06, 0, 0.03, 0.79, dark);                                            // muzzle brake
    C(0.021, 0.34, 0, 0.115, 0.03, dark);                                            // scope tube
    C(0.024, 0.08, 0, 0.115, 0.23, dark, 0.035); C(0.031, 0.004, 0, 0.115, 0.272, glass);   // objective bell + lens
    C(0.03, 0.06, 0, 0.115, -0.165, dark, 0.024);                                    // eyepiece
    C(0.012, 0.026, 0, 0.145, 0.03, dark, 0.012, 10, 'y'); C(0.012, 0.026, -0.03, 0.115, 0.03, dark, 0.012, 10, 'x');   // turrets
    B(0.05, 0.06, 0.018, 0, 0.085, -0.06, dark); B(0.05, 0.06, 0.018, 0, 0.085, 0.12, dark);   // rings
    B(0.05, 0.05, 0.34, 0, -0.005, 0.28, body);                                      // forend
    B(0.045, 0.11, 0.05, 0, -0.075, -0.06, shadeHex(body, 0.85), 0.3);               // grip
    B(0.048, 0.07, 0.3, 0, -0.01, -0.25, body); B(0.048, 0.06, 0.12, 0, -0.07, -0.33, body); B(0.04, 0.03, 0.14, 0, 0.04, -0.28, shadeHex(body, 0.85));
    B(0.052, 0.12, 0.022, 0, -0.035, -0.41, 0x111114);
    B(0.035, 0.05, 0.07, 0, -0.045, 0.06, dark);                                      // magazine
    if (detail) { B(0.03, 0.02, 0.03, 0, -0.035, 0.38, dark); for (const sx of [-1, 1]) B(0.008, 0.008, 0.2, sx * 0.018, -0.04, 0.49, metal); }   // folded bipod
    trigger(-0.03, -0.02);
    B(0.05, 0.016, 0.1, 0, -0.03, 0.2, acc);
    shift = 0.06;
  } else {   // rocket
    const tube = wrap === 0x3a3a42 ? 0x4a5a3a : body;
    C(0.065, 1.0, 0, 0.06, 0.1, tube);
    C(0.072, 0.08, 0, 0.06, 0.62, dark, 0.08);
    C(0.085, 0.12, 0, 0.06, -0.44, dark, 0.066);
    for (const z of [-0.2, 0.3]) C(0.068, 0.02, 0, 0.06, z, dark);
    C(0.0665, 0.05, 0, 0.06, 0.45, rarity > 0 ? rc : 0xd8b030);
    C(0.045, 0.14, 0, 0.06, 0.73, 0x7a2a1e, 0.004);                                   // warhead
    B(0.035, 0.11, 0.045, 0, -0.04, -0.02, poly, 0.25); B(0.03, 0.09, 0.035, 0, -0.03, 0.25, poly);
    B(0.035, 0.05, 0.1, 0.075, 0.1, 0.12, dark); C(0.016, 0.01, 0.075, 0.1, 0.175, glass);   // optic on the side
    B(0.05, 0.03, 0.18, 0, -0.012, -0.25, poly);
    trigger(0.0, 0.0);
    shift = 0.02;
  }
  if (EQ) { const n = 7, z0 = -0.12, len = type === 'pistol' ? 0.16 : type === 'rocket' ? 0.6 : 0.34, cols = [0x2fe7ff, 0x7cff4f, 0xffe14a, 0xff7a2a, 0xff3fa6, 0x9b6bff, 0x2fe7ff];
    for (let i = 0; i < n; i++) { const h = 0.012 + 0.03 * Math.abs(Math.sin(i * 1.7 + 0.6)); for (const sx of [-1, 1]) B(0.004, h, len / n * 0.7, sx * (type === 'rocket' ? 0.07 : type === 'pistol' ? 0.018 : 0.034), (type === 'rocket' ? 0.06 : 0.03) - 0.015 + h / 2, z0 + (i + 0.5) * len / n, cols[i]); } }
  // merge into one coloured geometry
  const P = [], N = [], Cc = [], c = new THREE.Color();
  for (const [g0, hex] of L) {
    const g = g0.index ? g0.toNonIndexed() : g0; c.setHex(hex);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i += 3) { P.push(pa[i], pa[i + 1], pa[i + 2] + shift); N.push(na[i], na[i + 1], na[i + 2]); Cc.push(c.r, c.g, c.b); }
    if (g !== g0) g.dispose(); g0.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  geo.computeBoundingSphere();
  _gunGeo.set(key, geo); return geo;
}
function gunModel(it, wrapHex, simple) {
  const g = new THREE.Group(), m = new THREE.Mesh(gunGeo(WEAPONS[it.wid].type, it.rarity, wrapHex, simple), GUN_MAT);
  m.castShadow = !simple; g.add(m); return g;
}
