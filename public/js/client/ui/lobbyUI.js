'use strict';
/* CLIENT - the title screen: Play solo, Host a game, or Join a game.
 *
 *  Solo     the single-player game. It is saved in this browser, in a world of its own (the same database a host uses), and carries on next time.
 *  Host     your browser runs the game and keeps it in ITS OWN database. Pick a saved world to continue, or start a new one.
 *           "Invite friends online" opens a room on the relay and gives you a code (and a link) for up to 3 friends.
 *  Join     type the host's code. Your character is kept by the host: come back with the same device and you get it back.
 *
 * Who you are is kept on this device: a name, and a secret player key (how a host recognises you when you return). */
class LobbyUI {
  constructor({ root, query }) { this.root = root; this.query = query; this.resolve = null; this.store = null; this.look = null; this.spin = null; }
  $(selector) { return this.root.querySelector(selector); }

  /** Shows the lobby; resolves with { adapter, welcome } once connected (or { adapter } for solo). */
  show() {
    return new Promise(resolve => {
      this.resolve = resolve; this.root.hidden = false;
      this.$('#lobbyName').value = this._load('ponyscapes.name') || LobbyUI.suggestName();      // never an empty box: a first-timer can just press Done
      this.$('#lobbyRelay').value = this._load('ponyscapes.relay') || this.query.get('relay') || '';
      this.look = this._loadLook();
      this.$('#lobbySolo').onclick = () => this._startSolo();
      this.$('#lobbyHost').onclick = () => this._showHost();
      this.$('#lobbyJoin').onclick = () => this._showJoin(this.query.get('join') || '');
      this.root.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => this._pane('lobbyMain'); });
      this.$('#charEdit').onclick = () => this._showCreator();
      this.$('#lobbyName').oninput = () => { if (this.look && !this.$('#lobbyMain').hidden) this._renderCard(); };
      this.$('#lobbyRelayNote').textContent = 'Using ' + RelayConnection.baseUrl();
      this.$('#lobbyPlay').onclick = () => this._enter();
      this.$('#lobbyEditor').onclick = () => this._editor();
      this.$('#lobbyMenu').onclick = () => this._pane('lobbyHome');
      this.$('#lobbyEditorGo').onclick = () => this._editor(this.$('#lobbyEditorCode').value);
      this.$('#lobbyEditorCode').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') this._editor(this.$('#lobbyEditorCode').value); };
      if (this.query.has('join')) this._enter();                                                   // an invite link goes straight to joining: no main menu
      else this._home();
    });
  }

  /* ---------------------------- the main menu: Play or Editor, with "Harmony Hooves" (the last tune of the soundtrack) as its theme ---------------------------- */
  _home() {
    this._pane('lobbyHome');
    if (!this.music && typeof PonyMusic !== 'undefined') this.music = new PonyMusic({ theme: 'harmony' });          // (sound starts on the first tap: browsers keep it off until then)
    if (typeof GameAudio !== 'undefined') GameAudio.onReady(() => { this.$('#lobbySound').hidden = true; });
  }
  /** Play: a new player makes their character first; then solo / host / join. */
  _enter() {
    if (!this._load('ponyscapes.character')) this._showCreator(true);
    else if (this.query.has('join')) this._showJoin(this.query.get('join'));
    else this._pane('lobbyMain');
  }
  /** Editor: behind the developer code (the same as Dev settings). Unlocked, it opens editor.html. */
  _editor(typed) {
    if (!DevLock.unlocked && typed === undefined) { this.$('#lobbyEditorLock').hidden = false; this.$('#lobbyEditorCode').focus(); return; }
    if (!DevLock.unlocked && !DevLock.tryCode(typed)) { this._error('That is not the code.'); this.$('#lobbyEditorCode').select(); return; }
    location.href = 'editor.html';
  }

  /* ---------------------------- identity ---------------------------- */
  /** A saved value. This game used to be called Realm, and its keys 'realm.*': a value saved under the old name is still found (and moved to the new). */
  _load(k) {
    try {
      let v = localStorage.getItem(k);
      if (v === null && k.startsWith('ponyscapes.')) { v = localStorage.getItem('realm.' + k.slice('ponyscapes.'.length)); if (v !== null) localStorage.setItem(k, v); }
      return v;
    } catch (e) { return null; }
  }
  _save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  /** This device's secret player key (made once). */
  _key() {
    let key = this._load('ponyscapes.key');
    if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
      const bytes = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(bytes);
      key = Array.from(bytes, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');
      this._save('ponyscapes.key', key);
    }
    return key;
  }
  _name() {
    const name = RelayProtocol.cleanName(this.$('#lobbyName').value) || 'Player' + Math.floor(100 + Math.random() * 900);
    this.$('#lobbyName').value = name; this._save('ponyscapes.name', name);
    return name;
  }
  _relay() {
    const typed = this.$('#lobbyRelay').value.trim();
    this._save('ponyscapes.relay', typed);
    return typed || RelayConnection.baseUrl();
  }

  /* ---------------------------- the character ---------------------------- */
  _loadLook() {
    try { const saved = CharacterLook.sanitize(JSON.parse(this._load('ponyscapes.character') || 'null')); if (saved) return saved; } catch (e) { /* none saved yet */ }
    return CharacterLook.random();
  }
  _look() { return this.look.slice(); }
  _describe() { const l = this.look; return `${CharacterPalette.bodies[l[0]]}, ${CharacterPalette.hairStyleNames[l[0] === 1 ? 'princess' : 'prince'][l[1]].toLowerCase()} ${CharacterPalette.hairColorNames[l[2]].toLowerCase()} hair, ${CharacterPalette.eyeNames[l[7]].toLowerCase()} eyes`; }
  _renderCard() {
    renderCharacterPortrait(this.$('#charMini'), this.look, 0, 1000, { crown: 'crown_simple' }, { dir: 'down', crop: 30 });
    this.$('#charCardName').textContent = RelayProtocol.cleanName(this.$('#lobbyName').value) || 'Unnamed';
    this.$('#charCardDesc').textContent = this._describe();
  }

  /** The character screen: prince or princess, six hair styles each, and four colours. A big pixel preview you can turn and set walking,
   *  the three views beside it, and little pictures on the body and hair buttons, all in your colours as you choose them. */
  _showCreator(first = false) {
    const P = CharacterPalette, T = this, canvas = this.$('#charPreview'), DIRS = ['down', 'left', 'up', 'right'];
    const thumb = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const swatches = (id, colors, slot, names) => {
      const el = this.$('#' + id); el.innerHTML = '';
      colors.forEach((color, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--sw', color); b.title = names[i] || ''; b.setAttribute('aria-label', b.title);
        b.onclick = () => { T.look[slot] = i; refresh(); };
        el.appendChild(b);
      });
    };
    // body: two cards with a head-and-shoulders picture
    const seg = this.$('#bodySeg'); seg.innerHTML = '';
    P.bodies.forEach((name, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.appendChild(thumb(60, 44)); b.appendChild(document.createTextNode(name));
      b.onclick = () => { T.look[0] = i; refresh(); }; seg.appendChild(b);
    });
    // hair: six chips, each with the head in that style
    const chips = this.$('#hairChips'); chips.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.appendChild(thumb(60, 44)); const label = document.createElement('span'); b.appendChild(label);
      b.onclick = () => { T.look[1] = i; refresh(); }; chips.appendChild(b);
    }
    swatches('hairColors', P.hairColors, 2, P.hairColorNames); swatches('skinColors', P.skins, 3, P.skinNames); swatches('outfitColors', P.outfits, 4, P.outfitNames); swatches('trimColors', P.trims, 5, P.trimNames);
    swatches('pantsColors', P.pants, 6, P.pantsNames); swatches('eyeColors', P.eyes, 7, P.eyeNames); swatches('shoeColors', P.shoes, 8, P.shoeNames);
    const textChips = (id, slot) => { const el = this.$('#' + id); el.innerHTML = ''; for (let i = 0; i < CharacterLook.SIZES[slot]; i++) { const b = document.createElement('button'); b.type = 'button'; b.onclick = () => { T.look[slot] = i; refresh(); }; el.appendChild(b); } };
    textChips('shirtStyles', 9); textChips('pantsStyles', 10);
    const refresh = () => {
      const l = T.look, kind = l[0] === 1 ? 'princess' : 'prince';
      seg.querySelectorAll('button').forEach((b, i) => { b.classList.toggle('on', i === l[0]); const look = l.slice(); look[0] = i; if (i !== l[0]) look[1] = Math.min(look[1], 7); renderCharacterPortrait(b.querySelector('canvas'), look, 0, 1000, {}, { dir: 'down', crop: 22 }); });
      chips.querySelectorAll('button').forEach((b, i) => { const look = l.slice(); look[1] = i; b.classList.toggle('on', i === l[1]); b.querySelector('span').textContent = P.hairStyleNames[kind][i]; renderCharacterPortrait(b.querySelector('canvas'), look, 0, 1000, {}, { dir: i === 2 && kind === 'princess' ? 'left' : 'down', crop: 22 }); });
      for (const [id, idx] of [['hairColors', 2], ['skinColors', 3], ['outfitColors', 4], ['trimColors', 5], ['pantsColors', 6], ['eyeColors', 7], ['shoeColors', 8]]) T.root.querySelectorAll('#' + id + ' button').forEach((b, i) => b.classList.toggle('on', i === l[idx]));
      this.$('#pantsLabel').textContent = kind === 'princess' ? 'Skirt' : 'Pants'; this.$('#pantsStyleLabel').textContent = kind === 'princess' ? 'Skirt style' : 'Pants style';
      for (const [id, idx, names] of [['shirtStyles', 9, P.shirtStyles], ['pantsStyles', 10, P.pantsStyles[kind]]]) this.$('#' + id).querySelectorAll('button').forEach((b, i) => { b.textContent = names[i]; b.classList.toggle('on', i === l[idx]); });
      T.root.querySelectorAll('.charViews canvas').forEach(c => renderCharacterPortrait(c, l, 0, 1000, {}, { dir: c.dataset.view }));
    };
    this.dirIdx = 0; this.walking = true;
    this.$('#charTurnL').onclick = () => { this.dirIdx = (this.dirIdx + 1) % 4; };
    this.$('#charTurnR').onclick = () => { this.dirIdx = (this.dirIdx + 3) % 4; };
    const walk = this.$('#charWalk'); walk.textContent = 'Stand'; walk.onclick = () => { this.walking = !this.walking; walk.textContent = this.walking ? 'Stand' : 'Walk'; };
    this.$('#charRandom').onclick = () => { this.look = CharacterLook.random(); refresh(); };
    this.$('#charDone').onclick = () => {
      const name = RelayProtocol.cleanName(this.$('#lobbyName').value);
      if (!name) { this.$('#lobbyName').value = LobbyUI.suggestName(); this._error('Your character needs a name: we suggested one, change it if you like, then press Done.'); return; }
      this._save('ponyscapes.name', name); this._save('ponyscapes.character', JSON.stringify(this.look));
      this._stopSpin(); this._renderCard();
      if (this.query.has('join') && first) this._showJoin(this.query.get('join')); else this._pane('lobbyMain');
    };
    this._pane('lobbyCreator'); refresh();
    const loop = now => { renderCharacterPortrait(canvas, this.look, 0, now, { crown: 'crown_simple' }, { dir: DIRS[this.dirIdx], moving: this.walking, phase: now / 160 }); this.spin = requestAnimationFrame(loop); };
    this._stopSpin(); this.spin = requestAnimationFrame(loop);
  }
  _stopSpin() { if (this.spin) cancelAnimationFrame(this.spin); this.spin = null; }

  /* ---------------------------- panes ---------------------------- */
  _pane(id) {
    if (id !== 'lobbyCreator') this._stopSpin();
    if (id === 'lobbyMain' && this.look) this._renderCard();
    for (const p of this.root.querySelectorAll('.lobbyPane')) p.hidden = p.id !== id;
    this.$('#nameField').hidden = id === 'lobbyBusy' || id === 'lobbyHome';                                  // (your name is on every screen except the spinner: an invite link opens straight on Join)
    this._error('');
    const first = this.$('#' + id + ' input, #' + id + ' button.big'); if (first && first.focus && id !== 'lobbyBusy' && id !== 'lobbyCreator') try { first.focus(); } catch (e) { /* not focusable */ }
    const card = this.$('.lobbyCard'); if (card) card.scrollTop = 0;                    // every screen starts at its top
  }
  _busy(text) { this.$('#lobbyBusyText').textContent = text; this._pane('lobbyBusy'); }
  _error(text) { const e = this.$('#lobbyError'); e.hidden = !text; e.textContent = text || ''; if (text) { const card = this.$('.lobbyCard'); if (card) card.scrollTop = 0; } }      // (errors are at the top, in view)
  _finish(result) { if (this.music) { this.music.stop(); this.music = null; } this.root.hidden = true; const r = this.resolve; this.resolve = null; r(result); }
  static ago(ms) { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; }

  /* ---------------------------- solo ---------------------------- */
  /** Solo is a hosted game that stays offline: its world and character are kept like any host's. The world is remembered by id; a browser that cannot keep saves plays unsaved, as before. */
  async _startSolo() {
    const name = this._name(), key = this._key();
    this._busy('Loading your world...');
    let store = null;
    try { store = this.store = this.store || await SaveStore.create(); } catch (e) { store = null; }
    if (!store) { this._finish({ adapter: new LocalAdapter({ name, appearance: this._look() }) }); return; }
    let world = null;
    try {
      const id = this._load('ponyscapes.soloWorld'), rec = id ? await store.getWorld(id) : null;
      if (rec) world = Object.assign({}, rec.meta, { data: rec.data });
    } catch (e) { world = null; }
    if (!world) {
      world = { id: 'w-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: LobbyUI.cleanWorldName(name + "'s world") || 'My world', seed: 1 + Math.floor(Math.random() * 2147483646), createdAt: Date.now() };
      this._save('ponyscapes.soloWorld', world.id);
    }
    const adapter = new HostAdapter({ store, world, key, name, online: false, appearance: this._look() });
    try { const welcome = await adapter.connect(); this._finish({ adapter, welcome }); }
    catch (e) { adapter.disconnect(); this._pane('lobbyMain'); this._error(e.message); }
  }

  /* ---------------------------- host ---------------------------- */
  async _showHost() {
    this._busy('Opening your saved games...');
    try { this.store = this.store || await SaveStore.create(); } catch (e) { this._pane('lobbyMain'); this._error('Could not open the save database: ' + e.message); return; }
    const worlds = await this.store.listWorlds().catch(() => []);
    const pane = this.$('#lobbyHostPane'), name = RelayProtocol.cleanName(this.$('#lobbyName').value) || this._load('ponyscapes.name') || 'Player';
    const rows = worlds.map((w, i) => `<label class="worldRow"><input type="radio" name="world" value="${w.id}" ${i === 0 ? 'checked' : ''}><span class="wname">${LobbyUI.escape(w.name)}</span><span class="wmeta">${w.players || 1} player${w.players === 1 ? '' : 's'} &middot; saved ${LobbyUI.ago(w.savedAt)}</span><button class="wdel" data-del="${w.id}" title="Delete this world" type="button">&#x1F5D1;</button></label>`).join('');
    pane.querySelector('#worldList').innerHTML = rows +
      `<label class="worldRow"><input type="radio" name="world" value="__new" ${worlds.length ? '' : 'checked'}><span class="wname">New world</span><input id="newWorldName" class="wnew" maxlength="24" value="${LobbyUI.escape(name)}'s world" aria-label="World name"></label>`;
    pane.querySelector('#saveWarning').hidden = this.store.persistent !== false;
    pane.querySelectorAll('[data-del]').forEach(b => { b.onclick = async e => { e.preventDefault(); if (confirm('Delete this world and every character saved in it? This cannot be undone.')) { await this.store.deleteWorld(b.dataset.del); this._showHost(); } }; });
    pane.querySelector('#hostStart').onclick = () => this._startHost(true);
    pane.querySelector('#hostOffline').onclick = () => this._startHost(false);
    this._pane('lobbyHostPane');
  }

  async _startHost(online) {
    const pane = this.$('#lobbyHostPane'), chosen = (pane.querySelector('input[name=world]:checked') || {}).value, name = this._name(), key = this._key(), relayBase = this._relay();
    let world;
    try {
      if (chosen && chosen !== '__new') { const rec = await this.store.getWorld(chosen); if (!rec) throw new Error('That saved world is missing.'); world = Object.assign({}, rec.meta, { data: rec.data }); }
      else world = { id: 'w-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name: LobbyUI.cleanWorldName(pane.querySelector('#newWorldName').value) || name + "'s world", seed: 1 + Math.floor(Math.random() * 2147483646), createdAt: Date.now() };
    } catch (e) { this._error(e.message); return; }
    this._busy(online ? 'Opening a room...' : 'Loading your world...');
    const adapter = new HostAdapter({ store: this.store, world, key, name, online, relayBase, appearance: this._look() });
    try { const welcome = await adapter.connect(); this._finish({ adapter, welcome }); }
    catch (e) {
      adapter.disconnect(); this._pane('lobbyHostPane');
      this._error(online ? (e.reason === 'unreachable' || e.reason === 'timeout' ? 'Could not reach the relay server (' + relayBase + '). You can still play this world offline with saving.' : e.message) : e.message);
    }
  }

  /* ---------------------------- join ---------------------------- */
  _showJoin(code) {
    this.$('#joinCode').value = RelayProtocol.normalizeCode(code);
    this.$('#joinGo').onclick = () => this._startJoin();
    this.$('#joinCode').onkeydown = e => { if (e.key === 'Enter') this._startJoin(); };
    this.$('#joinCode').oninput = e => { e.target.value = RelayProtocol.normalizeCode(e.target.value).slice(0, RelayProtocol.CODE_LENGTH); };
    this._pane('lobbyJoinPane');
  }
  async _startJoin(fresh = false) {
    const code = RelayProtocol.normalizeCode(this.$('#joinCode').value);
    if (!RelayProtocol.isCode(code)) { this._error('Enter the 5-character code the host gave you.'); return; }
    const name = this._name(), key = this._key(), base = this._relay();
    this._busy('Joining ' + code + '...');
    const adapter = new RemoteAdapter({ base, code, name, key, appearance: this._look(), fresh });
    try { const welcome = await adapter.connect(); this._finish({ adapter, welcome }); }
    catch (e) {
      adapter.disconnect(); this._showJoin(code);
      if (!fresh && (e.reason === 'character_mismatch' || e.reason === 'character_missing')) { this._error(e.message); this._askNewCharacter(e); return; }
      this._error(e.message);
    }
  }

  /** The host and this device disagree about who this character is. Nothing is guessed: starting a NEW character clears the old one's home on the host (so it can be given again). */
  _askNewCharacter(e) {
    const d = e.detail || {}, when = t => (t ? LobbyUI.ago(t) : 'a while ago');
    const text = e.reason === 'character_mismatch'
      ? `The host has a character called "${d.host && d.host.name || 'you'}" (saved ${when(d.host && d.host.savedAt)}) but this device remembers a different one (saved ${when(d.yours && d.yours.savedAt)}).`
      : `This device remembers a character in that world (saved ${when(d.yours && d.yours.savedAt)}) but the host no longer has it.`;
    if (confirm(text + '\n\nStart a NEW character in this world? Your old home there is cleared for it, and the old character is gone from the host.')) this._startJoin(true);
  }

  /** World names may contain apostrophes (they are always escaped when shown); markup and control characters are removed. */
  static cleanWorldName(text) { return String(text || '').replace(/[\u0000-\u001f\u007f<>&"`]/g, '').trim().slice(0, 24); }
  /** A fantasy name to start from. */
  static suggestName() { const n = ['Rowan', 'Elara', 'Corin', 'Mira', 'Thane', 'Lyra', 'Aldric', 'Isolde', 'Finn', 'Seren', 'Oriel', 'Ysolde', 'Kael', 'Briar', 'Alaric', 'Wren']; return n[Math.floor(Math.random() * n.length)]; }
  static escape(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
}
