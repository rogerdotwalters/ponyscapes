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
  const stats = { packed: 0, painted: 0, atlasMB: 0 };                    // pictures taken from the pack / painted by the game's own code (debug overlay)
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
  /** An indexed sprite (a layer of a pony or character: see SlotArt) as a Uint32Array of pixels, or undefined. Decoded once and kept. */
  const sprites = new LruCache(2500);
  function sprite(ns, key) {
    const k = ns + SEP + key;
    let px = sprites.get(k);
    if (px !== undefined) return px;
    const e = tables[ns] && tables[ns][key];
    if (!Array.isArray(e)) return undefined;
    const [a, x, y, w, h] = e, atlas = atlases[a];
    if (!atlas) return undefined;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(atlas, x, y, w, h, 0, 0, w, h);
    px = new Uint32Array(g.getImageData(0, 0, w, h).data.buffer);
    sprites.set(k, px); return px;
  }
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
      stats.atlasMB = Math.round(got.reduce((a, b) => a + (b ? b.width * b.height * 4 : 0), 0) / 1e5) / 10;
      return true;
    } catch (e) { return false; }
  }

  /* ---- export support (tools/export-art.js) ---- */
  const api = {
    SEP, lookup, has, sprite, load, caches, stats, recording: null,
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

/** SLOT ART: a pony or character picture whose colours are decided when it is built, not when it is drawn.
 *
 * The painters only ever use the colours of their palette (a pony's coat, mane and mark colours; a character's hair, skin, outfit...), so the shapes
 * can be painted ONCE with a stand-in palette whose colours are markers (`rgb(slot, 254, 254)`), and saved: each pixel of the saved picture is a
 * marker (take the colour of palette slot `slot`), a fixed colour (the painter's own constants: an eye's shine, a flame) or empty. Building a
 * figure in its real colours is then one pass over a few thousand pixels instead of running the painter. A picture is kept as LAYERS in the order
 * the painter draws them (so what is in front stays in front); the outline round the whole figure is added after they are joined.
 * `paths` is the list of palette entries ('coat.b', 'manes.0.d') that have slots: a slot's number is its place in that list. */
const SlotArt = (() => {
  const marker = slot => `rgb(${slot},254,254)`;
  const isMarker = p => (p >>> 24) === 255 && ((p >>> 8) & 0xFFFF) === 0xFEFE;                  // ABGR: A=255, B=254, G=254, R=slot
  const abgrOf = new Map();
  /** A CSS colour ('#rrggbb' or 'rgb(r,g,b)') as an opaque ABGR pixel (what a canvas holds, as little-endian 32-bit words). */
  function abgr(c) {
    let v = abgrOf.get(c);
    if (v === undefined) {
      const [r, g, b] = PixelCharacter.util.hex(c);
      v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; abgrOf.set(c, v);
    }
    return v;
  }
  const at = (obj, path) => { let o = obj; for (const k of path.split('.')) { if (o == null) return undefined; o = o[k]; } return o; };
  /** slot number -> pixel, for a real palette (an entry the palette lacks is opaque black; the layer that would use it is absent anyway). */
  function lutOf(pal, paths) {
    const lut = new Uint32Array(256).fill(0xFF000000);
    paths.forEach((path, i) => { const c = at(pal, path); if (typeof c === 'string') lut[i] = abgr(c); });
    return lut;
  }
  /** A copy of a palette in which every entry in `paths` is its slot's marker colour. */
  function probeOf(pal, paths) {
    const out = JSON.parse(JSON.stringify(pal));
    paths.forEach((path, i) => {
      const keys = path.split('.'); let o = out;
      for (let k = 0; k < keys.length - 1 && o != null; k++) o = o[keys[k]];
      if (o != null && o[keys[keys.length - 1]] !== undefined) o[keys[keys.length - 1]] = marker(i);      // (an entry the palette lacks stays lacking: adding one could change what the painters do)
    });
    return out;
  }
  /** Join layers (Uint32Array pixels, drawn in order; null skips one) in the colours of `lut`, add the 1-pixel outline round the figure, then
   *  lay `after` (layers drawn over the outline) on top. Returns the figure's pixels. */
  function compose(w, h, layers, lut, outlineColour, after) {
    const out = new Uint32Array(w * h);
    for (const layer of layers) {
      if (!layer) continue;
      for (let i = 0; i < out.length; i++) { const p = layer[i]; if (p >>> 24) out[i] = isMarker(p) ? lut[p & 255] : p; }
    }
    if (outlineColour) {                                                                          // every empty pixel touching the figure turns dark
      const edge = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (out[i] >>> 24) continue;
        if ((x > 0 && out[i - 1] >>> 24) || (x < w - 1 && out[i + 1] >>> 24) || (y > 0 && out[i - w] >>> 24) || (y < h - 1 && out[i + w] >>> 24)) edge.push(i);
      }
      for (const i of edge) out[i] = outlineColour;
    }
    if (after) for (const layer of after) {
      if (!layer) continue;
      for (let i = 0; i < out.length; i++) { const p = layer[i]; if (p >>> 24) out[i] = isMarker(p) ? lut[p & 255] : p; }
    }
    return out;
  }
  /** Pixels -> a canvas. */
  function canvasOf(w, h, px) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer, px.byteOffset, px.length * 4), w, h), 0, 0);
    return c;
  }
  return { marker, isMarker, abgr, lutOf, probeOf, compose, canvasOf };
})();
