'use strict';
/* CLIENT - the pony collector coins (data/items/ponyCoins.js) in pixel art: a milled gold ring round a field in the variety's mane colour, with a pony head
 * in SIDE PROFILE (facing right) stamped on it: pricked ears, a flowing forelock, a long nose with a nostril, a dark eye with a glint, the jaw and throat, and
 * the mane streaming down the back of the neck. The head is a few polygons (in a 24 x 24 design space) rasterised once per variety and coin size into whole pixels
 * from its coat and mane colours (data/ponies/variants.js), shaded (a darker cheek and throat, a light brow, a pink muzzle) and ringed with an ink outline;
 * each variety adds its own touch (leaves, flames, a crystal, stars, sprinkles, frost, a rainbow mane). Draw with image smoothing off: the same painter makes
 * the item icons and the Coin Poster, so a coin looks the same in your bag and on the wall. */
const PonyCoinArt = (() => {
  const INK = '#1d120a', memo = new Map();
  const { shade, light, mix } = PixelCharacter.util;
  const look = id => {
    const V = PonyVariantTable.all().find(v => v.id === id), P = PonyPalette;
    return { coat: (V && V.coats ? V.coats : P.coats)[0], mane: (V && V.manes ? V.manes : P.manes)[0], accessory: V ? V.accessory : null };
  };
  /* the head, in a 24 x 24 design space, facing right */
  const HEAD = [[10, 3], [13, 3.6], [15.5, 6], [18, 9.2], [20.2, 12.6], [21.8, 14.6], [22.2, 16.2], [21.4, 18.2], [19.6, 19.2], [17.2, 19.2], [15.2, 17.8], [12.6, 17.8], [11.4, 19.6], [11.4, 24], [2, 24], [3.2, 16], [5.5, 9], [7.5, 4.5]];
  const EAR = [[9, 5], [10.4, -0.4], [13.6, 4.4]], FAR_EAR = [[7.4, 5.2], [7.8, 0.8], [10.4, 4.4]];
  const MANE = [[5.6, 4.2], [10, 2.6], [11, 6], [9.6, 9.5], [9.2, 14], [10.2, 19.5], [9.6, 24], [0.6, 24], [2.4, 16], [3.8, 9.5]];
  const FORELOCK = [[10.4, 3.2], [14.2, 4.2], [15.4, 7.6], [13.4, 7.2], [12.4, 5.8], [10.8, 5.4]];
  const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

  /** The head of a variety as a G x G grid of colours (null = empty), outline included. */
  function head(id, G) {
    const key = id + ':' + G; if (memo.has(key)) return memo.get(key);
    const Z = 0.88, L = look(id), k = G / 24, g = Array.from({ length: G }, () => Array(G).fill(null));
    const coat = L.coat, dark = shade(coat, 0.8), deep = shade(coat, 0.66), pale = light(coat, 0.28), pink = mix(coat, '#f2a1b0', 0.6);
    const maneC = (x, y) => L.mane[Math.abs(Math.floor((y * 0.55 + x * 0.35))) % L.mane.length];
    const A = L.accessory;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = ((i + 0.5) / k - 12) / Z + 12, y = ((j + 0.5) / k - 12) / Z + 12 - 0.5;                                   // (the design is shrunk a little so the ears sit inside the ring)
      let c = null;
      if (inside(FAR_EAR, x, y)) c = deep;
      if (inside(MANE, x, y)) c = A === 'rainbow' ? ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'][Math.abs(Math.floor(y * 0.6 - x * 0.2)) % 6] : maneC(x, y);
      if (inside(HEAD, x, y) && !(inside(MANE, x, y) && x < 11)) {
        c = coat;
        if (y > 16.8 - Math.max(0, x - 14.5) * 0.9) c = dark;                                                       // the underside of the jaw and the throat in shade
        else if (x < 12.2 && y > 12) c = shade(coat, 0.9);                                                           // the cheek turning away
        if (x > 18.4 && y > 13) c = pink;                                                                           // the muzzle
        else if (x > 19.6 && y > 11.2) c = pink;
        const ridge = (x - 12) * 0.62 - (y - 4.6);                                                                  // a light brow / nose-bridge stripe near the front edge of the face
        if (ridge > -1.1 && ridge < 0.5 && x > 11 && y < 14 && c === coat) c = pale;
      }
      if (inside(EAR, x, y)) c = (x > 10.4 && y > 1.8 && x < 12 && y < 4.2) ? mix(coat, '#f2a1b0', 0.55) : coat;
      if (inside(FORELOCK, x, y)) c = L.mane[0];
      g[j][i] = c;
    }
    const at = (x, y) => [Math.floor(((x - 12) * Z + 12) * k), Math.floor(((y + 0.5 - 12) * Z + 12) * k)];
    const put = (x, y, c) => { const [i, j] = at(x, y); if (i >= 0 && i < G && j >= 0 && j < G) g[j][i] = c; };
    // the eye, the nostril and the mouth
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(14.6 + dx / k, 9.2 + dy / k, '#2b1a2e');
    put(14.6, 9.2, '#ffffff');
    put(21.0, 15.4, shade(pink, 0.45)); put(21.0 + 1 / k, 15.4, shade(pink, 0.45));
    for (let t = 0; t < 4; t++) put(20.4 - t / k, 18.0 - t * 0.1, shade(pink, 0.5));
    // the variety's own touch
    if (A === 'leaves') { put(10.2, 1.6, '#8fd16a'); put(11.2, 1.0, '#5fa44a'); put(9.4, 2.2, '#3d7a35'); }
    else if (A === 'flames') { for (const [x, y, c] of [[11.4, 1.6, '#ff3d00'], [12.4, 1.0, '#ff9100'], [13.4, 2.2, '#ffd740'], [14.2, 3.2, '#ff9100'], [10.4, 1.4, '#ffd740']]) put(x, y, c); }
    else if (A === 'crystals') { for (const [x, y] of [[13.6, 5.6], [14.6, 6.4], [13.2, 6.6], [14.2, 7.2]]) put(x, y, '#9fe7ff'); }
    else if (A === 'stars') { for (const [x, y] of [[13.6, 5.6], [14.6, 4.8], [7, 10], [5.4, 16], [8.6, 21]]) put(x, y, '#fff2a8'); }
    else if (A === 'sprinkles') { [[6, 9, '#ff4081'], [7.6, 14, '#00bfa5'], [5, 19, '#7c4dff'], [8.4, 21, '#ffeb3b'], [12.4, 4.6, '#ffffff'], [14.4, 6.4, '#ff4081']].forEach(([x, y, c]) => put(x, y, c)); }
    else if (A === 'frost') { for (const [x, y] of [[10.2, 0.8], [6.2, 12], [4.4, 18], [16, 7.4]]) put(x, y, '#e8f6ff'); }
    // the 1-pixel ink outline round the whole
    const out = g.map(r => r.slice());
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (!g[j][i]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const jj = j + dy, ii = i + dx; if (jj >= 0 && jj < G && ii >= 0 && ii < G && g[jj][ii]) { out[j][i] = INK; break; } }
    memo.set(key, out); return out;
  }

  /** Draw the coin of `varietyId` centred at (x, y), radius r (whole pixels, 16+ shows the head best). `dim` paints an empty slot instead. */
  function draw(g, x, y, r, varietyId, dim = false) {
    x = Math.round(x); y = Math.round(y); r = Math.round(r);
    const disc = (rad, color) => { g.fillStyle = color; for (let j = -rad; j <= rad; j++) { const w = Math.round(Math.sqrt(Math.max(0, rad * rad - j * j))); g.fillRect(x - w, y + j, w * 2 + 1, 1); } };
    if (dim) { disc(r + 1, 'rgba(29,18,10,0.55)'); disc(r - 1, 'rgba(90,70,45,0.35)'); return; }
    const L = look(varietyId);
    disc(r + 1, INK); disc(r, '#8a5a1a'); disc(r - 1, '#d9a23a'); disc(r - 2, '#f2cf6a'); disc(r - 3, '#c28a1a');          // inked, then a milled gold rim
    disc(r - 4, shade(L.mane[0], 0.5));                                                                                     // the field: a deep shade of the mane colour
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - r + 5, y - r + 5, Math.max(1, Math.round(r / 4)), 1);          // a glint on the rim
    const G = 2 * (r - 4) + 1, f = head(varietyId, G), ox = x - r + 4, oy = y - r + 4, lim = (r - 4 + 0.5) * (r - 4 + 0.5);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = f[j][i], cx = ox + i - x + 0.5, cy = oy + j - y + 0.5; if (c && cx * cx + cy * cy <= lim) { g.fillStyle = c; g.fillRect(ox + i, oy + j, 1, 1); } }
  }
  return { draw };
})();
