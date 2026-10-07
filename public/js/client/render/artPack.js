'use strict';
/* CLIENT - the ART PACK: pre-made pictures (assets/generated/art-index.json + art-N.png atlases) for the heavy, finite art the game otherwise paints
 * in code the first time it appears: the ground's cells, each creature's frames, trees, crops.
 *
 * It slots in underneath the existing caches. A PackedCache is an LruCache that, on a miss, looks the key up in the pack before the painter is
 * asked: the key is exactly the one the painter already uses, so a picture the pack does not hold (a rare variant, or a pack that has not been
 * made yet) is simply painted as before. Nothing is ever waited for: if the pack is missing or fails to load, the game runs as it always did.
 *
 * `node tools/export-art.js` paints every picture in a headless browser and writes the pack (see tools/README-art.md). A picture is sliced out of
 * its atlas into a small canvas of its own on first use, so only what is actually seen costs memory beyond the atlas. */
const ArtPack = (() => {
  const SEP = '\u0001';
  let tables = {}, atlases = [], loaded = false;
  const stats = { packed: 0, painted: 0 };                    // pictures taken from the pack / painted by the game's own code (debug overlay)
  const caches = [];                                          // every PackedCache (the exporter clears them to force the painters to run)

  /** Look a key up: a canvas (one picture), or an object { number props..., canvas props... } (a tree's trunk and crown), or undefined. */
  function lookup(ns, key) {
    const t = tables[ns], e = t && t[key];
    if (!e) return undefined;
    if (Array.isArray(e)) { const c = slice(e); if (c) stats.packed++; return c; }
    const out = Object.assign({}, e.s);
    for (const p in e.o) { const c = slice(e.o[p]); if (!c) return undefined; out[p] = c; }
    stats.packed++; return out;
  }
  const has = (ns, key) => !!(tables[ns] && tables[ns][key]);
  /** One picture [atlas, x, y, w, h] copied out of its atlas (null if that atlas did not load). */
  function slice([a, x, y, w, h]) {
    const atlas = atlases[a];
    if (!atlas) return undefined;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(atlas, x, y, w, h, 0, 0, w, h);
    return c;
  }

  /** Fetch the index and atlases (resolves true when there is a pack; never rejects: a missing pack is not an error). */
  async function load(base = 'assets/generated/') {
    try {
      const res = await fetch(base + 'art-index.json');
      if (!res.ok) return false;
      const index = await res.json();
      if (!index || index.v !== 1) return false;
      const got = await Promise.all(index.atlases.map(async name => {
        try {
          const r = await fetch(base + name);
          if (!r.ok) return null;
          const blob = await r.blob();
          if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);           // (kept decoded: no re-decode when it is sliced later)
          const img = new Image(); img.src = URL.createObjectURL(blob); await img.decode(); return img;
        } catch (e) { return null; }
      }));
      atlases = got; tables = index.ns || {}; loaded = true;
      return true;
    } catch (e) { return false; }
  }

  /* ---- export support (tools/export-art.js) ---- */
  const api = {
    SEP, lookup, has, load, caches, stats, recording: null,
    get loaded() { return loaded; },
    /** While `recording` is a Map, every picture a PackedCache is given is noted in it: 'ns' + SEP + key -> value. */
    record(ns, key, value) { this.recording.set(ns + SEP + key, value); },
    clearAll() { for (const c of caches) c.clear(); },
    /** Stop (or resume) consulting the pack: the exporter needs the painters' own output. */
    consult: true,
  };
  return api;
})();

/** An LruCache that falls back to the art pack (namespace `ns`) on a miss, and tells the exporter what the painters make. */
class PackedCache extends LruCache {
  constructor(max, ns) { super(max); this.ns = ns; ArtPack.caches.push(this); }
  get(key) {
    let v = super.get(key);
    if (v === undefined && ArtPack.consult) { v = ArtPack.lookup(this.ns, key); if (v !== undefined) super.set(key, v); }
    return v;
  }
  has(key) { return super.has(key) || (ArtPack.consult && ArtPack.has(this.ns, key)); }
  set(key, value) {
    if (ArtPack.recording) ArtPack.record(this.ns, key, value);
    ArtPack.stats.painted++;
    return super.set(key, value);
  }
}
