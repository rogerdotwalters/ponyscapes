'use strict';
/* NETWORK - the HOST of a game. It is a LocalAdapter (the authoritative GameServer runs in this browser) that ALSO
 *   - opens a room on the relay and lets up to 3 friends join,
 *   - sends each friend their own snapshots (small ones: see DeltaCodec) and feeds their inputs / commands to the server,
 *   - keeps the whole game in the HOST's own database: the world and every player's character, auto-saved every 15 minutes (configurable),
 *     saved when someone leaves, and saved once more when the host ends the session.
 *
 * The simulation is driven by a Web Worker timer so it keeps running at full speed while the host's tab is in the background. */
class HostAdapter extends LocalAdapter {
  /** @param {{store, world:{id,name,seed,createdAt,data?}, key:string, name:string, online?:boolean, relayBase?:string, autosaveMs?:number}} options */
  constructor(options) {
    super();
    this.o = Object.assign({ online: true, relayBase: null, autosaveMs: CONFIG.net.autosaveMinutes * 60000 }, options);
    this.world = this.o.world; this.store = this.o.store;
    this.remotes = {};                       // cid -> { cid, id, key, name, ready, rtt, ... }
    this.keys = {};                          // player id -> that person's secret player key (who is who in the database)
    this.conn = null; this.code = ''; this.online = false; this.ended = false;
    this.listeners = []; this.saving = null; this.lastSavedAt = 0; this.nextAutoAt = 0; this.lastPingAt = 0; this.partId = 0;
    this.tickWorker = null;
    this.known = new Set();                  // every player key that has a character in this world (shown as "N players" in the lobby)
  }

  /* ------------------------------------ lifecycle ------------------------------------ */
  async connect() {
    const { key, name } = this.o;
    let saved = null;
    if (this.world.data) { saved = SaveData.sanitizeWorld(this.world.data); if (!saved) throw new Error('This saved world is damaged and cannot be opened.'); }
    this.server = new GameServer(this.world.seed, saved ? { world: saved } : {});
    const record = await this.store.getCharacter(this.world.id, key).catch(() => null);
    this.id = this.server.joinHuman(null, name, this.o.appearance, key);          // (the key brings back their ponies left in the world)
    if (record && !SaveData.importCharacter(this.server, this.id, record.data)) throw new Error('Your saved character in this world could not be read.');
    { const look = CharacterLook.sanitize(this.o.appearance); if (look) { this.server.players[this.id].appearance = look; this.server.fitWardrobe(this.id); } }
    this.keys[this.id] = key; this.known.add(key);
    try { for (const c of await this.store.listCharacters(this.world.id)) this.known.add(c.key); } catch (e) { /* the count is only a label */ }
    this.lastTime = performance.now();
    this._startTicker();
    this.nextAutoAt = Date.now() + this.o.autosaveMs;
    this._hookPageLifecycle();
    if (!this.world.data) await this.saveAll('created');                   // a brand-new world exists in the database from the first moment
    if (this.o.online) await this.startOnline();
    return JSON.parse(JSON.stringify(Object.assign(SnapshotBuilder.welcomeFor(this.server, this.id), { you: { name }, session: this._sessionPublic() })));
  }

