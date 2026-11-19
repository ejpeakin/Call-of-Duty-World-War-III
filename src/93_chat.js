// =====================================================================
//  Team chat (Duos and Squads): Enter opens a box, Enter sends to your team only, Escape closes.
//  Online it goes to teammates' games through the host; bot teammates answer now and then.
// =====================================================================
const Chat = {
  on: false, lines: [], lastSend: 0,
  team() { return Match.mode === 'duos' || Match.mode === 'squads'; },
  init() {
    const inp = $('chatIn');
    // capture phase: while typing, keys never reach the game (no moving, building or pausing)
    addEventListener('keydown', e => {
      if (Match.state !== 'play' || !this.team()) return;
      if (this.on) {
        if (e.target !== inp) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } else if (e.key.length === 1 || e.key === 'Backspace') inp.focus(); return; }
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); this.send(inp.value); this.close(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
        return;
      }
      if (e.key === 'Enter' && !e.repeat && !Match.paused && $('death').hidden && !Inv.on && !Victory.on && !e.target.closest('input,textarea,select')) { e.preventDefault(); e.stopPropagation(); this.open(); }
    }, true);
    inp.addEventListener('keyup', e => e.stopPropagation(), true);
    $('chatBtn').addEventListener('click', () => { if (this.on) { this.send(inp.value); this.close(); } else this.open(); });
  },
  open() {
    this.on = true; $('chat').classList.add('open'); Input.keys = {}; Input.lmb = Input.rmb = false;
    if (player) { const i = player.input; i.f = i.r = 0; i.fire = i.jump = i.sprint = false; }
    if (document.pointerLockElement) document.exitPointerLock();
    const inp = $('chatIn'); inp.value = ''; inp.focus(); setTimeout(() => { if (this.on) inp.focus(); }, 0); this.render();
  },
  close() {
    if (!this.on) return; this.on = false; $('chat').classList.remove('open'); $('chatIn').blur(); this.render();
    if (Match.state === 'play' && !Input.coarse && !Input.touch.on) Input.requestLock();
  },
  clean(t) { return String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); },
  send(t) {
    t = this.clean(t); if (!t || !player || performance.now() - this.lastSend < 600) return; this.lastSend = performance.now();
    const me = Profile.d.name || 'You';
    this.add(me, t, true);
    if (Net.inMatch) Net.emit({ k: 'chat', t, n: me.slice(0, 16), team: player.team });
    this.botReply(t);
  },
  // a message from someone else's game (already checked for team by the host)
  receive(name, t) { t = this.clean(t); if (t) { this.add(String(name || 'Teammate').slice(0, 16), t, false); Sfx.tone(880, 0.06, 'triangle', 0.05); } },
  add(name, t, mine) {
    this.lines.push({ name, t, mine, at: performance.now() }); if (this.lines.length > 40) this.lines.shift();
    this.render();
  },
  botReply(t) {
    const bots = actors.filter(a => a.ai && !a.npc && a.alive && player && a.team === player.team); if (!bots.length || Math.random() < 0.35) return;
    const b = pick(bots), low = t.toLowerCase();
    const say = /help|come|here|where/.test(low) ? pick(['On my way!', 'Coming to you', 'Right behind you']) : /storm|zone|move/.test(low) ? pick(['Heading in now', 'Moving to the zone']) : /loot|chest|ammo|heal|shield/.test(low) ? pick(['I can share heals', 'Grabbing loot, one sec', 'Check the chest by me']) : /gg|nice|good|win/.test(low) ? pick(['GG!', 'Nice one!', "Let's go!"]) : pick(['Got it', 'Copy that', 'Sounds good', 'Okay!']);
    setTimeout(() => { if (b.alive && Match.state === 'play') this.receive(b.name, say); }, 900 + Math.random() * 1400);
  },
  clear() { this.lines = []; this.on = false; const c = $('chat'); if (c) c.classList.remove('open'); this.render(); },
  render() {
    const log = $('chatLog'); if (!log) return;
    const show = Match.state === 'play' && this.team(); $('chat').hidden = !show; if (!show) return;
    const now = performance.now(), L = this.on ? this.lines.slice(-12) : this.lines.filter(l => now - l.at < 9000).slice(-5);
    log.innerHTML = L.map(l => '<div class="cl' + (l.mine ? ' me' : '') + '"><b>' + esc(l.name) + ':</b> ' + esc(l.t) + '</div>').join('');
    $('chatHint').hidden = this.on;
  },
  update() { if (!this.on && this.lines.length && (this._t = (this._t || 0) + 1) % 30 === 0) this.render(); },   // let old lines fade out
};
