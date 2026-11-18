// =====================================================================
//  Who played: each play session sends one row to the maker's Google Form (fill in TRACK_FORM).
//  The maker's own lobby gets a private Players tab that charts the Form's Google Sheet. Only a
//  browser that has the Sheet's published link saved (pasted once via ?owner) shows that tab.
// =====================================================================
// From the Form's "Get pre-filled link": the formResponse address and each question's entry id.
const TRACK_FORM = { url: '', f: { name: '', device: '', session: '', started: '', minutes: '', matches: '', build: '' } };
const Track = {
  t0: Date.now(), active: 0, last: performance.now(), sentMin: -1, matches: 0, sid: Math.random().toString(36).slice(2, 10),
  device() { let d = Profile.d.dev; if (!d) { d = Profile.d.dev = Math.random().toString(36).slice(2, 10); Profile.save(); } return d; },
  tick() { const now = performance.now(); if (!document.hidden) this.active += Math.min(6000, now - this.last); this.last = now; },
  // minutes the game was on screen this visit; rows repeat the session id, so the chart keeps the longest
  send(final) {
    if (!TRACK_FORM.url || navigator.webdriver) return;
    this.tick(); const min = Math.round(this.active / 6000) / 10;
    if (this.active < 20000 || min - this.sentMin < (final ? 0.5 : 10)) return;
    this.sentMin = min; const f = TRACK_FORM.f, p = new URLSearchParams();
    p.set(f.name, (Profile.d.name || 'Player').slice(0, 24)); p.set(f.device, this.device()); p.set(f.session, this.sid);
    p.set(f.started, new Date(this.t0).toISOString()); p.set(f.minutes, String(min)); p.set(f.matches, String(this.matches)); p.set(f.build, BUILD_ID);
    try { if (!(navigator.sendBeacon && navigator.sendBeacon(TRACK_FORM.url, p))) fetch(TRACK_FORM.url, { method: 'POST', mode: 'no-cors', body: p, keepalive: true }).catch(() => {}); } catch (e) { /* offline */ }
  },
  init() {
    setInterval(() => { this.tick(); this.send(false); }, 5000);
    document.addEventListener('visibilitychange', () => { this.tick(); if (document.hidden) this.send(true); else this.last = performance.now(); });
    addEventListener('pagehide', () => this.send(true));
  },
};

