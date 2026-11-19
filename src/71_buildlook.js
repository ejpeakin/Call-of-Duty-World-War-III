// =====================================================================
//  How build pieces look: framed walls, decks with beams underneath, ramps with side rails, and
//  detailed wood / brick / metal surfaces with relief that catches the light. Pieces crack as they lose
//  health. Only the look lives here: collision boxes and sizes stay in src/70_build.js.
//  Textures are drawn in code from fixed seeds, so every player sees the same builds.
// =====================================================================
const BuildLook = {
  mats: {}, geos: {}, fades: {}, ready: false,
  init() {
    if (this.ready) return; this.ready = true;
    const lite = !!(Perf.on || GFX.fast);   // Performance Mode / Fast graphics: same pictures, simpler lighting
    for (const m of ['wood', 'brick', 'metal']) {
      const P = this.surface(m, 'panel', 512, 512), Tr = this.surface(m, 'trim', 512, 128);
      const opt = { wood: { roughness: 0.82, metalness: 0 }, brick: { roughness: 0.95, metalness: 0 }, metal: { roughness: 0.5, metalness: 0.12 } }[m];
      const pn = lite ? null : this.tex(this.normals(P.h, m === 'brick' ? 3.2 : 2.4)), tn = lite ? null : this.tex(this.normals(Tr.h, 2.2));
      const mk = (cv, nrm) => lite ? new THREE.MeshLambertMaterial({ map: this.tex(cv) })
        : new THREE.MeshStandardMaterial(Object.assign({ map: this.tex(cv), normalMap: nrm, normalScale: new THREE.Vector2(1, 1) }, opt));
      this.mats[m] = { panel: [mk(P.c, pn), mk(this.cracked(P.c, 1, m), pn), mk(this.cracked(P.c, 2, m), pn)], trim: mk(Tr.c, tn) };
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

  // ---------------------------------------------------------------- shapes (one mesh per piece: surface first, then frame)
  geo(mat, k) { const key = mat + ':' + k; return this.geos[key] || (this.geos[key] = this.make(mat, k)); },
  make(mat, k) {
    const P = [], F = [], S2 = Math.hypot(T, TH);
    // a box part; `long` names the axis the frame texture's grain should follow
    const box = (list, w, h, d, x, y, z, long, rz) => list.push({ g: new THREE.BoxGeometry(w, h, d), x, y, z, long, rz });
    if (k === 'wall') {
      const pw = mat === 'brick' ? 0.36 : 0.24;   // post width
      box(P, T - 0.06, TH - 0.06, mat === 'brick' ? 0.24 : 0.14, 0, 0, 0);
      box(F, pw, TH, 0.32, -T / 2 + pw / 2, 0, 0, 'y'); box(F, pw, TH, 0.32, T / 2 - pw / 2, 0, 0, 'y');
      box(F, T - 2 * pw, 0.22, 0.3, 0, TH / 2 - 0.11, 0, 'x'); box(F, T - 2 * pw, 0.22, 0.3, 0, -TH / 2 + 0.11, 0, 'x');
      if (mat === 'wood') {   // a middle rail and a cross brace on each face, like a barn wall
        box(F, T - 2 * pw, 0.14, 0.24, 0, 0, 0, 'x');
        const w = T - 2 * pw, h = TH - 0.44, L = Math.hypot(w, h) - 0.1, a = Math.atan2(h, w);
        box(F, L, 0.14, 0.04, 0, 0, 0.09, 'x', a); box(F, L, 0.14, 0.04, 0, 0, -0.09, 'x', a);
      }
      if (mat === 'metal') box(F, T - 2 * pw, 0.12, 0.26, 0, 0, 0, 'x');
    } else if (k === 'floor') {
      box(P, T - 0.02, 0.12, T - 0.02, 0, 0.065, 0);   // deck, top flush with the old slab
      for (const x of [-T / 2 + 0.12, 0, T / 2 - 0.12]) box(F, 0.18, 0.14, T - 0.04, x, -0.06, 0, 'z');   // joists underneath
      for (const z of [-T / 2 + 0.12, T / 2 - 0.12]) box(F, T - 0.04, 0.13, 0.18, 0, -0.055, z, 'x');
    } else if (k === 'rampX' || k === 'rampZ') {
      const X = k === 'rampX', W = T - 0.36;
      if (X) { box(P, S2, 0.12, W, 0, 0.065, 0); for (const z of [-T / 2 + 0.09, T / 2 - 0.09]) box(F, S2, 0.34, 0.18, 0, 0.03, z, 'x'); for (let i = -2; i <= 2; i++) box(F, 0.14, 0.12, W, i * S2 / 5.2, -0.06, 0, 'z'); }
      else { box(P, W, 0.12, S2, 0, 0.065, 0); for (const x of [-T / 2 + 0.09, T / 2 - 0.09]) box(F, 0.18, 0.34, S2, x, 0.03, 0, 'z'); for (let i = -2; i <= 2; i++) box(F, W, 0.12, 0.14, 0, -0.06, i * S2 / 5.2, 'x'); }
    } else {   // cone: a four-sided roof, boards running up to the peak
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

  // ---------------------------------------------------------------- surfaces: a colour picture and a height picture
  surface(m, part, W, H) {
    const c = document.createElement('canvas'), hc = document.createElement('canvas'); c.width = hc.width = W; c.height = hc.height = H;
    const g = c.getContext('2d'), h = hc.getContext('2d'), R = mulberry32({ wood: 11, brick: 23, metal: 37 }[m] + (part === 'trim' ? 100 : 0)), r = (a, b) => a + R() * (b - a);
    // draw something near an edge on both sides of it, so the picture tiles without seams
    const wrap = fn => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) fn(dx, dy); };
    const grey = v => { v = Math.round(Math.max(0, Math.min(255, v))); return `rgb(${v},${v},${v})`; };
    if (m === 'wood' && part === 'panel') {
      const n = 8, pw = W / n; h.fillStyle = grey(0); h.fillRect(0, 0, W, H);
      for (let i = 0; i < n; i++) {
        const x0 = i * pw; g.fillStyle = `hsl(${r(25, 33)},${r(38, 50)}%,${r(42, 52)}%)`; g.fillRect(x0, 0, pw, H); h.fillStyle = grey(175); h.fillRect(x0 + 2, 0, pw - 2, H);
        for (let k = 0; k < 30; k++) {   // grain: wavy lines along the board, a whole number of waves so it tiles
          const gx = x0 + r(4, pw - 4), amp = r(0.6, 2.6), cyc = 1 + Math.floor(R() * 4), ph = R() * TAU, dark = R() < 0.7;
          g.strokeStyle = dark ? `rgba(58,30,10,${r(0.12, 0.3)})` : `rgba(255,222,170,${r(0.05, 0.13)})`; g.lineWidth = r(0.6, 1.7);
          h.strokeStyle = dark ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.08)'; h.lineWidth = g.lineWidth;
          for (const ctx of [g, h]) { ctx.beginPath(); for (let y = 0; y <= H; y += 8) { const xx = gx + Math.sin(y / H * TAU * cyc + ph) * amp; y ? ctx.lineTo(xx, y) : ctx.moveTo(xx, y); } ctx.stroke(); }
        }
        for (let kk = 0, nk = R() < 0.6 ? 1 : 2; kk < nk; kk++) {   // knots
          const kx = x0 + r(14, pw - 14), ky = r(0, H), kr = r(4, 8);
          wrap((dx, dy) => { if (dx) return; const gr = g.createRadialGradient(kx, ky + dy, 0, kx, ky + dy, kr * 1.6); gr.addColorStop(0, 'rgba(40,20,6,.95)'); gr.addColorStop(0.5, 'rgba(70,38,14,.6)'); gr.addColorStop(1, 'rgba(70,38,14,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(kx, ky + dy, kr, kr * 1.6, 0, 0, TAU); g.fill(); h.fillStyle = grey(150); h.beginPath(); h.ellipse(kx, ky + dy, kr, kr * 1.6, 0, 0, TAU); h.fill(); });
        }
        if (R() < 0.55) { const jy = Math.floor(r(70, H - 70)); g.fillStyle = 'rgba(38,20,7,.85)'; g.fillRect(x0, jy, pw, 2); h.fillStyle = grey(30); h.fillRect(x0, jy, pw, 2); }   // where two boards butt together
        g.fillStyle = '#2b190b'; g.fillRect(x0, 0, 2, H);   // gap between boards
        for (const ny of [96, 416]) { const nx = x0 + pw / 2 + r(-6, 6); g.fillStyle = '#3c3a38'; g.beginPath(); g.arc(nx, ny, 2.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(220,220,220,.5)'; g.beginPath(); g.arc(nx - 0.8, ny - 0.8, 1, 0, TAU); g.fill(); h.fillStyle = grey(240); h.beginPath(); h.arc(nx, ny, 2.6, 0, TAU); h.fill(); }   // nails
      }
      for (let i = 0; i < 14; i++) { const x = r(0, W), y = r(0, H), rr = r(20, 60); wrap((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr); gr.addColorStop(0, 'rgba(30,18,6,.12)'); gr.addColorStop(1, 'rgba(30,18,6,0)'); g.fillStyle = gr; g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2); }); }   // weathering
    } else if (m === 'wood') {   // frame timber: darker, grain along the beam
      g.fillStyle = 'hsl(26,38%,33%)'; g.fillRect(0, 0, W, H); h.fillStyle = grey(165); h.fillRect(0, 0, W, H);
      for (let k = 0; k < 60; k++) {
        const gy = r(0, H), amp = r(0.5, 2), cyc = 1 + Math.floor(R() * 3), ph = R() * TAU, dark = R() < 0.7;
        g.strokeStyle = dark ? `rgba(30,15,4,${r(0.15, 0.35)})` : `rgba(230,190,140,${r(0.05, 0.12)})`; g.lineWidth = r(0.6, 1.8); h.strokeStyle = dark ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.08)'; h.lineWidth = g.lineWidth;
        for (const ctx of [g, h]) { ctx.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = gy + Math.sin(x / W * TAU * cyc + ph) * amp; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke(); }
      }
      for (let k = 0; k < 6; k++) { const x = r(0, W - 60), y = r(10, H - 10), l = r(20, 60); g.fillStyle = 'rgba(20,10,2,.7)'; g.fillRect(x, y, l, 1.4); h.fillStyle = grey(40); h.fillRect(x, y, l, 1.4); }   // drying cracks
      for (let x = 32; x < W; x += 128) for (const y of [32, 96]) { g.fillStyle = '#2f2d2b'; g.fillRect(x - 4, y - 4, 8, 8); g.fillStyle = 'rgba(200,200,200,.35)'; g.fillRect(x - 3, y - 3, 3, 3); h.fillStyle = grey(235); h.fillRect(x - 4, y - 4, 8, 8); }   // square bolt heads
    } else if (m === 'brick' && part === 'panel') {
      g.fillStyle = '#a8a094'; g.fillRect(0, 0, W, H); h.fillStyle = grey(55); h.fillRect(0, 0, W, H);
      for (let i = 0; i < 2600; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'; g.fillRect(r(0, W), r(0, H), 1.5, 1.5); }   // mortar grit
      const cols = 16, rows = 32, bw = W / cols, bh = H / rows;
      for (let row = 0; row < rows; row++) for (let c = -1; c <= cols; c++) {
        const cc = (c + cols) % cols, B = mulberry32(row * 131 + cc * 7 + 5), q = () => B();   // the same brick on both sides of the seam
        const x = c * bw + (row % 2 ? bw / 2 : 0), y = row * bh, burnt = q() < 0.09, pale = q() < 0.06;
        let rr = 150 + q() * 42; if (burnt) rr *= 0.62; if (pale) rr *= 1.12;
        g.fillStyle = `rgb(${rr | 0},${(rr * (0.38 + q() * 0.1)) | 0},${(rr * (0.27 + q() * 0.08)) | 0})`; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        h.fillStyle = grey(200 + q() * 30 - 15); h.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = 'rgba(255,230,210,.18)'; g.fillRect(x + 1, y + 1, bw - 2, 1); g.fillStyle = 'rgba(40,12,6,.25)'; g.fillRect(x + 1, y + bh - 2, bw - 2, 1);   // soft bevel
        for (let s = 0; s < 10; s++) { g.fillStyle = q() < 0.5 ? 'rgba(60,20,10,.35)' : 'rgba(255,210,180,.2)'; g.fillRect(x + 2 + q() * (bw - 5), y + 2 + q() * (bh - 5), 1.4, 1.4); }
        if (q() < 0.16) { const cx = x + (q() < 0.5 ? 1 : bw - 6), cy = y + (q() < 0.5 ? 1 : bh - 6); g.fillStyle = '#9f978b'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 5, cy); g.lineTo(cx + (q() * 5), cy + 5); g.fill(); h.fillStyle = grey(90); h.beginPath(); h.moveTo(cx, cy); h.lineTo(cx + 5, cy); h.lineTo(cx + 2, cy + 5); h.fill(); }   // a chipped corner
      }
      for (let i = 0; i < 10; i++) { const x = r(0, W), y = r(0, H), rr = r(25, 70); wrap((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr); gr.addColorStop(0, 'rgba(20,16,12,.13)'); gr.addColorStop(1, 'rgba(20,16,12,0)'); g.fillStyle = gr; g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2); }); }   // soot and grime
    } else if (m === 'brick') {   // concrete posts, cap and base
      g.fillStyle = '#8f8c86'; g.fillRect(0, 0, W, H); h.fillStyle = grey(150); h.fillRect(0, 0, W, H);
      for (let i = 0; i < 4000; i++) { const v = R(); g.fillStyle = v < 0.5 ? `rgba(40,38,34,${r(0.1, 0.3)})` : `rgba(235,230,220,${r(0.1, 0.25)})`; const x = r(0, W), y = r(0, H), s = r(0.8, 2.4); g.fillRect(x, y, s, s); h.fillStyle = grey(150 + (v < 0.5 ? -40 : 30)); h.fillRect(x, y, s, s); }   // aggregate
      for (let k = 0; k < 3; k++) { let x = r(0, W), y = r(0, H); g.strokeStyle = 'rgba(40,38,34,.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += r(4, 14); y += r(-5, 5); g.lineTo(x, y); } g.stroke(); }   // hairline cracks
    } else if (m === 'metal' && part === 'panel') {   // corrugated sheet steel
      const ridges = 24;
      for (let x = 0; x < W; x++) { const s = Math.sin(x / W * TAU * ridges), v = 0.84 + 0.16 * s; g.fillStyle = `rgb(${(170 * v) | 0},${(180 * v) | 0},${(190 * v) | 0})`; g.fillRect(x, 0, 1, H); h.fillStyle = grey(128 + 95 * s); h.fillRect(x, 0, 1, H); }
      for (const sy of [0, H / 2]) {   // where two sheets overlap, screwed along the seam
        g.fillStyle = 'rgba(30,34,40,.75)'; g.fillRect(0, sy, W, 3); g.fillStyle = 'rgba(230,236,242,.35)'; g.fillRect(0, sy + 3, W, 2); h.fillStyle = grey(20); h.fillRect(0, sy, W, 3);
        for (let x = 10; x < W; x += W / ridges) { const y = sy + 12; g.fillStyle = '#c7ced5'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,44,50,.8)'; g.lineWidth = 1; g.stroke(); h.fillStyle = grey(250); h.beginPath(); h.arc(x, y, 3, 0, TAU); h.fill(); }
      }
      for (let i = 0; i < 7; i++) { const x = 10 + Math.floor(R() * ridges) * W / ridges, y = (R() < 0.5 ? 0 : H / 2) + 15, l = r(40, 110); const gr = g.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(130,62,22,.55)'); gr.addColorStop(1, 'rgba(130,62,22,0)'); g.fillStyle = gr; g.fillRect(x - 3, y, 6, l); }   // rust running down from screws
      for (let i = 0; i < 45; i++) { const x = r(0, W), y = r(0, H), a = r(0, TAU), l = r(6, 30); g.strokeStyle = `rgba(255,255,255,${r(0.06, 0.16)})`; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }   // scratches
      for (let i = 0; i < 9; i++) { const x = r(0, W), y = r(0, H), rr = r(30, 90); wrap((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rr); gr.addColorStop(0, 'rgba(30,30,28,.14)'); gr.addColorStop(1, 'rgba(30,30,28,0)'); g.fillStyle = gr; g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2); }); }   // grime
    } else {   // steel frame: brushed, with bolts
      g.fillStyle = '#717a83'; g.fillRect(0, 0, W, H); h.fillStyle = grey(160); h.fillRect(0, 0, W, H);
      for (let i = 0; i < 220; i++) { const y = r(0, H); g.fillStyle = R() < 0.5 ? `rgba(255,255,255,${r(0.03, 0.09)})` : `rgba(0,0,0,${r(0.04, 0.1)})`; g.fillRect(0, y, W, r(0.5, 1.5)); }
      for (let x = 32; x < W; x += 64) for (const y of [24, 104]) { g.fillStyle = '#3c434a'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.fillStyle = 'rgba(210,218,226,.45)'; g.beginPath(); g.arc(x - 1.5, y - 1.5, 2, 0, TAU); g.fill(); h.fillStyle = grey(245); h.beginPath(); h.arc(x, y, 5, 0, TAU); h.fill(); }
      for (let i = 0; i < 3; i++) { const x = r(0, W), l = r(20, 50); const gr = g.createLinearGradient(0, 30, 0, 30 + l); gr.addColorStop(0, 'rgba(130,62,22,.4)'); gr.addColorStop(1, 'rgba(130,62,22,0)'); g.fillStyle = gr; g.fillRect(x, 30, 5, l); }
    }
    return { c, h: hc };
  },
  // cracks drawn over a copy of the surface: a few at two-thirds health, more and wider (plus chunks missing) at one-third
  cracked(src, lvl, m) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const R = mulberry32(lvl * 97 + m.length * 13), r = (a, b) => a + R() * (b - a), W = c.width, H = c.height;
    const line = (x, y, a, n, w) => { g.lineCap = 'round'; g.lineJoin = 'round'; const pts = [[x, y]]; for (let s = 0; s < n; s++) { a += r(-0.7, 0.7); x += Math.cos(a) * r(10, 22); y += Math.sin(a) * r(10, 22); pts.push([x, y]); }
      for (const [col, lw, o] of [['rgba(255,240,220,.18)', w + 1.2, 1], ['rgba(16,10,6,.9)', w, 0]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px + o, py + o) : g.moveTo(px + o, py + o)); g.stroke(); }
      return pts; };
    const n = lvl === 1 ? 4 : 9;
    for (let i = 0; i < n; i++) {
      const pts = line(r(70, W - 70), r(80, H - 80), r(0, TAU), 5 + Math.floor(R() * 6), lvl === 1 ? 1.6 : 2.6);
      for (let b = 0; b < (lvl === 1 ? 1 : 2); b++) { const [bx, by] = pts[1 + Math.floor(R() * (pts.length - 1))]; line(bx, by, r(0, TAU), 3 + Math.floor(R() * 3), lvl === 1 ? 1 : 1.6); }
    }
    if (lvl === 2) {
      for (let i = 0; i < 5; i++) {   // chunks knocked out
        const x = r(60, W - 60), y = r(60, H - 60), s = r(10, 22); g.fillStyle = m === 'wood' ? 'rgba(48,26,10,.9)' : m === 'brick' ? 'rgba(92,72,60,.9)' : 'rgba(40,44,48,.9)';
        g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = s * r(0.55, 1.1); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, W, H);   // dust and soot
    }
    return c;
  },
  // a normal map from the height picture, so light and shadow pick out boards, bricks and ridges
  normals(hc, k) {
    const W = hc.width, H = hc.height, src = hc.getContext('2d').getImageData(0, 0, W, H).data, out = document.createElement('canvas'); out.width = W; out.height = H;
    const og = out.getContext('2d'), img = og.createImageData(W, H), d = img.data, at = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * k, ny = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(nx, ny, 1), i = (y * W + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    og.putImageData(img, 0, 0); return out;
  },
};
