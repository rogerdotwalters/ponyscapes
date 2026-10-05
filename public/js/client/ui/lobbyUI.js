'use strict';
/* CLIENT - the title screen: Play solo, Host a game, or Join a game.
 *
 *  Solo     the old single-player game, nothing saved.
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
      this.$('#lobbyName').value = this._load('realm.name') || LobbyUI.suggestName();      // never an empty box: a first-timer can just press Done
      this.$('#lobbyRelay').value = this._load('realm.relay') || this.query.get('relay') || '';
      this.look = this._loadLook();
      this.$('#lobbySolo').onclick = () => this._finish({ adapter: new LocalAdapter({ name: this._name(), appearance: this._look() }) });
      this.$('#lobbyHost').onclick = () => this._showHost();
      this.$('#lobbyJoin').onclick = () => this._showJoin(this.query.get('join') || '');
      this.root.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => this._pane('lobbyMain'); });
      this.$('#charEdit').onclick = () => this._showCreator();
      this.$('#lobbyName').oninput = () => { if (this.look && !this.$('#lobbyMain').hidden) this._renderCard(); };
      this.$('#lobbyRelayNote').textContent = 'Using ' + RelayConnection.baseUrl();
      if (!this._load('realm.character')) this._showCreator(true);                            // a new player makes their character first
      else if (this.query.has('join')) this._showJoin(this.query.get('join'));
      else this._pane('lobbyMain');
    });
  }

  /* ---------------------------- identity ---------------------------- */
  _load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  _save(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  /** This device's secret player key (made once). */
  _key() {
    let key = this._load('realm.key');
    if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
      const bytes = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(bytes);
      key = Array.from(bytes, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');
      this._save('realm.key', key);
    }
    return key;
  }
  _name() {
    const name = RelayProtocol.cleanName(this.$('#lobbyName').value) || 'Player' + Math.floor(100 + Math.random() * 900);
    this.$('#lobbyName').value = name; this._save('realm.name', name);
    return name;
  }
  _relay() {
    const typed = this.$('#lobbyRelay').value.trim();
    this._save('realm.relay', typed);
    return typed || RelayConnection.baseUrl();
  }

  /* ---------------------------- the character ---------------------------- */
  _loadLook() {
    try { const saved = CharacterLook.sanitize(JSON.parse(this._load('realm.character') || 'null')); if (saved) return saved; } catch (e) { /* none saved yet */ }
    return CharacterLook.random();
  }
  _look() { return this.look.slice(); }
  _describe() { const l = this.look; return `${CharacterPalette.bodies[l[0]]}, ${CharacterPalette.hairStyles[l[1]].toLowerCase()} ${CharacterPalette.hairColorNames[l[2]].toLowerCase()} hair`; }
  _renderCard() {
    renderCharacterPortrait(this.$('#charMini'), this.look);
    this.$('#charCardName').textContent = RelayProtocol.cleanName(this.$('#lobbyName').value) || 'Unnamed';
    this.$('#charCardDesc').textContent = this._describe();
  }

  /** The character screen: prince or princess, hair, and four colours, with a preview that turns so you can see every side. */
  _showCreator(first = false) {
    const P = CharacterPalette, T = this, canvas = this.$('#charPreview');
    const row = (id, items, slot, kind) => {
      const el = this.$('#' + id); el.innerHTML = '';
      items.forEach((item, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i;
        if (kind === 'swatch') { b.style.background = item; b.title = (P[slot + 'Names'] || [])[i] || ''; b.setAttribute('aria-label', b.title); } else b.textContent = item;
        b.onclick = () => { T.look[{ hair: 1, hairColor: 2, skin: 3, outfit: 4, trim: 5 }[slot]] = i; refresh(); };
        el.appendChild(b);
      });
    };
    const refresh = () => {
      const l = T.look;
      T.root.querySelectorAll('#bodySeg button').forEach((b, i) => b.classList.toggle('on', i === l[0]));
      for (const [id, idx] of [['hairChips', 1], ['hairColors', 2], ['skinColors', 3], ['outfitColors', 4], ['trimColors', 5]]) T.root.querySelectorAll('#' + id + ' button').forEach((b, i) => b.classList.toggle('on', i === l[idx]));
    };
    const seg = this.$('#bodySeg'); seg.innerHTML = '';
    P.bodies.forEach((name, i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.onclick = () => { T.look[0] = i; refresh(); }; seg.appendChild(b); });
    row('hairChips', P.hairStyles, 'hair', 'chip'); row('hairColors', P.hairColors, 'hairColor', 'swatch'); row('skinColors', P.skins, 'skin', 'swatch'); row('outfitColors', P.outfits, 'outfit', 'swatch'); row('trimColors', P.trims, 'trim', 'swatch');
    this.root.querySelectorAll('#hairColors button').forEach((b, i) => { b.title = P.hairColorNames[i]; });
    this.$('#charRandom').onclick = () => { this.look = CharacterLook.random(); refresh(); };
    this.$('#charDone').onclick = () => {
      const name = RelayProtocol.cleanName(this.$('#lobbyName').value);
      if (!name) { this.$('#lobbyName').value = LobbyUI.suggestName(); this._error('Your character needs a name: we suggested one, change it if you like, then press Done.'); return; }
      this._save('realm.name', name); this._save('realm.character', JSON.stringify(this.look));
      this._stopSpin(); this._renderCard();
      if (this.query.has('join') && first) this._showJoin(this.query.get('join')); else this._pane('lobbyMain');
    };
    this._pane('lobbyCreator'); refresh();
    const loop = now => { renderCharacterPortrait(canvas, this.look, Math.PI / 4 + Math.sin(now / 900) * 1.35, now); this.spin = requestAnimationFrame(loop); };
    this._stopSpin(); this.spin = requestAnimationFrame(loop);
  }
  _stopSpin() { if (this.spin) cancelAnimationFrame(this.spin); this.spin = null; }

  /* ---------------------------- panes ---------------------------- */
  _pane(id) {
    if (id !== 'lobbyCreator') this._stopSpin();
    if (id === 'lobbyMain' && this.look) this._renderCard();
    for (const p of this.root.querySelectorAll('.lobbyPane')) p.hidden = p.id !== id;
    this.$('#nameField').hidden = id === 'lobbyBusy';                                  // (your name is on every screen except the spinner: an invite link opens straight on Join)
    this._error('');
    const first = this.$('#' + id + ' input, #' + id + ' button.big'); if (first && first.focus && id !== 'lobbyBusy' && id !== 'lobbyCreator') try { first.focus(); } catch (e) { /* not focusable */ }
    const card = this.$('.lobbyCard'); if (card) card.scrollTop = 0;                    // every screen starts at its top
  }
  _busy(text) { this.$('#lobbyBusyText').textContent = text; this._pane('lobbyBusy'); }
  _error(text) { const e = this.$('#lobbyError'); e.hidden = !text; e.textContent = text || ''; if (text) { const card = this.$('.lobbyCard'); if (card) card.scrollTop = 0; } }      // (errors are at the top, in view)
  _finish(result) { this.root.hidden = true; const r = this.resolve; this.resolve = null; r(result); }
  static ago(ms) { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; }

  /* ---------------------------- host ---------------------------- */
  async _showHost() {
    this._busy('Opening your saved games...');
    try { this.store = this.store || await SaveStore.create(); } catch (e) { this._pane('lobbyMain'); this._error('Could not open the save database: ' + e.message); return; }
    const worlds = await this.store.listWorlds().catch(() => []);
    const pane = this.$('#lobbyHostPane'), name = RelayProtocol.cleanName(this.$('#lobbyName').value) || this._load('realm.name') || 'Player';
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
  async _startJoin() {
    const code = RelayProtocol.normalizeCode(this.$('#joinCode').value);
    if (!RelayProtocol.isCode(code)) { this._error('Enter the 5-character code the host gave you.'); return; }
    const name = this._name(), key = this._key(), base = this._relay();
    this._busy('Joining ' + code + '...');
    const adapter = new RemoteAdapter({ base, code, name, key, appearance: this._look() });
    try { const welcome = await adapter.connect(); this._finish({ adapter, welcome }); }
    catch (e) { adapter.disconnect(); this._showJoin(code); this._error(e.message); }
  }

  /** World names may contain apostrophes (they are always escaped when shown); markup and control characters are removed. */
  static cleanWorldName(text) { return String(text || '').replace(/[\u0000-\u001f\u007f<>&"`]/g, '').trim().slice(0, 24); }
  /** A fantasy name to start from. */
  static suggestName() { const n = ['Rowan', 'Elara', 'Corin', 'Mira', 'Thane', 'Lyra', 'Aldric', 'Isolde', 'Finn', 'Seren', 'Oriel', 'Ysolde', 'Kael', 'Briar', 'Alaric', 'Wren']; return n[Math.floor(Math.random() * n.length)]; }
  static escape(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
}
