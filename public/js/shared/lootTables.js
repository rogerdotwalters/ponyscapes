'use strict';
/* SHARED - loot tables: what a creature drops when it dies and what a dungeon's chests hold. The built-in tables live in the data (creature `drops`, dungeon `loot`); the editor
 * (editor.html > Loot) can replace any of them. Where a table comes from, strongest first:
 *   this device   what you saved in the editor on this phone / computer (localStorage). Drops are rolled by whoever HOSTS the game, so the host's device decides what everyone gets.
 *   the file      js/content/lootTables.js (the editor's Download), which is the game for everyone
 *   built in      the creature's / dungeon's own data
 * A table is a list of entries { item, min, max, chance }: each entry is rolled by itself (chance 0-1, default always), giving min..max of the item. An empty list is a valid table:
 * it drops nothing. Keys: "creature:<creature id>" and "chest:<dungeon id>". */
const LootTables = (() => {
  const KEY = 'ponyscapes.lootTables', KEY_PATTERN = /^(creature|chest):[a-z][a-z0-9_]{0,39}$/, MAX_ENTRIES = 40;
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const root = typeof globalThis !== 'undefined' ? globalThis : {};

  /** One entry, checked: a known item, whole numbers 1-9999 with max >= min, a chance 0-1. null if it is no use. */
  function cleanEntry(e) {
    if (!plain(e) || typeof e.item !== 'string' || !ItemDefs[e.item]) return null;
    const whole = (v, d) => (Number.isFinite(+v) ? clamp(Math.round(+v), 1, 9999) : d), min = whole(e.min, 1), max = Math.max(min, whole(e.max, min));
    const out = { item: e.item, min, max };
    if (e.chance !== undefined && Number.isFinite(+e.chance) && +e.chance < 1) out.chance = Math.round(clamp(+e.chance, 0, 1) * 1000) / 1000;
    return out;
  }
  /** { key: [entries] }, only valid keys and entries. */
  function sanitize(raw) {
    const out = {};
    for (const [key, list] of Object.entries(plain(raw) ? raw : {})) if (KEY_PATTERN.test(key) && Array.isArray(list)) out[key] = list.slice(0, MAX_ENTRIES).map(cleanEntry).filter(Boolean);
    return out;
  }

  let file = sanitize(plain(root.PONYSCAPES_LOOT) ? root.PONYSCAPES_LOOT.tables : null), device = null;
  const readDevice = () => { try { const raw = localStorage.getItem(KEY); return raw ? sanitize(JSON.parse(raw).tables) : {}; } catch (e) { return {}; } };
  const mine = () => device || (device = readDevice());
  const writeDevice = () => { try { localStorage.setItem(KEY, JSON.stringify({ version: 1, tables: mine() })); return true; } catch (e) { return false; } };

  const creatureKey = id => 'creature:' + id, chestKey = id => 'chest:' + id;
  const copy = list => list.map(e => Object.assign({}, e));

  /** Every table that can be edited: [{ key, kind: 'creature' | 'chest', id, name }]. Every creature that is not a pony, and every dungeon's chests. */
  function all() {
    const creatures = Object.values(AnimalDefs).filter(d => !d.pony).sort((a, b) => (b.hostile ? 1 : 0) - (a.hostile ? 1 : 0) || a.name.localeCompare(b.name)).map(d => ({ key: creatureKey(d.id), kind: 'creature', id: d.id, name: d.name }));
    const chests = (typeof Dungeons !== 'undefined' ? Dungeons.all() : []).map(d => ({ key: chestKey(d.id), kind: 'chest', id: d.id, name: d.name + ' chests' }));
    return chests.concat(creatures);
  }
  /** The built-in table of a key (a copy), or [] . */
  function builtIn(key) {
    const [kind, id] = key.split(':');
    if (kind === 'creature') return copy((AnimalDefs[id] && AnimalDefs[id].drops) || []);
    const dungeon = typeof Dungeons !== 'undefined' ? Dungeons.all().find(d => d.id === id) : null;
    return copy((dungeon && dungeon.loot) || []);
  }
  /** Where the table in use comes from: 'device', 'file' or 'built-in'. */
  const source = key => (mine()[key] ? 'device' : file[key] ? 'file' : 'built-in');
  /** The table in use (a copy). */
  const current = key => copy(mine()[key] || file[key] || builtIn(key));

  /** What a creature drops (its table in use). */
  const dropsOf = def => (mine()[creatureKey(def.id)] || file[creatureKey(def.id)] || def.drops || []);
  /** What a dungeon's chests can hold. The built-in default is a few coins. */
  const chestOf = def => mine()[chestKey(def.id)] || file[chestKey(def.id)] || (def.loot && def.loot.length ? def.loot : [{ item: 'gold_coin', min: 10, max: 30 }]);

  /** Save a table on this device (cleaned). Returns false if the browser would not store it. */
  function save(key, list) {
    if (!KEY_PATTERN.test(key)) return false;
    mine()[key] = (Array.isArray(list) ? list : []).slice(0, MAX_ENTRIES).map(cleanEntry).filter(Boolean);
    return writeDevice();
  }
  /** Back to the file's table (or the built-in one) on this device. */
  function reset(key) { delete mine()[key]; return writeDevice(); }
  /** The tables saved on this device, as the text of js/content/lootTables.js. */
  function exportText() {
    const tables = Object.assign({}, file, mine());
    return "'use strict';\n/* LOOT TABLES, written by editor.html > Loot. Put this file at public/js/content/lootTables.js. */\nwindow.PONYSCAPES_LOOT = " + JSON.stringify({ version: 1, tables }, null, 2) + ';\n';
  }
  /** Take tables from the text of a lootTables.js (or plain JSON) onto this device. Returns how many tables came in, or -1 if it was not one. */
  function importText(text) {
    try {
      const at = String(text).indexOf('{', String(text).indexOf('PONYSCAPES_LOOT') + 1), json = String(text).trim().startsWith('{') ? String(text) : String(text).slice(at, String(text).lastIndexOf('}') + 1);
      const parsed = JSON.parse(json), tables = sanitize(plain(parsed) && plain(parsed.tables) ? parsed.tables : parsed);
      Object.assign(mine(), tables); writeDevice();
      return Object.keys(tables).length;
    } catch (e) { return -1; }
  }
  /** A sample of rolls for a table: { item: total } over `n` kills (to see what a table is worth). */
  function sample(list, n, rng = Math.random) {
    const totals = {};
    for (let i = 0; i < n; i++) for (const e of list) if (e.chance === undefined || rng() < e.chance) totals[e.item] = (totals[e.item] || 0) + e.min + Math.floor(rng() * (e.max - e.min + 1));
    return totals;
  }
  /** Forget what was read from this device (the next call reads it again): for tests and for a second tab that saved. */
  const reload = () => { device = null; };

  return { KEY, all, builtIn, current, source, dropsOf, chestOf, save, reset, exportText, importText, sample, sanitize, reload, MAX_ENTRIES };
})();