  /** The simulation clock. A Worker's timer is not throttled when the tab is hidden; the page's own setInterval is (to once a second). */
  _startTicker() {
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},8)'], { type: 'text/javascript' }));
      this.tickWorker = new Worker(url); this.tickWorker.onmessage = () => this._pump(); URL.revokeObjectURL(url);
    } catch (e) { this.timer = setInterval(() => this._pump(), 8); }
  }
  _stopTicker() { if (this.tickWorker) { this.tickWorker.terminate(); this.tickWorker = null; } clearInterval(this.timer); }

  _hookPageLifecycle() {
    this._onHide = () => { if (document.hidden !== false && Date.now() - this.lastSavedAt > 5000) this.saveAll('background'); };
    document.addEventListener('visibilitychange', this._onHide); window.addEventListener('pagehide', this._onHide);
  }

  disconnect() {
    this._stopTicker();
    if (this._onHide) { document.removeEventListener('visibilitychange', this._onHide); window.removeEventListener('pagehide', this._onHide); }
    if (this.conn) this.conn.close();
  }

  /* ------------------------------------ the simulation + what remote players receive ------------------------------------ */
  _pump() {
    if (this.ended) return;
    const now = performance.now();
    this.accumulator += Math.min(now - this.lastTime, 250); this.lastTime = now;
    while (this.accumulator >= TICK_MS) {
      this.accumulator -= TICK_MS;
      this.server.step();
      if (this.server.tick % CONFIG.net.snapshotEvery === 0) this._sendSnapshot();
    }
    const wall = Date.now();
    if (wall >= this.nextAutoAt) { this.nextAutoAt = wall + this.o.autosaveMs; this.saveAll('autosave'); }
    if (this.online && wall - this.lastPingAt >= CONFIG.net.hostPingMs) { this.lastPingAt = wall; this._pingRemotes(); }
  }

  _sendSnapshot() {
    const ids = this.server.humanIds(), snaps = SnapshotBuilder.snapshotsFor(this.server, ids);     // ONE call: drains the events and personalises for everybody
    const wire = JSON.stringify(snaps[this.id]);
    this._deliver('down', () => { const snap = JSON.parse(wire); if (this.callback) this.callback(snap); else this.backlog.push(snap); });
    const items = [];
    for (const cid in this.remotes) { const r = this.remotes[cid]; if (r.ready && snaps[r.id]) items.push({ cid, body: JSON.stringify(this._encodeFor(r, snaps[r.id])) }); }
    if (items.length) this._sendFrames(items);
  }

  /** A remote player's version of a snapshot: rounded, with animals as deltas and the long shared lists only when they changed. */
  _encodeFor(r, snap) {
    const me = this.server.players[r.id], D = DeltaCodec;
    const out = { t: 'snapshot', tick: snap.tick, players: r.playerEnc.encode(D.quantize(snap.players)), events: D.quantize(snap.events, 2), animals: r.animalEnc.encode(snap.animals, me) };
    const boats = {};
    for (const id in snap.boats) { const b = snap.boats[id]; if (Math.hypot(b.x - me.x, b.y - me.y) < 120) boats[id] = b; }
    const movedBoats = r.gates.boats.changed(D.quantize(boats)); if (movedBoats) out.boats = movedBoats;               // boats are only sent when one moves
    const npcDelta = r.npcEnc.encode(D.quantize(snap.npcs)); if (Object.values(npcDelta).some(d => Object.keys(d).length)) out.npcs = npcDelta;      // the villagers: only the fields that changed, and only when something did
    const trees = r.gates.trees.changed(snap.trees); if (trees) out.trees = trees;
    const forage = r.gates.forage.changed(snap.forage); if (forage) out.forage = forage;
    const drops = r.gates.drops.changed(snap.drops || {}); if (drops) out.drops = drops;                                // items on the ground: only when a pile changes
    for (const k of ['pets', 'book', 'varieties']) { const v = r.gates[k].changed(snap[k]); if (v) out[k] = v; }
    for (const k of ['inventory', 'built', 'floors', 'farm', 'stockpiles', 'progress', 'treasure', 'trade', 'rings', 'settings', 'admin', 'quests', 'mates', 'friends', 'pack']) if (snap[k] !== undefined) out[k] = snap[k];
    return out;
  }

  /** Several clients' frames in one socket message; a very big frame (the welcome of a long game) is cut into pieces. */
  _sendFrames(items) {
    if (!this.conn || !this.conn.isOpen) return;
    const P = RelayProtocol, small = [], big = [];
    for (const it of items) (it.body.length > P.PART_SIZE ? big : small).push(it);
    if (small.length === 1) this.conn.send(P.toClient(small[0].cid, small[0].body));
    else if (small.length) this.conn.send(P.multi(small));
    for (const it of big) for (const frame of P.split(it.body, ++this.partId)) this.conn.send(P.toClient(it.cid, frame));
  }
  _sendJson(cid, object) { this._sendFrames([{ cid, body: JSON.stringify(object) }]); }

  /* ------------------------------------ the relay ------------------------------------ */
  /** Opens a room (retrying with a fresh code if one is taken). Returns the room code. */
  async startOnline() {
    if (this.online) return this.code;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = RelayProtocol.makeCode();
      try { await this._openRoom(code); this.code = code; this.online = true; this._emit({ type: 'online', code }); return code; }
      catch (e) { if (e.reason !== 'room_taken') throw e; }
    }
    throw new Error('Could not find a free room code. Try again.');
  }

  _openRoom(code) {
    return new Promise((resolve, reject) => {
      const base = this.o.relayBase || RelayConnection.baseUrl();
      let hosting = false;
      const conn = new RelayConnection({
        url: RelayConnection.urlFor(base, { room: code, role: 'host', name: this.o.name }),
        onFrame: raw => this._onFrame(raw),
        onRelay: msg => {
          if (msg.ev === 'hosting') { hosting = true; this.conn = conn; resolve(); }
          else if (msg.ev === 'peer_join') this._onPeerJoin(msg);
          else if (msg.ev === 'peer_leave') this._dropRemote(msg.cid, 'left');
        },
        onEnd: (reason, detail) => {
          if (!hosting) { const err = new Error(detail.text || 'The relay refused the room'); err.reason = detail.code || reason; reject(err); return; }
          if (!this.ended) this._relayLost(reason);
        }
      });
      conn.open().catch(reject);
      setTimeout(() => { if (!hosting) { conn.close(); const err = new Error('The relay did not answer'); err.reason = 'timeout'; reject(err); } }, 10000);
    });
  }

  _onPeerJoin(msg) {
    const cid = msg.cid;
    this.remotes[cid] = { cid, name: RelayProtocol.cleanName(msg.name), state: 'joining', ready: false, errors: 0, rtt: null };
    setTimeout(() => { const r = this.remotes[cid]; if (r && r.state === 'joining') this.kick(cid, 'No hello'); }, 10000);          // somebody who never introduces themselves is dropped
  }

  _onFrame(raw) {
    const f = RelayProtocol.parseClientFrame(raw);
    if (f) this._onClient(f.cid, f.body);
  }

  _onClient(cid, body) {
    const r = this.remotes[cid];
    if (!r) return;
    let msg; try { msg = JSON.parse(body); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      switch (msg.t) {
        case 'hello': this._onHello(r, msg); break;
        case 'inputs': if (r.ready && Array.isArray(msg.list)) for (const input of msg.list.slice(0, 8)) this.server.receiveInput(r.id, input); break;
        case 'cmd': if (r.ready && msg.cmd && typeof msg.cmd === 'object' && !Array.isArray(msg.cmd) && typeof msg.cmd.type === 'string') this.server.receiveCommand(r.id, msg.cmd); break;
        case 'pong': if (typeof msg.ts === 'number') r.rtt = Math.max(0, Date.now() - msg.ts); break;
        case 'ping': if (r.ready && typeof msg.ts === 'number') this._sendJson(cid, { t: 'pong', ts: msg.ts }); break;       // (so a friend can measure their own delay)
        case 'bye': this.kick(cid, 'Left the game'); break;                  // (also frees their seat on the relay at once, without waiting for the connection to wind down)
      }
    } catch (e) {                                                       // a malformed message must never be able to stop the game
      r.errors++; console.warn('bad message from', r.name, e);
      if (r.errors > 30) this.kick(cid, 'Too many bad messages');
    }
  }

  async _onHello(r, msg) {
    if (r.state !== 'joining') return;
    r.state = 'hello';
    const deny = (reason, text) => { this._sendJson(r.cid, { t: 'denied', reason, text }); delete this.remotes[r.cid]; setTimeout(() => { if (this.conn) this.conn.send(JSON.stringify({ t: 'kick', cid: r.cid, reason: text })); }, 200); };
    if (msg.v !== RelayProtocol.VERSION) return deny('version', 'This game version does not match the host. Reload the page and try again.');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(String(msg.key))) return deny('bad_key', 'Invalid player key.');
    if (Object.values(this.keys).includes(msg.key)) return deny('duplicate', 'You are already in this game (another tab or device).');
    const name = RelayProtocol.cleanName(msg.name) || r.name || 'Player';
    let record = null; try { record = await this.store.getCharacter(this.world.id, msg.key); } catch (e) { record = null; }
    if (!this.remotes[r.cid] || this.ended) return;                    // they left while we were reading the database
    if (Object.values(this.keys).includes(msg.key)) return deny('duplicate', 'You are already in this game (another tab or device).');
    const id = this.server.joinHuman(null, name, null, msg.key);
    if (!id) return deny('full', 'The game is full.');
    if (record && !SaveData.importCharacter(this.server, id, record.data)) {   // never silently replace somebody's saved character with a blank one
      this.server.leaveHuman(id); return deny('damaged', 'Your saved character in this world could not be read. Ask the host to check the save.');
    }
    { const look = CharacterLook.sanitize(msg.appearance); if (look) { this.server.players[id].appearance = look; this.server.fitWardrobe(id); } }          // their own character-screen choice
    this.keys[id] = msg.key; this.known.add(msg.key);
    Object.assign(r, { id, key: msg.key, name, ready: true, state: 'ready', animalEnc: new AnimalDeltaEncoder(), playerEnc: new PlayerDeltaEncoder(), npcEnc: new PlayerDeltaEncoder() });
    const welcome = JSON.parse(JSON.stringify(SnapshotBuilder.welcomeFor(this.server, id)));
    r.animalEnc.prime(welcome.animals); r.npcEnc.encode(DeltaCodec.quantize(welcome.npcs));      // (the villagers in the welcome count as already sent)
    r.gates = { trees: new ChangeGate(), forage: new ChangeGate(), pets: new ChangeGate(), book: new ChangeGate(), varieties: new ChangeGate(), boats: new ChangeGate(), drops: new ChangeGate() };
    r.gates.trees.prime(welcome.trees); r.gates.forage.prime(welcome.forage); r.gates.boats.prime(DeltaCodec.quantize(welcome.boats)); r.gates.drops.prime(welcome.drops);
    Object.assign(welcome, { t: 'welcome', you: { name, restored: !!record }, session: this._sessionPublic() });
    this._sendJson(r.cid, welcome);
    this._emit({ type: 'joined', name, restored: !!record });
    this._broadcastRoster();
  }

  /** Somebody left (or was removed): their character is written to the database FIRST, then their seat is free again. */
  async _dropRemote(cid, why) {
    const r = this.remotes[cid];
    if (!r) return;
    delete this.remotes[cid];
    if (!r.ready) return;
    const data = SaveData.exportCharacter(this.server, r.id);
    delete this.keys[r.id];
    this.server.leaveHuman(r.id);
    try { if (data) await this.store.putCharacter(this.world.id, r.key, r.name, data); }
    catch (e) { this._emit({ type: 'saveFailed', reason: 'leave', error: String(e && e.message || e) }); }
    this._emit({ type: 'left', name: r.name, why });
    this._broadcastRoster();
  }

  kick(cid, reason = 'Removed by the host') {
    if (this.conn) this.conn.send(JSON.stringify({ t: 'kick', cid, reason }));
    return this._dropRemote(cid, 'kicked');
  }

  _pingRemotes() {
    const items = [];
    for (const cid in this.remotes) if (this.remotes[cid].ready) items.push({ cid, body: JSON.stringify({ t: 'ping', ts: Date.now() }) });
    if (items.length) this._sendFrames(items);
  }

  _broadcastRoster() {
    const body = JSON.stringify({ t: 'roster', players: this._sessionPublic().players });
    const items = Object.values(this.remotes).filter(r => r.ready).map(r => ({ cid: r.cid, body }));
    if (items.length) this._sendFrames(items);
    this._emit({ type: 'roster' });
  }

  /** The relay connection dropped under us: friends are gone, but the host's game carries on offline. */
  async _relayLost(reason) {
    this.online = false; this.code = '';
    const remotes = Object.values(this.remotes); this.remotes = {};
    for (const r of remotes) if (r.ready) { const data = SaveData.exportCharacter(this.server, r.id); delete this.keys[r.id]; this.server.leaveHuman(r.id); try { if (data) await this.store.putCharacter(this.world.id, r.key, r.name, data); } catch (e) { /* reported by the save below */ } }
    this._emit({ type: 'relayLost', reason });
    await this.saveAll('relay lost');
  }

  /* ------------------------------------ saving ------------------------------------ */
  /** Writes the world and every player's character to the host's database in one transaction. */
  saveAll(reason = 'manual') {
    if (this.saving) return this.saving;
    this.saving = (async () => {
      try {
        const server = this.server, now = Date.now();
        const worldData = SaveData.exportWorld(server);                               // (all exported synchronously: one consistent moment)
        const characters = server.humanIds().map(id => ({ key: this.keys[id], name: server.players[id].name || id, data: SaveData.exportCharacter(server, id) })).filter(c => c.key && c.data);
        const meta = { id: this.world.id, name: this.world.name, seed: this.world.seed, createdAt: this.world.createdAt, savedAt: now, players: Math.max(this.known.size, characters.length) };
        await this.store.putAll(meta, worldData, characters);
        this.lastSavedAt = now; this.world.data = worldData;
        this._emit({ type: 'saved', reason, at: now, characters: characters.length });
      } catch (e) { this._emit({ type: 'saveFailed', reason, error: String(e && e.message || e) }); }
      finally { this.saving = null; }
    })();
    return this.saving;
  }

  /** Ends the session: everything is saved to the database, friends are told, the room is closed. */
  async endSession() {
    if (this.ended) return;
    this._emit({ type: 'ending' });
    if (this.saving) await this.saving;
    await this.saveAll('session end');                                               // the world, the host's character and every friend's character
    this.ended = true;
    const bye = JSON.stringify({ t: 'session_end', reason: 'host_ended' });
    this._sendFrames(Object.values(this.remotes).filter(r => r.ready).map(r => ({ cid: r.cid, body: bye })));
    await new Promise(r => setTimeout(r, 300));
    if (this.conn && this.conn.isOpen) { this.conn.send(JSON.stringify({ t: 'end' })); await new Promise(r => setTimeout(r, 150)); this.conn.close(); }
    this.remotes = {}; this.online = false; this.code = '';
    this.disconnect();
    this._emit({ type: 'ended' });
  }

  /* ------------------------------------ for the UI ------------------------------------ */
  onSession(cb) { this.listeners.push(cb); }
  _emit(event) { for (const cb of this.listeners) { try { cb(event); } catch (e) { console.warn(e); } } }

  _sessionPublic() {
    const server = this.server, players = server.humanIds().map(id => ({ id, name: server.players[id].name || id, slot: server.players[id].slot, host: id === this.id }));
    return { code: this.code, max: CONFIG.sim.maxPlayers, players };
  }
  shareLink() {
    if (!this.code) return '';
    const base = this.o.relayBase || RelayConnection.baseUrl(), own = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
    return location.origin + location.pathname + '?join=' + this.code + (base !== own ? '&relay=' + encodeURIComponent(base) : '');
  }
  getSessionInfo() {
    const server = this.server;
    return {
      role: 'host', online: this.online, code: this.code, link: this.shareLink(), worldName: this.world.name, persistent: this.store.persistent !== false,
      lastSavedAt: this.lastSavedAt, nextAutoSaveAt: this.nextAutoAt, saving: !!this.saving,
      players: server.humanIds().map(id => { const r = Object.values(this.remotes).find(x => x.id === id); return { id, name: server.players[id].name || id, slot: server.players[id].slot, host: id === this.id, rtt: r ? r.rtt : null, cid: r ? r.cid : null }; })
    };
  }
}
