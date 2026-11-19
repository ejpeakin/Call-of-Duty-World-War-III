// =====================================================================
//  How build pieces look, in the same cartoony low-poly style as the rest of the island:
//  chunky frames, bright simple wood / brick / metal, a dark outline round every piece, and bold
//  cracks as a piece loses health. Only the look lives here: sizes and collision boxes are in
//  src/70_build.js. Textures are drawn in code from fixed seeds, so every player sees the same builds.
// =====================================================================
const BuildLook = {
  mats: {}, geos: {}, edgeGeos: {}, fades: {}, lineBuild: {}, lineSolid: {}, ready: false,
  get outlines() { return !Perf.on; },   // Performance Mode drops the outlines once a piece is built (one less thing to draw)
  INK: { wood: 0x3a1f0c, brick: 0x45190f, metal: 0x1b2836 },   // outline colours
  init() {
    if (this.ready) return; this.ready = true;
    for (const m of ['wood', 'brick', 'metal']) {
      const P = this.surface(m, 'panel', 512, 512), Tr = this.surface(m, 'trim', 512, 128);
      const mk = cv => new THREE.MeshLambertMaterial({ map: this.tex(cv) });   // the same lighting as the houses, trees and rocks
      this.mats[m] = { panel: [mk(P), mk(this.cracked(P, 1, m)), mk(this.cracked(P, 2, m))], trim: mk(Tr) };
      this.lineSolid[m] = new THREE.LineBasicMaterial({ color: this.INK[m] });
      this.lineBuild[m] = new THREE.LineBasicMaterial({ color: new THREE.Color(MATS[m].color).lerp(new THREE.Color(0xffffff), 0.55), transparent: true, opacity: 0.9, depthWrite: false });
    }
  },
  tex(cv) { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; },
  // a solid piece: cracks show at two-thirds and one-third health
  solid(p) { const L = this.mats[p.mat], f = p.hp / p.maxHp; return [L.panel[f < 0.34 ? 2 : f < 0.67 ? 1 : 0], L.trim]; },
  // see-through copies used while a piece is still building (shared, a few opacity steps)
  fade(mat, i, steps) {
    const k = mat + i;
    if (!this.fades[k]) { const L = this.mats[mat], op = 0.28 + 0.6 * i / (steps - 1); this.fades[k] = [L.panel[0], L.trim].map(m0 => { const m = m0.clone(); m.transparent = true; m.depthWrite = false; m.opacity = op; return m; }); }
    return this.fades[k];
  },
  // the outline of a piece's shape (bright while it builds, dark ink once it's solid)
  edges(mat, k) { const key = mat + ':' + k; return this.edgeGeos[key] || (this.edgeGeos[key] = new THREE.EdgesGeometry(this.geo(mat, k), 30)); },

  // ---------------------------------------------------------------- shapes (one mesh per piece: surface first, then frame)
  geo(mat, k) { const key = mat + ':' + k; return this.geos[key] || (this.geos[key] = this.make(mat, k)); },
  make(mat, k) {
    const P = [], F = [], S2 = Math.hypot(T, TH);
    // a box part; `long` names the axis the frame texture's grain should follow
    const box = (list, w, h, d, x, y, z, long, rz) => list.push({ g: new THREE.BoxGeometry(w, h, d), x, y, z, long, rz });
    if (k === 'wall') {
      if (mat === 'brick') {   // chunky stone posts, a thick cap and base
        const pw = 0.46;
        box(P, T - 2 * pw + 0.04, TH - 0.5, 0.28, 0, 0, 0);
        box(F, pw, TH - 0.5, 0.46, -T / 2 + pw / 2, 0, 0, 'y'); box(F, pw, TH - 0.5, 0.46, T / 2 - pw / 2, 0, 0, 'y');
        box(F, T, 0.28, 0.5, 0, TH / 2 - 0.14, 0, 'x'); box(F, T, 0.26, 0.46, 0, -TH / 2 + 0.13, 0, 'x');
      } else {
        const wood = mat === 'wood', pw = wood ? 0.34 : 0.3, dp = wood ? 0.42 : 0.36;
        box(P, T - 0.06, TH - 0.06, wood ? 0.16 : 0.12, 0, 0, 0);
        box(F, pw, TH, dp, -T / 2 + pw / 2, 0, 0, 'y'); box(F, pw, TH, dp, T / 2 - pw / 2, 0, 0, 'y');
        box(F, T - 2 * pw, 0.3, dp - 0.02, 0, TH / 2 - 0.15, 0, 'x'); box(F, T - 2 * pw, 0.3, dp - 0.02, 0, -TH / 2 + 0.15, 0, 'x');
        box(F, T - 2 * pw, 0.22, dp - 0.1, 0, 0, 0, 'x');   // middle rail
        if (wood) {   // a cross brace on each face, barn-door style
          const w = T - 2 * pw, h = TH - 0.6, L = Math.hypot(w, h) - 0.12, a = Math.atan2(h, w);
          box(F, L, 0.24, 0.08, 0, 0, 0.12, 'x', a); box(F, L, 0.24, 0.08, 0, 0, -0.12, 'x', a);
        }
      }
    } else if (k === 'floor') {
      box(P, T - 0.02, 0.16, T - 0.02, 0, 0.045, 0);   // deck, top flush with the old slab
      for (const z of [-T / 2 + 0.15, T / 2 - 0.15]) box(F, T, 0.26, 0.3, 0, -0.08, z, 'x');   // chunky edge beams
      for (const x of [-T / 2 + 0.15, 0, T / 2 - 0.15]) box(F, 0.3, 0.24, T - 0.62, x, -0.07, 0, 'z');
    } else if (k === 'rampX' || k === 'rampZ') {
      const X = k === 'rampX', W = T - 0.5;
      if (X) { box(P, S2, 0.16, W, 0, 0.045, 0); for (const z of [-T / 2 + 0.13, T / 2 - 0.13]) box(F, S2, 0.42, 0.26, 0, 0.03, z, 'x'); for (let i = -2; i <= 2; i++) box(F, 0.24, 0.16, W, i * S2 / 5.2, -0.1, 0, 'z'); }
      else { box(P, W, 0.16, S2, 0, 0.045, 0); for (const x of [-T / 2 + 0.13, T / 2 - 0.13]) box(F, 0.26, 0.42, S2, x, 0.03, 0, 'z'); for (let i = -2; i <= 2; i++) box(F, W, 0.16, 0.24, 0, -0.1, i * S2 / 5.2, 'x'); }
    } else {   // cone: a four-sided roof, boards / tiles / panels running up to the peak
      const g = new THREE.ConeGeometry(T / Math.SQRT2, CONE_H, 4, 1).rotateY(Math.PI / 4).translate(0, CONE_H / 2, 0); g.computeVertexNormals();
      P.push({ g, keepUV: true });
    }
    return this.merge(P, F);
  },
  // project each face along its main direction, so the pictures keep their real-world size on any part
  mapUV(part, trim) {
    const g = part.g, A = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < A.count; i++) {
      if (part.keepUV) { U.setXY(i, U.getX(i) * 4, U.getY(i)); continue; }
      const c = { x: A.getX(i), y: A.getY(i), z: A.getZ(i) }, nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i)), nz = Math.abs(N.getZ(i));
      let a, b; if (nz >= nx && nz >= ny) { a = 'x'; b = 'y'; } else if (nx >= ny) { a = 'z'; b = 'y'; } else { a = 'x'; b = 'z'; }
      if (trim) {
        if (part.long === b) [a, b] = [b, a];   // grain along the beam
        U.setXY(i, c[a] / 2.56 + 0.5, c[b] / 0.64 + 0.5);
      } else U.setXY(i, c[a] / T + 0.5, c[b] / T + 0.5);
    }
  },
  merge(P, F) {
    const pos = [], nor = [], uv = [], idx = []; let off = 0, split = 0;
    const add = (part, trim) => {
      const g = part.g; this.mapUV(part, trim);
      if (part.rz) g.rotateZ(part.rz);
      if (part.x || part.y || part.z) g.translate(part.x || 0, part.y || 0, part.z || 0);
      const A = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      for (let i = 0; i < A.count; i++) { pos.push(A.getX(i), A.getY(i), A.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i)); }
      const I = g.index; for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off); off += A.count; g.dispose();
    };
    for (const p of P) add(p, false); split = idx.length;
    for (const p of F) add(p, true);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx); out.addGroup(0, split, 0); if (idx.length > split) out.addGroup(split, idx.length - split, 1);
    out.computeBoundingSphere(); return out;
  },

  // ---------------------------------------------------------------- surfaces: bright, flat colours with toon highlights and shadows
  surface(m, part, W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const R = mulberry32({ wood: 11, brick: 23, metal: 37 }[m] + (part === 'trim' ? 100 : 0)), r = (a, b) => a + R() * (b - a);
    const rrect = (x, y, w, h, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
    const dot = (x, y, rad, fill, ring) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); if (ring) { g.strokeStyle = ring; g.lineWidth = 2; g.stroke(); } g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.35, 0, TAU); g.fill(); };
    if (m === 'wood' && part === 'panel') {   // six wide boards, bold gaps, a couple of smooth grain lines, a knot, nails
      const n = 6, pw = W / n;
      for (let i = 0; i < n; i++) {
        const x0 = i * pw, l = (i % 2 ? 57 : 62) + r(-2, 2);
        g.fillStyle = `hsl(30,64%,${l}%)`; g.fillRect(x0, 0, pw, H);
        g.fillStyle = `hsl(34,70%,${l + 10}%)`; g.fillRect(x0 + 5, 0, 6, H);   // lit edge
        g.fillStyle = `hsl(26,58%,${l - 12}%)`; g.fillRect(x0 + pw - 11, 0, 6, H);   // shaded edge
        g.strokeStyle = `hsl(26,55%,${l - 16}%)`; g.lineWidth = 3; g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {   // whole waves only, so the picture tiles top to bottom
          const gx = x0 + 18 + k * (pw - 36) / 2 + r(-6, 6), amp = r(3, 7), ph = R() * TAU;
          g.beginPath(); for (let y = 0; y <= H; y += 8) { const xx = gx + Math.sin(y / H * TAU + ph) * amp; y ? g.lineTo(xx, y) : g.moveTo(xx, y); } g.stroke();
        }
        const ky = r(40, H - 40), kx = x0 + r(24, pw - 24);   // a knot
        g.fillStyle = `hsl(24,52%,${l - 22}%)`; g.beginPath(); g.ellipse(kx, ky, 6, 10, 0, 0, TAU); g.fill();
        g.strokeStyle = `hsl(26,55%,${l - 10}%)`; g.lineWidth = 2.5; g.beginPath(); g.ellipse(kx, ky, 11, 17, 0, 0, TAU); g.stroke();
        g.fillStyle = '#5a2f12'; g.fillRect(x0, 0, 5, H);   // gap between boards
        for (const ny of [96, 416]) dot(x0 + pw / 2, ny, 5, '#4b3a30', '#2a1d14');   // nails
      }
    } else if (m === 'wood') {   // frame timber: a deeper orange-brown, grain along the beam, square bolts
      g.fillStyle = 'hsl(25,58%,40%)'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'hsl(24,55%,30%)'; g.lineWidth = 3; g.lineCap = 'round';
      for (const y0 of [44, 64, 84]) { const amp = r(2, 4), ph = R() * TAU; g.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = y0 + Math.sin(x / W * TAU * 2 + ph) * amp; x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
      for (let x = 64; x < W; x += 128) { g.fillStyle = '#3d3029'; g.fillRect(x - 7, 57, 14, 14); g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x - 5, 59, 5, 5); }
    } else if (m === 'brick' && part === 'panel') {   // big chunky bricks in cream mortar
      g.fillStyle = '#f1dcbc'; g.fillRect(0, 0, W, H);
      const cols = 8, rows = 16, bw = W / cols, bh = H / rows, mo = 5;
      for (let row = 0; row < rows; row++) for (let cc0 = -1; cc0 <= cols; cc0++) {
        const cc = (cc0 + cols) % cols, B = mulberry32(row * 131 + cc * 7 + 5), q = () => B();   // the same brick on both sides of the seam
        const x = cc0 * bw + (row % 2 ? bw / 2 : 0) + mo / 2, y = row * bh + mo / 2, w = bw - mo, h = bh - mo, odd = q() < 0.12;
        const hue = odd ? 8 : 12 + q() * 5, l = odd ? 38 : 47 + q() * 6;
        g.fillStyle = `hsl(${hue},62%,${l}%)`; rrect(x, y, w, h, 6); g.fill();
        g.save(); rrect(x, y, w, h, 6); g.clip();
        g.fillStyle = `hsla(18,80%,${l + 18}%,.75)`; g.fillRect(x, y, w, 5);   // lit top edge
        g.fillStyle = `hsla(6,60%,${l - 16}%,.7)`; g.fillRect(x, y + h - 6, w, 6);   // shaded bottom edge
        g.restore();
      }
    } else if (m === 'brick') {   // pale stone blocks for the posts, cap and base
      g.fillStyle = 'hsl(40,24%,76%)'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'hsl(40,26%,84%)'; g.fillRect(0, 34, W, 8);
      g.fillStyle = 'hsl(36,18%,62%)'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(r(0, W), r(30, 98), r(2, 5), 0, TAU); g.fill(); }   // a few pits
      g.fillStyle = 'hsl(36,16%,52%)'; for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 4, H);   // block joints
    } else if (m === 'metal' && part === 'panel') {   // four big riveted plates with bold seams and a bit of shine
      g.fillStyle = 'hsl(204,30%,74%)'; g.fillRect(0, 0, W, H);
      for (const px of [0, 256]) for (const py of [0, 256]) {
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(px + 8, py + 8, 240, 8); g.fillRect(px + 8, py + 8, 8, 240);   // lit edges
        g.fillStyle = 'rgba(20,40,60,.25)'; g.fillRect(px + 8, py + 240, 240, 8); g.fillRect(px + 240, py + 8, 8, 240);   // shaded edges
        g.save(); g.beginPath(); g.rect(px + 16, py + 16, 224, 224); g.clip();
        g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.moveTo(px + 60, py + 16); g.lineTo(px + 120, py + 16); g.lineTo(px + 16, py + 120); g.lineTo(px + 16, py + 60); g.fill();   // shine
        g.restore();
        for (const [rx, ry] of [[24, 24], [232, 24], [24, 232], [232, 232], [128, 24], [128, 232], [24, 128], [232, 128]]) dot(px + rx, py + ry, 7, 'hsl(206,18%,84%)', 'hsl(208,26%,36%)');
      }
      g.fillStyle = 'hsl(208,26%,40%)'; g.fillRect(0, 0, W, 5); g.fillRect(0, 254, W, 5); g.fillRect(0, 0, 5, H); g.fillRect(254, 0, 5, H);   // seams
    } else {   // steel frame: a darker blue-grey with big bolts
      g.fillStyle = 'hsl(206,26%,54%)'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 38, W, 6);
      for (let x = 32; x < W; x += 64) for (const y of [52, 80]) dot(x, y, 7, 'hsl(206,18%,74%)', 'hsl(208,26%,26%)');
    }
    return c;
  },
  // bold cracks drawn over a copy of the surface: a few at two-thirds health, more (and chunks knocked out) at one-third
  cracked(src, lvl, m) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const R = mulberry32(lvl * 97 + m.length * 13), r = (a, b) => a + R() * (b - a), W = c.width, H = c.height, ink = '#' + this.INK[m].toString(16).padStart(6, '0');
    const line = (x, y, a, n, w) => {
      const pts = [[x, y]]; for (let s = 0; s < n; s++) { a += (s % 2 ? 1 : -1) * r(0.5, 1.0); x += Math.cos(a) * r(16, 30); y += Math.sin(a) * r(16, 30); pts.push([x, y]); }   // zig-zag
      g.strokeStyle = ink; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'miter';
      g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); return pts;
    };
    const n = lvl === 1 ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const pts = line(r(80, W - 80), r(90, H - 90), r(0, TAU), 4 + Math.floor(R() * 3), lvl === 1 ? 5 : 7);
      const [bx, by] = pts[1 + Math.floor(R() * (pts.length - 1))]; line(bx, by, r(0, TAU), 2 + Math.floor(R() * 2), lvl === 1 ? 3.5 : 5);
    }
    if (lvl === 2) for (let i = 0; i < 4; i++) {   // chunks knocked out: a dark hole with a light chipped rim
      const x = r(70, W - 70), y = r(70, H - 70), s = r(16, 28), pts = [];
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = s * r(0.6, 1.1); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
      g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath();
      g.fillStyle = ink; g.fill(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3; g.stroke();
    }
    return c;
  },
};
