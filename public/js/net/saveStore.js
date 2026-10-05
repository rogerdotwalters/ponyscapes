'use strict';
/* NETWORK - where the HOST keeps the game. The host's own browser database (IndexedDB) holds every world they host and, inside each
 * world, a record for every person who ever played in it (the host included), keyed by the secret "player key" that person's own device
 * keeps. So when a friend comes back with the same device, they get their character back.
 *
 *   worldIndex   { id, name, seed, createdAt, savedAt, players }       small, listed in the lobby
 *   worldData    { id, data }                                          the big SaveData world
 *   characters   { id: worldId|key, worldId, key, name, savedAt, data }
 *
 * The same API is implemented by MemorySaveStore (used where IndexedDB is unavailable, e.g. some private modes). */
class IndexedDbSaveStore {
  constructor(name = 'realm-saves') { this.name = name; this.db = null; this.persistent = true; }

  open() {
    if (this.db) return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('worldIndex', { keyPath: 'id' });
        db.createObjectStore('worldData', { keyPath: 'id' });
        db.createObjectStore('characters', { keyPath: 'id' }).createIndex('worldId', 'worldId');
      };
      req.onsuccess = () => { this.db = req.result; resolve(this); };
      req.onerror = () => reject(req.error || new Error('Could not open the save database'));
      req.onblocked = () => reject(new Error('The save database is blocked by another tab'));
    });
  }
  _tx(stores, mode, work) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, mode); let result;
      tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Save aborted'));
      result = work(tx);
    });
  }
  _req(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

  async listWorlds() { const all = await this._tx(['worldIndex'], 'readonly', tx => this._req(tx.objectStore('worldIndex').getAll())); return all.sort((a, b) => b.savedAt - a.savedAt); }
  async getWorld(id) {
    return this._tx(['worldIndex', 'worldData'], 'readonly', tx => Promise.all([this._req(tx.objectStore('worldIndex').get(id)), this._req(tx.objectStore('worldData').get(id))]))
      .then(([meta, data]) => (meta && data ? { meta, data: data.data } : null));
  }
  /** Write the world's index entry and its data in ONE transaction: a crash can never leave one without the other. */
  putWorld(meta, data) {
    return this._tx(['worldIndex', 'worldData'], 'readwrite', tx => { tx.objectStore('worldIndex').put(meta); tx.objectStore('worldData').put({ id: meta.id, data }); });
  }
  async deleteWorld(id) {
    const chars = await this.listCharacters(id);
    return this._tx(['worldIndex', 'worldData', 'characters'], 'readwrite', tx => { tx.objectStore('worldIndex').delete(id); tx.objectStore('worldData').delete(id); for (const c of chars) tx.objectStore('characters').delete(c.id); });
  }
  getCharacter(worldId, key) { return this._tx(['characters'], 'readonly', tx => this._req(tx.objectStore('characters').get(worldId + '|' + key))).then(r => r || null); }
  putCharacter(worldId, key, name, data) { return this._tx(['characters'], 'readwrite', tx => { tx.objectStore('characters').put({ id: worldId + '|' + key, worldId, key, name, savedAt: Date.now(), data }); }); }
  listCharacters(worldId) { return this._tx(['characters'], 'readonly', tx => this._req(tx.objectStore('characters').index('worldId').getAll(worldId))); }

  /** Save everything in one transaction: the world and every character, together. */
  putAll(meta, worldData, characters) {
    return this._tx(['worldIndex', 'worldData', 'characters'], 'readwrite', tx => {
      tx.objectStore('worldIndex').put(meta); tx.objectStore('worldData').put({ id: meta.id, data: worldData });
      for (const c of characters) tx.objectStore('characters').put({ id: meta.id + '|' + c.key, worldId: meta.id, key: c.key, name: c.name, savedAt: Date.now(), data: c.data });
    });
  }
  /** A plain-JSON backup of everything (so a host can download their saves). */
  async exportAll() {
    const worlds = [];
    for (const meta of await this.listWorlds()) { const w = await this.getWorld(meta.id); worlds.push({ meta, data: w && w.data, characters: await this.listCharacters(meta.id) }); }
    return { v: 1, exportedAt: Date.now(), worlds };
  }
}

class MemorySaveStore {
  constructor() { this.worlds = new Map(); this.data = new Map(); this.chars = new Map(); this.persistent = false; }
  open() { return Promise.resolve(this); }
  async listWorlds() { return [...this.worlds.values()].map(v => JSON.parse(JSON.stringify(v))).sort((a, b) => b.savedAt - a.savedAt); }
  async getWorld(id) { return this.worlds.has(id) ? { meta: JSON.parse(JSON.stringify(this.worlds.get(id))), data: JSON.parse(JSON.stringify(this.data.get(id))) } : null; }
  async putWorld(meta, data) { this.worlds.set(meta.id, JSON.parse(JSON.stringify(meta))); this.data.set(meta.id, JSON.parse(JSON.stringify(data))); }
  async deleteWorld(id) { this.worlds.delete(id); this.data.delete(id); for (const k of [...this.chars.keys()]) if (k.startsWith(id + '|')) this.chars.delete(k); }
  async getCharacter(worldId, key) { const c = this.chars.get(worldId + '|' + key); return c ? JSON.parse(JSON.stringify(c)) : null; }
  async putCharacter(worldId, key, name, data) { this.chars.set(worldId + '|' + key, JSON.parse(JSON.stringify({ id: worldId + '|' + key, worldId, key, name, savedAt: Date.now(), data }))); }
  async listCharacters(worldId) { return [...this.chars.values()].filter(c => c.worldId === worldId).map(c => JSON.parse(JSON.stringify(c))); }
  async putAll(meta, worldData, characters) { await this.putWorld(meta, worldData); for (const c of characters) await this.putCharacter(meta.id, c.key, c.name, c.data); }
  async exportAll() { const worlds = []; for (const meta of await this.listWorlds()) worlds.push({ meta, data: (await this.getWorld(meta.id)).data, characters: await this.listCharacters(meta.id) }); return { v: 1, exportedAt: Date.now(), worlds }; }
}

/** The best store this browser offers; asks the browser not to evict it when space runs low. */
const SaveStore = {
  async create() {
    if (typeof indexedDB !== 'undefined') {
      try {
        const store = await new IndexedDbSaveStore().open();
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
        return store;
      } catch (e) { console.warn('IndexedDB unavailable, saves will not survive a reload:', e); }
    }
    return new MemorySaveStore();
  }
};
