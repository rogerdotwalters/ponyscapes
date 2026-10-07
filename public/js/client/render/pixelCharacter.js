'use strict';
/* CLIENT - retro pixel-art characters. Each frame is painted pixel by pixel into a tiny canvas (W x H art pixels) in the character's own
 * colours (hair, skin, outfit, trim from the character screen; crown, dress and cape from the wardrobe), given a dark outline, cached, and
 * drawn scaled up with hard edges. Views: 'down' (facing the camera), 'up' (the back), 'left' ('right' is the mirror).
 * Animations: 'walk' (4 frames, stepped by the distance walked), 'idle' (a slow breath, and a blink now and then).
 * PIXEL_BODIES says which bodies use it (both: the princess in her dresses, the prince in tunic, trousers and boots). */
const PIXEL_BODIES = { princess: true, prince: true };
const PixelCharacter = (() => {
  const W = 28, H = 40, TOP = 2, CX = 14, PX = 1.3, PixelCharacter_W = W, PixelCharacter_H = H;   // (TOP: rows above the head kept for tall crowns)                  // art size, centre column, and how many world pixels one art pixel covers
  const cache = new Map();

  /* ---- colour helpers ---- */
  const hex = c => {                                                                        // '#rrggbb' or 'rgb(r,g,b)' -> [r, g, b]
    const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c || ''); if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
    const m = /^#?([0-9a-f]{6})$/i.exec(c || ''), n = m ? parseInt(m[1], 16) : 0x888888; return [n >> 16, (n >> 8) & 255, n & 255];
  };
  const css = ([r, g, b]) => `rgb(${Math.max(0, Math.min(255, r | 0))},${Math.max(0, Math.min(255, g | 0))},${Math.max(0, Math.min(255, b | 0))})`;
  const shade = (c, f) => css(hex(c).map(v => v * f));
  const light = (c, f) => css(hex(c).map(v => v + (255 - v) * f));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return css(A.map((v, i) => v + (B[i] - v) * t)); };
  /** Three tones of one colour: base, shadow, highlight. */
  const tones = c => ({ b: css(hex(c)), d: shade(c, 0.72), l: light(c, 0.22) });

  /* ---- the palette of one character in one outfit ---- */
  function palette(L, W8) {
    const outfit = W8.outfit, style = outfit ? outfit.style : 'plain';
    const skirt = (outfit && outfit.color) || L.outfit, trim = (outfit && outfit.trim) || L.trim;
    return {
      style, hairKind: L.hairKind, prince: !L.princess,
      tunic: tones(style === 'hunter' ? shade(skirt, 0.92) : skirt), trousers: tones(L.princess ? '#3b3542' : mix(skirt, '#2a2632', 0.72)), boot: tones('#5a3a22'), belt: tones(style === 'hunter' ? '#3a2a1a' : style === 'doublet' ? shade(skirt, 0.55) : '#4a3624'),
      hair: tones(L.hair), skin: { b: L.skin, d: shade(L.skin, 0.82), blush: mix(L.skin, '#e26a6a', L.princess ? 0.35 : 0.16) },
      eye: '#2a1a12', mouth: shade(L.skin, 0.62),
      blouse: style === 'plain' ? tones('#7a5236') : tones(skirt),                  // the plain dress: a brown blouse, a cream apron, a skirt in your colour
      lace: tones('#efe3c4'), apron: tones('#e6d9b6'), skirt: tones(skirt), trim: tones(trim),
      shoe: tones('#6b4428'),
      crown: W8.crown ? Object.assign(tones(W8.crown.color), { style: W8.crown.style, gem: W8.crown.gem || '#e05a8a' }) : null,
      cape: W8.cape ? Object.assign(tones(W8.cape.color), { style: W8.cape.style, trim: tones(W8.cape.trim || W8.cape.color) }) : null,
      outline: '#24170f',
    };
  }

  /* ---- a tiny pixel painter with a movable origin (for the bob of the upper body) ---- */
  function painter(ctx) {
    let ox = 0, oy = 0;
    const P = {
      at(dx, dy, fn) { const sx = ox, sy = oy; ox += dx; oy += dy; fn(); ox = sx; oy = sy; },
      px(x, y, c) { if (c) { ctx.fillStyle = c; ctx.fillRect(x + ox, y + oy, 1, 1); } },
      rect(x, y, w, h, c) { if (c && w > 0 && h > 0) { ctx.fillStyle = c; ctx.fillRect(x + ox, y + oy, w, h); } },
      row(y, x0, x1, c) { P.rect(x0, y, x1 - x0 + 1, 1, c); },
      /** A row centred on the body: `half` pixels each side of the centre line. */
      sym(y, half, c) { P.rect(CX - half, y, half * 2, 1, c); },
      /** A centred row, shaded: highlight at the left edge, shadow on the right third. */
      shaded(y, half, t) { P.sym(y, half, t.b); P.px(CX - half, y, t.l); const s = Math.max(1, Math.round(half * 0.6)); P.rect(CX + half - s, y, s, 1, t.d); },
    };
    return P;
  }

  /* ---- the outline: every empty pixel touching the figure turns dark ---- */
  function outline(ctx, color, W = PixelCharacter_W, H = PixelCharacter_H) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, solid = i => d[i * 4 + 3] > 0, mark = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (solid(y * W + x)) continue;
      if ((x > 0 && solid(y * W + x - 1)) || (x < W - 1 && solid(y * W + x + 1)) || (y > 0 && solid((y - 1) * W + x)) || (y < H - 1 && solid((y + 1) * W + x))) mark.push(x, y);
    }
    ctx.fillStyle = color; for (let i = 0; i < mark.length; i += 2) ctx.fillRect(mark[i], mark[i + 1], 1, 1);
  }

  /* ---- animation: what each frame moves ---- */
  // bob: the upper body; fl/fr: the feet [dx, dy] (front & back views) or near/far foot (side view); al/ar: hands up (-) / down (+); hem: skirt sway; sway: hair ends
  const WALK = [
    { bob: 0, fl: [-1, 0], fr: [0, -1], al: 1, ar: -1, hem: -1, sway: 1, side: { near: -3, far: 3, arm: 2 } },
    { bob: -1, fl: [0, 0], fr: [0, 0], al: 0, ar: 0, hem: 0, sway: 0, side: { near: 0, far: 0, arm: 0 } },
    { bob: 0, fl: [0, -1], fr: [1, 0], al: -1, ar: 1, hem: 1, sway: -1, side: { near: 3, far: -3, arm: -2 } },
    { bob: -1, fl: [0, 0], fr: [0, 0], al: 0, ar: 0, hem: 0, sway: 0, side: { near: 0, far: 0, arm: 0 } },
  ];
  const IDLE = [
    { bob: 0, fl: [0, 0], fr: [0, 0], al: 0, ar: 0, hem: 0, sway: 0, side: { near: 0, far: 0, arm: 0 } },
    { bob: -1, fl: [0, 0], fr: [0, 0], al: 0, ar: 0, hem: 0, sway: 1, side: { near: 0, far: 0, arm: 0 } },
  ];

  /* =====================================================================================================================
   * FRONT VIEW (facing the camera)
   * ===================================================================================================================== */
  function front(P, C, F, blink) {
    const gown = C.style === 'ball' || C.style === 'scaled', sun = C.style === 'sundress';
    P.at(0, F.bob, () => { capeBehind(P, C, F); hairBack(P, C, F, 'down'); });
    // the skirt (not bobbing at the hem, so the feet stay planted)
    skirtFront(P, C, F, gown, sun);
    if (!gown) feetFront(P, C, F, sun);
    P.at(0, F.bob, () => {
      if (C.style === 'plain') apronFront(P, C);
      torsoFront(P, C, F, gown, sun);
      headFront(P, C, blink);
      hairFront(P, C, F, 'down');
      crown(P, C, 'down');
    });
  }

  function skirtFront(P, C, F, gown, sun) {
    const top = 23, bottom = gown ? 36 : sun ? 31 : 34, t = C.skirt;
    for (let y = top; y <= bottom; y++) {
      const k = (y - top) / (bottom - top), half = Math.round(gown ? 4 + k * 6.4 : sun ? 4 + k * 3.4 : 4 + k * 3.2), sway = k > 0.6 ? F.hem : 0;
      P.at(sway, y < top + 2 ? F.bob : 0, () => P.shaded(y, half, t));
    }
    // folds: darker pixel streaks
    for (const dx of gown ? [-6, -3, 2, 5] : [-3, 1, 4]) for (let y = top + 4; y < bottom; y++) if ((y + dx) % 3 !== 0) P.px(CX + dx + (y > bottom - 4 ? F.hem : 0), y, t.d);
    if (gown) {
      P.at(F.hem, 0, () => { P.sym(bottom, 10, C.trim.b); P.sym(bottom - 1, 10, C.trim.d); });
      if (C.style === 'scaled') for (let y = top + 3; y < bottom - 2; y += 2) for (let x = -8 + (y % 4 ? 1 : 0); x < 9; x += 3) P.px(CX + x, y, C.skirt.l);
      else for (const [x, y] of [[-6, 27], [3, 26], [-2, 30], [6, 31], [-8, 33], [1, 34], [8, 28]]) P.px(CX + x, y, '#fffbe8');   // sparkles
    }
    if (sun) { P.at(F.hem, 0, () => { for (let x = -7; x < 7; x++) P.px(CX + x, bottom + 1, (x & 1) ? C.trim.b : C.trim.d); P.sym(bottom, 7, C.trim.b); }); }
    if (!gown && !sun) P.at(F.hem, 0, () => P.sym(bottom, 7, t.d));             // the hem
  }

  function feetFront(P, C, F, sun) {
    const shoe = sun ? C.trim : C.shoe;
    const foot = (x, [dx, dy]) => {
      if (sun) P.rect(x + dx, 32 + dy, 3, 3, C.skin.b);                          // bare legs below a sundress
      P.rect(x + dx, 35 + dy, 3, 2, shoe.b); P.px(x + dx, 35 + dy, shoe.l); P.row(37 + dy, x + dx, x + dx + 2, shoe.d);
    };
    foot(CX - 4, F.fl); foot(CX + 1, F.fr);
  }

  function apronFront(P, C) {
    const a = C.apron;
    for (let y = 24; y <= 33; y++) { const half = y < 28 ? 3 : 4; P.sym(y, half, a.b); P.px(CX + half - 1, y, a.d); P.px(CX - half, y, a.l); }
    for (let y = 26; y < 33; y += 2) P.px(CX + 1, y, a.d);                         // a crease
    P.sym(23, 4, a.l); P.sym(33, 4, a.d);
  }

  function torsoFront(P, C, F, gown, sun) {
    const b = C.blouse;
    P.sym(16, 3, b.b); for (let y = 17; y <= 22; y++) P.shaded(y, 5, b);             // shoulders and body
    P.sym(23, 4, C.style === 'plain' ? C.apron.l : C.trim.b);                          // the waistband / sash
    // sleeves and hands, swinging with the step
    for (const [x, d, dark] of [[CX - 7, F.al, false], [CX + 5, F.ar, true]]) {
      const len = sun ? 2 : 6;
      P.rect(x, 17, 2, len, dark ? b.d : b.b); P.px(x, 17, b.l);
      if (sun || gown) P.rect(x, 16, 2, 2, b.l);                                       // puffed sleeves
      if (sun) P.rect(x, 19, 2, 4 + d, C.skin.b);                                     // bare arms
      else P.rect(x, 23, 2, 1 + Math.max(0, d), C.style === 'plain' ? C.lace.b : C.trim.b);   // the cuff
      P.rect(x, 24 + d, 2, 2, C.skin.b); P.px(x + (dark ? 1 : 0), 25 + d, C.skin.d);
    }
    if (C.style === 'plain') {                                                         // the lace collar, scalloped
      P.sym(16, 3, C.lace.b); P.sym(17, 4, C.lace.b); for (let x = -4; x < 4; x += 2) P.px(CX + x, 17, C.lace.d); P.px(CX - 1, 18, C.lace.d); P.px(CX, 18, C.lace.d);
    } else if (sun) { P.px(CX - 1, 18, C.trim.b); P.px(CX, 18, C.trim.d); P.px(CX - 2, 17, C.trim.b); P.px(CX + 1, 17, C.trim.b); }     // a bow
    else { P.sym(16, 4, C.trim.b); P.sym(17, 2, C.skin.b); }                            // a gown's neckline
    if (C.cape && (C.cape.style === 'royal' || C.cape.style === 'fur')) { for (let x = -5; x < 5; x++) P.px(CX + x, 16, (x & 1) ? C.cape.trim.b : C.cape.trim.l); }
    if (C.cape) { P.px(CX - 1, 17, '#f2c14e'); P.px(CX, 17, '#f2c14e'); }              // the cape's clasp
  }

  function headFront(P, C, blink) {
    const s = C.skin;
    P.sym(16, 1, s.d);                                                                  // the neck
    for (let y = 6; y <= 15; y++) { const half = y < 14 ? 6 : y === 14 ? 5 : 4; P.sym(y, half, s.b); }
    P.px(CX + 5, 13, s.d); P.px(CX + 4, 14, s.d); P.px(CX + 3, 15, s.d);               // shadow under the jaw
    if (blink) { P.row(11, CX - 5, CX - 3, C.eye); P.row(11, CX + 2, CX + 4, C.eye); }
    else for (const x of [CX - 5, CX + 2]) {                                             // big dark eyes with a shine, and a brow
      P.rect(x, 9, 3, 3, C.eye); P.px(x, 9, '#ffffff'); P.px(x + 2, 11, mix(C.eye, '#8a6a50', 0.5)); P.row(8, x, x + 2, C.hair.d);
    }
    P.row(12, CX - 6, CX - 5, s.blush); P.row(12, CX + 4, CX + 5, s.blush);
    P.row(13, CX - 1, CX, C.mouth);
  }

  /* =====================================================================================================================
   * BACK VIEW (walking away)
   * ===================================================================================================================== */
  function back(P, C, F) {
    const gown = C.style === 'ball' || C.style === 'scaled', sun = C.style === 'sundress';
    skirtFront(P, C, F, gown, sun);
    if (!gown) feetFront(P, C, { fl: F.fr, fr: F.fl }, sun);
    P.at(0, F.bob, () => {
      const b = C.blouse;
      P.sym(16, 3, b.b); for (let y = 17; y <= 22; y++) P.shaded(y, 5, b);
      for (const [x, d] of [[CX - 7, F.ar], [CX + 5, F.al]]) { P.rect(x, 17, 2, sun ? 2 : 6, b.d); if (sun) P.rect(x, 19, 2, 4, C.skin.b); P.rect(x, 24 + d, 2, 2, C.skin.d); }
      P.sym(23, 4, C.style === 'plain' ? C.apron.l : C.trim.b);
      if (C.style === 'plain') {                                                       // the apron's bow at the back
        P.rect(CX - 3, 22, 2, 2, C.apron.b); P.rect(CX + 1, 22, 2, 2, C.apron.b); P.rect(CX - 1, 22, 2, 2, C.apron.d);
        P.px(CX - 2, 24, C.apron.b); P.px(CX - 2, 25, C.apron.b); P.px(CX + 1, 24, C.apron.b); P.px(CX + 1, 25, C.apron.b); P.px(CX + 2, 26, C.apron.d);
      }
      capeOver(P, C, F);
      P.sym(15, 1, C.skin.d);
      for (let y = 2; y <= 15; y++) P.sym(y, y < 3 ? 4 : y < 4 ? 6 : y < 14 ? 7 : 6, (y * 3 + 1) % 5 ? C.hair.b : C.hair.d);   // the back of the head is all hair
      P.row(2, CX - 2, CX + 1, C.hair.l); P.row(3, CX - 4, CX - 2, C.hair.l);
      hairBack(P, C, F, 'up');
      crown(P, C, 'up');
    });
  }

  /* =====================================================================================================================
   * SIDE VIEW (facing left; 'right' is drawn mirrored)
   * ===================================================================================================================== */
  function side(P, C, F) {
    const gown = C.style === 'ball' || C.style === 'scaled', sun = C.style === 'sundress', S = F.side, b = C.blouse;
    P.at(0, F.bob, () => { capeSide(P, C, F); hairBack(P, C, F, 'left'); });
    // the far foot, behind the skirt
    const shoe = sun ? C.trim : C.shoe;
    if (!gown) { if (sun) P.rect(CX + S.far, 32, 2, 3, C.skin.d); P.rect(CX - 1 + S.far, 35, 3, 2, shoe.d); }
    // skirt: a bell seen from the side, swinging at the hem
    const top = 23, bottom = gown ? 36 : sun ? 31 : 34;
    for (let y = top; y <= bottom; y++) {
      const k = (y - top) / (bottom - top), back = Math.round(gown ? 4 + k * 5 : 3 + k * 3), fwd = Math.round(gown ? 4 + k * 5 : 3 + k * 2.6), sway = k > 0.6 ? Math.sign(S.near) : 0;
      P.at(0, y < top + 2 ? F.bob : 0, () => { P.row(y, CX - fwd + sway, CX + back + sway, C.skirt.b); P.px(CX - fwd + sway, y, C.skirt.l); P.row(y, CX + back - 1 + sway, CX + back + sway, C.skirt.d); });
    }
    for (let y = top + 4; y < bottom; y++) if (y % 3) P.px(CX + 1, y, C.skirt.d);
    if (gown) P.row(bottom, CX - 9, CX + 9, C.trim.b);
    if (sun) P.row(bottom + 1, CX - 5, CX + 5, C.trim.b);
    if (!gown) { if (sun) P.rect(CX - 1 + S.near, 32, 2, 3, C.skin.b); P.rect(CX - 2 + S.near, 35, 4, 2, shoe.b); P.px(CX - 2 + S.near, 35, shoe.l); P.row(37, CX - 2 + S.near, CX + 1 + S.near, shoe.d); }
    P.at(0, F.bob, () => {
      if (C.style === 'plain') { for (let y = 24; y <= 33; y++) { const x = CX - (y < 28 ? 4 : 5); P.rect(x, y, 2, 1, C.apron.b); P.px(x, y, C.apron.l); } }   // the apron's front edge
      P.row(16, CX - 2, CX + 1, b.b); for (let y = 17; y <= 22; y++) { P.row(y, CX - 3, CX + 3, b.b); P.px(CX + 3, y, b.d); }
      P.row(23, CX - 3, CX + 3, C.style === 'plain' ? C.apron.l : C.trim.b);
      if (C.style === 'plain') { P.row(16, CX - 2, CX + 1, C.lace.b); P.px(CX - 3, 17, C.lace.b); P.px(CX - 2, 17, C.lace.d); }
      else if (!sun) P.row(16, CX - 3, CX + 1, C.trim.b);
      // the near arm, swinging
      const ax = CX - 1 + Math.round(S.arm / 2), hand = CX - 1 + S.arm;
      P.rect(ax, 17, 2, sun ? 2 : 5, b.l); P.px(ax + 1, 18, b.b);
      if (sun) P.rect(Math.round((ax + hand) / 2), 19, 2, 4, C.skin.b);
      else { P.rect(Math.round((ax + hand) / 2), 21, 2, 2, b.b); P.rect(Math.round((ax + hand) / 2), 23, 2, 1, C.style === 'plain' ? C.lace.b : C.trim.b); }
      P.rect(hand, 24, 2, 2, C.skin.b);
      // the head in profile: face to the left
      const s = C.skin;
      P.row(16, CX - 1, CX + 1, s.d);
      for (let y = 5; y <= 15; y++) { const x0 = y < 14 ? CX - 6 : y === 14 ? CX - 5 : CX - 4, x1 = CX + 4; P.row(y, x0, x1, s.b); }
      P.px(CX - 7, 11, s.b);                                                             // the nose
      P.rect(CX - 5, 9, 2, 3, C.eye); P.px(CX - 5, 9, '#ffffff'); P.row(8, CX - 5, CX - 3, C.hair.d);
      P.px(CX - 3, 12, s.blush); P.px(CX - 2, 12, s.blush); P.px(CX - 6, 13, C.mouth);
      hairFront(P, C, F, 'left');
      crown(P, C, 'left');
    });
  }


  /* =====================================================================================================================
   * THE PRINCE: a tunic (or doublet, or hunter's leathers) over trousers and boots, belted, with his own six hair styles.
   * Same head and face as the princess, the same frame rows (head 6-15, body 16-23, legs below), so crowns, capes and tools line up.
   * ===================================================================================================================== */
  const HEM = { plain: 26, tunic: 30, doublet: 27, hunter: 26 };
  /** Two legs in trousers and boots, seen from the front or back; each foot steps by [dx, dy]. */
  function legsFront(P, C, F) {
    const leg = (x, [dx, dy], far) => {
      const t = C.trousers, b = C.boot;
      for (let y = 25; y <= 33 + dy; y++) { P.rect(x + dx, y, 3, 1, far ? t.d : t.b); P.px(x + dx + (far ? 2 : 0), y, far ? t.d : t.l); }
      P.rect(x + dx, 33 + dy, 3, 3, b.b); P.row(33 + dy, x + dx, x + dx + 2, b.l); P.px(x + dx + 2, 34 + dy, b.d);
      P.row(36 + dy, x + dx - (x < CX ? 1 : 0), x + dx + 2 + (x < CX ? 0 : 1), b.d);                         // the sole, toes turned out
    };
    leg(CX - 4, F.fl, false); leg(CX + 1, F.fr, true);
  }
  /** The tunic's skirt below the belt (front or back). */
  function tunicSkirt(P, C, F) {
    const t = C.tunic, hem = HEM[C.style] || 26;
    for (let y = 24; y <= hem; y++) { const half = 5 + Math.round((y - 24) * (C.style === 'tunic' ? 0.34 : 0.5)), sway = y > hem - 2 ? F.hem : 0; P.at(sway, 0, () => P.shaded(y, half, t)); }
    for (let y = 25; y < hem; y++) if (y % 2) P.px(CX - 2 + (y > hem - 2 ? F.hem : 0), y, t.d);                // a fold
    const edge = C.style === 'plain' ? t.d : C.trim.b, half = 5 + Math.round((hem - 24) * (C.style === 'tunic' ? 0.34 : 0.5));
    P.at(F.hem, 0, () => P.sym(hem, half, edge));
    if (C.style === 'tunic') for (let y = 24; y < hem; y++) P.px(CX - 1, y, C.trim.b);                     // a gold band down the front
  }
  /** Body, belt, sleeves and hands from the front (back: true from behind). */
  function princeTorso(P, C, F, back) {
    const t = C.tunic, S = C.style;
    P.sym(16, 4, t.b); for (let y = 17; y <= 23; y++) P.shaded(y, 5, t);
    for (const [x, d, dark] of back ? [[CX - 7, F.ar, true], [CX + 5, F.al, true]] : [[CX - 7, F.al, false], [CX + 5, F.ar, true]]) {
      P.rect(x, 17, 2, 7, dark ? t.d : t.b); P.px(x, 17, t.l);
      P.rect(x, 23 + Math.max(0, d), 2, 1, S === 'plain' ? t.d : C.trim.b);                                   // the cuff
      P.rect(x, 24 + d, 2, 2, back ? C.skin.d : C.skin.b); if (!back) P.px(x + (dark ? 1 : 0), 25 + d, C.skin.d);
    }
    if (S === 'doublet') { P.rect(CX - 7, 16, 3, 2, C.trim.b); P.rect(CX + 4, 16, 3, 2, C.trim.b); P.px(CX - 7, 16, C.trim.l); }   // epaulettes
    if (!back) {
      if (S === 'doublet') { for (const y of [18, 20, 22]) P.px(CX - 1, y, C.trim.b); for (let y = 17; y <= 23; y++) P.px(CX, y, t.d); }
      else if (S === 'hunter') { for (let k = 0; k < 7; k++) { P.px(CX - 4 + k + (k > 3 ? 1 : 0), 17 + k, C.trim.b); } for (let y = 17; y <= 21; y += 2) { P.px(CX - 1, y, t.l); P.px(CX, y + 1, t.l); } }   // a strap across, lacing
      else { P.px(CX - 2, 16, S === 'tunic' ? C.trim.b : t.d); P.px(CX + 1, 16, S === 'tunic' ? C.trim.b : t.d); P.px(CX - 1, 17, C.skin.d); P.px(CX, 17, C.skin.d); }   // a V neck (gold-edged on the royal tunic)
      if (S === 'plain') { P.px(CX - 4, 19, C.trim.b); P.px(CX + 3, 19, C.trim.b); }                        // a little trim on the chest
    }
    P.sym(24, 5, C.belt.b); P.row(24, CX - 5, CX - 4, C.belt.l);                                             // the belt, and its buckle
    if (!back && S !== 'doublet') { P.rect(CX - 1, 24, 2, 1, '#f2c14e'); }
    if (C.cape && !back && (C.cape.style === 'royal' || C.cape.style === 'fur')) { for (let x = -5; x < 5; x++) P.px(CX + x, 16, (x & 1) ? C.cape.trim.b : C.cape.trim.l); }
    if (C.cape && !back) { P.px(CX - 1, 17, '#f2c14e'); P.px(CX, 17, '#f2c14e'); }
  }
  function frontPrince(P, C, F, blink) {
    P.at(0, F.bob, () => { capeBehind(P, C, F); princeHairBack(P, C, F, 'down'); });
    legsFront(P, C, F);
    P.at(0, F.bob, () => {
      tunicSkirt(P, C, F); princeTorso(P, C, F, false);
      headFront(P, C, blink); princeHairFront(P, C, F, 'down'); crown(P, C, 'down');
    });
  }
  function backPrince(P, C, F) {
    legsFront(P, C, { fl: F.fr, fr: F.fl });
    P.at(0, F.bob, () => {
      tunicSkirt(P, C, F); princeTorso(P, C, F, true); capeOver(P, C, F);
      const k = C.hairKind, end = k === 'medium' ? 16 : k === 'curly' ? 13 : 12;
      for (let y = 6; y <= 15; y++) P.sym(y, y < 14 ? 6 : y === 14 ? 5 : 4, C.skin.d);                     // the back of the head and the neck
      for (let y = 2; y <= end; y++) P.sym(y, y < 3 ? 4 : y < 4 ? 6 : y < end ? 7 : 6, (y * 3 + 1) % 5 ? C.hair.b : C.hair.d);
      P.row(2, CX - 2, CX + 1, C.hair.l); P.row(3, CX - 4, CX - 2, C.hair.l);
      princeHairBack(P, C, F, 'up'); princeHairTop(P, C, 'up');
      crown(P, C, 'up');
    });
  }
  function sidePrince(P, C, F) {
    const S = F.side, t = C.tunic, tr = C.trousers, b = C.boot;
    P.at(0, F.bob, () => { capeSide(P, C, F); princeHairBack(P, C, F, 'left'); });
    const leg = (stride, far) => {                                                                         // a leg swinging from the hip
      for (let y = 25; y <= 33; y++) { const x = CX - 1 + Math.round(stride * (y - 25) / 9); P.rect(x, y, 3, 1, far ? tr.d : tr.b); if (!far) P.px(x, y, tr.l); }
      const fx = CX - 1 + stride; P.rect(fx, 33, 3, 3, far ? b.d : b.b); if (!far) P.row(33, fx, fx + 2, b.l); P.row(36, fx - 1, fx + 2, b.d);   // the boot, toe forward (left)
    };
    leg(S.far, true); leg(S.near, false);
    P.at(0, F.bob, () => {
      const hem = HEM[C.style] || 26;
      for (let y = 24; y <= hem; y++) { const w = 4 + Math.round((y - 24) * 0.4), sw = y > hem - 2 ? Math.sign(S.near) : 0; P.row(y, CX - w + sw, CX + w + sw, t.b); P.px(CX - w + sw, y, t.l); P.px(CX + w + sw, y, t.d); }
      P.row(hem, CX - 4 - Math.round((hem - 24) * 0.4), CX + 4 + Math.round((hem - 24) * 0.4), C.style === 'plain' ? t.d : C.trim.b);
      P.row(16, CX - 2, CX + 1, t.b); for (let y = 17; y <= 23; y++) { P.row(y, CX - 4, CX + 3, t.b); P.px(CX + 3, y, t.d); P.px(CX - 4, y, t.l); }
      if (C.style === 'doublet') { P.rect(CX - 1, 16, 3, 2, C.trim.b); P.px(CX - 4, 19, C.trim.b); P.px(CX - 4, 21, C.trim.b); }
      if (C.style === 'hunter') for (let k = 0; k < 7; k++) P.px(CX - 3 + k, 17 + k, C.trim.b);
      if (C.style === 'tunic') P.row(16, CX - 3, CX - 1, C.trim.b);
      P.row(24, CX - 4, CX + 3, C.belt.b); if (C.style !== 'doublet') P.px(CX - 4, 24, '#f2c14e');
      const ax = CX - 1 + Math.round(S.arm / 2), hand = CX - 1 + S.arm;                                     // the near arm, swinging
      P.rect(ax, 17, 2, 5, t.l); P.px(ax + 1, 18, t.b); P.rect(Math.round((ax + hand) / 2), 21, 2, 2, t.b);
      P.rect(Math.round((ax + hand) / 2), 23, 2, 1, C.style === 'plain' ? t.d : C.trim.b); P.rect(hand, 24, 2, 2, C.skin.b);
      const s = C.skin;                                                                                    // the head in profile, facing left
      P.row(16, CX - 1, CX + 1, s.d);
      for (let y = 5; y <= 15; y++) { const x0 = y < 14 ? CX - 6 : y === 14 ? CX - 5 : CX - 4; P.row(y, x0, CX + 4, s.b); }
      P.px(CX - 7, 11, s.b);
      P.rect(CX - 5, 9, 2, 3, C.eye); P.px(CX - 5, 9, '#ffffff'); P.row(8, CX - 5, CX - 3, C.hair.d);
      P.px(CX - 6, 13, C.mouth);
      princeHairFront(P, C, F, 'left'); crown(P, C, 'left');
    });
  }

  /* ---- the prince's hair: short, swept, spiky, medium (to the shoulders), tied (a short tail), curly ---- */
  function princeHairBack(P, C, F, view) {
    const h = C.hair, k = C.hairKind;
    if (k === 'medium' && view === 'down') for (let y = 4; y <= 17; y++) P.sym(y, y < 5 ? 7 : 8, (y + 2) % 4 ? h.b : h.d);
    if (k === 'medium' && view === 'left') for (let y = 4; y <= 17; y++) P.row(y, CX, CX + 7, (y + 2) % 4 ? h.b : h.d);
    if (k === 'curly' && view !== 'up') for (let y = 2; y <= 12; y++) { const half = y < 3 ? 6 : 8 + ((y >> 1) & 1); if (view === 'left') P.row(y, CX - 2, CX + half - 1, y % 3 ? h.b : h.d); else P.sym(y, half, y % 3 ? h.b : h.d); }
    if (k === 'tied' && view !== 'down') {                                                                // a short tail at the nape, tied with a band (hidden behind the head from the front)
      const tx = view === 'up' ? CX - 1 : CX + 6;
      for (let y = 11; y <= 17; y++) P.rect(tx + (view === 'up' ? 0 : (y > 14 ? 1 : 0)) + (y > 15 ? F.sway : 0), y, 2, 1, y % 3 ? h.b : h.d);
      P.rect(tx, 11, 2, 1, '#3a2a1a');
    }
  }
  /** Spikes, a quiff or curls on top of the head (all views). */
  function princeHairTop(P, C, view) {
    const h = C.hair, k = C.hairKind;
    if (k === 'spiky') for (const [x, tall] of view === 'left' ? [[-5, 1], [-2, 2], [1, 2], [4, 1]] : [[-6, 1], [-3, 2], [0, 3], [3, 2], [5, 1]]) for (let j = 1; j <= tall + 1; j++) { P.px(CX + x - (view === 'left' ? 0 : 0), 2 - j, j === tall + 1 ? h.l : h.b); P.px(CX + x + 1, 2 - j + 1, h.d); }
    if (k === 'swept') { const x0 = view === 'left' ? CX - 7 : CX - 5; P.row(1, x0, x0 + 8, h.b); P.row(0, x0 + 1, x0 + 6, h.b); P.row(0, x0 + 2, x0 + 4, h.l); P.row(1, x0, x0 + 2, h.l); }
    if (k === 'curly') for (let x = -7; x <= 6; x += 2) { P.px(CX + x, 1, h.b); P.px(CX + x + 1, 1, h.d); }
  }
  function princeHairFront(P, C, F, view) {
    const h = C.hair, k = C.hairKind;
    if (view === 'left') {
      for (let y = 2; y <= 7; y++) P.row(y, CX - (y < 3 ? 3 : y < 4 ? 5 : k === 'swept' || k === 'tied' ? 5 : 6), CX + (y < 3 ? 3 : 6), h.b);
      P.row(2, CX - 2, CX + 1, h.l); P.row(3, CX - 4, CX - 1, h.l);
      const ear = k === 'medium' ? 15 : k === 'curly' ? 12 : 10;
      for (let y = 8; y <= ear; y++) P.row(y, CX + (k === 'short' || k === 'tied' || k === 'swept' ? 1 : 0), CX + 6, (y + 1) % 4 ? h.b : h.d);
      if (k === 'short' || k === 'spiky') { P.px(CX - 6, 8, h.b); P.px(CX - 2, 8, h.d); }
      if (k === 'curly') for (let y = 4; y <= 12; y += 2) P.px(CX + 7, y, h.b);
      P.px(CX + 1, 10, h.d); P.px(CX + 1, 11, h.d);                                                        // a sideburn
      princeHairTop(P, C, 'left');
      return;
    }
    P.sym(2, 4, h.b); P.sym(3, 6, h.b); P.sym(4, 7, h.b); P.sym(5, 7, h.b); P.row(2, CX - 2, CX + 1, h.l); P.row(3, CX - 4, CX - 1, h.l);
    if (k === 'swept' || k === 'tied') { P.sym(6, 6, h.b); P.row(6, CX - 5, CX - 1, h.l); P.px(CX - 6, 7, h.b); P.px(CX + 5, 7, h.b); }   // combed back: the brow clear
    else if (k === 'spiky') { P.sym(6, 6, h.b); for (const x of [-6, -4, -1, 2, 4]) P.px(CX + x, 7, h.b); P.px(CX - 3, 8, h.b); P.px(CX + 3, 8, h.b); }
    else if (k === 'curly') { P.sym(6, 7, h.b); for (let x = -7; x <= 6; x += 2) P.px(CX + x, 7, h.b); P.px(CX - 3, 6, h.d); P.px(CX + 2, 6, h.d); }
    else { P.sym(6, 6, h.b); for (const x of [-6, -5, -4, -1, 0, 3, 4, 5]) P.px(CX + x, 7, h.b); P.px(CX - 3, 6, h.d); P.px(CX + 1, 6, h.d); }   // short / medium: a fringe with a side parting
    const ear = k === 'medium' ? 15 : k === 'curly' ? 12 : 10;
    for (const [x0, x1] of [[CX - 8, CX - 6], [CX + 5, CX + 7]]) for (let y = 5; y <= ear; y++) P.row(y, x0 + (y > 9 && k !== 'medium' && k !== 'curly' ? 1 : 0), x1 - (y > 9 && k !== 'medium' && k !== 'curly' ? 1 : 0), (y + x0) % 4 ? h.b : h.d);
    if (k === 'medium') for (const x of [CX - 8, CX + 6]) P.rect(x, 15, 2, 2, h.d);
    if (k === 'curly') for (let y = 5; y <= 12; y += 2) { P.px(CX - 9, y, h.b); P.px(CX + 8, y, h.b); }
    princeHairTop(P, C, 'down');
  }

  /* ---- capes ---- */
  function capeBehind(P, C, F) {
    const k = C.cape; if (!k) return;
    for (let y = 17; y <= 32; y++) { P.row(y, CX - 8, CX - 7, k.d); P.row(y, CX + 6, CX + 7, k.d); }
    capeHem(P, k, 32, CX - 8, CX + 7, F);
  }
  function capeOver(P, C, F) {
    const k = C.cape; if (!k) return;
    for (let y = 16; y <= 32; y++) { const half = y < 18 ? 5 : y < 26 ? 6 : 7; P.shaded(y, half, k); }
    for (const dx of [-3, 2]) for (let y = 19; y < 31; y++) if (y % 3) P.px(CX + dx, y, k.d);
    if (k.style === 'scaled') for (let y = 18; y < 31; y += 2) for (let x = -5 + (y % 4 ? 1 : 0); x < 6; x += 3) P.px(CX + x, y, k.l);
    if (k.style === 'star') for (const [x, y] of [[-4, 20], [2, 22], [-1, 26], [4, 28], [-5, 29]]) P.px(CX + x, y, k.trim.b);
    capeHem(P, k, 32, CX - 7, CX + 6, F);
  }
  function capeSide(P, C, F) {
    const k = C.cape; if (!k) return;
    const flare = F.side.near !== 0 ? 1 : 0;
    for (let y = 17; y <= 32; y++) { const x1 = CX + 4 + Math.round((y - 17) / 4) + (y > 26 ? flare : 0); P.row(y, CX + 2, x1, k.d); P.px(x1, y, k.b); }
    capeHem(P, k, 32, CX + 2, CX + 9 + flare, F);
  }
  function capeHem(P, k, y, x0, x1) {
    if (k.style === 'royal' || k.style === 'plain') P.row(y, x0, x1, k.trim.b);
    else if (k.style === 'fur') { P.row(y, x0, x1, k.trim.l); for (let x = x0; x <= x1; x += 2) P.px(x, y + 1, k.trim.b); }
  }

  /* ---- hair: what hangs behind (drawn before the body) ---- */
  function hairBack(P, C, F, view) {
    const h = C.hair, kind = C.hairKind, sway = F.sway;
    if (kind === 'long' || kind === 'curly') {
      const long = kind === 'long', end = long ? 27 : 20, half = long ? 9 : 10;
      for (let y = 3; y <= end; y++) {
        const wave = ((y >> 1) & 1), hw = y < 5 ? half - 2 : half + (y > end - 3 ? -1 : 0) + (long ? 0 : wave) - (long ? wave : 0), sx = y > end - 7 ? sway : 0;
        for (let x = -hw; x < hw; x++) {
          const tri = [0, 1, 1, 0, -1, -1][y % 6], band = ((x + tri) % 5 + 5) % 5;          // wavy strands: zigzag lines of shadow, a little shine
          const c = band === 0 ? h.d : band === 2 && y % 3 === 0 ? h.l : h.b;
          if (view === 'left') { if (x >= -1) P.px(CX + Math.round(x * 0.8) + 1 + sx, y, c); }
          else P.px(CX + x + sx, y, c);
        }
      }
      for (let x = -half + 1; x < half - 1; x += 3) if (view !== 'left' || x >= 0) P.px((view === 'left' ? CX + Math.round(x * 0.8) + 1 : CX + x) + sway, end + 1, h.d);   // ragged ends
    } else if (kind === 'bob') {
      for (let y = 4; y <= 16; y++) view === 'left' ? P.row(y, CX - 1, CX + 7, (y + 2) % 4 ? h.b : h.d) : P.sym(y, y < 5 ? 7 : 8, (y + 2) % 4 || view === 'down' ? h.b : h.d);
      view === 'left' ? P.row(16, CX - 1, CX + 7, h.d) : P.sym(16, 8, h.d);
    } else if (kind === 'ponytail') {
      const tx = view === 'left' ? CX + 6 : view === 'up' ? CX - 1 : CX + 6;
      for (let y = 6; y <= 20; y++) { const w = y < 9 ? 3 : y < 16 ? 3 : 2, x = tx + (view === 'up' ? 0 : Math.round((y - 6) / 6)) + (y > 14 ? sway : 0); P.rect(x, y, w, 1, (y % 3) ? h.b : h.d); }
      P.rect(tx, 5, 3, 1, C.trim.b);
    } else if (kind === 'braid' && view !== 'down') {
      const bx = view === 'up' ? CX - 1 : CX + 5;
      for (let y = 13; y <= 25; y++) P.rect(bx + ((y >> 1) & 1) + (y > 20 ? sway : 0), y, 2, 1, (y >> 1) & 1 ? h.b : h.d);
      P.rect(bx, 26, 2, 1, C.trim.b);
    }
    if (kind === 'bun') { const bx = view === 'left' ? CX + 3 : CX - 3; P.rect(bx, -1, 6, 4, h.b); P.row(-2, bx + 1, bx + 4, h.b); P.row(-1, bx + 1, bx + 3, h.l); P.row(2, bx, bx + 5, h.d); P.px(bx + 5, 0, C.trim.b); }
  }

  /* ---- hair: on the head and over the shoulders (drawn after the face) ---- */
  function hairFront(P, C, F, view) {
    const h = C.hair, kind = C.hairKind, sway = F.sway;
    if (view === 'left') {                                                              // the crown of the head and the bangs, from the side
      for (let y = 2; y <= 7; y++) P.row(y, CX - (y < 3 ? 3 : y < 4 ? 5 : 7), CX + (y < 3 ? 3 : 6), h.b);
      P.row(2, CX - 2, CX + 1, h.l); P.row(3, CX - 4, CX - 1, h.l);
      for (let y = 8; y <= 13; y++) P.row(y, CX, CX + 6, (y + 1) % 4 ? h.b : h.d);    // over the ear
      P.px(CX - 7, 8, h.b); P.px(CX - 6, 8, h.b); P.px(CX - 2, 8, h.d); P.px(CX + 2, 10, h.d);
      if (kind === 'long' || kind === 'curly') for (let y = 13; y <= (kind === 'long' ? 24 : 18); y++) P.row(y, CX + 1 + (y > 20 ? sway : 0), CX + 3 + (y > 20 ? sway : 0), (y % 3) ? h.b : h.d);
      if (kind === 'bob') for (let y = 9; y <= 15; y++) P.row(y, CX - 1, CX + 5, h.b);
      return;
    }
    // the cap of hair and the bangs, from the front
    P.sym(2, 4, h.b); P.sym(3, 6, h.b); P.sym(4, 7, h.b); P.sym(5, 7, h.b); P.row(2, CX - 2, CX + 1, h.l); P.row(3, CX - 4, CX - 1, h.l); P.px(CX - 6, 4, h.l);
    if (view === 'down') {
      P.sym(6, 6, h.b);
      for (const x of [-6, -5, -2, 3, 4, 5]) P.px(CX + x, 7, h.b);                    // wispy bangs
      P.px(CX - 3, 6, h.d); P.px(CX + 1, 6, h.d); P.px(CX - 5, 7, h.d);
      for (const [x0, x1] of [[CX - 8, CX - 6], [CX + 5, CX + 7]]) for (let y = 5; y <= 12; y++) P.row(y, x0, x1, (y + x0) % 4 ? h.b : h.d);   // over the ears
      if (kind === 'long' || kind === 'curly') {                                        // locks falling over the shoulders, in front
        const end = kind === 'long' ? 24 : 18;
        for (const [x, dark] of [[CX - 7, false], [CX + 5, true]]) for (let y = 13; y <= end; y++) {
          const wob = ((y >> 1) & 1) * (x < CX ? -1 : 1) + (x < CX ? -1 : 1), sx = y > end - 5 ? sway : 0;
          P.rect(x + wob + sx, y, 2, 1, (y % 3 === 0) ? h.d : dark ? h.b : h.l);
        }
      }
      if (kind === 'bob') for (const x of [CX - 8, CX + 6]) for (let y = 6; y <= 15; y++) P.rect(x, y, 2, 1, y === 15 ? h.d : h.b);
      if (kind === 'braid') for (let y = 13; y <= 25; y++) P.rect(CX - 8 + ((y >> 1) & 1) + (y > 21 ? sway : 0), y, 2, 1, (y >> 1) & 1 ? h.b : h.d);
      if (kind === 'braid') P.rect(CX - 8, 26, 2, 1, C.trim.b);
      if (kind === 'ponytail') P.rect(CX + 6, 4, 2, 2, C.trim.b);
    }
  }

  /* ---- crowns: a crown (royal), tiara, circlet or spiked crown ---- */
  function crown(P, C, view) {
    const k = C.crown; if (!k) return;
    const side = view === 'left', x0 = side ? CX - 5 : CX - 6, x1 = side ? CX + 3 : CX + 5;
    if (k.style === 'royal' || k.style === 'spiked') {                                   // the golden crown from the picture: a band and three points
      P.row(1, x0, x1, k.b); P.row(2, x0, x1, k.d); P.px(x0, 1, k.l);
      const tall = k.style === 'spiked' ? 1 : 0;
      for (const x of side ? [x0, CX - 1, x1] : [x0, CX - 1, CX, x1]) { P.px(x, 0, k.b); P.px(x, -1, k.l); if (tall || x === CX - 1 || x === CX) P.px(x, -2, k.b); }
      if (!side) { P.px(x0 + 1, 0, k.b); P.px(x1 - 1, 0, k.b); }
      if (k.gem && view !== 'up') P.px(side ? CX - 2 : CX - 1, 1, k.gem);
    } else if (k.style === 'tiara') {
      P.row(2, x0, x1, k.b); P.px(CX - 1, 1, k.b); P.px(CX, 1, k.b); P.px(CX - 1, 0, k.l); P.px(CX, 0, k.b); P.px(CX - 1, -1, k.l); P.px(x0 + 2, 1, k.b); P.px(x1 - 2, 1, k.b);
      if (view !== 'up') P.px(CX - 1, 1, k.gem);
    } else {                                                                               // circlet: a thin band with little points
      P.row(3, x0, x1, k.b); for (let x = x0 + 1; x < x1; x += 3) P.px(x, 2, k.l);
    }
  }

  /* ---- one frame ---- */
  function render(C, dir, F, blink, hurt) {
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'), P = painter(ctx);
    P.at(0, TOP, () => { if (C.prince) { if (dir === 'up') backPrince(P, C, F); else if (dir === 'down') frontPrince(P, C, F, blink); else sidePrince(P, C, F); } else if (dir === 'up') back(P, C, F); else if (dir === 'down') front(P, C, F, blink); else side(P, C, F); });
    outline(ctx, C.outline);
    if (hurt) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(255,40,40,.55)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    return canvas;
  }

  /**
   * Draws a character. L: CharacterLook.describe(...); wardrobe: { crown, outfit, cape } looks; dir: 'up'|'down'|'left'|'right';
   * anim: { moving, phase (walk phase, radians), now, seed, hurt, crouch (world px pressed down), cut (art rows hidden from the bottom: riding) }.
   * Returns { top, headY, torsoTop } in screen space so tools, name tags and emotes line up.
   */
  function draw(ctx, L, wardrobe, dir, sx, sy, anim) {
    const C = palette(L, wardrobe);
    const two = Math.PI * 2, phase = ((anim.phase % two) + two) % two;
    const frame = anim.moving ? Math.floor(phase / (Math.PI / 2)) % 4 : Math.floor((anim.now / 650 + anim.seed) % 2);
    const F = anim.moving ? WALK[frame] : IDLE[frame];
    const blink = !anim.moving && ((anim.now + anim.seed * 977) % 3600) < 130;
    const view = dir === 'right' ? 'left' : dir, hurt = !!anim.hurt;
    const key = `${JSON.stringify(L)}|${JSON.stringify(wardrobe)}|${view}|${anim.moving ? 'w' : 'i'}${frame}|${blink ? 1 : 0}|${hurt ? 1 : 0}`;
    let canvas = cache.get(key);
    if (!canvas) { if (cache.size > 600) cache.clear(); canvas = render(C, view, F, blink, hurt); cache.set(key, canvas); }
    const cut = Math.max(0, anim.cut | 0), w = W * PX, h = (H - cut) * PX, top = sy - H * PX + (anim.crouch || 0);
    ctx.save(); ctx.imageSmoothingEnabled = false;
    if (dir === 'right') { ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, 0, 0, W, H - cut, -w / 2, top, w, h); }
    else ctx.drawImage(canvas, 0, 0, W, H - cut, sx - w / 2, top, w, h);
    ctx.restore();
    return { top, headY: top + (TOP + 9) * PX, torsoTop: top + (TOP + 17) * PX };
  }

  /** Shared with the other pixel-art sprites (pixelPony.js). */
  const util = { hex, css, shade, light, mix, tones, outline };
  return { draw, W, H, PX, util };
})();
