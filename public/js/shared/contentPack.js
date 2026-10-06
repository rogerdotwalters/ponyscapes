'use strict';
/* SHARED - your own content (js/content/customContent.js, written by editor.html) merged over the built-in definitions.
 *
 * The definition files call ContentPack.mergeDefs() while they build their frozen tables, so every system sees one table of
 * items / creatures whether an entry came from the game or from you. The untouched built-ins are kept in ContentPack.builtIn
 * so the editor can show what you changed and put an entry back the way it was.
 *
 * ?content=draft (solo testing only) plays the editor's unsaved draft from this browser instead of the file. Everyone in an
 * online game must load the same content, so a draft is never what friends see: download the file and deploy it for that. */
const ContentPack = (() => {
  const DRAFT_KEY = 'ponyscapes.contentDraft';
  const SECTIONS = ['items', 'creatures', 'characters'];
  const ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  function read() {
    const root = typeof globalThis !== 'undefined' ? globalThis : {};
    let raw = plain(root.PONYSCAPES_CONTENT) ? root.PONYSCAPES_CONTENT : {}, source = 'file';
    try {
      if (typeof location !== 'undefined' && typeof localStorage !== 'undefined' && new URLSearchParams(location.search).get('content') === 'draft') {
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft) { raw = JSON.parse(draft); source = 'draft'; }
      }
    } catch (e) { /* a broken draft never stops the game: the file is used instead */ }
    const data = { version: 1 };
    for (const s of SECTIONS) {
      data[s] = {};
      for (const [id, entry] of Object.entries(plain(raw[s]) ? raw[s] : {})) if (ID_PATTERN.test(id) && plain(entry)) data[s][id] = entry;
    }
    return { data, source };
  }

  const { data, source } = read();
  const builtIn = { items: {}, creatures: {} };

  /** Objects merge key by key; arrays and plain values replace. `undefined` never overwrites. */
  function deepMerge(base, over) {
    if (!plain(over)) return over === undefined ? base : over;
    const out = plain(base) ? Object.assign({}, base) : {};
    for (const [k, v] of Object.entries(over)) if (v !== undefined) out[k] = plain(v) && plain(out[k]) ? deepMerge(out[k], v) : v;
    return out;
  }
  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
    return o;
  }

  /**
   * One frozen table: every built-in (overridden where your content says so) plus every new entry.
   * @param {'items'|'creatures'} section
   * @param {object} defs the built-in table
   * @param {(merged:object, id:string, isNew:boolean)=>object|null} build normalises an entry (null = reject it)
   */
  function mergeDefs(section, defs, build) {
    const out = {}, custom = data[section];
    for (const id of Object.keys(defs)) {
      builtIn[section][id] = defs[id];
      let def = defs[id];
      if (custom[id]) { try { def = build(deepMerge(defs[id], custom[id]), id, false) || defs[id]; } catch (e) { console.warn('content: ignored', section, id, e); } }
      out[id] = deepFreeze(Object.assign({}, def, { id }));
    }
    for (const [id, entry] of Object.entries(custom)) {
      if (out[id]) continue;
      const base = typeof entry.base === 'string' && defs[entry.base] ? defs[entry.base] : {};
      try { const def = build(deepMerge(base, entry), id, true); if (def) out[id] = deepFreeze(Object.assign({}, def, { id })); }
      catch (e) { console.warn('content: ignored', section, id, e); }
    }
    return Object.freeze(out);
  }

  /** The sprite set for a player's body ('prince' | 'princess'), or null. */
  const character = body => (data.characters[body] && plain(data.characters[body].sprites) ? data.characters[body].sprites : null);

  return { DRAFT_KEY, SECTIONS, ID_PATTERN, data, source, builtIn, deepMerge, deepFreeze, mergeDefs, character, isPlain: plain };
})();
