'use strict';
/* CLIENT - retro pixel-art ponies, in the same style as the pixel characters (pixelCharacter.js): painted pixel by pixel in the pony's own
 * coat, mane and cutie-mark colours (PonyLook), outlined, cached, and drawn scaled up with hard edges.
 * Views: 'right' (the profile; 'left' is its mirror), 'down' (walking towards the camera), 'up' (walking away).
 * Animations: a 4-frame trot tied to the distance walked; standing, the tail swishes, the ears flick and the eyes blink.
 * Every pony kind uses it: pegasi and alicorns get feathered wings (folded on the ground, beating in the air), unicorns and alicorns a spiral horn,
 * mystical ponies circling sparkles, and each biome variety its own effect (fire, frost, leaves, gem shards, stars, sprinkles, a flower crown,
 * bubbles, dust, a rainbow). A kind listed in PIXEL_PONIES_OFF keeps the older smooth drawing (AnimalSprite._pony). */
const PIXEL_PONIES_OFF = {};
const PixelPony = (() => {
  const W = 52, H = 50, TOP = 8, CX = 26, GROUND = 40, PX = 1.25;   // (TOP: rows above the ears for raised wings and horns)
  const { css, shade, light, mix, tones, outline } = PixelCharacter.util;
  const cache = new LruCache(2000);
  /* Building a picture (painting it pixel by pixel, a few ms) is capped per frame, so a crowd of ponies met for the first time (every one has its own
   * genes, so each is painted live) spreads that work over several frames instead of dropping one: beginFrame() resets the clock, setBudget(ms) sets the cap
   * (Infinity: build everything at once, for tools that draw a still frame). Only a game frame that called beginFrame() is capped: previews and tools that draw
   * ponies on their own build at once. A pony whose next picture is not built yet keeps its last one. */
  let budgetMs = 3, spent = 0, frameAt = -1e9;
  const lastShown = new LruCache(600);                                                              // look + view -> the picture last drawn: { key, canvas }
  const HOOF = { b: '#4a4148', l: '#7a6e74', d: '#2e282d' };

  /** A pony's colours, worked out once per look (they used to be recomputed for every pony, every frame). A copy is returned: draw() sets
   *  the frame's own fields (wings, flame frame...) on it. */
  const palettes = new LruCache(500);
  const CLASSIC = PonyGenes.phenotype([0, 0, 0, 0, 0, 0, 0]);                                    // (the genes of a plain pony: the art pack's own ponies have none)
  const geneKey = (g = CLASSIC) => g.key + (g.tailLinked ? '' : '|' + g.tailMane.join());
  function palette(look) {
    const key = `${look.coat}|${look.mane.join()}|${look.mark}|${look.accessory}|${geneKey(look.gene)}`;
    let p = palettes.get(key);
    if (!p) { p = makePalette(look); palettes.set(key, p); }
    return Object.assign({}, p);
  }
  /** Every colour a pony is drawn in. The painting code below only ever uses entries of this (never works a colour out itself): that is what lets
   *  the art pack save the shapes once and colour them per pony (SlotArt, SLOTS). */
  function makePalette(look) {
    const coat = look.coat, m = look.mane, G = look.gene || CLASSIC, mkManes = a => (a.length >= 3 ? a : [a[0], a[1] || light(a[0], 0.3), light(a[1] || a[0], 0.45)]).map(tones);
    // hair colours by pattern (ponyGenes.js): striped is the variety's own list (padded to three tones), solid is ONE colour, multicolor is four or more painted in patches
    const hair = (list, pattern) => { if (pattern === 1) return [tones(list[0])]; const set = mkManes(list); if (pattern === 2) set.patch = true; return set; };
    const manes = hair(look.gene ? G.maneColors : m, G.manePattern | 0);          // (a look without genes, such as the art pack's own, has just its mane)                                                 // (a rainbow mane has four)
    const C = {
      coat: tones(coat), muzzle: tones(mix(coat, '#f1dcc0', 0.45)), feather: tones(mix(coat, '#f6ead2', 0.6)),
      ear: mix(coat, '#e98fa6', 0.5), eye: '#2a1810', iris: G.eyeColor || mix(m[0], '#4a2a18', 0.55),
      tailManes: G.tailLinked ? manes : hair(G.tailMane, G.tailPattern | 0),                                  // the tail's own colours when the tail does not have to match the mane (the genes: ponyGenes.js)
      sh: { eye: G.eyeShape, mane: G.maneShape, tail: G.tailShape, body: G.bodyShape, hoof: G.hoofShape, head: G.headShape, mpat: G.manePattern | 0, tpat: G.tailLinked ? G.manePattern | 0 : G.tailPattern | 0 },
      manes, mark: look.mark, markColor: m[0], markColor2: m[1] || m[0], outline: '#24170f',
      fx: look.accessory, ff: 0, tw: 0,                                                    // the biome effect, and its flame / twinkle frame
      hoof: G.hoofColor ? tones(G.hoofColor) : look.accessory === 'flames' ? EMBER_HOOF : look.accessory === 'frost' ? ICE_HOOF : HOOF,
      ...(look.accessory === 'flames' ? { feather: tones(mix(coat, '#ff7043', 0.45)) } : look.accessory === 'frost' ? { feather: tones('#f2faff') } : {}),
    };
    C.coatFar = { b: C.coat.d, d: shade(C.coat.d, 0.85), l: C.coat.b };                       // the far side's legs, and the back of the head: darker
    C.featherFar = { b: C.feather.d, d: shade(C.feather.d, 0.85), l: C.feather.b };
    C.wing = tones(mix(coat, '#ffffff', 0.35));
    C.wingFar = { b: shade(C.wing.b, 0.78), l: C.wing.b, d: shade(C.wing.d, 0.8) };
    C.wingEdge = shade(C.coat.b, 0.55); C.wingEdgeFar = shade(C.coat.b, 0.45);                // the dark line round a wing
    C.nostril = shade(C.muzzle.b, 0.4);
    // The painters compare colours in two places (a coat's fur texture: `c === t.b`; a wing's edge: `tip.has(c)`). If such colours coincide
    // (a pure white coat; a mane colour equal to a wing's), a picture built from marker colours would differ, so those ponies are painted live.
    const same = (t) => t.l === t.b || t.d === t.b;
    // The art pack holds the CLASSIC shapes and one set of mane colours: a pony with a gene-made shape, or a tail of its own colour, is painted live.
    C.liveOnly = Object.values(C.sh).some(v => v) || C.tailManes !== C.manes || same(C.coat) || same(C.coatFar) || same(C.feather) || same(C.muzzle)
      || [C.manes[0].b, C.manes[0].d].some(tip => [C.wing.b, C.wing.l, C.wing.d, C.wingFar.b, C.wingFar.l, C.wingFar.d].includes(tip));
    return C;
  }
  /** The palette entries that have a slot in a saved picture, in slot order (see SlotArt). Four manes at most (a rainbow's). */
  const SLOTS = [];
  for (const t of ['coat', 'muzzle', 'feather', 'coatFar', 'featherFar', 'wing', 'wingFar', 'hoof']) for (const k of ['b', 'l', 'd']) SLOTS.push(t + '.' + k);
  for (let i = 0; i < 4; i++) for (const k of ['b', 'l', 'd']) SLOTS.push('manes.' + i + '.' + k);
  SLOTS.push('ear', 'iris', 'markColor', 'wingEdge', 'wingEdgeFar', 'nostril', 'eye');

  /* ---- EMBER and FROST ponies: fire for a mane, ice at the tips ---- */
  const EMBER_HOOF = { b: '#5a2a1a', l: '#ff9100', d: '#3a1a10' }, ICE_HOOF = { b: '#7f9fb8', l: '#d9f1ff', d: '#4e6a80' };
  const FIRE = ['#a01818', '#ff3d00', '#ff9100', '#ffd740', '#fff3a0'];
  const ICE = { white: '#f4fcff', pale: '#d9f1ff', blue: '#a8dcff', sparkle: '#6cc4ff' };
  /** A flame pixel: hottest (pale yellow) at the middle of a lock, red at its edges, flickering with the flame frame. */
  function fire(C, i, y, w) {
    const mid = (w - 1) / 2, heat = 1 - Math.abs(i - mid) / (w / 2 + 0.5) + ((((i * 7 + y * 13 + C.ff * 5) % 5) + 5) % 5 - 2) * 0.12;
    return FIRE[Math.max(0, Math.min(4, Math.floor(heat * 4.6)))];
  }
  /** Little flames licking up and out from the edge of a fiery mane or tail. */
  function tongue(P, C, x, y, dir) {
    if ((y + C.ff) % 3) return;
    P.px(x + dir, y, FIRE[2]); P.px(x + dir * 2, y - 1, FIRE[1]); if ((y + C.ff) % 2) P.px(x + dir * 2, y - 2, FIRE[0]);
  }

  /** `cap`: null to paint into `ctx`; or a function (layer name) -> a 2D context, to paint each LAYER of the picture onto a canvas of its own (the
   *  art pack's export: see layers in side(), and SlotArt). In capture mode the cutie mark is left out: it is laid on by the game. */
  function painter(ctx, cap) {
    let ox = 0, oy = 0;
    const P = {
      cap: !!cap,
      /** Paint what `fn` draws onto layer `name` (capture mode), or just run it (painting live, in order, onto one canvas). */
      layer(name, fn) { if (!cap) { fn(); return; } const prev = ctx; ctx = cap(name); fn(); ctx = prev; },
      at(dx, dy, fn) { const sx = ox, sy = oy; ox += dx; oy += dy; fn(); ox = sx; oy = sy; },
      px(x, y, c) { if (c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x) + ox, Math.round(y) + oy, 1, 1); } },
      rect(x, y, w, h, c) { if (c && w > 0 && h > 0) { ctx.fillStyle = c; ctx.fillRect(Math.round(x) + ox, Math.round(y) + oy, w, h); } },
      row(y, x0, x1, c) { P.rect(x0, y, Math.round(x1) - Math.round(x0) + 1, 1, c); },
      /** A filled ellipse of coat: lighter on top, darker underneath, with a little fur texture. */
      blob(cx, cy, rx, ry, t, texture = true) {
        for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
          const ny = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
          for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
            let c = ny < -0.5 ? t.l : ny > 0.45 ? t.d : t.b;
            if (texture && c === t.b && (x * 3 + y * 5) % 13 === 0) c = t.d;
            P.px(x, y, c);
          }
        }
      },
      /** Several ellipses merged into ONE shape and shaded as one: lit along its top edge, shadowed along the bottom. Returns its pixels. */
      shape(parts, t, texture = true) {
        const cols = {}, pts = [];
        for (const [cx, cy, rx, ry] of parts) for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
          const ny = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
          for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) { const c = cols[x] || (cols[x] = new Set()); if (!c.has(y)) { c.add(y); pts.push([x, y]); } }
        }
        const span = {}; for (const x in cols) { const ys = [...cols[x]]; span[x] = [Math.min(...ys), Math.max(...ys)]; }
        for (const [x, y] of pts) {
          const [top, bot] = span[x];
          let c = y - top < 2 ? t.l : bot - y < 2 ? t.d : t.b;
          if (texture && c === t.b && (x * 3 + y * 5) % 13 === 0) c = t.d;
          P.px(x, y, c);
        }
        return { has: (x, y) => !!(cols[x] && cols[x].has(y)) };
      },
    };
    return P;
  }

  /* ---- frames: hoof offsets [dx, lift] for each leg pair, the bob, and the sway of mane and tail ---- */
  // A: near front + far hind; B: far front + near hind (a trot moves the diagonals together)
  const TROT = [
    { A: [2, 0], B: [-2, 0], bob: 0, sway: 1 },                         // (a planted hoof slides BACK under the body, and a lifted one swings FORWARD:
    { A: [0, 0], B: [0, 2], bob: -1, sway: 0 },                         //  A lands forward, passes under, pushes off behind, lifts and swings forward again)
    { A: [-2, 0], B: [2, 0], bob: 0, sway: -1 },
    { A: [0, 2], B: [0, 0], bob: -1, sway: 0 },
  ];
  const STAND = [
    { A: [0, 0], B: [0, 0], bob: 0, sway: 0 },
    { A: [0, 0], B: [0, 0], bob: 0, sway: 1, ear: 1 },
    { A: [0, 0], B: [0, 0], bob: -1, sway: 2 },
    { A: [0, 0], B: [0, 0], bob: 0, sway: 1 },
  ];

  /** Mane and tail locks: 2-pixel-wide locks of each mane colour that wave as they fall, each with a dark edge and a shine. */
  const lock = (C, i, y, w = 4, set = C.manes) => {
    if (C.fx === 'flames') return fire(C, i, y, w);
    if (C.fx === 'frost' && y % 5 === 0 && (i & 1) === 0) return ICE.white;                 // frost glinting in the hair
    const off = Math.round(Math.sin(y / 3 + i * 0.4)), band = set.patch ? Math.floor((y + i * 2 + 40) / 3) : Math.floor((i + off + 8) / 2), t = set[band % set.length], within = (i + off + 8) % 2;
    return within === 1 && y % 3 === 0 ? t.d : within === 0 && y % 4 === 1 ? t.l : t.b;
  };

  /** A leg from (x, top) down to the hoof: shin, a shaggy fetlock and a dark hoof. far: the far side's legs are shaded darker. */
  function leg(P, C, x, top, [dx, lift], far, thick = 4) {
    const coat = far ? C.coatFar : C.coat, feather = far ? C.featherFar : C.feather;
    const shape = C.sh.hoof, hoofY = GROUND - 2 - lift, fet = hoofY - (shape === 1 ? 5 : 3);               // (hoof shapes, ponyGenes.js: 0 round, 1 feathered, 2 shod, 3 sleek)
    for (let y = top; y < fet; y++) { const t = (y - top) / Math.max(1, fet - top), xx = x + Math.round(dx * t); P.rect(xx, y, thick, 1, coat.b); P.px(xx + thick - 1, y, coat.d); if (y === top + 3) P.px(xx, y, coat.d); }
    if (shape === 3) for (let y = fet; y < hoofY; y++) { P.rect(x + dx, y, thick, 1, coat.b); P.px(x + dx + thick - 1, y, coat.d); }   // a clean, smooth fetlock
    else for (let y = fet; y < hoofY; y++) { P.rect(x + dx - 1, y, thick + 1, 1, feather.b); P.px(x + dx - 1, y, feather.l); P.px(x + dx + thick - 1, y, feather.d); }
    if (shape !== 3) { P.px(x + dx - 2, hoofY - 1, feather.d); P.px(x + dx + thick, hoofY - 1, feather.d); }       // tufts over the hoof
    if (shape === 1) { P.px(x + dx - 2, hoofY - 2, feather.b); P.px(x + dx + thick, hoofY - 2, feather.b); P.px(x + dx - 2, hoofY - 3, feather.d); P.px(x + dx + thick, hoofY - 3, feather.d); }   // long feathers
    const hoof = C.hoof;
    P.rect(x + dx - 1, hoofY, thick + 1, 1, far ? hoof.b : hoof.l); P.rect(x + dx - 1, hoofY + 1, thick + 1, 2, far ? hoof.d : hoof.b);
    if (shape === 2) P.rect(x + dx - 1, hoofY + 2, thick + 1, 1, far ? '#7f8793' : '#d3d9e2');                        // a horseshoe
  }

  /** The cutie mark: a tiny 5x5 picture. */
  const MARKS = {
    star:   ['..#..', '.###.', '#####', '.###.', '.#.#.'],
    heart:  ['.#.#.', '#####', '#####', '.###.', '..#..'],
    flower: ['.#.#.', '##o##', '.#o#.', '##o##', '.#.#.'],
    moon:   ['.###.', '##...', '##...', '##...', '.###.'],
    cloud:  ['.....', '.##..', '#####', '#####', '.....'],
    apple:  ['...o.', '.##o.', '#####', '#####', '.###.'],
    drop:   ['..#..', '.###.', '#####', '#####', '.###.'],
    note:   ['..##.', '..#.#', '..#..', '###..', '##...'],
    snow:   ['#.#.#', '.###.', '##o##', '.###.', '#.#.#'],
    flame:  ['..#..', '.##..', '.###.', '##o##', '.###.'],
    sun:    ['#.#.#', '.###.', '##o##', '.###.', '#.#.#'],
    gem:    ['.###.', '#####', '.###.', '..#..', '.....'],
    leaf:   ['...##', '..###', '.###.', '###..', '#....'],
  };
  function mark(P, C, x, y) {
    const rows = MARKS[C.mark] || MARKS.note;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') P.px(x + i, y + j, C.markColor); else if (ch === 'o') P.px(x + i, y + j, C.mark === 'apple' ? '#4f8a3a' : C.mark === 'snow' ? '#ffffff' : '#fff3b0'); }));
  }

  /* ---- WINGS: a leading edge from the root, feathers hanging off it in scallops, tipped in the mane colour ---- */
  const WING_BEAT = [1.15, 0.55, 0.0, -0.45];                                                // the flap, frame by frame (radians above level)
  /** sgn -1: the wing points left (backwards in the profile). out: which way the feathers hang ([x, y]); by default, downwards. */
  function wing(P, C, rx, ry, a, L, depth, sgn, far, out, curve = 3) {
    const dx = sgn * Math.cos(a), dy = -Math.sin(a);
    let [qx, qy] = out || [-dy, dx];
    if (!out && qy < 0) { qx = -qx; qy = -qy; }
    const f = far ? C.wingFar : C.wing, tipT = far ? C.manes[0].d : C.manes[0].b;
    const steps = Math.ceil(L * 1.6), pix = new Map();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, lx = rx + dx * L * t - qx * curve * t * t, ly = ry + dy * L * t - qy * curve * t * t, feather = Math.floor(t * 5);   // (the leading edge arcs up towards the tip)
      const d = Math.max(1, Math.round(depth * (1 - t * 0.5)) - (s % 5 > 2 ? 1 : 0));                // scalloped feather ends
      for (let k = 0; k <= d; k++) {
        const c = k === 0 ? f.l : k >= d ? tipT : (s % 5 === 0 ? f.d : feather % 2 ? f.b : f.l);
        pix.set(Math.round(lx + qx * k) + ',' + Math.round(ly + qy * k), c);
      }
    }
    const edge = far ? C.wingEdgeFar : C.wingEdge, tip = new Set([tipT]);                       // its own dark line round the edge, so it stands out on the coat
    for (const [k, c] of pix) {
      const [x, y] = k.split(',').map(Number), open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([u, v]) => !pix.has((x + u) + ',' + (y + v)));
      P.px(x, y, open && !tip.has(c) ? edge : c);
    }
  }
  /** The wings for a view: folded along the side on the ground, beating in the air. far: the wing behind the body (side view). */
  function wings(P, C, view, layer) {
    const fly = C.flying, a = fly ? WING_BEAT[C.wf] : null;
    if (view === 'right') {
      if (layer === 'far') { if (fly) wing(P, C, 27, 16, a * 0.8 + 0.25, 15, 6, -1, true); return; }
      if (fly) wing(P, C, 25, 18, a * 0.8, 17, 7, -1, false);                                    // rooted over the barrel, behind the mane
      else wing(P, C, 31, 18, -0.22 + (C.ruffle ? 0.08 : 0), 16, 6, -1, false, null, 1.5);      // folded along the side
    } else {
      const back = view === 'up';
      for (const sgn of [-1, 1]) {
        const rx = CX + sgn * (back ? 5 : 8), ry = back ? 20 : 21;
        if (fly) wing(P, C, rx, ry, a, 17, 6, sgn, false);
        else wing(P, C, rx, ry, -1.3, back ? 7 : 8, 2, sgn, false, [sgn, 0], 0);           // folded: a feathered edge down each side
      }
    }
  }

  /* ---- HORN: a spiral horn of gold (or a gem, on a crystal pony) ---- */
  function horn(P, C, x0, y0, x1, y1) {
    const g = C.fx === 'crystals' ? { b: '#bff3ff', l: '#ffffff', d: '#5fc4e0' } : { b: '#f6d56f', l: '#fff2a8', d: '#b8902a' };
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2;
    for (let s = 0; s <= n; s++) {
      const t = s / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, w = t < 0.35 ? 3 : t < 0.75 ? 2 : 1;
      for (let k = 0; k < w; k++) P.px(x - (w >> 1) + k, y, k === 0 ? g.l : Math.round(y) % 2 ? g.d : g.b);
    }
  }

  /* ---- BIOME EFFECTS painted into the sprite ---- */
  const SPRINKLES = ['#ff4081', '#ffeb3b', '#40c4ff', '#69f0ae', '#ffffff', '#b388ff'];
  const SPOTS = {                                                                              // places on the coat for stars, sprinkles and twinkles
    right: [[14, 20], [22, 19], [29, 23], [18, 26], [25, 27], [33, 21], [11, 24], [20, 23], [27, 20], [16, 28]],
    down: [[21, 24], [30, 25], [26, 28], [19, 27], [33, 27], [24, 25], [28, 29], [22, 30]],
    up: [[20, 23], [31, 24], [26, 29], [22, 26], [30, 28], [18, 27], [34, 27], [24, 21]],
  };
  const leaf = (P, x, y) => { P.px(x, y, '#3f8a3c'); P.px(x + 1, y, '#5fae4e'); P.px(x + 1, y - 1, '#5fae4e'); P.px(x + 2, y - 1, '#8fd16a'); P.px(x, y + 1, '#2f6a2c'); };
  const flower = (P, x, y, c) => { for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) P.px(x + dx, y + dy, c); P.px(x, y, '#f9a825'); };
  function shard(P, x, base, h, c) { for (let k = 0; k < h; k++) { P.px(x, base - k, k === h - 1 ? '#ffffff' : c); if (k < h - 2) { P.px(x - 1, base - k, shade(c, 0.8)); P.px(x + 1, base - k, c); } } }
  function bodyFx(P, C, view) {
    const spots = SPOTS[view], fx = C.fx;
    if (fx === 'leaves') {                                                                     // moss on the back, a few leaves
      const [x0, x1, y] = view === 'right' ? [14, 30, 17] : view === 'up' ? [19, 33, 18] : [20, 32, 19];
      for (let x = x0; x <= x1; x++) { P.px(x, y, (x * 5) % 3 ? '#4f8a3a' : '#6fae4e'); if (x % 3 === 0) P.px(x, y - 1, '#3f7a3c'); }
      for (const x of view === 'right' ? [17, 25] : [x0 + 2, x1 - 4]) leaf(P, x, y - 1);
    } else if (fx === 'crystals') {                                                            // gem shards growing along the back
      const xs = view === 'right' ? [15, 19, 23, 27] : view === 'up' ? [19, 23, 27, 31] : [18, 34], base = view === 'right' ? 18 : 19;
      xs.forEach((x, i) => shard(P, x, base, [5, 7, 6, 5][i % 4], i % 2 ? '#c7a8ff' : '#8ef0ff'));
    } else if (fx === 'stars') {                                                               // a coat dusted with stars, some twinkling
      spots.forEach(([x, y], i) => P.px(x, y, i % 3 ? '#ffffff' : '#fff5b0'));
      const [x, y] = spots[C.tw % spots.length]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.px(x + dx, y + dy, '#fff5b0');
    } else if (fx === 'sprinkles') {                                                           // candy sprinkles
      spots.forEach(([x, y], i) => { const c = SPRINKLES[i % SPRINKLES.length]; P.px(x, y, c); P.px(x + (i % 2), y + ((i + 1) % 2), c); });
    }
  }
  function headFx(P, C, view) {
    if (C.fx === 'crown') {                                                                    // a crown of flowers between the ears
      const cols = ['#ff7eb6', '#ffffff', '#ff9ec7', '#ffd54f', '#ffffff'];
      const at = view === 'right' ? [[33, 2], [36, 0], [39, 0], [42, 2]] : view === 'down' ? [[20, 2], [23, 0], [26, -1], [29, 0], [32, 2]] : [[21, 3], [26, 1], [31, 3]];
      at.forEach(([x, y], i) => flower(P, x, y, cols[i % cols.length]));
    } else if (C.fx === 'leaves') {
      if (view === 'right') leaf(P, 36, 0); else leaf(P, view === 'down' ? 28 : 25, 1);
    }
  }

  /* =====================================================================================================================
   * SIDE VIEW (facing right)
   * ===================================================================================================================== */
  /** Body shapes (ponyGenes.js: 0 standard, 1 stocky, 2 slender): the ellipses of the barrel, rump and chest in the side view, and the chest and rump in the front and back views. */
  const BODIES = [
    { side: [[23, 24, 12.5, 7], [13, 23, 6.5, 7], [32, 24, 5, 7]], belly: 31, chest: [CX, 26, 9.5, 7], rump: [CX, 26, 10.5, 8] },
    { side: [[23, 24, 13, 7.6], [13, 23, 7, 7.6], [32, 24, 5.4, 7.6]], belly: 31, chest: [CX, 26, 10.6, 7.6], rump: [CX, 26, 11.6, 8.6] },
    { side: [[23, 24, 12, 6], [13, 23, 6, 6], [32, 24, 4.6, 6.2]], belly: 30, chest: [CX, 26, 8.4, 6.3], rump: [CX, 26, 9.4, 7.2] }];
  function side(P, C, F, blink) {
    const b = F.bob, B = BODIES[C.sh.body];
    if (C.wings) P.at(0, b, () => wings(P, C, 'right', 'far'));
    leg(P, C, 29, 28, F.B, true, 3); leg(P, C, 16, 28, F.A, true, 3);                    // far legs, behind the body
    P.at(0, b, () => {
      tailSide(P, C, F);
      P.shape(B.side, C.coat);                                                             // the barrel, the rump and the chest
      for (let x = 15; x < 31; x++) if ((x * 7) % 5 === 0) P.px(x, B.belly, C.coat.d);     // a shaggy belly
      if (!P.cap) mark(P, C, 11, 21);                                                      // (the layers below it are layer B: see PixelPony.pack)
      P.layer('B', () => {
        bodyFx(P, C, 'right');
        for (let y = 9; y <= 24; y++) { const t = (y - 9) / 15, xl = Math.round(33 - t * 6), xr = Math.round(41 - t * 4); P.row(y, xl, xr, C.coat.b); P.px(xr, y, C.coat.d); P.px(xr - 1, y, t > 0.3 ? C.coat.b : C.coat.d); }   // the neck
      });
    });
    P.layer('B', () => {
    leg(P, C, 31, 28, F.A, false); leg(P, C, 11, 28, F.B, false);                         // near legs, in front
    P.at(0, b, () => {
      for (let y = 25; y <= 31; y++) P.px(16 - Math.round(Math.abs(y - 27.5) * 0.4), y, C.coat.d);   // the line of the near thigh
      if (C.fx === 'frost') for (const [x, len] of [[19, 3], [22, 2], [25, 3], [28, 2]]) for (let k = 0; k < len; k++) P.px(x, B.belly + k, k ? ICE.blue : ICE.white);   // icicles under the belly
      maneSide(P, C, F);
      headSide(P, C, F, blink);
      if (C.horn) horn(P, C, 40, 2, 44, -7);
      headFx(P, C, 'right');
      if (C.wings) wings(P, C, 'right', 'near');
    });
    });
  }

  /** Tail shapes (ponyGenes.js): how far it hangs and how wide it is, in the side and the back view. */
  const TAILS = [{ len: 20, wide: 0 }, { len: 12, wide: 0 }, { len: 17, wide: 2 }, { len: 21, wide: -2 }];       // long, short, bushy, sleek
  function tailSide(P, C, F) {
    const T = TAILS[C.sh.tail];
    for (let y = 18; y <= 18 + T.len; y++) {
      const k = (y - 18) / T.len, cx = 9 - Math.round(k * 4) + Math.round(Math.sin(y / 3.5)) + (y > 24 ? F.sway : 0), w = Math.max(1, Math.round(3 + T.wide + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 4 - (k > 0.9 ? 2 : 0)));
      for (let i = 0; i < w; i++) P.px(cx - i + 1, y, C.fx === 'frost' && y > 34 ? (i % 2 ? ICE.blue : ICE.pale) : lock(C, i, y, w, C.tailManes));
      if (C.fx === 'flames') { tongue(P, C, cx - w + 1, y, -1); tongue(P, C, cx + 1, y + 1, 1); }
    }
    for (let y = 17; y <= 21; y++) P.rect(8, y, 4, 1, lock(C, y, y, 4, C.tailManes));       // where it springs from the rump
  }

  /** Mane shapes (ponyGenes.js): where it ends in the side, front and back view, how much wider or narrower it is, and whether it tapers or stands in spikes. */
  const MANES = [{ end: [28, 28, 22], wide: 0 }, { end: [17, 16, 14], wide: -1, taper: 1 }, { end: [31, 31, 25], wide: 1, taper: 1 }, { end: [26, 27, 20], wide: 0, spiky: 1 }];   // wavy, cropped, flowing, spiky
  /** The width of a lock of mane at a row: its natural width, shaped by the mane's gene. */
  const maneWidth = (M, y, w, end) => Math.max(2, Math.min(w + (y > 4 ? M.wide : 0) - (M.spiky && y % 3 === 0 ? 2 : 0), M.taper ? end - y + 3 : 99));
  function maneSide(P, C, F) {
    const M = MANES[C.sh.mane], end = M.end[0];
    for (let y = 2; y <= end; y++) {                                                      // a big, wavy mane down the neck and over the shoulder
      const t = Math.max(0, (y - 9) / 15), edge = y < 9 ? 33 : Math.round(33 - t * 6), wave = Math.round(Math.sin(y / 2.6)), w = maneWidth(M, y, y < 4 ? 4 : y > 24 ? 4 + (28 - y) % 2 : 7, end);
      const sx = y > 18 ? F.sway : 0;
      for (let i = 0; i < w; i++) P.px(edge - 4 + i + wave + sx, y, C.fx === 'frost' && y > 25 ? (i % 2 ? ICE.blue : ICE.pale) : lock(C, i, y, w));
      if (C.fx === 'flames') tongue(P, C, edge - 4 + wave + sx, y, -1);
    }
    if (C.fx === 'flames') for (let x = 30; x <= 35; x += 2) { P.px(x, 1, FIRE[1]); if ((x + C.ff) % 3) P.px(x, 0, FIRE[0]); }   // flames along the crest
    if (!M.taper) for (const [x, y] of [[26, 29], [28, 30], [30, 29]]) P.px(x + F.sway, y + end - 28, lock(C, x, y));   // stray ends
  }

  /** Head and snout shapes (ponyGenes.js: 0 classic, 1 long, 2 button, 3 roman, 4 dished, 5 broad, 6 pointed). Side view: the nose blob, the muzzle ellipse [cx, cy, rx, ry], the nostril [x, x, y] and the mouth [y, x0, x1].
   *  Front view: the chin blob, the muzzle [cy, rx, ry], the nostril row and the mouth row. */
  const HEADS = [
    { nose: [46, 14, 4, 3.5], mz: [46, 14, 4.3, 3.6], nos: [48, 49, 13], mouth: [17, 45, 48], chin: [CX, 17.5, 5, 4], fmz: [18, 5, 3.6], fnos: 19, fmouth: 21 },
    { nose: [46, 15, 4, 4.4], mz: [46, 15, 4.3, 4.3], nos: [48, 49, 14], mouth: [19, 45, 48], chin: [CX, 18.8, 4.8, 4.8], fmz: [19.2, 4.6, 4], fnos: 20, fmouth: 23 },
    { nose: [45, 13.5, 3.4, 3], mz: [45, 13.5, 3.6, 3.1], nos: [47, 48, 13], mouth: [16, 44, 47], chin: [CX, 16.5, 5.4, 3.4], fmz: [17, 4.6, 3], fnos: 18, fmouth: 20 },
    { nose: [46, 14, 4, 3.5], mz: [46, 14, 4.3, 3.6], nos: [48, 49, 13], mouth: [17, 45, 48], bump: [[44, 10.5, 3.4, 2.6]], chin: [CX, 17.5, 5, 4], fmz: [18, 5, 3.6], fnos: 19, fmouth: 21 },    // roman: a raised bridge
    { nose: [46, 13, 3.6, 3.2], mz: [46, 13.2, 3.9, 3.2], nos: [48, 49, 12], mouth: [16, 45, 48], chin: [CX, 17.2, 5, 3.7], fmz: [17.6, 4.8, 3.2], fnos: 18, fmouth: 20 },                       // dished: short, a little upturned
    { nose: [45.5, 14.5, 4.5, 4], mz: [45.5, 14.5, 4.8, 3.9], nos: [47, 49, 14], mouth: [18, 44, 49], chin: [CX, 18, 5.8, 4.2], fmz: [18.4, 5.6, 3.8], fnos: 19, fmouth: 22 },                    // broad: a wide, deep muzzle
    { nose: [47, 14, 3.5, 2.6], mz: [47, 14, 3.5, 2.7], nos: [49, 50, 13], mouth: [16, 46, 49], chin: [CX, 17.5, 4, 4.2], fmz: [18, 3.6, 3.6], fnos: 19, fmouth: 21 }];                            // pointed: a slim, fine nose
  /** The eye in the side view (shapes: 0 round, 1 almond, 2 sleepy, 3 big, 4 starry). Every shape blinks the same way. */
  function eyeSide(P, C, blink) {
    const e = C.eye, i = C.iris, w = '#ffffff';
    if (blink) { P.row(9, 40, 42, e); P.px(43, 8, e); return; }
    switch (C.sh.eye) {
      case 1: P.rect(40, 8, 3, 3, e); P.px(40, 8, w); P.px(41, 10, i); P.px(42, 10, i); P.row(7, 40, 43, e); P.px(44, 6, e); break;
      case 2: P.row(8, 40, 43, C.coat.d); P.rect(40, 9, 3, 2, e); P.px(40, 9, w); P.px(41, 10, i); P.px(42, 10, i); break;
      case 3: P.rect(40, 6, 4, 5, e); P.px(40, 6, w); P.px(41, 7, w); P.row(10, 40, 43, i); P.px(43, 9, i); P.px(43, 5, e); P.px(44, 4, e); break;
      case 4: P.rect(40, 7, 3, 4, e); P.px(40, 7, w); P.px(42, 8, w); P.row(10, 40, 42, i); P.px(42, 9, i); P.row(6, 40, 43, e); P.px(44, 5, e); break;
      default: P.rect(40, 7, 3, 4, e); P.px(40, 7, w); P.px(41, 10, i); P.px(42, 10, i); P.px(42, 9, i); P.row(6, 40, 43, e); P.px(44, 5, e);   // a big eye with lashes
    }
  }
  /** One eye in the front view, at x (the left eye or the right one). */
  function eyeFront(P, C, x, blink) {
    const e = C.eye, i = C.iris, w = '#ffffff', inner = x + (x < CX ? 2 : 0), out = x < CX ? -1 : 1;
    if (blink) { P.row(11, x, x + 2, e); return; }
    switch (C.sh.eye) {
      case 1: P.rect(x, 10, 3, 3, e); P.px(inner, 10, w); P.row(12, x, x + 2, i); P.row(9, x, x + 2, e); break;
      case 2: P.row(10, x, x + 2, C.coat.d); P.rect(x, 11, 3, 2, e); P.px(inner, 11, w); P.row(12, x, x + 2, i); break;
      case 3: P.rect(x - 1, 8, 5, 5, e); P.px(inner, 8, w); P.px(inner - out, 9, w); P.row(12, x - 1, x + 3, i); P.px(x - 1, 7, e); P.px(x + 3, 7, e); break;
      case 4: P.rect(x, 9, 3, 4, e); P.px(inner, 9, w); P.px(x + 1, 11, w); P.row(12, x, x + 2, i); P.row(8, x, x + 2, e); P.px(x + 1, 11, w); break;
      default: P.rect(x, 9, 3, 4, e); P.px(inner, 9, w); P.row(12, x, x + 2, i); P.row(8, x, x + 2, e);
    }
  }
  function headSide(P, C, F, blink) {
    const flick = F.ear ? 1 : 0, Hd = HEADS[C.sh.head];
    for (const [x, far] of [[34, true], [38, false]]) {                                  // ears (the far one darker)
      const c = far ? C.coat.d : C.coat.b, e = far ? 0 : flick;
      P.px(x + 1 + e, 0, c); P.rect(x, 1, 2, 1, c); P.rect(x, 2, 3, 1, c); P.rect(x - 1, 3, 4, 1, c);
      if (!far) { P.px(x, 2, C.ear); P.px(x, 3, C.ear); }
    }
    P.shape([[40, 9, 6.5, 6], [41, 13, 5, 4.5], Hd.nose, ...(Hd.bump || [])], C.coat, false);                   // the skull, the cheek and the nose, as one head
    { const [mx, my, rx, ry] = Hd.mz, top = Math.ceil(my - ry), bot = Math.floor(my + ry);
      for (let y = top; y <= bot; y++) for (let x = 43; x <= Math.floor(mx + rx); x++) if (((x - mx) / rx) ** 2 + ((y - my) / ry) ** 2 <= 1) P.px(x, y, y >= bot ? C.muzzle.d : y <= top ? C.muzzle.l : C.muzzle.b); }   // the soft, pale muzzle
    P.px(Hd.nos[0], Hd.nos[2], C.nostril); P.px(Hd.nos[1], Hd.nos[2], C.muzzle.d);          // the nostril
    P.row(Hd.mouth[0], Hd.mouth[1], Hd.mouth[2], C.muzzle.d);                               // the mouth
    P.row(17, 38, 40, C.coat.d); P.px(37, 16, C.coat.d);                                   // the jaw
    eyeSide(P, C, blink);
    for (const [y, x0, x1] of [[1, 35, 38], [2, 34, 40], [3, 34, 41], [4, 35, 42], [5, 36, 42], [6, 37, 39], [7, 37, 38], [8, 38, 38]]) for (let x = x0; x <= x1; x++) P.px(x, y, lock(C, x - x0, y, x1 - x0 + 1));   // the forelock, falling over the brow
  }

  /* =====================================================================================================================
   * FRONT VIEW (walking towards the camera)
   * ===================================================================================================================== */
  function front(P, C, F, blink) {
    const b = F.bob;
    leg(P, C, 19, 30, [0, F.B[1]], true, 3); leg(P, C, 31, 30, [0, F.A[1]], true, 3);     // hind legs, behind
    P.at(0, b, () => {
      if (C.wings) wings(P, C, 'down');
      { const T = TAILS[C.sh.tail], w = Math.max(2, 3 + (T.wide >> 1)), end = 20 + Math.round(T.len * 0.65);
        for (let y = 20; y <= end; y++) { const x = 35 + (y > 24 ? F.sway : 0) - (y > 29 ? 1 : 0); for (let i = 0; i < w; i++) P.px(x + i, y, C.fx === 'frost' && y > 30 ? ICE.pale : lock(C, i, y, w, C.tailManes)); } }   // the tail, peeking out
      P.shape([BODIES[C.sh.body].chest], C.coat);                                           // the chest
      bodyFx(P, C, 'down');
      P.rect(21, 13, 11, 11, C.coat.b); P.rect(30, 13, 2, 11, C.coat.d);                    // the neck
    });
    leg(P, C, 20, 30, [0, F.A[1]], false); leg(P, C, 28, 30, [0, F.B[1]], false);         // front legs
    P.at(0, b, () => {
      const flick = F.ear ? 1 : 0;
      for (const [x, e, out] of [[19, 0, -1], [31, flick, 1]]) { P.px(x + 1 + out, e, C.coat.b); P.rect(x + (out > 0 ? 1 : 0), 1 + e, 2, 1, C.coat.b); P.rect(x, 2 + e, 3, 2, C.coat.b); P.px(x + 1, 2 + e, C.ear); P.px(x + 1, 3 + e, C.ear); }   // ears, pointing out
      const Hd = HEADS[C.sh.head], [my, mrx, mry] = Hd.fmz, top = Math.ceil(my - mry), bot = Math.floor(my + mry);
      P.shape([[CX, 11, 7.5, 7], Hd.chin], C.coat, false);                                   // the head
      for (let y = top; y <= bot; y++) for (let x = 21; x <= 31; x++) if (((x - CX) / mrx) ** 2 + ((y - my) / mry) ** 2 <= 1) P.px(x, y, y >= bot ? C.muzzle.d : y <= top ? C.muzzle.l : C.muzzle.b);   // the muzzle
      P.px(23, Hd.fnos, C.nostril); P.px(29, Hd.fnos, C.nostril); P.row(Hd.fmouth, 25, 27, C.muzzle.d);
      for (const x of [20, 29]) eyeFront(P, C, x, blink);                                   // big eyes on the sides of the head
      for (const [y, x0, x1] of [[2, 22, 30], [3, 21, 31], [4, 21, 31], [5, 22, 30], [6, 23, 29], [7, 24, 28], [8, 25, 27]]) for (let x = x0; x <= x1; x++) P.px(x, y, lock(C, x - x0, y, x1 - x0 + 1));   // the forelock
      const M = MANES[C.sh.mane];
      for (let y = 6; y <= M.end[1]; y++) { const wave = Math.round(Math.sin(y / 2.6)), w = maneWidth(M, y, y > 25 ? 3 : 5, M.end[1]); const x = 15 + wave + (y > 18 ? F.sway : 0); for (let i = 0; i < w; i++) P.px(x + i, y, C.fx === 'frost' && y > 25 ? ICE.pale : lock(C, i, y, w)); if (C.fx === 'flames') tongue(P, C, x, y, -1); }   // the mane, falling on one side
      if (C.horn) horn(P, C, CX, 2, CX, -7);
      headFx(P, C, 'down');
    });
  }

  /* =====================================================================================================================
   * BACK VIEW (walking away)
   * ===================================================================================================================== */
  function back(P, C, F) {
    const b = F.bob, far = C.coatFar;
    leg(P, C, 21, 30, [0, F.A[1]], true, 3); leg(P, C, 29, 30, [0, F.B[1]], true, 3);     // front legs, far away
    P.at(0, b, () => {
      if (C.horn) horn(P, C, CX, 4, CX, -6);
      for (const [x, out] of [[20, -1], [30, 1]]) { P.px(x + 1 + out, 0, C.coat.d); P.rect(x + (out > 0 ? 1 : 0), 1, 2, 1, C.coat.d); P.rect(x, 2, 3, 2, C.coat.d); }
      P.blob(CX, 9, 6, 5.5, far, false);                                                    // the back of the head
      P.rect(21, 12, 11, 9, C.coat.d);                                                      // the neck
      const M = MANES[C.sh.mane];
      for (let y = 2; y <= M.end[2]; y++) { const wave = Math.round(Math.sin(y / 2.6)), w = maneWidth(M, y, 6, M.end[2]), x0 = 23 + 3 - (w >> 1); for (let i = 0; i < w; i++) P.px(x0 + i + wave, y, lock(C, i, y, w)); if (C.fx === 'flames') { tongue(P, C, x0 + wave, y, -1); tongue(P, C, x0 + w - 1 + wave, y + 1, 1); } }   // the mane down the neck
      headFx(P, C, 'up');
      P.shape([BODIES[C.sh.body].rump], C.coat);                                             // the rump
      for (let y = 28; y <= 33; y++) P.px(CX, y, C.coat.d);
      bodyFx(P, C, 'up');
      if (C.wings) wings(P, C, 'up');
    });
    leg(P, C, 17, 30, [0, F.B[1]], false); leg(P, C, 31, 30, [0, F.A[1]], false);          // hind legs
    P.at(0, b, () => {
      const T = TAILS[C.sh.tail];
      for (let y = 18; y <= 18 + T.len; y++) {                                              // a full tail, hanging down the middle
        const k = (y - 18) / T.len, w = Math.max(2, Math.round(4 + T.wide + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 3)), cx = CX + Math.round(Math.sin(y / 3.5)) + (y > 24 ? F.sway : 0);
        for (let i = 0; i < w; i++) P.px(cx - (w >> 1) + i, y, C.fx === 'frost' && y > 34 ? (i % 2 ? ICE.blue : ICE.pale) : lock(C, i, y, w, C.tailManes));
        if (C.fx === 'flames') { tongue(P, C, cx - (w >> 1), y, -1); tongue(P, C, cx - (w >> 1) + w - 1, y + 1, 1); }
      }
    });
  }

  const TWINKLES = {
    right: [[14, 20], [22, 19], [29, 23], [18, 26], [25, 27], [33, 21], [40, 4], [11, 24]],
    down: [[21, 24], [30, 25], [26, 28], [23, 5], [29, 14], [19, 27]],
    up: [[20, 23], [31, 24], [26, 29], [22, 26], [30, 28], [26, 8]],
  };

  /** Live, uncached effects: embers rising off a fiery mane; snowflakes drifting down and a frosty breath. Drawn in art pixels. */
  function drawFx(ctx, look, dir, view, sx, top, now, seed, kind = {}, moving = false) {
    const left = dir === 'left', w = W * PX;
    const dot = (ax, ay, color, a) => { ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = color; ctx.fillRect(left ? sx + w / 2 - (Math.round(ax) + 1) * PX : sx - w / 2 + Math.round(ax) * PX, top + Math.round(ay) * PX, PX, PX); };
    const plus = (ax, ay, color, a, big) => { dot(ax, ay, '#ffffff', a); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(ax + dx, ay + dy, color, a); if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) dot(ax + dx, ay + dy, color, a * 0.6); };
    const acc = look.accessory, side = view === 'right';
    if (kind.mystical) for (let i = 0; i < 4; i++) {                                              // magic: sparkles circling the pony
      const a = now / 900 + i * 1.6, x = CX + Math.cos(a) * (side ? 24 : 16), y = 20 + Math.sin(a * 1.3) * 15;
      plus(x, y, look.mane[i % look.mane.length], 0.55 + 0.45 * Math.sin(now / 260 + i * 2), false);
    }
    if (kind.horn) { const [hx, hy] = side ? [44, -8] : [CX, -8]; plus(hx, hy, '#fff2a8', 0.5 + 0.5 * Math.abs(Math.sin(now / 250)), Math.sin(now / 250) > 0.6); }   // the horn glints
    if (acc === 'bubbles') for (let i = 0; i < 4; i++) {                                          // marsh: bubbles rising
      const t = ((now / 1900) + i / 4 + seed) % 1, x = 12 + i * 8 + Math.sin(now / 500 + i) * 1.5, y = 30 - t * 30;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + dx, y + dy, '#d2faff', 0.85 * (1 - t));
    }
    if (acc === 'dust' && moving) for (let i = 0; i < 5; i++) {                                    // dune: dust kicked up behind
      const t = ((now / 520) + i / 5) % 1, x = side ? 10 - t * 12 : CX + (i - 2) * 4, y = 39 - t * 6;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, -1]]) dot(x + dx + (side ? 0 : (i - 2) * t * 3), y + dy, '#e1c38c', 0.6 * (1 - t));
    }
    if (acc === 'crown') for (let i = 0; i < 2; i++) {                                             // blossom: petals drifting down
      const t = ((now / 2600) + i * 0.5) % 1; dot((side ? 36 : CX) + Math.sin(now / 500 + i * 3) * 4 + i * 4, -1 + t * 40, '#ffb3d1', 1 - t);
    }
    if ((acc === 'stars' || acc === 'crystals') && Math.sin(now / 340 + seed * 9) > 0.3) plus(side ? 18 + (Math.floor(now / 2200) % 3) * 6 : CX + 5, side ? 14 : 16, acc === 'stars' ? '#fff5b0' : '#bff3ff', 0.9, false);
    if (acc === 'rainbow') {                                                                       // a rainbow streaming from the tail
      const cols = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'];
      if (moving && side) for (let k = 0; k < 12; k++) cols.forEach((c, j) => dot(5 - k, 20 + j + Math.round(Math.sin((now / 120) - k * 0.6)), c, 0.75 * (1 - k / 12)));
      else for (let i = 0; i < 3; i++) { const t = ((now / 1800) + i / 3) % 1; plus(CX + Math.cos(i * 2.1) * 14, 24 - t * 24, cols[(i * 2) % 6], 1 - t, false); }
    }
    if (acc === 'sparks') {                                                                        // lightning: little bolts crackling round the body
      const step = Math.floor(now / 110);
      for (let b = 0; b < 3; b++) {
        const r = Math.sin((step + b * 7) * 12.9898) * 43758.5453, rnd = r - Math.floor(r);
        if (rnd < 0.35) continue;                                                                  // (not every bolt is lit every moment)
        let x = (side ? 14 : 12) + rnd * (side ? 24 : 28), y = 8 + ((rnd * 97) % 1) * 22, dir = rnd > 0.7 ? 1 : -1;
        for (let k = 0; k < 5; k++) { dot(x, y, k % 2 ? '#fff7a0' : '#ffffff', 0.95); dot(x + 1, y, '#ffe94d', 0.55); x += dir * (k % 2 ? 2 : -1); y += 2; }
      }
    }
    if (acc === 'rays') {                                                                          // sun: a ring of golden rays, and warm glints drifting up
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + now / 2400, r = (side ? 25 : 17) + Math.sin(now / 300 + i * 1.3) * 1.6;
        dot(CX + Math.cos(a) * r, 20 + Math.sin(a) * r * 0.62, i % 2 ? '#ffe082' : '#fff3b0', 0.55 + 0.3 * Math.sin(now / 260 + i));
      }
      for (let i = 0; i < 3; i++) { const t = ((now / 2200) + i / 3 + seed) % 1; plus(10 + i * 14 + Math.sin(now / 500 + i) * 2, 34 - t * 34, '#ffd54f', 1 - t, false); }
    }
    if (look.accessory === 'flames') {
      const from = view === 'right' ? [[30, 6], [8, 24], [28, 14], [6, 30]] : view === 'down' ? [[16, 10], [17, 20], [37, 24], [26, 3]] : [[25, 6], [26, 24], [24, 14], [27, 30]];
      for (let i = 0; i < 8; i++) {
        const t = ((now / 1500) + i / 8 + seed) % 1, [x0, y0] = from[i % from.length];
        dot(x0 + Math.sin(t * 6 + i) * 1.6, y0 - t * 18, t < 0.3 ? FIRE[4] : t < 0.6 ? FIRE[3] : FIRE[1], 1 - t);
      }
    } else if (look.accessory === 'frost') {
      for (let i = 0; i < 6; i++) {
        const t = ((now / 3400) + i / 6 + seed) % 1;
        dot(6 + (i * 37 % 40) + Math.sin(t * 5 + i) * 2, -6 + t * 46, ICE.white, 0.9 * (1 - t * 0.6));
      }
      const tb = ((now + seed * 2000) % 2800) / 900;                                          // a puff of frosty breath now and then
      if (tb < 1 && view !== 'up') {
        const [mx, my, ddx, ddy] = view === 'right' ? [50, 15, 1, -0.4] : [26, 22, 0, 1];
        for (let k = 0; k < 4; k++) dot(mx + ddx * (tb * 5 + k) + (view === 'down' ? (k - 1.5) * (1 + tb * 2) : 0), my + ddy * (tb * 4 + k * 0.5) - (view === 'right' ? (k % 2) : 0), ICE.pale, 0.8 * (1 - tb));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** One pony frame, painted live (the old way): the body, the outline round it, then frost's twinkles over that. */
  function renderLive(C, view, F, blink) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), P = painter(ctx);
    P.at(0, TOP, () => { if (view === 'up') back(P, C, F); else if (view === 'down') front(P, C, F, blink); else side(P, C, F, blink); });
    outline(ctx, C.outline, W, H);
    if (C.fx === 'frost') twinkles(P, C, view, F);
    const flat = document.createElement('canvas'); flat.width = W; flat.height = H;                       // painted (and read back for the outline) on a CPU canvas; kept as a plain one to draw from every frame
    flat.getContext('2d').drawImage(canvas, 0, 0);
    return flat;
  }
  function twinkles(P, C, view, F) {
    P.at(0, TOP, () => {                                                                                      // frost twinkling on the coat
      const spots = TWINKLES[view], at = k => spots[(C.tw + k) % spots.length];
      for (const k of [0, 3]) { const [x, y] = at(k); P.at(0, F.bob, () => { P.px(x, y, ICE.white); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.px(x + dx, y + dy, ICE.sparkle); }); }
    });
  }

  /* ---- the ART PACK's ponies (artPack.js, SlotArt): the shapes of every frame are saved once, in marker colours, as LAYERS (A: everything behind the
   *      cutie mark, B: everything in front of it, C: frost's twinkles, drawn over the outline); a pony's own colours are applied when it is built. ---- */
  const POSES = { T0: TROT[0], T1: TROT[1], T2: TROT[2], T3: TROT[3], S0: STAND[0], S1: STAND[1], S2: STAND[2], S3: STAND[3] };
  /** Which saved picture a frame is: everything about it that changes its SHAPE (never its colours). */
  const stateKey = (C, view, pose, blink) => [view, pose, blink ? 1 : 0, (C.fx || '') + (C.fx === 'flames' ? C.ff : C.fx === 'frost' || C.fx === 'stars' ? C.tw : 0),
    C.wings ? (C.flying ? 'w' + C.wf : 'wf') : '', C.horn ? 'h' : '', C.manes.length].join('|');
  const accent = C => C.mark === 'apple' ? '#4f8a3a' : C.mark === 'snow' ? '#ffffff' : '#fff3b0';
  /** The cutie mark as pixels (side view only), where mark() paints it: 5 x 5 at (11, 21), bobbing with the body. */
  function markPixels(C, F) {
    const px = new Uint32Array(W * H), rows = MARKS[C.mark] || MARKS.note, col = SlotArt.abgr(C.markColor), acc = SlotArt.abgr(accent(C));
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') px[(21 + j + F.bob + TOP) * W + 11 + i] = col; else if (ch === 'o') px[(21 + j + F.bob + TOP) * W + 11 + i] = acc; }));
    return px;
  }
  /** A frame built from the pack in this pony's colours, or null when the pack lacks it (or this pony's colours would not build exactly). */
  function renderPacked(C, view, F, blink, pose) {
    if (!ArtPack.loaded || C.liveOnly) return null;
    const key = stateKey(C, view, pose, blink), A = ArtPack.sprite('pony', key + '|A');
    if (!A) return null;
    const B = view === 'right' ? ArtPack.sprite('pony', key + '|B') : null, T = C.fx === 'frost' ? ArtPack.sprite('pony', key + '|C') : null;
    if ((view === 'right' && !B) || (C.fx === 'frost' && !T)) return null;
    const lut = SlotArt.lutOf(C, SLOTS);
    return SlotArt.canvasOf(W, H, SlotArt.compose(W, H, view === 'right' ? [A, markPixels(C, F), B] : [A], lut, SlotArt.abgr(C.outline), T ? [T] : null));
  }
  /** The frame's layers painted in marker colours: { A, B?, C? } canvases (for the exporter). C: a palette with its frame fields set (see states()). */
  function captureLayers(C, view, F, blink) {
    const layers = {}, cap = name => (layers[name] || (layers[name] = Object.assign(document.createElement('canvas'), { width: W, height: H }))).getContext('2d');
    const P = painter(cap('A'), cap);
    P.at(0, TOP, () => { if (view === 'up') back(P, C, F); else if (view === 'down') front(P, C, F, blink); else side(P, C, F, blink); });
    if (C.fx === 'frost') P.layer('C', () => twinkles(P, C, view, F));
    return layers;
  }
  /** Every frame the pack should hold for these effects (null: a plain pony): { view, pose, blink, fx, fxFrame, wings, flying, wf, horn, nm }. */
  function* states(fxs) {
    for (const fx of fxs) for (const nm of fx === 'rainbow' ? [3, 4] : [3]) for (let fxFrame = 0; fxFrame < (fx === 'flames' ? 4 : fx === 'frost' || fx === 'stars' ? 8 : 1); fxFrame++)
      for (const view of ['right', 'down', 'up']) for (const [wings, horn] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        const base = { view, fx, fxFrame, wings, horn, nm, flying: false, wf: 0 };
        for (const pose of ['T0', 'T1', 'T2', 'T3']) yield { ...base, pose, blink: 0 };
        for (const pose of ['S0', 'S1', 'S2', 'S3']) for (const blink of [0, 1]) yield { ...base, pose, blink };
        if (wings) for (let wf = 0; wf < 4; wf++) for (const blink of [0, 1]) yield { ...base, pose: 'S0', blink, flying: true, wf };
      }
  }
  /** The palette for a frame state, from a pony look: the frame fields draw() sets are filled in (ruffle is a trot's odd frames). */
  function stateOf(look, st) {
    const C = palette(look);
    C.wings = !!st.wings; C.horn = !!st.horn; C.flying = st.flying; C.wf = st.wf; C.ruffle = !st.flying && st.pose[0] === 'T' && st.pose[1] % 2 === 1;
    C.ff = st.fx === 'flames' ? st.fxFrame : 0; C.tw = st.fx === 'frost' || st.fx === 'stars' ? st.fxFrame : 0;
    return C;
  }
  /** What art-sweeps.js and the exporter use. `probe(look)` is a palette whose every slot is its marker colour. */
  const pack = {
    SLOTS, states, stateKey,
    layersOf(st) {
      const ref = { coat: '#9fb7e8', mane: st.nm === 4 ? ['#ff1744', '#ff9100', '#ffea00', '#00e676'] : ['#6a4bc4', '#a58be8'], mark: 'star', accessory: st.fx };
      const C = stateOf(ref, st), probe = SlotArt.probeOf(C, SLOTS);
      Object.assign(probe, { tailManes: probe.manes, wings: C.wings, horn: C.horn, flying: C.flying, wf: C.wf, ruffle: C.ruffle, ff: C.ff, tw: C.tw, fx: C.fx, outline: C.outline });
      return { key: stateKey(C, st.view, st.pose, st.blink), layers: captureLayers(probe, st.view, POSES[st.pose], !!st.blink) };
    },
    live(look, st) { const C = stateOf(look, st); return renderLive(C, st.view, POSES[st.pose], !!st.blink); },
    packed(look, st) { const C = stateOf(look, st); return renderPacked(C, st.view, POSES[st.pose], !!st.blink, st.pose); },
    palette,
  };

  /**
   * Draws a pony at its footprint (sx, sy). look: PonyLook.describe(...); dir: 'up'|'down'|'left'|'right' (the screen direction it faces);
   * anim: { moving, phase (radians of stride), now, seed, lift (shadow is skipped while flying) }. Returns { top, h }.
   */
  /** What identifies a pony's colours in a cache key: worked out once per look object (a look is shared by every frame of that pony). */
  const lookKeys = new WeakMap();
  const lookKey = look => { let k = lookKeys.get(look); if (!k) { k = `${look.coat}|${look.mane.join()}|${look.mark}|${geneKey(look.gene)}`; lookKeys.set(look, k); } return k; };

  /* ---- the Pixi backend (pixi/pixiRenderer.js): a frame stays in MARKER colours and a shader colours it (pixi/paletteFilter.js). The frame joins the
   *      pack's layers as SlotArt.compose does, but with a marker for the outline and for the cutie mark's two colours, so it is the same picture for
   *      every pony of that shape; the pony's own colours are the palette texture, `lut`. ---- */
  const OUTLINE_SLOT = SLOTS.length, MARK_SLOT = SLOTS.length + 1, ACCENT_SLOT = SLOTS.length + 2;
  let identity = null;                                                                              // slot -> its own marker pixel (made on first use: artPack.js loads after this file)
  const IDENT = () => identity || (identity = Uint32Array.from({ length: 256 }, (_, i) => SlotArt.markerPixel(i)));
  const figPal = new WeakMap();                                                                     // look -> its palette (the frame's fields are set for each draw)
  function markMarkers(C, F) {
    const px = new Uint32Array(W * H), rows = MARKS[C.mark] || MARKS.note, col = SlotArt.markerPixel(MARK_SLOT), acc = SlotArt.markerPixel(ACCENT_SLOT);
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') px[(21 + j + F.bob + TOP) * W + 11 + i] = col; else if (ch === 'o') px[(21 + j + F.bob + TOP) * W + 11 + i] = acc; }));
    return px;
  }
  /** { frame: { key, make() }, lut: { key, make() } } for the Pixi backend, or null when the pack lacks the frame (or the pony is painted live). */
  function markerFigure(look, view, F, blink, pose, st) {
    if (!ArtPack.loaded) return null;
    let C = figPal.get(look); if (!C) { C = palette(look); figPal.set(look, C); }
    if (C.liveOnly) return null;
    C.wings = st.wings; C.horn = st.horn; C.flying = st.flying; C.wf = st.wf; C.ruffle = !st.flying && st.moving && st.frame % 2 === 1; C.ff = st.ff; C.tw = st.tw;
    const skey = stateKey(C, view, pose, blink), A = ArtPack.sprite('pony', skey + '|A');
    if (!A) return null;
    const B = view === 'right' ? ArtPack.sprite('pony', skey + '|B') : null, T = C.fx === 'frost' ? ArtPack.sprite('pony', skey + '|C') : null;
    if ((view === 'right' && !B) || (C.fx === 'frost' && !T)) return null;
    const mark = C.mark, markColor = C.markColor, outline = C.outline, markAccent = accent(C);
    return {
      frame: { key: 'pf|' + skey + '|' + (view === 'right' ? C.mark + '@' + F.bob : ''), make: () => SlotArt.canvasOf(W, H, SlotArt.compose(W, H, view === 'right' ? [A, markMarkers({ mark }, F), B] : [A], IDENT(), SlotArt.markerPixel(OUTLINE_SLOT), T ? [T] : null)) },
      lut: { key: 'pl|' + lookKey(look), make: () => { const lut = SlotArt.lutOf(C, SLOTS); lut[OUTLINE_SLOT] = SlotArt.abgr(outline); lut[MARK_SLOT] = SlotArt.abgr(markColor); lut[ACCENT_SLOT] = SlotArt.abgr(markAccent); return lut; } },
    };
  }

  function draw(ctx, look, dir, sx, sy, anim) {
    const kind = anim.kind || {}, fx = look.accessory || null, now = anim.now;
    const wings = !!kind.wings, horn = !!kind.horn, flying = !!(wings && anim.flying), wf = flying ? Math.floor(now / 85) % 4 : 0;     // (the wingbeat)
    const two = Math.PI * 2, phase = ((anim.phase % two) + two) % two;
    const frame = anim.moving ? Math.floor(phase / (Math.PI / 2)) % 4 : Math.floor((now / 420 + anim.seed) % 4);
    const pose = flying ? 'S0' : (anim.moving ? 'T' : 'S') + frame, F = POSES[pose];
    const blink = !anim.moving && ((now + anim.seed * 1311) % 4200) < 150;
    const view = dir === 'left' ? 'right' : dir;
    const ff = Math.floor(now / 120) % 4, tw = Math.floor(now / 350) % 8;                           // flame flicker, frost twinkle
    const fxFrame = fx === 'flames' ? ff : fx === 'frost' || fx === 'stars' ? tw : 0;
    const key = `${lookKey(look)}|${fx}${fxFrame}|${wings ? 'w' + (flying ? wf : 'f') : ''}${horn ? 'h' : ''}|${view}|${anim.moving ? 't' : 's'}${frame}|${blink ? 1 : 0}`;
    if (typeof ctx.figureOk === 'function' && ctx.figureOk()) {                                    // (the Pixi backend: the frame is drawn by a shader, see above)
      const fig = markerFigure(look, view, F, blink, pose, { wings, horn, flying, wf, ff, tw, moving: anim.moving, frame });
      if (fig) {
        const w = W * PX, h = H * PX, top = sy - (TOP + GROUND + 1) * PX;
        if (!anim.lift) SpriteCache.shadow(ctx, sx, sy + 1, view === 'right' ? 20 : 11, 6, 0.24);
        ctx.figure({ frame: fig.frame, lut: fig.lut, wash: 0, mirror: dir === 'left', dx: sx - w / 2, dy: top, dw: w, dh: h });
        drawFx(ctx, look, dir, view, sx, top + TOP * PX, anim.now, anim.seed, kind, anim.moving);
        return { top: top + TOP * PX, h: (GROUND + 1) * PX };
      }
    }
    let canvas = cache.get(key), drawKey = key;
    const w = W * PX, h = H * PX, top = sy - (TOP + GROUND + 1) * PX, seen = lookKey(look) + '|' + view;
    if (!canvas) {
      if (spent > budgetMs && performance.now() - frameAt < 100) {                                                                      // out of building time this frame: show the pony's last picture (or wait a frame) instead of hitching
        const last = lastShown.get(seen);
        if (!last) return { top: top + TOP * PX, h: (GROUND + 1) * PX };
        canvas = last.canvas; drawKey = last.key;
      } else {
        const t0 = performance.now(), C = palette(look);                                           // (the palette is only worked out for a picture not made yet)
        C.wings = wings; C.horn = horn; C.flying = flying; C.wf = wf; C.ruffle = !flying && anim.moving && frame % 2 === 1; C.ff = ff; C.tw = tw;
        canvas = renderPacked(C, view, F, blink, pose);                                            // from the art pack, in this pony's colours ...
        if (canvas) ArtPack.stats.packed++; else { canvas = renderLive(C, view, F, blink); ArtPack.stats.painted++; }   // ... or painted
        cache.set(key, canvas); spent += performance.now() - t0;
      }
    }
    if (drawKey === key) lastShown.set(seen, { key, canvas });
    if (!anim.lift) SpriteCache.shadow(ctx, sx, sy + 1, view === 'right' ? 20 : 11, 6, 0.24);
    const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dir === 'left' ? SpriteCache.mirror(drawKey, canvas) : canvas, sx - w / 2, top, w, h);   // (facing left: a mirrored copy, made once)
    ctx.imageSmoothingEnabled = smooth;
    drawFx(ctx, look, dir, view, sx, top + TOP * PX, anim.now, anim.seed, kind, anim.moving);
    return { top: top + TOP * PX, h: (GROUND + 1) * PX };
  }

  /** Whether a kind of animal is drawn as a pixel pony. */
  const covers = type => !!(AnimalDefs[type] && AnimalDefs[type].pony && !PIXEL_PONIES_OFF[type]);
  return { draw, covers, W, H, PX, pack, beginFrame() { spent = 0; frameAt = performance.now(); }, setBudget(ms) { budgetMs = ms; } };
})();
