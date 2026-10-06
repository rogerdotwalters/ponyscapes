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
    };
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
  const lock = (C, i, y) => {
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
    P.rect(x + dx - 1, hoofY, thick + 1, 1, far ? HOOF.b : HOOF.l); P.rect(x + dx - 1, hoofY + 1, thick + 1, 2, far ? HOOF.d : HOOF.b);
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
  };
  function mark(P, C, x, y) {
    const rows = MARKS[C.mark] || MARKS.note;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') P.px(x + i, y + j, C.markColor); else if (ch === 'o') P.px(x + i, y + j, C.mark === 'apple' ? '#4f8a3a' : '#fff3b0'); }));
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
      maneSide(P, C, F);
      headSide(P, C, F, blink);
    });
  }

  function tailSide(P, C, F) {
    for (let y = 18; y <= 38; y++) {
      const k = (y - 18) / 20, cx = 9 - Math.round(k * 4) + Math.round(Math.sin(y / 3.5)) + (y > 24 ? F.sway : 0), w = Math.round(3 + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 4 - (k > 0.9 ? 2 : 0));
      for (let i = 0; i < w; i++) P.px(cx - i + 1, y, lock(C, i, y));
    }
    for (let y = 17; y <= 21; y++) P.rect(8, y, 4, 1, lock(C, y, y));                       // where it springs from the rump
  }

  function maneSide(P, C, F) {
    for (let y = 2; y <= 28; y++) {                                                       // a big, wavy mane down the neck and over the shoulder
      const t = Math.max(0, (y - 9) / 15), edge = y < 9 ? 33 : Math.round(33 - t * 6), wave = Math.round(Math.sin(y / 2.6)), w = y < 4 ? 4 : y > 24 ? 4 + (28 - y) % 2 : 7;
      const sx = y > 18 ? F.sway : 0;
      for (let i = 0; i < w; i++) P.px(edge - 4 + i + wave + sx, y, lock(C, i, y));
    }
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
    for (const [y, x0, x1] of [[1, 35, 38], [2, 34, 40], [3, 34, 41], [4, 35, 42], [5, 36, 42], [6, 37, 39], [7, 37, 38], [8, 38, 38]]) for (let x = x0; x <= x1; x++) P.px(x, y, lock(C, x - 34, y));   // the forelock, falling over the brow
  }

  /* =====================================================================================================================
   * FRONT VIEW (walking towards the camera)
   * ===================================================================================================================== */
  function front(P, C, F, blink) {
    const b = F.bob;
    leg(P, C, 19, 30, [0, F.B[1]], true, 3); leg(P, C, 31, 30, [0, F.A[1]], true, 3);     // hind legs, behind
    P.at(0, b, () => {
      for (let y = 20; y <= 33; y++) P.rect(35 + (y > 24 ? F.sway : 0) - (y > 29 ? 1 : 0), y, 3, 1, lock(C, y, y));   // the tail, peeking out
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
      for (const [y, x0, x1] of [[2, 22, 30], [3, 21, 31], [4, 21, 31], [5, 22, 30], [6, 23, 29], [7, 24, 28], [8, 25, 27]]) for (let x = x0; x <= x1; x++) P.px(x, y, lock(C, x - 21, y));   // the forelock
      for (let y = 6; y <= 28; y++) { const wave = Math.round(Math.sin(y / 2.6)), w = y > 25 ? 3 : 5; for (let i = 0; i < w; i++) P.px(15 + i + wave + (y > 18 ? F.sway : 0), y, lock(C, i, y)); }   // the mane, falling on one side
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
      for (let y = 2; y <= 22; y++) { const wave = Math.round(Math.sin(y / 2.6)); for (let i = 0; i < 6; i++) P.px(23 + i + wave, y, lock(C, i, y)); }   // the mane down the neck
      P.shape([[CX, 26, 10.5, 8]], C.coat);                                                  // the rump
      for (let y = 28; y <= 33; y++) P.px(CX, y, C.coat.d);
    });
    leg(P, C, 17, 30, [0, F.B[1]], false); leg(P, C, 31, 30, [0, F.A[1]], false);          // hind legs
    P.at(0, b, () => {
      for (let y = 18; y <= 38; y++) {                                                      // a full tail, hanging down the middle
        const k = (y - 18) / 20, w = Math.round(4 + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 3), cx = CX + Math.round(Math.sin(y / 3.5)) + (y > 24 ? F.sway : 0);
        for (let i = 0; i < w; i++) P.px(cx - (w >> 1) + i, y, lock(C, i, y));
      }
    });
  }

  function render(C, view, F, blink) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), P = painter(ctx);
    if (view === 'up') back(P, C, F); else if (view === 'down') front(P, C, F, blink); else side(P, C, F, blink);
    outline(ctx, C.outline, W, H);
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
    const key = `${look.coat}|${look.mane.join()}|${look.mark}|${view}|${anim.moving ? 't' : 's'}${frame}|${blink ? 1 : 0}`;
    let canvas = cache.get(key);
    if (!canvas) { if (cache.size > 800) cache.clear(); canvas = render(C, view, F, blink); cache.set(key, canvas); }
    const w = W * PX, h = H * PX, top = sy - (GROUND + 1) * PX;
    if (!anim.lift) { ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, view === 'right' ? 20 : 11, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (dir === 'left') { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, -w / 2, top, w, h); }
    else ctx.drawImage(canvas, sx - w / 2, top, w, h);
    ctx.restore();
    return { top, h: (GROUND + 1) * PX };
  }

  return { draw, W, H, PX };
})();
