// =====================================================================
//  Lobby: 3D character stage, play options, locker, pass, career
// =====================================================================
const Lobby = {
  scene: null, cam: null, rig: null, fake: null, t: 0, tab: 'play', cat: 'outfit', bus: null,
  init() {
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color(0x0b1f4a); s.fog = new THREE.Fog(0x0b1f4a, 18, 70);
    s.add(new THREE.HemisphereLight(0xb8d4ff, 0x10284f, 0.85));
    const key = new THREE.DirectionalLight(0xffd9b0, 1.05); key.position.set(3, 6, 6); s.add(key);
    const rim = new THREE.DirectionalLight(0x5a9bff, 0.9); rim.position.set(-4, 4, -6); s.add(rim);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 0.4, 40), lam(0x163a7a)); plat.position.y = -0.2; s.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.05, 8, 64), basic(0x4fb0ff)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.01; s.add(ring);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: i % 3 ? 0x1d4fa8 : 0x2f6fd8, transparent: true, opacity: 0.35, depthWrite: false }));
      const a = i / 14 * TAU; m.position.set(Math.cos(a) * 24, 2 + Math.random() * 8, -18 + Math.sin(a) * 8); m.scale.set(8 + Math.random() * 6, 4 + Math.random() * 3, 6); s.add(m);
    }
    const isl = new THREE.Group(); const rock = new THREE.Mesh(new THREE.ConeGeometry(7, 9, 7), lam(0x4a5a7a)); rock.rotation.x = Math.PI; rock.position.y = -4.5; isl.add(rock);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1.2, 7), lam(0x4f9a5a)); isl.add(top); isl.position.set(-14, 3, -30); s.add(isl); this.isl = isl;
    const sp = []; for (let i = 0; i < 400; i++) sp.push(rnd(-60, 60), rnd(-5, 40), rnd(-60, -20));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); s.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })));
    this.bus = buildBusModel(); this.bus.scale.setScalar(0.5); s.add(this.bus);
    this.car = buildPremiumCar(); this.car.scale.setScalar(0.5); this.car.visible = false; s.add(this.car);
    this.street = buildStreetCar(0xc8202a); this.street.scale.setScalar(0.5); this.street.visible = false; s.add(this.street);
    this.limo = buildLimo(); this.limo.scale.setScalar(0.4); this.limo.visible = false; s.add(this.limo);
    this.cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200); this.place();
    this.fake = newActor({ state: 'ground', onGround: true, inv: [{ kind: 'pick' }, makeWeapon('ar', 4), null, null, null, null], slot: 0 });
    this.rebuild();
    this.bindUI(); this.refresh();
  },
  lift: 0,
  place() {
    const wide = innerWidth > 760, L = this.lift || 0;
    if (wide) { this.cam.position.set(1.3, 1.5 + L, 6.6 + L * 0.8); this.cam.lookAt(1.3, 1.15 + L, 0); }
    else { this.cam.position.set(0, 1.2 + L, 11.7 + L); this.cam.lookAt(0, -0.9 + L, 0); }
  },
  shopSel: { cat: 'car', id: 'midnight' }, rigKey: '',
  lockSel: null,
  viewEq() {
    const eq = Profile.d.eq, sel = this.tab === 'shop' ? this.shopSel : this.tab === 'locker' ? this.lockSel : null;
    return sel && sel.cat !== 'car' && (this.tab === 'shop' || sel.cat === this.cat) ? Object.assign({}, eq, { [sel.cat]: sel.id }) : eq;
  },
  rebuild() { const eq = this.viewEq(); this.rigKey = JSON.stringify(eq); if (this.rig) this.scene.remove(this.rig.root); this.rig = makeRig(eq); this.scene.add(this.rig.root); },
  render(dt) {
    if (Perf.on && !Opening.on) { this.acc = (this.acc || 0) + dt; if (this.acc < 1 / 30) return; dt = this.acc; this.acc = 0; }   // Performance Mode: the lobby draws at 30 fps
    this.t += dt; const f = this.fake, sel = this.shopSel, cat = this.tab === 'locker' ? this.cat : this.tab === 'shop' ? sel.cat : 'outfit';
    const veq = this.viewEq(); if (JSON.stringify(veq) !== this.rigKey) this.rebuild();
    f.state = cat === 'glider' ? 'glide' : 'ground'; f.slot = cat === 'wrap' ? 1 : 0; f.pitch = 0;
    f.yaw = cat === 'backpack' ? Math.PI + Math.sin(this.t * 0.6) * 0.5 : Math.sin(this.t * 0.4) * 0.45 - 0.2;
    if (cat === 'emote') { if (!f.emote) f.emoteT = 0; f.emote = veq.emote; f.emoteT += dt; } else f.emote = null;
    f.pos.set(0, cat === 'glider' ? 0.6 + Math.sin(this.t * 1.5) * 0.1 : 0, 0);
    animateRig(this.rig, f, dt, this.t);
    const showCar = cat === 'car';
    const which = this.tab === 'shop' ? sel.id : this.tab === 'locker' && this.lockSel && this.lockSel.cat === 'car' ? this.lockSel.id : Profile.d.eq.car;
    this.car.visible = showCar && which === 'midnight'; this.limo.visible = showCar && which === 'limo'; this.street.visible = showCar && which !== 'midnight' && which !== 'limo'; this.rig.root.visible = !showCar;
    if (showCar) { const m = which === 'midnight' ? this.car : which === 'limo' ? this.limo : this.street; m.rotation.y += dt * 0.45; for (const w of m.userData.wheels) w.rotation.set(0, w.userData.front ? Math.sin(this.t * 0.8) * 0.3 : 0, 0, 'YXZ'); }
    this.rig.glider.position.y = 3.2;
    const lt = cat === 'glider' ? 1.9 : 0; if (Math.abs(this.lift - lt) > 0.01) { this.lift = lerp(this.lift, lt, Math.min(1, dt * 5)); this.place(); }
    this.bus.visible = !Perf.on;   // Performance Mode: a still background (no flying bus or turning island)
    if (!Perf.on) {
      const bt = (this.t * 0.05) % 1; this.bus.position.set(lerp(-50, 50, bt), 4.5 + Math.sin(this.t) * 0.4, -26); this.bus.rotation.y = Math.PI / 2;
      for (const p of this.bus.userData.props) p.rotation.z += dt * 20;
      this.isl.rotation.y += dt * 0.05;
    }
    Opening.cam(this.cam, dt);
    renderer.render(this.scene, this.cam);
  },
  // what PLAY will start, in plain words (shown on the button)
  summary() {
    const d = Profile.d, m = { solo: 'Solo', duos: 'Duos', squads: 'Squads', rumble: 'Storm Rumble' }[d.mode] || 'Solo', th = THEMES[MapRotation.current()];
    return [m, d.build ? 'Build' : 'No-Build', th ? th.name : '', d.ranked && d.mode !== 'rumble' && Net.state !== 'room' ? 'Ranked' : ''].filter(Boolean).join(' · ');
  },
  bindUI() {
    // Enter starts the match from the lobby (not while typing, or while a menu or the opening is up)
    addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.repeat || Match.state !== 'lobby' || $('lobby').classList.contains('intro')) return;
      const t = e.target; if (t && t.closest && t.closest('input, textarea, select, button, a, summary')) return;
      if (!$('settings').hidden || !$('tutAsk').hidden || $('readyBtn').disabled) return;
      e.preventDefault(); $('readyBtn').click();
    });
    $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; this.tab = b.dataset.tab; this.refresh(); });
    $('modeGrid').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; Profile.d.mode = b.dataset.mode; Profile.save(); this.refresh(); });
    $('buildSeg').addEventListener('click', e => { const b = e.target.closest('[data-build]'); if (!b) return; Profile.d.build = b.dataset.build === '1'; Profile.save(); this.refresh(); });
    $('islGrid').addEventListener('click', e => { const b = e.target.closest('[data-isl]'); if (!b) return; if (b.dataset.isl !== MapRotation.current()) { Sfx.init(); $('islNote').textContent = THEMES[b.dataset.isl].name + ' is locked. Only ' + THEMES[MapRotation.current()].name + ' is open right now.'; return; } Profile.d.theme = b.dataset.isl; Profile.save(); this.refresh(); });
    $('nameIn').addEventListener('input', e => { Profile.d.name = e.target.value.trim().slice(0, 16); Profile.save(); const m = $('mpName'); if (m) m.value = Profile.d.name; });
    $('nameIn').addEventListener('keydown', e => e.stopPropagation());
    $('rankedChk').addEventListener('change', e => { Profile.d.ranked = e.target.checked; Profile.save(); this.refresh(); });
    $('catRow').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; this.cat = b.dataset.cat; this.refresh(); });
    $('itemGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-id]'); if (!b) return; const item = cosById(this.cat, b.dataset.id);
      this.lockSel = { cat: this.cat, id: item.id };
      if (Profile.unlocked(item)) { Profile.d.eq[this.cat] = item.id; Profile.save(); Sfx.init(); Sfx.blip && Sfx.blip(); }
      this.refresh(); $('tab-locker').scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('lkBody').addEventListener('click', e => { const b = e.target.closest('[data-body]'); if (!b) return; Profile.d.eq.body = b.dataset.body; Profile.save(); Sfx.init(); this.refresh(); });
    $('lkBtn').addEventListener('click', () => {
      const sel = this.lockSel, item = cosById(sel.cat, sel.id);
      if (Profile.unlocked(item)) { Profile.d.eq[sel.cat] = item.id; Profile.save(); this.refresh(); return; }
      this.shopSel = { cat: sel.cat, id: item.id }; this.tab = 'shop'; this.refresh(); $('tab-shop').scrollTop = 0;
    });
    $('buyBtn').addEventListener('click', () => this.buy(this.shopSel.cat, this.shopSel.id));
    $('codeLink').addEventListener('click', () => { const r = $('codeRow'); r.hidden = !r.hidden; if (!r.hidden) $('codeIn').focus(); });
    const redeem = async () => {
      const msg = $('shopMsg'), inp = $('codeIn'); Sfx.init(); msg.textContent = 'Checking…';
      let r; try { r = await redeemCode(inp.value); } catch (e) { r = { err: 'Could not check that code.' }; }
      if (r.err) { msg.textContent = r.err; return; }
      if (r.pass) { inp.value = ''; $('codeRow').hidden = true; Sfx.chest(); this.refresh(); $('shopMsg').textContent = r.had ? 'You already have the Battle Pass this season.' : 'Battle Pass unlocked! You are now ' + RANKS[Profile.rankIdx()][0] + '. Pick your free skin.'; return; }
      inp.value = ''; $('codeRow').hidden = true; Sfx.chest(); this.shopSel = { cat: r.it.cat, id: r.it.id }; this.lockSel = null;
      this.refresh(); $('shopMsg').textContent = r.had ? r.it.name + ' was already yours, so it is now equipped.' : 'Code redeemed! ' + r.it.name + ' is unlocked and equipped.';
    };
    $('codeBtn').addEventListener('click', redeem);
    $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') redeem(); e.stopPropagation(); });
    // Battle Pass: 5,000 FortBux (tap twice to confirm), or $1 on the payment site (it sends you back with ?bp=)
    $('bpBtn').addEventListener('click', () => {
      Sfx.init(); const b = $('bpBtn');
      if (Profile.hasPass()) {
        if (!Profile.passPickLeft()) return;
        const first = COS.outfit.find(c => Profile.canClaim(c)); this.tab = 'shop'; this.shopFilter = 'outfit'; if (first) this.shopSel = { cat: 'outfit', id: first.id };
        this.refresh(); $('tab-shop').scrollTop = 0; $('shopMsg').textContent = 'Battle Pass: pick any skin and press Claim free. You get one per season.'; return;
      }
      if (Profile.d.coins < PASS_PRICE) { $('bpMsg').textContent = 'You need ' + (PASS_PRICE - Profile.d.coins).toLocaleString() + ' more ' + COIN + (PASS_PAY_URL ? ', or pay $1 online below.' : '.'); return; }
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Tap again to spend ' + PASS_PRICE.toLocaleString(); clearTimeout(this.bpT); this.bpT = setTimeout(() => { delete b.dataset.confirm; this.refresh(); }, 3500); return; }
      delete b.dataset.confirm; clearTimeout(this.bpT);
      const r = Profile.buyPass(); if (r.ok) Sfx.chest();
      this.refresh(); $('bpMsg').textContent = r.err || 'Battle Pass unlocked! You are now ' + RANKS[Profile.rankIdx()][0] + '. Press Pick your free skin.';
    });
    $('thankBtn').addEventListener('click', () => {
      const d = Profile.d; if (d.thankSeason === Season.id()) return;
      d.thankSeason = Season.id(); const lv = Profile.addXp(1000); Profile.save(); Sfx.init();
      this.refresh(); $('thankTxt').textContent = 'Thank you for playing! +1,000 XP' + (lv.coins ? ' · Level ' + lv.l1 + '! +' + lv.coins + ' ' + COIN : '') + '.';
    });
    $('shopGrid').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; this.shopSel = { cat: b.dataset.cat, id: b.dataset.id }; $('shopMsg').textContent = ''; this.refresh(); $('tab-shop').scrollTo({ top: 0, behavior: 'smooth' }); });
    $('shopFilters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; this.shopFilter = b.dataset.f; this.refresh(); });
    $('readyBtn').addEventListener('click', () => {
      if (Net.state === 'room' && !Net.isHost) return;
      Sfx.init(); Sfx.horn();
      Net.inMatch = Net.state === 'room';
      MapRotation.began(); Profile.d.theme = MapRotation.current();
      Match.start({ mode: Profile.d.mode, build: Profile.d.mode === 'rumble' ? Profile.d.build : Profile.d.build, ranked: Profile.d.ranked && Profile.d.mode !== 'rumble' && !Net.inMatch, theme: Profile.d.theme });
    });
    Net.initUI();
  },
  buy(cat, id) {
    const it = cosById(cat, id), d = Profile.d, msg = $('shopMsg'), price = itemPrice(it); Sfx.init();
    if (Profile.canClaim(it)) { Profile.claimPassSkin(it); Sfx.chest(); msg.textContent = it.name + ' is yours for free with the Battle Pass, and equipped.'; this.refresh(); return; }
    if (Profile.unlocked(it)) { d.eq[cat] = id; Profile.save(); msg.textContent = it.name + ' equipped.' + (cat === 'car' ? ' Get into any car to drive it.' : ''); this.refresh(); return; }
    if (d.coins < price) { msg.textContent = 'You need ' + (price - d.coins).toLocaleString() + ' more ' + COIN + '. Play matches to earn them.'; return; }
    d.coins -= price; d.owned[cat + ':' + id] = true; d.eq[cat] = id; Profile.save(); Sfx.chest();
    msg.textContent = 'Purchased and equipped. It is in your locker under ' + COS_CATS.find(c => c[0] === cat)[1] + '.'; this.refresh();
  },
  shopFilter: 'all',
  shopHero() {
    const d = Profile.d, sel = this.shopSel, it = cosById(sel.cat, sel.id), catName = COS_CATS.find(c => c[0] === sel.cat)[1];
    const own = Profile.unlocked(it), eq = d.eq[sel.cat] === it.id, price = itemPrice(it), rc = it.premium ? '#ffd23a' : RARITY[it.r].css;
    const DESC = { outfit: 'A full character skin with its own face, hair and outfit.', backpack: 'Back bling worn on your character in every match.', pickaxe: 'Swings in place of the standard harvesting tool.', glider: 'Opens when you drop from the bus.', wrap: 'A finish applied to every weapon you hold.', emote: 'A dance you can play with B during a match.' };
    $('shopDetail').style.setProperty('--rc', rc);
    $('shopTag').textContent = it.premium ? 'Premium' : RARITY[it.r].name;
    $('shopName').textContent = it.name;
    $('shopSub').textContent = catName + ' · ' + (it.premium ? 'Premium' : RARITY[it.r].name);
    const feats = [];
    if (sel.cat === 'car') {
      $('shopDesc').textContent = it.id === 'limo' ? 'An 8.6 m black stretch limousine: chrome grille and trim, tinted windows, cream leather lounge seats with a bar and purple mood lighting, and a sunroof.' : it.premium ? 'A blue tuner coupe with a carbon hood, yellow light covers and a tall rear wing.' : 'The standard coupe parked around the island.';
      if (it.premium) feats.push('Any car you get into becomes your ' + it.name, it.id === 'limo' ? 'Rams through anyone in its way: it is twice as long' : 'Spinning wheels with working front steering');
    } else $('shopDesc').textContent = DESC[sel.cat] || '';
    if (it.music) feats.unshift('Music Festival 2026 collection');
    if (it.unlock && it.unlock.startsWith('tier:')) feats.push('Also unlocks free at level ' + it.unlock.slice(5));
    if (it.unlock === 'win') feats.push('Also earned free by winning a match');
    if (!it.unlock) feats.push('Included with every account');
    if (Profile.ticket() && !Profile.owns(it) && it.unlock) feats.unshift('Included with your Music Concert Ticket until ' + Season.name() + ' ends');
    if (Profile.canClaim(it)) feats.unshift('Free with your Battle Pass: one skin each season');
    feats.push('Cosmetic only, no gameplay advantage');
    $('shopFeats').innerHTML = feats.map(f => '<li>' + esc(f) + '</li>').join('');
    const pr = $('shopPrice').parentElement; pr.classList.toggle('owned', own);
    pr.innerHTML = own ? '<b id="shopPrice">' + (eq ? 'Equipped' : 'Owned') + '</b>' : '<i class="coin"></i><b id="shopPrice" class="num">' + price.toLocaleString() + '</b>';
    const btn = $('buyBtn'); btn.textContent = own ? (eq ? 'Equipped' : 'Equip') : 'Buy for ' + price.toLocaleString();
    btn.className = 'buy' + (own && eq ? ' owned' : own ? ' equip' : ''); btn.disabled = own && eq;
    if (Profile.canClaim(it)) { pr.classList.remove('owned'); pr.innerHTML = '<b id="shopPrice">FREE</b>'; btn.textContent = 'Claim free · Battle Pass'; btn.className = 'buy equip'; btn.disabled = false; }
    const coded = !own && Object.values(SKIN_CODES).includes(sel.cat + ':' + sel.id); $('codeBox').hidden = !coded; if (!coded) $('codeRow').hidden = true;
  },
  lockerView() {
    const d = Profile.d, cat = this.cat, catName = COS_CATS.find(c => c[0] === cat)[1];
    if (!this.lockSel || this.lockSel.cat !== cat) this.lockSel = { cat, id: d.eq[cat] };
    const owned = c => Profile.unlocked(c);
    $('catRow').innerHTML = COS_CATS.map(([k, n]) => `<button role="tab" aria-selected="${k === cat}" data-cat="${k}" class="${k === cat ? 'on' : ''}">${n}<i>${COS[k].filter(owned).length}/${COS[k].length}</i></button>`).join('');
    const total = COS_CATS.reduce((s, [k]) => s + COS[k].length, 0), have = COS_CATS.reduce((s, [k]) => s + COS[k].filter(owned).length, 0);
    $('lkCount').textContent = have + ' of ' + total + ' collected';
    $('lockerTitle').textContent = 'Locker';
    const how = c => c.unlock === 'chest' ? '1 in 1,000 chests' : c.unlock === 'win' ? 'Win a match' : c.unlock === 'shop' ? 'Item Shop' : c.unlock && c.unlock.startsWith('tier:') ? 'Level ' + c.unlock.slice(5) : '';
    $('itemGrid').innerHTML = COS[cat].slice().sort((a, b) => owned(b) - owned(a) || a.r - b.r).map(c => {
      const own = owned(c), eq = d.eq[cat] === c.id, on = this.lockSel.id === c.id, rc = c.premium ? '#ffd23a' : RARITY[c.r].css;
      const foot = eq ? '<span class="scard-foot eq">Equipped</span>' : own ? '<span class="scard-foot owned">Owned</span>' : `<span class="scard-foot lock"><svg class="lk" viewBox="0 0 24 24"><path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/></svg>${c.unlock === 'chest' ? 'Chest find' : '<i class="coin"></i>' + itemPrice(c).toLocaleString()}</span>`;
      return `<button class="scard ${on ? 'on' : ''} ${own ? '' : 'locked'}" data-id="${c.id}" style="--rc:${rc}">${c.premium ? '<span class="prem">PREMIUM</span>' : ''}${eq ? '<span class="eqb">EQUIPPED</span>' : ''}<span class="scard-art">${this.shopIcon(cat, c)}</span><span class="scard-body"><b>${esc(c.name)}</b><span>${c.premium ? 'Premium' : RARITY[c.r].name}</span></span>${foot}</button>`;
    }).join('');
    const it = cosById(cat, this.lockSel.id), own = owned(it), eq = d.eq[cat] === it.id, rc = it.premium ? '#ffd23a' : RARITY[it.r].css;
    const DESC = { outfit: 'A full character skin with its own face, hair and outfit.', backpack: 'Back bling worn on your character in every match.', pickaxe: 'Swings in place of the standard harvesting tool.', glider: 'Opens when you drop from the bus.', wrap: 'A finish applied to every weapon you hold.', emote: 'A dance you can play with B during a match.', car: 'Any car you get into becomes this one.' };
    $('lkDetail').style.setProperty('--rc', rc);
    $('lkTag').textContent = it.premium ? 'Premium' : RARITY[it.r].name;
    $('lkName').textContent = it.name;
    $('lkSub').textContent = catName + (own ? ' · In your collection' : ' · Not owned yet');
    $('lkDesc').textContent = DESC[cat] + (own ? '' : it.unlock === 'chest' ? ' Get it: every chest you open has a 1 in 1,000 chance to hold it. Only one per player, and it is never sold in the Shop.' : ' Get it: ' + (how(it) ? how(it) + ', or ' : '') + 'buy it in the Item Shop for ' + itemPrice(it).toLocaleString() + ' ' + COIN + '.');
    $('lkState').textContent = eq ? 'Equipped' : own ? 'Owned' : 'Locked';
    $('lkState').className = 'sd-price' + (own ? ' owned' : '');
    const bodyOk = cat === 'outfit' && !it.personal; $('lkBody').hidden = !bodyOk;
    if (bodyOk) for (const b of $('lkBody').querySelectorAll('button')) { const on = (d.eq.body || 'woman') === b.dataset.body; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
    const btn = $('lkBtn'); btn.textContent = eq ? 'Equipped' : own ? 'Equip' : it.unlock === 'chest' ? 'Find it in a chest' : 'Get it in the Shop'; btn.disabled = eq || (!own && it.unlock === 'chest'); btn.className = 'buy' + (eq ? ' owned' : own ? ' equip' : '');
  },
  shopIcon(cat, item) {
    const P = { outfit: 'M8 3l4 2 4-2 5 4-3 3-2-1v11H8V9l-2 1-3-3z', backpack: 'M7 9a5 5 0 0 1 10 0v11H7z M9 13h6 M10 4.5h4', pickaxe: 'M5 20L15 10 M8.5 6.5c4-2.5 8.5-1.5 11 2-3-1-6.5-.8-9 1.3', glider: 'M2 10l10-5 10 5-10 2z M6.5 11l5.5 8 5.5-8', wrap: 'M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z', emote: 'M9 17.5V6l10-2v11.5 M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', car: 'M3 15.5l2-5h14l2 5v3H3z M6.5 10.5L8.5 6h7l2 4.5 M7 18.5v1.5 M17 18.5v1.5' }[cat];
    const tint = item && (cat === 'outfit' ? item.shirt : item.c);
    return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (tint != null ? ' class="tint" style="--tint:#' + new THREE.Color(tint).getHexString() + '"' : '') + '><path d="' + P + '"/></svg>';
  },
  refresh() {
    const d = Profile.d;
    Net.render(); $('buildTag').textContent = 'build ' + BUILD_ID;
    { const k = a => '<kbd>' + esc(Keys.of(a)) + '</kbd>';
      const rows = [['Move', k('forward') + k('left') + k('back') + k('right')], ['Shoot', k('fire')], ['Aim', k('ads') + ' hold, or ' + k('scope') + ' to toggle'], ['Jump', k('jump')], ['Sprint', k('sprint')], ['Pick up / open', k('use')], ['Reload', k('reload')],
        ['Build', k('wall') + ' wall ' + k('ramp') + ' ramp ' + k('floor') + ' floor ' + k('cone') + ' cone'], ['Building material', k('material')], ['Map', k('map')], ['Move items', k('inventory')], ['Emote', k('emote')]];
      const kh = rows.map(([n, v]) => '<span>' + n + '</span><span>' + v + '</span>').join(''); if ($('kbHint').innerHTML !== kh) $('kbHint').innerHTML = kh; }
    { const fresh = !d.matches && !d.tutDone, newish = !d.tutDone && (d.matches || 0) < 3;
      $('welcome').hidden = !fresh; $('tutBadge').hidden = !newish; $('tutBtn').classList.toggle('new', newish); $('tutBtn').classList.toggle('small', !newish); }
    $('coinLbl').textContent = d.coins.toLocaleString();
    [...$('tabs').children].forEach(b => b.classList.toggle('on', b.dataset.tab === this.tab));
    if (this.tab === 'players' && !Players.link()) this.tab = 'play';
    $('tabPlayers').hidden = !Players.link();   // only the maker's browser has the Sheet link
    for (const t of ['play', 'locker', 'pass', 'career', 'shop', 'players']) $('tab-' + t).hidden = t !== this.tab;
    if (this.tab === 'players') { Players.render(); Players.load(false); }
    if (document.activeElement !== $('nameIn')) $('nameIn').value = Profile.d.name || '';
    $('lobby').classList.toggle('shop-wide', this.tab === 'shop' || this.tab === 'locker');
    if (this.tab === 'shop') {
      this.shopHero();
      $('shopBal').textContent = d.coins.toLocaleString();
      const all = []; for (const [cat] of COS_CATS) for (const c of COS[cat]) if (c.unlock !== 'chest') all.push(c);   // chest finds are never sold
      const featured = c => c.premium || c.music || c.r >= 4;
      const filters = [['all', 'All', all.length], ['featured', 'Featured', all.filter(featured).length], ...COS_CATS.map(([k, n]) => [k, n, COS[k].length])];
      $('shopFilters').innerHTML = filters.map(([k, n, c]) => `<button role="tab" aria-selected="${this.shopFilter === k}" class="${this.shopFilter === k ? 'on' : ''}" data-f="${k}">${n}<i>${c}</i></button>`).join('');
      const order = COS_CATS.map(c => c[0]);
      const list = all.filter(c => this.shopFilter === 'all' ? true : this.shopFilter === 'featured' ? featured(c) : c.cat === this.shopFilter)
        .sort((a, b) => (featured(b) && this.shopFilter === 'all') - (featured(a) && this.shopFilter === 'all') || order.indexOf(a.cat) - order.indexOf(b.cat) || a.r - b.r || a.name.localeCompare(b.name));
      $('shopGrid').innerHTML = list.map(c => {
        const own = Profile.unlocked(c), eq = d.eq[c.cat] === c.id, on = this.shopSel.cat === c.cat && this.shopSel.id === c.id, rc = c.premium ? '#ffd23a' : RARITY[c.r].css;
        const foot = Profile.canClaim(c) ? '<span class="scard-foot free">FREE · Pass</span>' : eq ? '<span class="scard-foot eq">Equipped</span>' : own ? '<span class="scard-foot owned">Owned</span>' : `<span class="scard-foot"><i class="coin"></i>${itemPrice(c).toLocaleString()}</span>`;
        const cat = COS_CATS.find(x => x[0] === c.cat)[1];
        return `<button class="scard ${on ? 'on' : ''}" data-cat="${c.cat}" data-id="${c.id}" style="--rc:${rc}">${c.premium ? '<span class="prem">PREMIUM</span>' : ''}<span class="scard-art">${this.shopIcon(c.cat, c)}</span><span class="scard-body"><b>${esc(c.name)}</b><span>${c.premium ? 'Premium' : RARITY[c.r].name} · ${cat}</span></span>${foot}</button>`;
      }).join('');
    }
    const tier = Profile.tier();
    Profile.syncSeason();
    $('tierLbl').textContent = 'Level ' + tier; $('tierFill').style.width = ((d.seasonXp % XP_PER_LEVEL) / XP_PER_LEVEL * 100) + '%';
    [...$('modeGrid').children].forEach(b => b.classList.toggle('on', b.dataset.mode === d.mode));
    [...$('buildSeg').children].forEach(b => b.classList.toggle('on', (b.dataset.build === '1') === d.build));
    $('buildHint').textContent = d.build ? 'Harvest wood, brick and metal with your tool, then throw up walls, ramps and floors mid-fight.' : 'No construction. Use natural cover, mantle up ledges, and lean on a 50-point overshield that regenerates when you are out of combat.';
    const cur = MapRotation.current(), nxt = MapRotation.next(); if (d.theme !== cur) { d.theme = cur; Profile.save(); }
    $('islGrid').innerHTML = THEME_ORDER.map(k => { const t = THEMES[k], open = k === cur; return `<button class="isl ${open ? 'on' : 'locked'}" data-isl="${k}" style="--sw:${t.swatch}" aria-disabled="${!open}">${open ? '' : '<i class="isl-lock" aria-hidden="true"></i>'}<b>${t.name}</b><span>${open ? 'Open now · closes in ' + MapRotation.left() : k === nxt ? 'Opens in ' + MapRotation.left() : 'Locked'}</span></button>`; }).join('');
    $('islNote').textContent = MapRotation.start() ? THEMES[cur].name + ' is open for ' + MapRotation.left() + ', then ' + THEMES[nxt].name + ' opens and ' + THEMES[cur].name + ' closes.' : 'Every player starts on Greenvale. After 30 days the next island opens and this one closes.';
    $('rankedChk').checked = !!d.ranked; $('rankedChk').disabled = d.mode === 'rumble';
    if (this.tab === 'locker') this.lockerView();
    if (this.tab === 'pass') {
      const rw = passRewards();
      const sid = Season.id(), dl = Season.daysLeft();
      $('seasonName').textContent = Season.name(); document.querySelector('.season-tag').textContent = 'Season ' + (sid + 1);
      $('seasonLeft').textContent = dl > 1 ? 'Ends in ' + dl + ' days' : dl === 1 ? 'Ends in 1 day' : 'Ends today';
      $('ticketOwn').hidden = !Profile.ticket();
      { const has = Profile.hasPass(), left = Profile.passPickLeft(), dtx = dl > 1 ? dl + ' days' : dl === 1 ? '1 day' : 'less than a day';
        $('bpCard').classList.toggle('on', has); $('bpTitle').textContent = has ? 'Battle Pass active' : 'Get the Battle Pass';
        $('bpList').innerHTML = ['<b>Diamond rank</b> right away, and you can\'t drop below Diamond this season',
          '<b>More ' + COIN + '</b>: at Diamond a good match pays ×' + RANK_COIN_MULT[PASS_RANK] + ' (up to ' + MATCH_COINS_MAX + ' a match)',
          '<b>1 free skin</b> of your choice from the Item Shop' + (has ? (left ? ' · not picked yet' : ' · claimed ✓') : '')].map(x => '<li>' + x + '</li>').join('');
        $('bpNote').textContent = has ? 'Active for ' + Season.name() + ' · ' + dtx + ' left. Get it again next season for another free skin.' : 'Lasts until ' + Season.name() + ' ends (' + dtx + '). Get it again each season for another free skin.';
        const b = $('bpBtn'); if (!b.dataset.confirm) { b.textContent = has ? (left ? 'Pick your free skin' : 'Free skin claimed ✓') : 'Buy for ' + PASS_PRICE.toLocaleString() + ' ' + COIN; b.disabled = has && !left; b.className = 'buy' + (has ? (left ? ' equip' : ' owned') : ''); }
        $('bpUsd').hidden = has; $('bpPay').hidden = !PASS_PAY_URL; if (PASS_PAY_URL) $('bpPay').href = PASS_PAY_URL;
        $('bpPayNote').textContent = PASS_PAY_URL ? 'Pay on the secure checkout page. When you finish, you come straight back here and the Battle Pass unlocks by itself.' : 'Online checkout is coming soon.'; }
      $('passLvl').textContent = 'Level ' + tier; $('passXp').textContent = (d.seasonXp % XP_PER_LEVEL).toLocaleString() + ' / ' + XP_PER_LEVEL.toLocaleString() + ' XP';
      $('passInfo').textContent = `Every level takes ${XP_PER_LEVEL.toLocaleString()} XP and pays ${LEVEL_COINS} ${COIN}. Bonus XP: 1st place +2,500 · each shark you defeat +2,000 · first to land +500 · your first game +5,000 · thanking the maker +1,000 once a season. Levels start over each season; anything you unlock stays yours.`;
      $('passFill').style.width = ((d.seasonXp % XP_PER_LEVEL) / XP_PER_LEVEL * 100) + '%';
      const thanked = d.thankSeason === sid; $('thankBtn').disabled = thanked; $('thankBtn').textContent = thanked ? 'Thanked ✓' : 'Thank you!';
      $('thankTxt').textContent = thanked ? 'Thanks sent for ' + Season.name() + '. You can thank the maker again next season.' : 'Say thanks to the person who made FortDay. +1,000 XP, once per season.';
      let h = '';
      for (let t = 1; t <= PASS_TIERS; t++) { const r = rw[t]; h += `<div class="tier ${t <= tier ? 'got' : ''} ${t === tier ? 'cur' : ''}"><span class="tn">${t}</span><span class="tr">${r ? esc(r.item.name) + '<br><span style="color:' + RARITY[r.item.r].css + '">' + COS_CATS.find(c => c[0] === r.cat)[1] + '</span>' : 'XP boost'}</span></div>`; }
      $('passTrack').innerHTML = h;
    }
    if (this.tab === 'career') {
      $('statGrid').innerHTML = [['Wins', d.wins], ['Matches', d.matches], ['Eliminations', d.kills], ['Top 10 finishes', d.top10], ['Chests opened', (d.chests || 0).toLocaleString()]].map(s => `<div class="stat"><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
      const ri = Profile.rankIdx();
      $('rankList').innerHTML = (Profile.hasPass() ? '<div class="hint">Battle Pass: Diamond or higher until ' + esc(Season.name()) + ' ends.</div>' : '') + RANKS.map((r, i) => `<div class="rank ${i === ri ? 'cur' : ''}"><span>${r[0]}${i === ri ? ' · ' + d.rp + ' RP' : ''}</span><i>${r[1]} RP</i></div>`).join('');
    }
  },
};
