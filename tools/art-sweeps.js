/* Runs INSIDE the game page (injected by tools/export-art.js): paints every picture the art pack holds, packs them into atlases, and checks a
 * finished pack against what the painters make. The game's own painters do all the drawing, so the pack can never disagree with the code that
 * made it; the sweeps only decide WHICH pictures to ask for. When a painter gains a new variant that nothing here asks for, the game paints it
 * live as before (add it to the sweep, re-export, and it ships in the pack). */
window.__art = (() => {
  const ATLAS = 2048, GAP = 1;
  const SEP = ArtPack.SEP;

  /* ---- what to paint ---- */
  const sweeps = {
    /** The ground: every cell set at all six variants (TerrainRenderer.cellSets also lists the four seasons of meadow grass, soil, curbs...). */
    terrain() {
      for (const { kind, pal, season, wet } of TerrainRenderer.cellSets()) for (let v = 0; v < 6; v++) PixelTerrain.cell(kind, pal, v, season, wet);
    },
    /** Every walk and idle frame of every pixel creature, as the game asks for them (AnimalSprite): both hunting looks, and the stag / shorn variants. */
    creatures() {
      const g = document.createElement('canvas').getContext('2d');
      for (const def of Object.values(AnimalDefs)) {
        const kind = def.sprite && def.sprite.kind;
        if (def.pony || !kind || !PixelCreatures.has(kind)) continue;
        const spec = Object.assign({ kind: 'sheep' }, def.sprite);
        const extras = kind === 'deer' ? ['', 'stag'] : kind === 'sheep' ? ['', 'shorn'] : [''];
        for (const extra of extras) for (const hunting of [false, true]) for (let now = 0; now < 4800; now += 30) {
          PixelCreatures.draw(g, spec, 80, 120, 1, { moving: false, phase: 0, now, seed: 0, hunting, extra });
          for (let i = 0; i < 4; i++) PixelCreatures.draw(g, spec, 80, 120, 1, { moving: true, phase: i * Math.PI / 2 + 0.1, now, seed: 0, hunting, extra });
        }
      }
    },
    /** Trees: every look (leafy / pine, five sizes) in the spring colours, each season's tint and each biome's tint; the stump. (Apple trees' fruit varies
     *  too much to list: those are painted live.) */
    props() {
      const tints = new Set([null, ...Seasons.LIST.map(s => s.treeTint), ...Biomes.all().map(b => b.treeTint).filter(Boolean)]);
      for (const tint of tints) for (let variant = 0; variant < 10; variant++) PixelProps.treeArt(variant, tint, null);
      PixelProps.stumpArt();
    },
    /** The village's buildings (each as the ground at the foot of its walls is on the starting map) and every wall / watchtower tile over the grounds
     *  that can lie at its foot. A building painted for another ground is painted live. */
    buildings() {
      const world = new World(1337);
      PixelBuildings.useGround((x, y) => TerrainRenderer.lookOf(world, x, y));
      for (const site of BuildingSites.list) PixelBuildings.art(site);
      const grounds = [null, 'grass', 'dirt', 'sand', 'clay', 'stone'];
      for (const kind of ['wall', 'tower']) for (const gS of grounds) for (const gE of grounds) PixelBuildings.pieceArt(kind, gS, gE);
    },
    /** Every crop at every stage. */
    crops() {
      for (const crop of Crops.all()) for (const stage of [0, 1, 2, 3, 'dead']) PixelCrops.art(crop, stage);
    },
  };

  /** Run every sweep with the pack switched off and every cache emptied, so the painters really paint; returns what they made: 'ns' SEP 'key' -> value. */
  function paintAll() {
    const wasConsulting = ArtPack.consult;
    ArtPack.consult = false; ArtPack.clearAll(); ArtPack.recording = new Map();
    const made = ArtPack.recording, counts = {};
    try { for (const [name, run] of Object.entries(sweeps)) { const before = made.size; run(); counts[name] = made.size - before; } }
    finally { ArtPack.recording = null; ArtPack.consult = wasConsulting; ArtPack.clearAll(); }
    return { made, counts };
  }

  /* ---- packing ---- */
  const isCanvas = v => v instanceof HTMLCanvasElement;
  function fnv(bytes, h = 0x811c9dc5) { for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

  async function exportPack() {
    const { made, counts } = paintAll();
    const unique = [], buckets = new Map();
    const intern = canvas => {                                                          // identical pictures (many frames repeat) are stored once
      const w = canvas.width, h = canvas.height, data = canvas.getContext('2d').getImageData(0, 0, w, h), id = w + 'x' + h + ':' + fnv(data.data);
      const list = buckets.get(id) || []; buckets.set(id, list);
      for (const im of list) if (same(im.data.data, data.data)) return im;
      const im = { w, h, data, at: null }; list.push(im); unique.push(im); return im;
    };
    const entries = [];                                                                 // [ns, key, { img } | { o: {prop: img}, s: {scalars} }]
    let skipped = 0;
    for (const [nk, value] of [...made].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      const [ns, key] = nk.split(SEP);
      if (isCanvas(value)) { entries.push([ns, key, { img: intern(value) }]); continue; }
      if (value && typeof value === 'object') {
        const o = {}, s = {}; let ok = true;
        for (const [p, v] of Object.entries(value)) { if (isCanvas(v)) o[p] = intern(v); else if (['number', 'string', 'boolean'].includes(typeof v)) s[p] = v; else ok = false; }
        if (ok) { entries.push([ns, key, { o, s }]); continue; }
      }
      skipped++;
    }
    // shelf-pack, tallest first
    const order = [...unique].sort((a, b) => b.h - a.h || b.w - a.w || 0), atlases = [];
    let cur = null, x = 0, y = 0, rowH = 0;
    const newAtlas = () => { cur = document.createElement('canvas'); cur.width = cur.height = ATLAS; atlases.push({ canvas: cur, ctx: cur.getContext('2d'), used: 0 }); x = y = rowH = 0; };
    newAtlas();
    for (const im of order) {
      if (im.w > ATLAS || im.h > ATLAS) throw new Error('picture too big for an atlas: ' + im.w + 'x' + im.h);
      if (x + im.w > ATLAS) { x = 0; y += rowH + GAP; rowH = 0; }
      if (y + im.h > ATLAS) { newAtlas(); }
      atlases[atlases.length - 1].ctx.putImageData(im.data, x, y);
      im.at = [atlases.length - 1, x, y, im.w, im.h]; atlases[atlases.length - 1].used = Math.max(atlases[atlases.length - 1].used, y + im.h);
      x += im.w + GAP; rowH = Math.max(rowH, im.h);
    }
    // trim each atlas to the rows used (a smaller PNG, a smaller decoded bitmap)
    const pngs = atlases.map(a => { const t = document.createElement('canvas'); t.width = ATLAS; t.height = Math.max(1, a.used); t.getContext('2d').drawImage(a.canvas, 0, 0); return t.toDataURL('image/png'); });
    // a digest of everything: the same painters always give the same digest
    let digest = 0x811c9dc5;
    for (const im of order) digest = fnv(im.data.data, digest);
    for (const [ns, key] of entries) for (const ch of ns + SEP + key) digest = Math.imul(digest ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    const hex = digest.toString(16).padStart(8, '0'), names = pngs.map((_, i) => `art-${hex}-${i}.png`);
    const rect = im => im.at, ns = {};
    for (const [n, key, spec] of entries) {
      (ns[n] || (ns[n] = {}))[key] = spec.img ? rect(spec.img) : { o: Object.fromEntries(Object.entries(spec.o).map(([p, im]) => [p, rect(im)])), s: spec.s };
    }
    const stats = { entries: entries.length, unique: unique.length, skipped, counts, atlases: pngs.length, pixels: unique.reduce((a, im) => a + im.w * im.h, 0) };
    return { index: { v: 1, digest: hex, atlases: names, ns }, pngs, stats };
  }

  /* ---- checking a finished pack ---- */
  /** With the pack loaded: paint everything fresh and compare each picture with the pack's. */
  function verify() {
    const { made } = paintAll();
    let missing = 0, checked = 0, different = 0, maxDiff = 0, wrongSize = 0;
    const pix = c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const compare = (a, b) => {
      if (a.width !== b.width || a.height !== b.height) { wrongSize++; return; }
      const da = pix(a), db = pix(b); let bad = false;
      for (let i = 0; i < da.length; i++) { const d = Math.abs(da[i] - db[i]); if (d) { bad = true; if (d > maxDiff) maxDiff = d; } }
      if (bad) different++;
    };
    for (const [nk, value] of made) {
      const [ns, key] = nk.split(SEP), packed = ArtPack.lookup(ns, key);
      if (packed === undefined) { missing++; continue; }
      checked++;
      if (isCanvas(value)) compare(value, packed);
      else for (const [p, v] of Object.entries(value)) { if (isCanvas(v)) compare(v, packed[p]); else if (v !== packed[p]) different++; }
    }
    return { painted: made.size, checked, missing, different, wrongSize, maxDiff };
  }

  return { paintAll, exportPack, verify, sweeps };
})();
