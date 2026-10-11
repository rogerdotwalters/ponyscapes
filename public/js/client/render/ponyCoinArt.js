'use strict';
/* CLIENT - the pony collector coins (data/items/ponyCoins.js) in chunky pixel art: a milled gold ring round a field in the variety's mane colour, with a
 * front-facing PONY FACE stamped on it: ears, a forelock, a pale blaze, dark eyes with a glint, a muzzle with nostrils, the mane framing both cheeks, and each
 * variety's own touch (leaves, flames, a crystal, stars, sprinkles, frost, a rainbow mane). The face is built once per variety from its coat and mane colours
 * (data/ponies/variants.js) on an 18 x 18 grid, then drawn with whole-pixel rectangles (image smoothing off), so a coin looks the same in your bag, in a
 * pop-up and on the Coin Poster. */
const PonyCoinArt = (() => {
  const INK = '#1d120a', N = 18, memo = new Map();
  const { shade, light, mix } = PixelCharacter.util;
  const look = id => {
    const V = PonyVariantTable.all().find(v => v.id === id), P = PonyPalette;
    return { coat: (V && V.coats ? V.coats : P.coats)[0], mane: (V && V.manes ? V.manes : P.manes)[0], accessory: V ? V.accessory : null };
  };
  /** The face of a variety: an N x N grid of colours (null = empty), outline included. */
  function face(id) {
    if (memo.has(id)) return memo.get(id);
    const L = look(id), g = Array.from({ length: N }, () => Array(N).fill(null));
    const put = (x, y, c) => { if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c; };
    const both = (x, y, c) => { put(x, y, c); put(N - 1 - x, y, c); };                                  // mirrored about the middle
    const mane = (y, x = 0) => L.mane[(Math.floor(y / 2) + x) % L.mane.length];
    const coat = L.coat, dark = shade(coat, 0.8), pale = light(coat, 0.35), blaze = '#fbf7ef', pink = mix(coat, '#f2a1b0', 0.55), eye = '#2b1a2e';
    // the mane framing the face (behind the head): a curtain down each cheek
    for (let y = 4; y <= 13; y++) { const w = y < 6 ? 2 : y < 11 ? 2 : 2; for (let x = 1; x < 1 + w; x++) both(x, y, mane(y, x)); }
    // the head, wide at the brow and narrowing to the muzzle
    const half = [0, 0, 0, 4, 5, 6, 6, 6, 6, 5, 4, 4, 4, 4, 3, 0];                                      // half width on each row (rows 0..15), centred on x = 8.5
    for (let y = 3; y <= 14; y++) { const h = half[y]; for (let x = 9 - h; x <= 8 + h; x++) put(x, y, y >= 10 ? pink : coat); }
    for (let y = 9; y <= 14; y++) { both(9 - half[y], y, dark); }                                       // a shaded cheek
    for (let y = 3; y <= 9; y++) { put(9 - half[y] + 1, y, dark); put(8 + half[y] - 1, y, coat); }       // (a touch of light from the upper right)
    for (let y = 10; y <= 13; y++) for (let x = 6; x <= 11; x++) put(x, y, y === 10 ? mix(coat, pink, 0.4) : pink);   // the muzzle
    // ears
    for (const [y, w] of [[0, 1], [1, 2], [2, 2]]) for (let x = 0; x < w; x++) both(4 + x - (y === 0 ? 0 : 0), y, x === w - 1 && y > 0 ? pink : coat);
    both(4, 3, coat);
    // the blaze down the face, the forelock over the brow
    for (let y = 5; y <= 11; y++) { put(8, y, blaze); put(9, y, blaze); }
    for (let y = 2; y <= 5; y++) for (let x = 6; x <= 11; x++) { const edge = y === 5 ? (x === 8 || x === 9) : (y === 4 ? (x === 6 || x === 11) : false); if (!edge) put(x, y, mane(y, x)); }
    put(7, 5, mane(5, 7)); put(10, 5, mane(5, 10));
    // eyes (big, with a glint) and nostrils
    for (const x of [4, 12]) { put(x, 7, eye); put(x + 1, 7, eye); put(x, 8, eye); put(x + 1, 8, eye); put(x + (x < 8 ? 0 : 1), 7, '#ffffff'); }
    put(7, 12, shade(pink, 0.5)); put(10, 12, shade(pink, 0.5));
    put(8, 14, shade(pink, 0.7)); put(9, 14, shade(pink, 0.7));
    // the variety's own touch
    const A = L.accessory;
    if (A === 'leaves') { both(3, 2, '#5fa44a'); both(2, 1, '#8fd16a'); both(3, 1, '#3d7a35'); }
    else if (A === 'flames') { for (const [x, y, c] of [[8, 0, '#ffd740'], [9, 0, '#ff9100'], [8, 1, '#ff9100'], [9, 1, '#ffd740'], [7, 1, '#ff3d00'], [10, 1, '#ff3d00'], [5, 1, '#ff9100']]) put(x, y, c); }
    else if (A === 'crystals' || A === 'stars') { for (const [x, y] of [[8, 3], [9, 3], [7, 4], [10, 4], [8, 4], [9, 4]]) put(x, y, A === 'crystals' ? '#9fe7ff' : '#fff2a8'); }
    else if (A === 'sprinkles') { [[1, 6, '#ff4081'], [2, 9, '#00bfa5'], [15, 7, '#7c4dff'], [14, 10, '#ffeb3b'], [7, 3, '#ffffff'], [11, 3, '#ff4081']].forEach(([x, y, c]) => put(x, y, c)); }
    else if (A === 'frost') { for (const [x, y] of [[4, 0], [13, 0], [2, 8], [15, 8], [8, 3]]) put(x, y, '#e8f6ff'); }
    else if (A === 'rainbow') { for (let y = 4; y <= 13; y++) { const c = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'][(y - 4) % 6]; for (let x = 1; x < 1 + (y < 6 ? 2 : y < 11 ? 3 : 2); x++) both(x, y, c); } }
    // the 1-pixel ink outline round the whole head
    const out = g.map(r => r.slice());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!g[y][x]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < N && xx >= 0 && xx < N && g[yy][xx]) { out[y][x] = INK; break; } }
    memo.set(id, out); return out;
  }

  /** Draw the coin of `varietyId` centred at (x, y), radius r (whole pixels, 16+ shows the face best). `dim` paints an empty slot instead. */
  function draw(g, x, y, r, varietyId, dim = false) {
    x = Math.round(x); y = Math.round(y); r = Math.round(r);
    const disc = (rad, color) => { g.fillStyle = color; for (let j = -rad; j <= rad; j++) { const w = Math.round(Math.sqrt(Math.max(0, rad * rad - j * j))); g.fillRect(x - w, y + j, w * 2 + 1, 1); } };
    if (dim) { disc(r + 1, 'rgba(29,18,10,0.55)'); disc(r - 1, 'rgba(90,70,45,0.35)'); return; }
    const L = look(varietyId);
    disc(r + 1, INK); disc(r, '#8a5a1a'); disc(r - 1, '#d9a23a'); disc(r - 2, '#f2cf6a'); disc(r - 3, '#c28a1a');          // inked, then a milled gold rim
    disc(r - 4, shade(L.mane[0], 0.5));                                                                                     // the field: a deep shade of the mane colour
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x - r + 5, y - r + 5, Math.max(1, Math.round(r / 4)), 1);          // a glint on the rim
    const f = face(varietyId), s = Math.max(1, Math.floor((r - 3) * 2 / N)), ox = x - Math.floor(N * s / 2), oy = y - Math.floor(N * s / 2) + Math.round(s / 2);
    const lim = (r - 4 + 0.6) * (r - 4 + 0.6);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = f[j][i], cx = ox + (i + 0.5) * s - x, cy = oy + (j + 0.5) * s - y; if (c && cx * cx + cy * cy <= lim) { g.fillStyle = c; g.fillRect(ox + i * s, oy + j * s, s, s); } }
  }
  return { draw };
})();
