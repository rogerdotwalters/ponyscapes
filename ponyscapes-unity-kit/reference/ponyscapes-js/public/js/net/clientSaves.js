'use strict';
/* NETWORK - a FRIEND's own copy of their characters. The host's browser keeps the real save (saveStore.js); the host also sends each friend a copy
 * of their character whenever it saves, and the friend's device keeps it here, in localStorage, one entry per world:
 *
 *   world id -> { world, worldName, hostName, cid (the character's id), name, savedAt, data (the SaveData character) }
 *
 * It does two jobs. When the friend comes back the HANDSHAKE (hostAdapter.js _onHello) sends the world and character ids held here, so host and
 * friend can check they mean the same character. And it is a backup: `exportAll()` gives it as a plain JSON file's worth of text.
 * It is never loaded back into a host's world on the friend's say-so (a hand-edited copy would be a cheat): the host's own record is the game. */
const ClientSaves = (() => {
  const KEY = 'ponyscapes.characters', MAX = 12, MAX_DATA = 400000;
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } };
  const write = all => {
    const entries = Object.entries(all).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)).slice(0, MAX);
    for (let attempt = 0; attempt < 3; attempt++) {
      try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries))); return true; }
      catch (e) { if (!entries.length) return false; entries.pop(); }          // out of room: the oldest copy makes way
    }
    return false;
  };
  const clean = s => String(s || '').replace(/[\u0000-\u001f\u007f<>&"`]/g, '').slice(0, 40);
  return {
    /** What the hello tells the host: which characters this device holds, and in which worlds (no save data: that stays here). */
    claims() { return Object.values(read()).filter(r => r && typeof r.world === 'string' && typeof r.cid === 'string').map(r => ({ world: r.world, cid: r.cid, savedAt: r.savedAt || 0 })); },
    get(world) { const r = read()[world]; return r && typeof r === 'object' ? r : null; },
    /** Keep the host's copy of my character. Returns false when it could not be kept. */
    put(record) {
      if (!record || typeof record.world !== 'string' || !SaveData.validCharacterId(record.cid) || !record.data || typeof record.data !== 'object') return false;
      if (!SaveData.sanitizeCharacter(record.data) || JSON.stringify(record.data).length > MAX_DATA) return false;
      const all = read();
      all[record.world.slice(0, 64)] = { world: record.world.slice(0, 64), worldName: clean(record.worldName), hostName: clean(record.hostName), cid: record.cid, name: clean(record.name), savedAt: Number(record.savedAt) || Date.now(), data: record.data };
      return write(all);
    },
    list() { return Object.values(read()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); },
    exportAll() { return JSON.stringify({ v: 1, exportedAt: Date.now(), characters: read() }, null, 1); }
  };
})();
