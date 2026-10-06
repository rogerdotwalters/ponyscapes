'use strict';
/* CLIENT - retro pixel-art ponies, in the same style as the pixel characters (pixelCharacter.js): painted pixel by pixel in the pony's own
 * coat, mane and cutie-mark colours (PonyLook), outlined, cached, and drawn scaled up with hard edges.
 * Views: 'right' (the profile; 'left' is its mirror), 'down' (walking towards the camera), 'up' (walking away).
 * Animations: a 4-frame trot tied to the distance walked; standing, the tail swishes, the ears flick and the eyes blink.
 * PIXEL_PONIES says which pony kinds use it (the plain and earth ponies for now; winged and horned ones keep the older smooth drawing). */
const PIXEL_PONIES = { pony_plain: true, pony_earth: true };
const PixelPony = (() => {
  const W = 52, H = 42, CX = 26, GROUND = 40, PX = 1.25;
  const { css, shade, light, mix, tones, outline } = PixelCharacter.util;
  const cache = new Map();
  const HOOF = { b: '#4a4148', l: '#7a6e74', d: '#2e282d' };

  function palette(look) {
    const coat = look.coat, m = look.mane;
    const manes = [m[0], m[1] || light(m[0], 0.3), m[2] || light(m[1] || m[0], 0.45)].map(tones);
    return {
      coat: tones(coat), muzzle: tones(mix(coat, '#f1dcc0', 0.45)), feather: tones(mix(coat, '#f6ead2', 0.6)),
      ear: mix(coat, '#e98fa6', 0.5), eye: '#2a1810', iris: mix(m[0], '#4a2a18', 0.55),
      manes, mark: look.mark, markColor: m[0], markColor2: m[1] || m[0], outline: '#24170f',
      fx: look.accessory, ff: 0, tw: 0,                                                    // the biome effect, and its flame / twinkle frame
      hoof: look.accessory === 'flames' ? EMBER_HOOF : look.accessory === 'frost' ? ICE_HOOF : HOOF,
      ...(look.accessory === 'flames' ? { feather: tones(mix(coat, '#ff7043', 0.45)) } : look.accessory === 'frost' ? { feather: tones('#f2faff') } : {}),
    };
  }

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

  function painter(ctx) {
    let ox = 0, oy = 0;
    const P = {
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
    const off = Math.round(Math.sin(y / 3 + i * 0.4)), band = Math.floor((i + off + 8) / 2), t = C.manes[band % 3], within = (i + off + 8) % 2;
    return within === 1 && y % 3 === 0 ? t.d : within === 0 && y % 4 === 1 ? t.l : t.b;
  };

  /** A leg from (x, top) down to the hoof: shin, a shaggy fetlock and a dark hoof. far: the far side's legs are shaded darker. */
  function leg(P, C, x, top, [dx, lift], far, thick = 4) {
    const coat = far ? { b: C.coat.d, d: shade(C.coat.d, 0.85), l: C.coat.b } : C.coat, feather = far ? { b: C.feather.d, d: shade(C.feather.d, 0.85), l: C.feather.b } : C.feather;
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

  /* =====================================================================================================================
   * SIDE VIEW (facing right)
   * ===================================================================================================================== */
  function side(P, C, F, blink) {
    const b = F.bob;
    leg(P, C, 29, 28, F.B, true, 3); leg(P, C, 16, 28, F.A, true, 3);                    // far legs, behind the body
    P.at(0, b, () => {
      tailSide(P, C, F);
      P.shape([[23, 24, 12.5, 7], [13, 23, 6.5, 7], [32, 24, 5, 7]], C.coat);             // the barrel, the rump and the chest
      for (let x = 15; x < 31; x++) if ((x * 7) % 5 === 0) P.px(x, 31, C.coat.d);          // a shaggy belly
      mark(P, C, 11, 21);
      for (let y = 9; y <= 24; y++) { const t = (y - 9) / 15, xl = Math.round(33 - t * 6), xr = Math.round(41 - t * 4); P.row(y, xl, xr, C.coat.b); P.px(xr, y, C.coat.d); P.px(xr - 1, y, t > 0.3 ? C.coat.b : C.coat.d); }   // the neck
    });
    leg(P, C, 31, 28, F.A, false); leg(P, C, 11, 28, F.B, false);                         // near legs, in front
    P.at(0, b, () => {
      for (let y = 25; y <= 31; y++) P.px(16 - Math.round(Math.abs(y - 27.5) * 0.4), y, C.coat.d);   // the line of the near thigh
      if (C.fx === 'frost') for (const [x, len] of [[19, 3], [22, 2], [25, 3], [28, 2]]) for (let k = 0; k < len; k++) P.px(x, 31 + k, k ? ICE.blue : ICE.white);   // icicles under the belly
      maneSide(P, C, F);
      headSide(P, C, F, blink);
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
    P.px(48, 13, shade(C.muzzle.b, 0.4)); P.px(49, 13, C.muzzle.d);                        // the nostril
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
      for (let y = 20; y <= 33; y++) { const x = 35 + (y > 24 ? F.sway : 0) - (y > 29 ? 1 : 0); for (let i = 0; i < 3; i++) P.px(x + i, y, C.fx === 'frost' && y > 30 ? ICE.pale : lock(C, i, y, 3)); }   // the tail, peeking out
      P.shape([[CX, 26, 9.5, 7]], C.coat);                                                  // the chest
      P.rect(21, 13, 11, 11, C.coat.b); P.rect(30, 13, 2, 11, C.coat.d);                    // the neck
    });
    leg(P, C, 20, 30, [0, F.A[1]], false); leg(P, C, 28, 30, [0, F.B[1]], false);         // front legs
    P.at(0, b, () => {
      const flick = F.ear ? 1 : 0;
      for (const [x, e, out] of [[19, 0, -1], [31, flick, 1]]) { P.px(x + 1 + out, e, C.coat.b); P.rect(x + (out > 0 ? 1 : 0), 1 + e, 2, 1, C.coat.b); P.rect(x, 2 + e, 3, 2, C.coat.b); P.px(x + 1, 2 + e, C.ear); P.px(x + 1, 3 + e, C.ear); }   // ears, pointing out
      P.shape([[CX, 11, 7.5, 7], [CX, 17.5, 5, 4]], C.coat, false);                          // the head
      for (let y = 15; y <= 21; y++) for (let x = 21; x <= 31; x++) if (((x - CX) / 5) ** 2 + ((y - 18) / 3.6) ** 2 <= 1) P.px(x, y, y >= 21 ? C.muzzle.d : y <= 15 ? C.muzzle.l : C.muzzle.b);   // the muzzle
      P.px(23, 19, shade(C.muzzle.b, 0.4)); P.px(29, 19, shade(C.muzzle.b, 0.4)); P.row(21, 25, 27, C.muzzle.d);
      for (const x of [20, 29]) {                                                           // big eyes on the sides of the head
        if (blink) P.row(11, x, x + 2, C.eye);
        else { P.rect(x, 9, 3, 4, C.eye); P.px(x + (x < CX ? 2 : 0), 9, '#ffffff'); P.row(12, x, x + 2, C.iris); P.row(8, x, x + 2, C.eye); }
      }
      for (const [y, x0, x1] of [[2, 22, 30], [3, 21, 31], [4, 21, 31], [5, 22, 30], [6, 23, 29], [7, 24, 28], [8, 25, 27]]) for (let x = x0; x <= x1; x++) P.px(x, y, lock(C, x - x0, y, x1 - x0 + 1));   // the forelock
      for (let y = 6; y <= 28; y++) { const wave = Math.round(Math.sin(y / 2.6)), w = y > 25 ? 3 : 5; const x = 15 + wave + (y > 18 ? F.sway : 0); for (let i = 0; i < w; i++) P.px(x + i, y, C.fx === 'frost' && y > 25 ? ICE.pale : lock(C, i, y, w)); if (C.fx === 'flames') tongue(P, C, x, y, -1); }   // the mane, falling on one side
    });
  }

  /* =====================================================================================================================
   * BACK VIEW (walking away)
   * ===================================================================================================================== */
  function back(P, C, F) {
    const b = F.bob, far = { b: C.coat.d, d: shade(C.coat.d, 0.85), l: C.coat.b };
    leg(P, C, 21, 30, [0, F.A[1]], true, 3); leg(P, C, 29, 30, [0, F.B[1]], true, 3);     // front legs, far away
    P.at(0, b, () => {
      for (const [x, out] of [[20, -1], [30, 1]]) { P.px(x + 1 + out, 0, C.coat.d); P.rect(x + (out > 0 ? 1 : 0), 1, 2, 1, C.coat.d); P.rect(x, 2, 3, 2, C.coat.d); }
      P.blob(CX, 9, 6, 5.5, far, false);                                                    // the back of the head
      P.rect(21, 12, 11, 9, C.coat.d);                                                      // the neck
      for (let y = 2; y <= 22; y++) { const wave = Math.round(Math.sin(y / 2.6)); for (let i = 0; i < 6; i++) P.px(23 + i + wave, y, lock(C, i, y, 6)); if (C.fx === 'flames') { tongue(P, C, 23 + wave, y, -1); tongue(P, C, 28 + wave, y + 1, 1); } }   // the mane down the neck
      P.shape([[CX, 26, 10.5, 8]], C.coat);                                                  // the rump
      for (let y = 28; y <= 33; y++) P.px(CX, y, C.coat.d);
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
  function drawFx(ctx, look, dir, view, sx, top, now, seed) {
    const left = dir === 'left', w = W * PX;
    const dot = (ax, ay, color, a) => { ctx.globalAlpha = a; ctx.fillStyle = color; ctx.fillRect(left ? sx + w / 2 - (Math.round(ax) + 1) * PX : sx - w / 2 + Math.round(ax) * PX, top + Math.round(ay) * PX, PX, PX); };
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

  function render(C, view, F, blink) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), P = painter(ctx);
    if (view === 'up') back(P, C, F); else if (view === 'down') front(P, C, F, blink); else side(P, C, F, blink);
    outline(ctx, C.outline, W, H);
    if (C.fx === 'frost') {                                                                  // frost twinkling on the coat
      const spots = TWINKLES[view], at = k => spots[(C.tw + k) % spots.length];
      for (const k of [0, 3]) { const [x, y] = at(k); P.at(0, F.bob, () => { P.px(x, y, ICE.white); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.px(x + dx, y + dy, ICE.sparkle); }); }
    }
    return canvas;
  }

  /**
   * Draws a pony at its footprint (sx, sy). look: PonyLook.describe(...); dir: 'up'|'down'|'left'|'right' (the screen direction it faces);
   * anim: { moving, phase (radians of stride), now, seed, lift (shadow is skipped while flying) }. Returns { top, h }.
   */
  function draw(ctx, look, dir, sx, sy, anim) {
    const C = palette(look), two = Math.PI * 2, phase = ((anim.phase % two) + two) % two;
    const frame = anim.moving ? Math.floor(phase / (Math.PI / 2)) % 4 : Math.floor((anim.now / 420 + anim.seed) % 4);
    const F = anim.moving ? TROT[frame] : STAND[frame];
    const blink = !anim.moving && ((anim.now + anim.seed * 1311) % 4200) < 150;
    const view = dir === 'left' ? 'right' : dir;
    C.ff = Math.floor(anim.now / 120) % 4; C.tw = Math.floor(anim.now / 350) % 8;                     // flame flicker, frost twinkle
    const fxFrame = C.fx === 'flames' ? C.ff : C.fx === 'frost' ? C.tw : 0;
    const key = `${look.coat}|${look.mane.join()}|${look.mark}|${C.fx}${fxFrame}|${view}|${anim.moving ? 't' : 's'}${frame}|${blink ? 1 : 0}`;
    let canvas = cache.get(key);
    if (!canvas) { if (cache.size > 800) cache.clear(); canvas = render(C, view, F, blink); cache.set(key, canvas); }
    const w = W * PX, h = H * PX, top = sy - (GROUND + 1) * PX;
    if (!anim.lift) { ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, view === 'right' ? 20 : 11, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (dir === 'left') { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, -w / 2, top, w, h); }
    else ctx.drawImage(canvas, sx - w / 2, top, w, h);
    ctx.restore();
    if (C.fx === 'flames' || C.fx === 'frost') drawFx(ctx, look, dir, view, sx, top, anim.now, anim.seed);
    return { top, h: (GROUND + 1) * PX };
  }

  return { draw, W, H, PX };
})();
