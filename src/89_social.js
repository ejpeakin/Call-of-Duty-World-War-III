// =====================================================================
//  Accounts, friends and party invites (Supabase)
//  Off until SOCIAL.url and SOCIAL.key are filled in: the Friends card stays hidden and the game
//  plays as before. Setup steps: supabase/SETUP.md. The database rules are in supabase/schema.sql,
//  and the emails are sent by supabase/functions/notify (never from the page: emails stay private).
// =====================================================================
const SOCIAL = {
  url: 'https://scbkykinwnbwutomzoxl.supabase.co',   // Project URL (Supabase: Project Settings → Data API)
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjYmt5a2lud25id3V0b216b3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMDU3NTEsImV4cCI6MjExMDY4MTc1MX0.6SmNecWItOWCzknKNsFMcSJSKkeoy3CZaHkEotZ7v7s',   // the anon key: meant to be public. Never put the service_role key here.
  site: 'https://ejpeakin.github.io/FortDay/',   // where sign-up, password-reset and invite links send players
  emails: false,   // true once emails are set up (supabase/SETUP.md, "Adding emails later"); until then requests and invites are in-game only
};
const SOC_NAME = /^[A-Za-z0-9_]{3,16}$/;

const Social = {
  sb: null, ready: false, user: null, me: null, mode: 'in', msg: '', bad: false, recovering: false,
  state: { friends: [], incoming: [], outgoing: [], invites: [] }, online: new Set(), seen: new Set(), sentInv: new Set(),
  found: [], confirm: '', ch: null, pres: null, loadT: 0, loaded: false,
  get configured() { return !!(SOCIAL.url && SOCIAL.key); },

  init() {
    this.bind();
    this.joinFromLink();
    this.render();
    if (!this.configured) return;
    // the account library only downloads once accounts are switched on, in the background so the game doesn't wait
    const lib = document.createElement('script'); lib.async = true; lib.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js'; document.head.append(lib);
    const t0 = performance.now(), wait = () => {
      if (window.supabase && window.supabase.createClient) return this.start();
      if (performance.now() - t0 < 30000) setTimeout(wait, 250);
    };
    wait();
  },
  start() {
    try { this.sb = window.supabase.createClient(SOCIAL.url, SOCIAL.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); }
    catch (e) { console.warn('FortDay accounts', e); return; }
    this.ready = true; this.render();
    this.sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { this.recovering = true; this.say('Type a new password for your account.'); this.open(); }
      const u = session ? session.user : null;
      if ((u && u.id) !== (this.user && this.user.id)) { this.user = u; setTimeout(() => this.signedIn(ev), 0); }   // never await Supabase inside this callback
      else this.render();
    });
    setInterval(() => { if (this.me && !document.hidden) this.load(); }, 60000);   // catches removals, which aren't sent live
  },

  // ---------------------------------------------------------------- session
  async signedIn(ev) {
    this.unlisten(); this.me = null; this.loaded = false; this.seen.clear(); this.sentInv.clear(); this.found = []; $('socFind').value = '';
    if (!this.user) { this.state = { friends: [], incoming: [], outgoing: [], invites: [] }; this.online.clear(); this.render(); return; }
    this.render();
    await this.load();
    if (this.me) {
      Profile.d.name = this.me.username; Profile.save(); Net.tellProfile(); Lobby.refresh();
      if (ev === 'SIGNED_IN' && !this.recovering) this.say('Signed in as ' + this.me.username + '.');
      this.listen();
    } else this.say('Your account has no player name yet. Sign out and create the account again.', true);
  },
  async load() {
    if (!this.sb || !this.user) return;
    const { data, error } = await this.sb.rpc('social_state');
    if (error || !data) { this.say(this.why(error), true); return; }
    const first = !this.loaded; this.loaded = true;
    this.me = data.me; this.state = { friends: data.friends || [], incoming: data.incoming || [], outgoing: data.outgoing || [], invites: data.invites || [] };
    // tell the player about anything new
    const newReq = this.state.incoming.filter(r => !this.seen.has('r' + r.id)), newInv = this.state.invites.filter(i => !this.seen.has('i' + i.id));
    for (const r of this.state.incoming) this.seen.add('r' + r.id);
    for (const i of this.state.invites) this.seen.add('i' + i.id);
    if (first && newReq.length > 1) this.note('You have ' + newReq.length + ' friend requests.', [['Show', () => this.open()]]);
    else for (const r of newReq) this.note(r.username + ' sent you a friend request.', [['Accept', () => this.respond(r.id, true), 1], ['Decline', () => this.respond(r.id, false)]]);
    for (const i of newInv) this.note(i.username + ' invited you to their party.', [['Join', () => this.join(i), 1], ['Not now', () => {}]]);
    this.render();
  },
  // new requests and invites arrive the moment they're sent; presence shows which friends are playing
  listen() {
    const uid = this.user.id, again = () => { clearTimeout(this.loadT); this.loadT = setTimeout(() => this.load(), 150); };
    this.ch = this.sb.channel('social-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: 'to_id=eq.' + uid }, again)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_requests', filter: 'from_id=eq.' + uid }, p => {
        if (p.new && p.new.status === 'accepted') this.load().then(() => { const f = this.state.friends.find(x => x.id === p.new.to_id); if (f) this.note(f.username + ' accepted your friend request.'); });
        else again();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'party_invites', filter: 'to_id=eq.' + uid }, again)
      .subscribe();
    this.pres = this.sb.channel('online', { config: { presence: { key: uid } } });
    this.pres.on('presence', { event: 'sync' }, () => { this.online = new Set(Object.keys(this.pres.presenceState())); this.render(); })
      .subscribe(s => { if (s === 'SUBSCRIBED') this.pres.track({ at: Date.now() }); });
  },
  unlisten() {
    if (this.sb) { if (this.ch) this.sb.removeChannel(this.ch); if (this.pres) this.sb.removeChannel(this.pres); }
    this.ch = this.pres = null; this.online = new Set();
  },

  // ---------------------------------------------------------------- account forms
  async go() {
    const email = $('socEmail').value.trim(), pass = $('socPass').value, name = $('socName').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return this.say('Type your email address.', true);
    if (pass.length < 8) return this.say('Passwords need at least 8 characters.', true);
    this.say('Just a moment…');
    if (this.mode === 'up') {
      if (!SOC_NAME.test(name)) return this.say('Player names are 3 to 16 letters, numbers or _ (no spaces).', true);
      const free = await this.sb.rpc('username_available', { name });
      if (free.error) return this.say(this.why(free.error), true);
      if (!free.data) return this.say(name + ' is taken. Try another player name.', true);
      const { data, error } = await this.sb.auth.signUp({ email, password: pass, options: { data: { username: name }, emailRedirectTo: SOCIAL.site } });
      if (error) return this.say(this.why(error), true);
      if (!data.session) { $('socPass').value = ''; this.mode = 'in'; this.say(SOCIAL.emails ? 'Almost done! We emailed ' + email + '. Click the link in it to confirm, then sign in here.' : 'Account made! Now sign in with your email and password.'); }
      return;
    }
    const { error } = await this.sb.auth.signInWithPassword({ email, password: pass });
    if (error) return this.say(this.why(error), true);
    $('socPass').value = '';
  },
  async forgot() {
    const email = $('socEmail').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return this.say('Type your email address above, then press Forgot your password again.', true);
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: SOCIAL.site });
    this.say(error ? this.why(error) : 'If there is an account for ' + email + ', we emailed it a link to reset the password.', !!error);
  },
  async setPass() {
    const p = $('socNewPass').value;
    if (p.length < 8) return this.say('Passwords need at least 8 characters.', true);
    const { error } = await this.sb.auth.updateUser({ password: p });
    if (error) return this.say(this.why(error), true);
    $('socNewPass').value = ''; this.recovering = false; this.say('Password changed.');
  },
  async signOut() { this.unlisten(); await this.sb.auth.signOut(); this.say('Signed out.'); },
  async setNotify(on) {
    const { error } = await this.sb.rpc('set_email_notify', { want: on });
    if (error) { this.say(this.why(error), true); return; }
    if (this.me) this.me.email_notify = on;
    this.say(on ? 'You will get emails for friend requests and party invites.' : 'No more emails. You still see requests and invites in the game.');
  },

  // ---------------------------------------------------------------- friends
  async search() {
    const q = $('socFind').value.trim();
    if (q.length < 2) { this.found = []; this.say('Type at least 2 letters of a player name.', true); return; }
    const { data, error } = await this.sb.rpc('search_players', { q });
    if (error) return this.say(this.why(error), true);
    this.found = data || []; this.say(this.found.length ? '' : 'No player names start with "' + q + '".', !this.found.length);
  },
  async add(id) {
    const p = this.found.find(x => x.id === id), name = p ? p.username : 'them';
    const { data, error } = await this.sb.rpc('send_friend_request', { target: id });
    if (error) return this.say(this.why(error), true);
    if (data.result === 'sent') { await this.load(); const ok = await this.email('friend', data.id); this.say('Friend request sent to ' + name + '.' + (ok === false ? ' (The email could not be sent right now, but they will see it in the game.)' : '')); }
    else if (data.result === 'accepted') { await this.load(); this.say('You and ' + name + ' are now friends!'); }
    else if (data.result === 'friends') this.say('You and ' + name + ' are already friends.');
    else this.say('You already sent ' + name + ' a request.');
  },
  async respond(id, accept) {
    const r = this.state.incoming.find(x => x.id === id);
    const { error } = await this.sb.rpc('respond_friend_request', { req: id, accept });
    if (error) { this.say(this.why(error), true); this.load(); return; }
    await this.load(); if (r) this.say(accept ? 'You and ' + r.username + ' are now friends!' : 'Declined ' + r.username + '\'s request.');
  },
  async cancel(id) { const { error } = await this.sb.rpc('cancel_friend_request', { req: id }); if (error) this.say(this.why(error), true); this.load(); },
  async remove(id) {
    const f = this.state.friends.find(x => x.id === id);
    if (this.confirm !== 'rm' + id) { this.confirm = 'rm' + id; this.render(); clearTimeout(this.cT); this.cT = setTimeout(() => { this.confirm = ''; this.render(); }, 3000); return; }   // tap twice
    this.confirm = '';
    const { error } = await this.sb.rpc('remove_friend', { other: id });
    if (error) return this.say(this.why(error), true);
    await this.load(); if (f) this.say('Removed ' + f.username + ' from your friends.');
  },

  // ---------------------------------------------------------------- party invites
  async invite(id) {
    const f = this.state.friends.find(x => x.id === id), name = f ? f.username : 'your friend';
    if (Net.state !== 'room') {   // no party yet: make a room first, then invite into it
      if (Net.state !== 'connecting') Net.create();
      this.say('Making a room for your party…');
      await this.until(() => Net.state === 'room' || Net.state === 'off', 25000);
      if (Net.state !== 'room') return this.say(Net.err || 'Could not make a room. Try again.', true);
    }
    const { data, error } = await this.sb.rpc('send_party_invite', { target: id, room: Net.code });
    if (error) return this.say(this.why(error), true);
    if (data.result !== 'sent') return this.say('You just invited ' + name + '. Give them a moment.');
    this.sentInv.add(id); this.render(); setTimeout(() => { this.sentInv.delete(id); this.render(); }, 60000);
    const ok = await this.email('invite', data.id);
    this.say('Invited ' + name + ' to room ' + Net.code + '.' + (ok === false ? ' (The email could not be sent right now, but they will see it in the game.)' : ''));
  },
  join(i) {
    this.dismiss(i.id);
    if (Match.state !== 'lobby') { this.note('Finish this match, then join ' + i.username + ' from the Friends card.'); return; }
    if (Net.state === 'room' && Net.code === i.code) { this.say('You are already in ' + i.username + '\'s party.'); return; }
    if (Net.state === 'room') Net.leaveRoom();
    setTimeout(() => { Net.join(i.code); Lobby.tab = 'play'; Lobby.refresh(); $('partyBox').open = true; }, 250);
    this.say('Joining ' + i.username + '\'s party…');
  },
  async dismiss(id) { if (this.sb) await this.sb.rpc('dismiss_party_invite', { inv: id }); this.state.invites = this.state.invites.filter(x => x.id !== id); this.render(); },
  // an emailed invite opens the game with ?join=CODE: join that room once the lobby is up
  joinFromLink() {
    let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const code = String(q.get('join') || '').toUpperCase().replace(/[^A-Z]/g, ''); if (!q.has('join')) return;
    q.delete('join'); try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (e) { /* sandboxed */ }
    if (code.length !== 4) return;
    this.until(() => Match.state === 'lobby' && !Opening.on && (Net.relayHere || P2P.ok()), 60000).then(ok => {
      if (!ok || Net.state === 'room') return;
      Net.join(code); Lobby.tab = 'play'; Lobby.refresh(); $('partyBox').open = true;
    });
  },
  // send the email for a request or invite; false if it couldn't go out, null when emails are switched off
  async email(kind, id) {
    if (!SOCIAL.emails) return null;
    try { const { data, error } = await this.sb.functions.invoke('notify', { body: { kind, id } }); if (error) throw error; return !!(data && (data.sent || data.reason)); }
    catch (e) { console.warn('FortDay email', e); return false; }
  },

  // ---------------------------------------------------------------- helpers
  until(test, ms) {
    return new Promise(res => { const t0 = performance.now(), tick = () => { if (test()) res(true); else if (performance.now() - t0 > ms) res(false); else setTimeout(tick, 200); }; tick(); });
  },
  why(e) {
    const m = String((e && e.message) || e || '');
    if (/invalid login/i.test(m)) return 'Wrong email or password.';
    if (/not confirmed/i.test(m)) return 'Confirm your email first: click the link we sent you.';
    if (/already registered|already been registered/i.test(m)) return 'There is already an account with that email. Sign in instead.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a little and try again.';
    if (/fetch|network|load failed/i.test(m)) return 'Could not reach the account service. Check your connection.';
    if (/permission denied|jwt/i.test(m)) return 'Your sign-in ran out. Sign in again.';
    return m.replace(/^error:\s*/i, '') || 'Something went wrong. Try again.';
  },
  say(m, bad) { this.msg = m || ''; this.bad = !!bad; this.render(); },
  open() { if (Match.state !== 'lobby') return; Lobby.tab = 'play'; Lobby.refresh(); const b = $('socBox'); b.open = true; b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  // a pop-up in the lobby (with buttons), or a short message in the corner during a match
  note(text, acts) {
    if (Match.state !== 'lobby') { if (typeof HUD !== 'undefined' && HUD.toast) HUD.toast(text); return; }
    const box = $('notes'), el = document.createElement('div'); el.className = 'note';
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
    el.innerHTML = '<span class="note-t"></span><span class="note-b"></span>'; el.firstChild.textContent = text;
    for (const [label, fn, pri] of acts || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (pri) b.className = 'pri'; b.addEventListener('click', () => { close(); fn(); }); el.lastChild.append(b); }
    if (!acts || !acts.length) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'OK'; b.addEventListener('click', close); el.lastChild.append(b); }
    box.append(el); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(close, 20000);
    try { Sfx.init(); Sfx.blip && Sfx.blip(); } catch (e) { /* sound is optional */ }
  },

  // ---------------------------------------------------------------- the Friends card
  bind() {
    const box = $('socBox');
    box.addEventListener('keydown', e => {
      e.stopPropagation();   // typing here must not move the player or start a match
      if (e.key !== 'Enter') return;
      if (e.target.id === 'socFind') this.search(); else if (e.target.id === 'socNewPass') this.setPass(); else if (e.target.closest('#socAuth')) this.go();
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      const m = b.dataset.socMode; if (m) { this.mode = m; this.say(''); return; }
      if (b.id === 'socGo') this.go(); else if (b.id === 'socForgot') this.forgot(); else if (b.id === 'socSetPass') this.setPass();
      else if (b.id === 'socFindBtn') this.search(); else if (b.id === 'socOut') this.signOut();
      const act = b.dataset.act, id = b.dataset.id, n = Number(id); if (!act) return;
      if (act === 'add') this.add(id); else if (act === 'accept') this.respond(n, true); else if (act === 'decline') this.respond(n, false);
      else if (act === 'cancel') this.cancel(n); else if (act === 'remove') this.remove(id); else if (act === 'invite') this.invite(id);
      else if (act === 'join') { const i = this.state.invites.find(x => x.id === n); if (i) this.join(i); } else if (act === 'dismiss') this.dismiss(n);
    });
    $('socNotify').addEventListener('change', e => this.setNotify(e.target.checked));
  },
  render() {
    const box = $('socBox'); if (!box) return;
    box.hidden = !this.ready;
    const ni = $('nameIn'); ni.readOnly = !!this.me; ni.title = this.me ? 'Your account name' : 'Click to change your name';
    if (!this.ready) return;
    const me = this.me, st = this.state, online = st.friends.filter(f => this.online.has(f.id)).length, waiting = st.incoming.length + st.invites.length;
    $('socSum').textContent = me ? me.username : this.user ? 'Signing in…' : 'Sign in';
    $('socSub').textContent = me ? (st.friends.length ? online + ' of ' + st.friends.length + ' friends online' : 'Add friends by their player name') : 'Make an account to add friends';
    $('socBadge').hidden = !waiting; $('socBadge').textContent = waiting;
    $('socAuth').hidden = !!this.user || this.recovering; $('socReset').hidden = !this.recovering; $('socIn').hidden = !me || this.recovering;
    for (const b of $('socTabs').children) b.classList.toggle('on', b.dataset.socMode === this.mode);
    const up = this.mode === 'up';
    $('socNameRow').hidden = !up; $('socGo').textContent = up ? 'Create account' : 'Sign in'; $('socForgot').hidden = up || !SOCIAL.emails;
    $('socMailRow').hidden = !SOCIAL.emails;
    $('socAuthHint').textContent = SOCIAL.emails ? 'Your email is only used to sign in and to tell you about friend requests and party invites. Other players never see it.' : 'Your email is only used to sign in. Other players never see it.';
    $('socPass').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
    $('socMsg').textContent = this.msg; $('socMsg').className = 'soc-msg' + (this.bad ? ' bad' : '');
    if (!me) return;
    $('socNotify').checked = !!me.email_notify;
    const btn = (act, id, label, cls, off) => `<button type="button" class="${cls || ''}" data-act="${act}" data-id="${esc(String(id))}"${off ? ' disabled' : ''}>${label}</button>`;
    const row = (name, btns, dot) => `<div class="soc-row">${dot == null ? '' : `<i class="soc-dot${dot ? ' on' : ''}" title="${dot ? 'Playing now' : 'Offline'}"></i>`}<b>${esc(name)}</b><span class="soc-btns">${btns}</span></div>`;
    const friendIds = new Set(st.friends.map(f => f.id)), sentTo = new Set(st.outgoing.map(r => r.to)), fromThem = new Map(st.incoming.map(r => [r.from, r.id]));
    let h = this.found.map(p => row(p.username, friendIds.has(p.id) ? btn('', p.id, 'Friends', '', true) : sentTo.has(p.id) ? btn('', p.id, 'Sent', '', true) : fromThem.has(p.id) ? btn('accept', fromThem.get(p.id), 'Accept', 'pri') : btn('add', p.id, 'Add', 'pri'))).join('');
    if ($('socFound').innerHTML !== h) $('socFound').innerHTML = h;
    h = '';
    if (st.invites.length) h += '<h4>Party invites</h4>' + st.invites.map(i => row(i.username, btn('join', i.id, 'Join', 'pri') + btn('dismiss', i.id, '✕', 'x'))).join('');
    if (st.incoming.length) h += '<h4>Friend requests</h4>' + st.incoming.map(r => row(r.username, btn('accept', r.id, 'Accept', 'pri') + btn('decline', r.id, 'Decline'))).join('');
    h += '<h4>Friends' + (st.friends.length ? ' · ' + st.friends.length : '') + '</h4>';
    const fl = st.friends.slice().sort((a, b) => this.online.has(b.id) - this.online.has(a.id));
    h += fl.length ? fl.map(f => row(f.username, btn('invite', f.id, this.sentInv.has(f.id) ? 'Invited' : 'Invite', 'pri', this.sentInv.has(f.id)) + btn('remove', f.id, this.confirm === 'rm' + f.id ? 'Remove?' : '✕', 'x' + (this.confirm === 'rm' + f.id ? ' sure' : '')), this.online.has(f.id))).join('')
      : '<div class="hint">No friends yet. Search for a player name above.</div>';
    if (st.outgoing.length) h += '<h4>Sent requests</h4>' + st.outgoing.map(r => row(r.username, btn('cancel', r.id, 'Cancel'))).join('');
    if ($('socLists').innerHTML !== h) $('socLists').innerHTML = h;
  },
};
