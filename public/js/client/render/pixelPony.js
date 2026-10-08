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
  const HOOF = { b: '#4a4148', l: '#7a6e74', d: '#2e282d' };

  /** A pony's colours, worked out once per look (they used to be recomputed for every pony, every frame). A copy is returned: draw() sets
   *  the frame's own fields (wings, flame frame...) on it. */
  const palettes = new LruCache(500);
  function palette(look) {
    const key = `${look.coat}|${look.mane.join()}|${look.mark}|${look.accessory}`;
    let p = palettes.get(key);
    if (!p) { p = makePalette(look); palettes.set(key, p); }
    return Object.assign({}, p);
  }
  /** Every colour a pony is drawn in. The painting code below only ever uses entries of this (never works a colour out itself): that is what lets
   *  the art pack save the shapes once and colour them per pony (SlotArt, SLOTS). */
  function makePalette(look) {
    const coat = look.coat, m = look.mane;
    const manes = (m.length >= 3 ? m : [m[0], m[1] || light(m[0], 0.3), light(m[1] || m[0], 0.45)]).map(tones);   // (a rainbow mane has four)
    const C = {
      coat: tones(coat), muzzle: tones(mix(coat, '#f1dcc0', 0.45)), feather: tones(mix(coat, '#f6ead2', 0.6)),
      ear: mix(coat, '#e98fa6', 0.5), eye: '#2a1810', iris: mix(m[0], '#4a2a18', 0.55),
      manes, mark: look.mark, markColor: m[0], markColor2: m[1] || m[0], outline: '#24170f',
      fx: look.accessory, ff: 0, tw: 0,                                                    // the biome effect, and its flame / twinkle frame
      hoof: look.accessory === 'flames' ? EMBER_HOOF : look.accessory === 'frost' ? ICE_HOOF : HOOF,
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
    C.liveOnly = same(C.coat) || same(C.coatFar) || same(C.feather) || same(C.muzzle)
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
    { A: [2, 0], B: [-2, 0], bob: 0, sway: 1 },
    { A: [0, 2], B: [0, 0], bob: -1, sway: 0 },
    { A: [-2, 0], B: [2, 0], bob: 0, sway: -1 },
    { A: [0, 0], B: [0, 2], bob: -1, sway: 0 },
  ];
  const STAND = [
    { A: [0, 0], B: [0, 0], bob: 0, sway: 0 },
    { A: [0, 0], B: [0, 0], bob: 0, sway: 1, ear: 1 },
    { A: [0, 0], B: [0, 0], bob: -1, sway: 2 },
    { A: [0, 0], B: [0, 0], bob: 0, sway: 1 },
  ];

  /** Mane and tail locks: 2-pixel-wide locks of each mane colour that wave as they fall, each with a dark edge and a shine. */
  const lock = (C, i, y, w = 4) => {
    if (C.fx === 'flames') return fire(C, i, y, w);
    if (C.fx === 'frost' && y % 5 === 0 && (i & 1) === 0) return ICE.white;                 // frost glinting in the hair
    const off = Math.round(Math.sin(y / 3 + i * 0.4)), band = Math.floor((i + off + 8) / 2), t = C.manes[band % C.manes.length], within = (i + off + 8) % 2;
    return within === 1 && y % 3 === 0 ? t.d : within === 0 && y % 4 === 1 ? t.l : t.b;
  };

  /** A leg from (x, top) down to the hoof: shin, a shaggy fetlock and a dark hoof. far: the far side's legs are shaded darker. */
  function leg(P, C, x, top, [dx, lift], far, thick = 4) {
    const coat = far ? C.coatFar : C.coat, feather = far ? C.featherFar : C.feather;
    const hoofY = GROUND - 2 - lift, fet = hoofY - 3;
    for (let y = top; y < fet; y++) { const t = (y - top) / Math.max(1, fet - top), xx = x + Math.round(dx * t); P.rect(xx, y, thick, 1, coat.b); P.px(xx + thick - 1, y, coat.d); if (y === top + 3) P.px(xx, y, coat.d); }
    for (let y = fet; y < hoofY; y++) { P.rect(x + dx - 1, y, thick + 1, 1, feather.b); P.px(x + dx - 1, y, feather.l); P.px(x + dx + thick - 1, y, feather.d); }
    P.px(x + dx - 2, hoofY - 1, feather.d); P.px(x + dx + thick, hoofY - 1, feather.d);                          // tufts over the hoof
    const hoof = C.hoof;
    P.rect(x + dx - 1, hoofY, thick + 1, 1, far ? hoof.b : hoof.l); P.rect(x + dx - 1, hoofY + 1, thick + 1, 2, far ? hoof.d : hoof.b);
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
  function side(P, C, F, blink) {
    const b = F.bob;
    if (C.wings) P.at(0, b, () => wings(P, C, 'right', 'far'));
    leg(P, C, 29, 28, F.B, true, 3); leg(P, C, 16, 28, F.A, true, 3);                    // far legs, behind the body
    P.at(0, b, () => {
      tailSide(P, C, F);
      P.shape([[23, 24, 12.5, 7], [13, 23, 6.5, 7], [32, 24, 5, 7]], C.coat);             // the barrel, the rump and the chest
      for (let x = 15; x < 31; x++) if ((x * 7) % 5 === 0) P.px(x, 31, C.coat.d);          // a shaggy belly
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
      if (C.fx === 'frost') for (const [x, len] of [[19, 3], [22, 2], [25, 3], [28, 2]]) for (let k = 0; k < len; k++) P.px(x, 31 + k, k ? ICE.blue : ICE.white);   // icicles under the belly
      maneSide(P, C, F);
      headSide(P, C, F, blink);
      if (C.horn) horn(P, C, 40, 2, 44, -7);
      headFx(P, C, 'right');
      if (C.wings) wings(P, C, 'right', 'near');
    });
    });
  }

  function tailSide(P, C, F) {
    for (let y = 18; y <= 38; y++) {
      const k = (y - 18) / 20, cx = 9 - Math.round(k * 4) + Math.round(Math.sin(y / 3.5)) + (y > 24 ? F.sway : 0), w = Math.round(3 + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 4 - (k > 0.9 ? 2 : 0));
      for (let i = 0; i < w; i++) P.px(cx - i + 1, y, C.fx === 'frost' && y > 34 ? (i % 2 ? ICE.blue : ICE.pale) : lock(C, i, y, w));
      if (C.fx === 'flames') { tongue(P, C, cx - w + 1, y, -1); tongue(P, C, cx + 1, y + 1, 1); }
    }
    for (let y = 17; y <= 21; y++) P.rect(8, y, 4, 1, lock(C, y, y));                       // where it springs from the rump
  }

  function maneSide(P, C, F) {
    for (let y = 2; y <= 28; y++) {                                                       // a big, wavy mane down the neck and over the shoulder
      const t = Math.max(0, (y - 9) / 15), edge = y < 9 ? 33 : Math.round(33 - t * 6), wave = Math.round(Math.sin(y / 2.6)), w = y < 4 ? 4 : y > 24 ? 4 + (28 - y) % 2 : 7;
      const sx = y > 18 ? F.sway : 0;
      for (let i = 0; i < w; i++) P.px(edge - 4 + i + wave + sx, y, C.fx === 'frost' && y > 25 ? (i % 2 ? ICE.blue : ICE.pale) : lock(C, i, y, w));
      if (C.fx === 'flames') tongue(P, C, edge - 4 + wave + sx, y, -1);
    }
    if (C.fx === 'flames') for (let x = 30; x <= 35; x += 2) { P.px(x, 1, FIRE[1]); if ((x + C.ff) % 3) P.px(x, 0, FIRE[0]); }   // flames along the crest
    for (const [x, y] of [[26, 29], [28, 30], [30, 29]]) P.px(x + F.sway, y, lock(C, x, y));   // stray ends
  }

  function headSide(P, C, F, blink) {
    const flick = F.ear ? 1 : 0;
    for (const [x, far] of [[34, true], [38, false]]) {                                  // ears (the far one darker)
      const c = far ? C.coat.d : C.coat.b, e = far ? 0 : flick;
      P.px(x + 1 + e, 0, c); P.rect(x, 1, 2, 1, c); P.rect(x, 2, 3, 1, c); P.rect(x - 1, 3, 4, 1, c);
      if (!far) { P.px(x, 2, C.ear); P.px(x, 3, C.ear); }
    }
    P.shape([[40, 9, 6.5, 6], [41, 13, 5, 4.5], [46, 14, 4, 3.5]], C.coat, false);           // the skull, the cheek and the nose, as one head
    for (let y = 11; y <= 17; y++) for (let x = 43; x <= 50; x++) if (((x - 46) / 4.3) ** 2 + ((y - 14) / 3.6) ** 2 <= 1) P.px(x, y, y >= 17 ? C.muzzle.d : y <= 11 ? C.muzzle.l : C.muzzle.b);   // the soft, pale muzzle
    P.px(48, 13, C.nostril); P.px(49, 13, C.muzzle.d);                        // the nostril
    P.row(17, 45, 48, C.muzzle.d);                                                          // the mouth
    P.row(17, 38, 40, C.coat.d); P.px(37, 16, C.coat.d);                                   // the jaw
    if (blink) { P.row(9, 40, 42, C.eye); P.px(43, 8, C.eye); }
    else { P.rect(40, 7, 3, 4, C.eye); P.px(40, 7, '#ffffff'); P.px(41, 10, C.iris); P.px(42, 10, C.iris); P.px(42, 9, C.iris); P.row(6, 40, 43, C.eye); P.px(44, 5, C.eye); }   // a big eye with lashes
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
      for (let y = 20; y <= 33; y++) { const x = 35 + (y > 24 ? F.sway : 0) - (y > 29 ? 1 : 0); for (let i = 0; i < 3; i++) P.px(x + i, y, C.fx === 'frost' && y > 30 ? ICE.pale : lock(C, i, y, 3)); }   // the tail, peeking out
      P.shape([[CX, 26, 9.5, 7]], C.coat);                                                  // the chest
      bodyFx(P, C, 'down');
      P.rect(21, 13, 11, 11, C.coat.b); P.rect(30, 13, 2, 11, C.coat.d);                    // the neck
    });
    leg(P, C, 20, 30, [0, F.A[1]], false); leg(P, C, 28, 30, [0, F.B[1]], false);         // front legs
    P.at(0, b, () => {
      const flick = F.ear ? 1 : 0;
      for (const [x, e, out] of [[19, 0, -1], [31, flick, 1]]) { P.px(x + 1 + out, e, C.coat.b); P.rect(x + (out > 0 ? 1 : 0), 1 + e, 2, 1, C.coat.b); P.rect(x, 2 + e, 3, 2, C.coat.b); P.px(x + 1, 2 + e, C.ear); P.px(x + 1, 3 + e, C.ear); }   // ears, pointing out
      P.shape([[CX, 11, 7.5, 7], [CX, 17.5, 5, 4]], C.coat, false);                          // the head
      for (let y = 15; y <= 21; y++) for (let x = 21; x <= 31; x++) if (((x - CX) / 5) ** 2 + ((y - 18) / 3.6) ** 2 <= 1) P.px(x, y, y >= 21 ? C.muzzle.d : y <= 15 ? C.muzzle.l : C.muzzle.b);   // the muzzle
      P.px(23, 19, C.nostril); P.px(29, 19, C.nostril); P.row(21, 25, 27, C.muzzle.d);
      for (const x of [20, 29]) {                                                           // big eyes on the sides of the head
        if (blink) P.row(11, x, x + 2, C.eye);
        else { P.rect(x, 9, 3, 4, C.eye); P.px(x + (x < CX ? 2 : 0), 9, '#ffffff'); P.row(12, x, x + 2, C.iris); P.row(8, x, x + 2, C.eye); }
      }
      for (const [y, x0, x1] of [[2, 22, 30], [3, 21, 31], [4, 21, 31], [5, 22, 30], [6, 23, 29], [7, 24, 28], [8, 25, 27]]) for (let x = x0; x <= x1; x++) P.px(x, y, lock(C, x - x0, y, x1 - x0 + 1));   // the forelock
      for (let y = 6; y <= 28; y++) { const wave = Math.round(Math.sin(y / 2.6)), w = y > 25 ? 3 : 5; const x = 15 + wave + (y > 18 ? F.sway : 0); for (let i = 0; i < w; i++) P.px(x + i, y, C.fx === 'frost' && y > 25 ? ICE.pale : lock(C, i, y, w)); if (C.fx === 'flames') tongue(P, C, x, y, -1); }   // the mane, falling on one side
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
      for (let y = 2; y <= 22; y++) { const wave = Math.round(Math.sin(y / 2.6)); for (let i = 0; i < 6; i++) P.px(23 + i + wave, y, lock(C, i, y, 6)); if (C.fx === 'flames') { tongue(P, C, 23 + wave, y, -1); tongue(P, C, 28 + wave, y + 1, 1); } }   // the mane down the neck
      headFx(P, C, 'up');
      P.shape([[CX, 26, 10.5, 8]], C.coat);                                                  // the rump
      for (let y = 28; y <= 33; y++) P.px(CX, y, C.coat.d);
      bodyFx(P, C, 'up');
      if (C.wings) wings(P, C, 'up');
    });
    leg(P, C, 17, 30, [0, F.B[1]], false); leg(P, C, 31, 30, [0, F.A[1]], false);          // hind legs
    P.at(0, b, () => {
      for (let y = 18; y <= 38; y++) {                                                      // a full tail, hanging down the middle
        const k = (y - 18) / 20, w = Math.round(4 + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 3), cx = CX + Math.round(Math.sin(y / 3.5)) + (y > 24 ? F.sway : 0);
        for (let i = 0; i < w; i++) P.px(cx - (w >> 1) + i, y, C.fx === 'frost' && y > 34 ? (i % 2 ? ICE.blue : ICE.pale) : lock(C, i, y, w));
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
    const ctx = canvas.getContext('2d'), P = painter(ctx);
    P.at(0, TOP, () => { if (view === 'up') back(P, C, F); else if (view === 'down') front(P, C, F, blink); else side(P, C, F, blink); });
    outline(ctx, C.outline, W, H);
    if (C.fx === 'frost') twinkles(P, C, view, F);
    return canvas;
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
      Object.assign(probe, { wings: C.wings, horn: C.horn, flying: C.flying, wf: C.wf, ruffle: C.ruffle, ff: C.ff, tw: C.tw, fx: C.fx, outline: C.outline });
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
  const lookKey = look => { let k = lookKeys.get(look); if (!k) { k = `${look.coat}|${look.mane.join()}|${look.mark}`; lookKeys.set(look, k); } return k; };

  function draw(ctx, look, dir, sx, sy, anim) {
    const kind = anim.kind || {}, fx = look.accessory || null, now = anim.now;
    const wings = !!kind.wings, horn = !!kind.horn, flying = !!(wings && anim.flying), wf = flying ? Math.floor(now / 85) % 4 : 0;     // (the wingbeat)
    const two = Math.PI * 2, phase = ((anim.phase % two) + two) % two;
    const frame = anim.moving ? (4 - Math.floor(phase / (Math.PI / 2)) % 4) % 4 : Math.floor((now / 420 + anim.seed) % 4);   // (trot frames run forward-lift-back; played in reverse so the hooves push back along the ground instead of moonwalking)
    const pose = flying ? 'S0' : (anim.moving ? 'T' : 'S') + frame, F = POSES[pose];
    const blink = !anim.moving && ((now + anim.seed * 1311) % 4200) < 150;
    const view = dir === 'left' ? 'right' : dir;
    const ff = Math.floor(now / 120) % 4, tw = Math.floor(now / 350) % 8;                           // flame flicker, frost twinkle
    const fxFrame = fx === 'flames' ? ff : fx === 'frost' || fx === 'stars' ? tw : 0;
    const key = `${lookKey(look)}|${fx}${fxFrame}|${wings ? 'w' + (flying ? wf : 'f') : ''}${horn ? 'h' : ''}|${view}|${anim.moving ? 't' : 's'}${frame}|${blink ? 1 : 0}`;
    let canvas = cache.get(key);
    if (!canvas) {                                                                                // (the palette is only worked out for a picture not made yet)
      const C = palette(look);
      C.wings = wings; C.horn = horn; C.flying = flying; C.wf = wf; C.ruffle = !flying && anim.moving && frame % 2 === 1; C.ff = ff; C.tw = tw;
      canvas = renderPacked(C, view, F, blink, pose);                                              // from the art pack, in this pony's colours ...
      if (canvas) ArtPack.stats.packed++; else { canvas = renderLive(C, view, F, blink); ArtPack.stats.painted++; }   // ... or painted
      cache.set(key, canvas);
    }
    const w = W * PX, h = H * PX, top = sy - (TOP + GROUND + 1) * PX;
    if (!anim.lift) SpriteCache.shadow(ctx, sx, sy + 1, view === 'right' ? 20 : 11, 6, 0.24);
    const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dir === 'left' ? SpriteCache.mirror(key, canvas) : canvas, sx - w / 2, top, w, h);   // (facing left: a mirrored copy, made once)
    ctx.imageSmoothingEnabled = smooth;
    drawFx(ctx, look, dir, view, sx, top + TOP * PX, anim.now, anim.seed, kind, anim.moving);
    return { top: top + TOP * PX, h: (GROUND + 1) * PX };
  }

  /** Whether a kind of animal is drawn as a pixel pony. */
  const covers = type => !!(AnimalDefs[type] && AnimalDefs[type].pony && !PIXEL_PONIES_OFF[type]);
  return { draw, covers, W, H, PX, pack };
})();
