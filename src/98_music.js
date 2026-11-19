// =====================================================================
//  Your lobby music: songs a player picks from their own computer. They are stored only in that
//  browser (IndexedDB) and play in the lobby, one after another. Nothing is uploaded anywhere.
// =====================================================================
const LobbyMusic = {
  db: null, songs: [], i: 0, el: null, url: '', unlocked: false, err: '',
  async init() {
    this.el = new Audio(); this.el.preload = 'auto';
    this.el.addEventListener('ended', () => this.next());
    this.el.addEventListener('error', () => { if (this.songs.length > 1) this.next(); });
    const unlock = () => { this.unlocked = true; this.sync(); };
    addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);   // browsers only allow sound after a click or key
    $('musFile').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; this.add(f); });
    $('musList').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) this.remove(b.dataset.del); const p = e.target.closest('[data-play]'); if (p) { this.i = this.songs.findIndex(s => s.id === p.dataset.play); this.load(true); } });
    $('musVol').value = Profile.d.musVol ?? 0.5; $('musVol').addEventListener('input', e => { Profile.d.musVol = +e.target.value; Profile.save(); this.el.volume = Profile.d.musVol; });
    $('musOn').checked = Profile.d.musOn !== false; $('musOn').addEventListener('change', e => { Profile.d.musOn = e.target.checked; Profile.save(); this.sync(); });
    this.el.volume = Profile.d.musVol ?? 0.5;
    try { await this.open(); this.songs = await this.all(); } catch (e) { this.err = 'This browser cannot save songs (private window or storage turned off).'; }
    this.render(); this.load(false);
  },
  open() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no storage'));
      const r = indexedDB.open('fortday-music', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => rej(r.error);
    });
  },
  tx(mode) { return this.db.transaction('songs', mode).objectStore('songs'); },
  all() { return new Promise((res, rej) => { const r = this.tx('readonly').getAll(); r.onsuccess = () => res((r.result || []).sort((a, b) => a.at - b.at)); r.onerror = () => rej(r.error); }); },
  async add(files) {
    if (!this.db) { this.err = this.err || 'This browser cannot save songs.'; this.render(); return; }
    for (const f of files) {
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|oga|wav|flac|webm)$/i.test(f.name)) continue;
      if (f.size > 40 * 1024 * 1024) { this.err = f.name + ' is bigger than 40 MB.'; continue; }
      const s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.replace(/\.[^.]+$/, '').slice(0, 80), at: Date.now(), blob: f };
      try { await new Promise((res, rej) => { const r = this.tx('readwrite').put(s); r.onsuccess = res; r.onerror = () => rej(r.error); }); this.songs.push(s); this.err = ''; }
      catch (e) { this.err = 'Could not save ' + f.name + ' (the browser may be out of space).'; }
    }
    this.render(); if (this.songs.length && !this.url) { this.i = this.songs.length - 1; this.load(true); }
  },
  remove(id) {
    if (this.db) this.tx('readwrite').delete(id);
    const was = this.songs[this.i] && this.songs[this.i].id === id;
    this.songs = this.songs.filter(s => s.id !== id); if (this.i >= this.songs.length) this.i = 0;
    if (was) { this.el.pause(); if (this.url) URL.revokeObjectURL(this.url); this.url = ''; this.load(true); }
    this.render();
  },
  load(play) {
    const s = this.songs[this.i]; if (!s) { this.el.removeAttribute('src'); this.render(); return; }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(s.blob); this.el.src = this.url; this.render();
    if (play) this.sync(true);
  },
  next() { if (!this.songs.length) return; this.i = (this.i + 1) % this.songs.length; this.load(true); },
  want() { return Profile.d.musOn !== false && this.songs.length > 0 && Match.state === 'lobby' && !document.hidden; },
  // play in the lobby, pause everywhere else (matches, loading, results)
  sync(force) {
    if (!this.el || !this.el.src) return;
    if (this.want() && this.unlocked) { if (this.el.paused || force) { const p = this.el.play(); if (p && p.catch) p.catch(() => {}); } }
    else if (!this.el.paused) this.el.pause();
  },
  render() {
    const box = $('musList'); if (!box) return;
    const cur = this.songs[this.i];
    box.innerHTML = (this.songs.length ? this.songs.map(s => `<div class="mus-row${cur && s.id === cur.id ? ' on' : ''}"><button class="mus-name" data-play="${s.id}" title="Play this one">${cur && s.id === cur.id ? '♫ ' : ''}${esc(s.name)}</button><button class="mus-del" data-del="${s.id}" title="Remove">✕</button></div>`).join('') : '<div class="hint">No songs yet.</div>') + (this.err ? '<div class="hint pl-err">' + esc(this.err) + '</div>' : '');
  },
};
