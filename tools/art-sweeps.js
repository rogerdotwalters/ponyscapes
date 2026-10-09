/* Runs INSIDE the game page (injected by tools/export-art.js): paints every picture the art pack holds, packs them into atlases, and checks a
 * finished pack against what the painters make. The game's own painters do all the drawing, so the pack can never disagree with the code that
 * made it; the sweeps only decide WHICH pictures to ask for. When a painter gains a new variant that nothing here asks for, the game paints it
 * live as before (add it to the sweep, re-export, and it ships in the pack). */
window.__art = (() => {
  const ATLAS = 2048, GAP = 1;
  /** Which pony biome effects have their frames in the pack (null: the plain meadow pony). Each effect adds about 2.5 MB of decoded pictures in memory
   *  (see ArtPack.stats.atlasMB), so the animated ones, with 4-8 frames each, are painted live. */
  const PONY_FX = [null, 'leaves', 'bubbles', 'dust', 'crown', 'crystals', 'sprinkles', 'rainbow'];     // (not the animated flames / frost / stars: 20 frames each, for the rarest ponies)
  /** Every kind of clothing the wardrobe has, by slot (and body): the shapes of a character depend on these styles, never on their colours. */
  function wardrobeStyles(slot, body) {
    const styles = new Set(slot === 'outfit' ? ['plain'] : []);
    for (const e of WardrobeItems.all()) if (e.slot === slot && (!body || !e.body || e.body === 'any' || e.body === body) && e.look && e.look.style) styles.add(e.look.style);
    return [...styles];
  }
  const BODIES = [{ prince: true, name: 'prince', kinds: CharacterPalette.hairKinds.prince }, { prince: false, name: 'princess', kinds: CharacterPalette.hairKinds.princess }];
  const SEP = ArtPack.SEP;

  /* ---- what to paint ---- */
  const sweeps = {
    /** The ground: every cell set at all six variants (TerrainRenderer.cellSets also lists the four seasons of meadow grass, soil, curbs...). */
    terrain() {
      for (const { kind, pal, season, wet } of TerrainRenderer.cellSets()) for (let v = 0; v < 6; v++) PixelTerrain.cell(kind, pal, v, season, wet);
    },
    /** Every walk and idle frame of every pixel creature, as the game asks for them (AnimalSprite), and the stag / shorn variants. */
    creatures() {
      const g = document.createElement('canvas').getContext('2d');
      for (const def of Object.values(AnimalDefs)) {
        const kind = def.sprite && def.sprite.kind;
        if (def.pony || !kind || !PixelCreatures.has(kind)) continue;
        const spec = Object.assign({ kind: 'sheep' }, def.sprite);
        const extras = kind === 'deer' ? ['', 'stag'] : kind === 'sheep' ? ['', 'shorn'] : [''];
        for (const extra of extras) for (const hunting of [false]) for (let now = 0; now < 4800; now += 30) {      // (hunting: red eyes, only while chasing: painted live)
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
    /** Ponies: the SHAPES of every frame as marker-coloured layers (see SlotArt in artPack.js): the colours are applied when a pony is built. */
    ponies() {
      for (const st of PixelPony.pack.states(PONY_FX)) {
        const { key, layers } = PixelPony.pack.layersOf(st);
        for (const [name, canvas] of Object.entries(layers)) { checkLayer(canvas, PixelPony.pack.SLOTS.length); ArtPack.record('pony', key + '|' + name, canvas); }
      }
    },
    /** Characters: the shapes of every frame as marker-coloured layers: body (by outfit style), hair (by hair style), head, cape and crown (by style). */
    characters() {
      const PC = PixelCharacter.pack, put = layers => { for (const [key, canvas] of Object.entries(layers)) { checkLayer(canvas, PC.SLOTS.length); ArtPack.record('char', key, canvas); } };
      const each = fn => { for (const view of ['down', 'up', 'left']) for (const pose of Object.keys(PC.POSES)) for (const blink of pose[0] === 'i' ? [0, 1] : [0]) fn(view, pose, blink); };
      for (const b of BODIES) for (const style of wardrobeStyles('outfit', b.name)) for (const hairKind of b.kinds)
        each((view, pose, blink) => put(PC.layersOf({ prince: b.prince, style, hairKind, crown: null, cape: null }, view, pose, blink, ['body', 'armL', 'armR', 'armS', 'hairB', 'hairF', 'head'])));
      for (const cape of wardrobeStyles('cape')) each((view, pose, blink) => put(PC.layersOf({ prince: false, style: 'plain', hairKind: 'bob', crown: null, cape }, view, pose, blink, ['capeB', 'capeF', 'capeO'])));
      for (const crown of wardrobeStyles('crown')) each((view, pose, blink) => put(PC.layersOf({ prince: false, style: 'plain', hairKind: 'bob', crown, cape: null }, view, pose, blink, ['crown'])));
    },
    /** Every crop at every stage. */
    crops() {
      for (const crop of Crops.all()) for (const stage of [0, 1, 2, 3, 'dead']) PixelCrops.art(crop, stage);
    },
  };

  /** A saved layer may hold only empty pixels, opaque fixed colours and slot markers: anything else would not be recoloured exactly. */
  function checkLayer(canvas, slots) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] !== 0 && d[i + 3] !== 255) throw new Error('a layer has a translucent pixel');
      if (d[i + 3] === 255 && d[i + 1] === 254 && d[i + 2] === 254 && d[i] >= slots) throw new Error('a fixed colour looks like a marker: rgb(' + d[i] + ',254,254)');
    }
  }

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
    return { painted: made.size, checked, missing, different, wrongSize, maxDiff, ponies: verifyPonies(pix), chars: verifyChars() };
  }

  /** Largest channel difference between two same-size canvases (0: identical). */
  function maxDiffOf(a, b) {
    if (a.width !== b.width || a.height !== b.height) return 999;
    const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data, db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let m = 0; for (let i = 0; i < da.length; i++) { const d = Math.abs(da[i] - db[i]); if (d > m) m = d; }
    return m;
  }
  /** Characters built from the pack must equal characters painted live, for EVERY combination of body, outfit style, hair style, crown and cape (each in
   *  random colours, which is also what proves a layer depends on nothing but its key). */
  function verifyChars() {
    const PC = PixelCharacter.pack, P = CharacterPalette, rnd = (() => { let x = 12345; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
    const pick = a => a[Math.floor(rnd() * a.length)], color = () => '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
    const crowns = [null, ...wardrobeStyles('crown')], capes = [null, ...wardrobeStyles('cape')];
    const frames = [['down', 'w1', 0], ['down', 'w2', 0], ['up', 'w3', 0], ['left', 'w0', 0], ['left', 'w2', 0], ['down', 'i1', 1], ['down', 'i0', 0], ['up', 'i1', 0], ['left', 'i0', 0]];
    let structures = 0, count = 0, fallback = 0, different = 0, maxDiff = 0;
    for (const b of BODIES) for (const style of wardrobeStyles('outfit', b.name)) for (const hairKind of b.kinds) for (const crown of crowns) for (const cape of capes) {
      structures++;
      const spec = { prince: b.prince, style, hairKind, crown, cape };
      const colours = { hair: pick(P.hairColors), skin: pick(P.skins), outfit: color(), trim: color(), crown: [color(), color()], cape: [color(), color()] };
      for (const [view, pose, blink] of frames) {
        const hurt = rnd() < 0.1, packed = PC.packed(spec, colours, view, pose, blink, hurt);
        if (!packed) { fallback++; continue; }
        const d = maxDiffOf(packed, PC.live(spec, colours, view, pose, blink, hurt)); count++;
        if (d) { different++; if (d > maxDiff) maxDiff = d; }
      }
    }
    return { structures, frames: count, paintedLive: fallback, different, maxDiff };
  }

  /** Ponies built from the pack must equal ponies painted live, pixel for pixel, for every coat / mane / cutie mark of every variety whose effect is packed. */
  function verifyPonies(pix) {
    const P = PonyPalette, pack = PixelPony.pack, wanted = {};
    for (const fx of PONY_FX) wanted[fx] = [...pack.states([fx])].filter(st => st.fxFrame % 3 === 0 && ((st.pose === 'T1' && !st.wings === !st.horn) || (st.pose === 'S2' && st.blink) || (st.flying && st.wf === 2 && !st.blink)));
    const varieties = [{ accessory: null, coats: P.coats, manes: P.manes, marks: P.marks }, ...PonyVariants.slice(1).filter(v => PONY_FX.includes(v.accessory))];
    let looks = 0, frames = 0, fallback = 0, different = 0, maxDiff = 0, live = 0, states = 0;
    for (const v of varieties) {
      const sts = wanted[v.accessory]; states += sts.length;
      for (const coat of v.coats) for (const mane of v.manes) for (const mark of v.marks) {
        looks++;
        const look = { coat, mane, mark, accessory: v.accessory };
        for (const st of sts) {
          if (st.nm !== (mane.length === 4 ? 4 : 3)) continue;
          const packed = pack.packed(look, st);
          if (!packed) { fallback++; continue; }
          const d = maxDiffOf(packed, pack.live(look, st)); frames++;
          if (d) { different++; if (d > maxDiff) maxDiff = d; }
        }
      }
    }
    return { looks, frames, wantedStates: states, paintedLive: fallback, different, maxDiff };
  }

  return { paintAll, exportPack, verify, verifyPonies, verifyChars, sweeps };
})();