// ---------------------------------------------------------------- the maker's private Players tab
const Players = {
  rows: null, err: '', loading: false, at: 0,
  link() { return Profile.d.ownerCsv || ''; },
  // ?owner in the address opens the box where the maker pastes the Sheet's published CSV link
  init() {
    $('ownBtn').addEventListener('click', () => this.saveLink());
    $('ownOff').addEventListener('click', () => { delete Profile.d.ownerCsv; Profile.save(); $('ownIn').value = ''; $('ownMsg').textContent = 'Removed from this browser. The Players tab is gone.'; Lobby.tab = 'play'; Lobby.refresh(); });
    $('ownClose').addEventListener('click', () => { $('owner').hidden = true; });
    $('ownIn').addEventListener('keydown', e => { if (e.key === 'Enter') this.saveLink(); e.stopPropagation(); });
    $('plRefresh').addEventListener('click', () => this.load(true));
    $('plLink').addEventListener('click', () => this.openSetup());
    let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (q.has('owner')) { q.delete('owner'); try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) { /* sandboxed */ } this.openSetup(); }
  },
  openSetup() { $('ownIn').value = this.link(); $('ownMsg').textContent = ''; $('ownOff').hidden = !this.link(); $('owner').hidden = false; },
  saveLink() {
    const v = $('ownIn').value.trim();
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/.+(output=csv|format=csv)/.test(v)) { $('ownMsg').textContent = 'Paste the CSV link from File → Share → Publish to web (it ends with output=csv).'; return; }
    Profile.d.ownerCsv = v; Profile.save(); this.rows = null; $('owner').hidden = true; Lobby.tab = 'players'; Lobby.refresh();
  },
  async load(force) {
    if (!this.link() || this.loading || (!force && this.rows && Date.now() - this.at < 60000)) return;
    this.loading = true; this.err = ''; this.render();
    try {
      const r = await fetch(this.link() + (this.link().includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('the Sheet answered ' + r.status);
      this.rows = this.parse(await r.text()); this.at = Date.now();
    } catch (e) { this.err = 'Could not read your Sheet (' + (e.message || e) + '). Check that it is still published to the web as CSV.'; }
    this.loading = false; this.render();
  },
  csv(text) {
    const out = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out;
  },
  // one entry per session (the longest row wins)
  parse(text) {
    const t = this.csv(text); if (!t.length) return [];
    const H = t[0].map(h => h.trim().toLowerCase()), col = k => H.findIndex(h => h.startsWith(k));
    const ci = { name: col('player'), device: col('device'), session: col('session'), started: col('started'), minutes: col('minutes'), matches: col('matches'), ts: col('timestamp') };
    const by = new Map();
    for (const r of t.slice(1)) {
      if (!r.length || r.every(c => !c)) continue;
      const g = k => (ci[k] >= 0 ? (r[ci[k]] || '').trim() : '');
      let when = new Date(g('started')); if (isNaN(when)) when = new Date(g('ts')); if (isNaN(when)) continue;
      const s = { name: g('name') || 'Player', device: g('device'), session: g('session') || Math.random().toString(36), when, min: Math.max(0, parseFloat(g('minutes')) || 0), matches: parseInt(g('matches'), 10) || 0 };
      const o = by.get(s.session); if (!o || s.min >= o.min) by.set(s.session, s);
    }
    return [...by.values()].sort((a, b) => b.when - a.when);
  },
  fmtMin(m) { return m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(m < 600 ? 1 : 0) + ' h'; },
  render() {
    const box = $('plBody'); if (!box) return;
    if (this.loading && !this.rows) { box.innerHTML = '<div class="hint">Loading your Sheet…</div>'; return; }
    if (this.err) { box.innerHTML = '<div class="hint pl-err">' + esc(this.err) + '</div>'; if (!this.rows) return; }
    const R = this.rows || [];
    if (!R.length) { box.innerHTML = (this.err ? '<div class="hint pl-err">' + esc(this.err) + '</div>' : '') + '<div class="hint">No sessions yet. They show up here after people play on the website for at least 20 seconds.</div>'; return; }
    const me = Profile.d.dev, who = s => s.name + (s.device && s.device === me ? ' (you)' : '');
    const now = Date.now(), day = 864e5, week = R.filter(s => now - s.when < 7 * day);
    const people = new Set(R.map(s => s.device || s.name)).size, total = R.reduce((a, s) => a + s.min, 0), wk = week.reduce((a, s) => a + s.min, 0);
    // last 14 days, minutes per day
    const days = []; const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) { const d = new Date(d0.getTime() - i * day); days.push({ d, min: 0, n: 0, who: new Set() }); }
    for (const s of R) { const k = Math.floor((new Date(s.when).setHours(0, 0, 0, 0) - days[0].d.getTime()) / day); if (k >= 0 && k < 14) { days[k].min += s.min; days[k].n++; days[k].who.add(s.name); } }
    const W = 400, Hh = 150, padL = 34, padB = 22, padT = 10, bw = Math.min(18, (W - padL) / 14 - 6), maxM = Math.max(10, ...days.map(x => x.min));
    const step = maxM <= 30 ? 10 : maxM <= 60 ? 20 : maxM <= 150 ? 50 : maxM <= 300 ? 100 : Math.ceil(maxM / 300) * 100, top = Math.ceil(maxM / step) * step;
    const y = v => padT + (Hh - padT - padB) * (1 - v / top), x = i => padL + (i + 0.5) * (W - padL) / 14;
    let svg = `<svg class="pl-chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Minutes played per day, last 14 days">`;
    for (let v = 0; v <= top; v += step) svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="pl-grid"/><text x="${padL - 6}" y="${y(v) + 3.5}" class="pl-ax" text-anchor="end">${v}</text>`;
    days.forEach((b, i) => {
      const h = Math.max(0, y(0) - y(b.min)), r = Math.min(4, h), x0 = x(i) - bw / 2, y0 = y(0);
      if (h > 0.5) svg += `<path class="pl-bar" d="M${x0},${y0} V${y0 - h + r} Q${x0},${y0 - h} ${x0 + r},${y0 - h} H${x0 + bw - r} Q${x0 + bw},${y0 - h} ${x0 + bw},${y0 - h + r} V${y0} Z"/>`;
      svg += `<rect class="pl-hit" x="${x(i) - (W - padL) / 28}" y="${padT}" width="${(W - padL) / 14}" height="${Hh - padT - padB}" data-i="${i}"/>`;
      if (i % 2 === 1 || i === 13) svg += `<text x="${x(i)}" y="${Hh - 6}" class="pl-ax" text-anchor="middle">${i === 13 ? 'Today' : b.d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</text>`;
    });
    svg += `<line x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="pl-base"/></svg>`;
    // top players by total time
    const tot = new Map(); for (const s of R) { const k = s.device || s.name; const o = tot.get(k) || { name: who(s), min: 0, n: 0, last: s.when }; o.min += s.min; o.n++; if (s.when > o.last) o.last = s.when; tot.set(k, o); }
    const tops = [...tot.values()].sort((a, b) => b.min - a.min).slice(0, 8), tmax = Math.max(1, tops[0] ? tops[0].min : 1);
    const when = d => { const t = new Date(d), today = new Date(); const sameDay = t.toDateString() === today.toDateString(); return (sameDay ? 'Today' : t.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + ', ' + t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
    box.innerHTML = (this.err ? '<div class="hint pl-err">' + esc(this.err) + '</div>' : '') + `
      <div class="pl-tiles">
        <div class="stat"><b>${people}</b><span>Players</span></div>
        <div class="stat"><b>${R.length}</b><span>Sessions</span></div>
        <div class="stat"><b>${this.fmtMin(total)}</b><span>Total play time</span></div>
        <div class="stat"><b>${this.fmtMin(wk)}</b><span>Last 7 days</span></div>
      </div>
      <h3>Minutes played per day</h3>
      <div class="pl-wrap">${svg}<div class="pl-tip" id="plTip" hidden></div></div>
      <h3>Most time played</h3>
      <div class="pl-top">${tops.map(p => `<div class="pl-row"><span class="pl-name">${esc(p.name)}</span><span class="pl-track"><i style="width:${(p.min / tmax * 100).toFixed(1)}%"></i></span><b>${this.fmtMin(p.min)}</b></div>`).join('')}</div>
      <h3>Recent sessions</h3>
      <table class="pl-table"><thead><tr><th>Player</th><th>When</th><th>How long</th><th>Matches</th></tr></thead><tbody>${R.slice(0, 30).map(s => `<tr><td>${esc(who(s))}</td><td>${esc(when(s.when))}</td><td>${this.fmtMin(s.min)}</td><td>${s.matches}</td></tr>`).join('')}</tbody></table>`;
    const tip = $('plTip'), wrap = box.querySelector('.pl-wrap');
    wrap.addEventListener('mousemove', e => {
      const t = e.target.closest('.pl-hit'); if (!t) { tip.hidden = true; return; }
      const b = days[+t.dataset.i], r = wrap.getBoundingClientRect();
      tip.innerHTML = `<b>${b.d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b><span>${Math.round(b.min)} min · ${b.n} session${b.n === 1 ? '' : 's'}</span>${b.who.size ? '<span>' + esc([...b.who].slice(0, 4).join(', ') + (b.who.size > 4 ? ' +' + (b.who.size - 4) : '')) + '</span>' : ''}`;
      tip.hidden = false; tip.style.left = Math.min(r.width - 150, Math.max(0, e.clientX - r.left - 60)) + 'px'; tip.style.top = Math.max(0, e.clientY - r.top - 70) + 'px';
    });
    wrap.addEventListener('mouseleave', () => { tip.hidden = true; });
  },
};
