'use strict';
/* CLIENT - the pony collector coins (data/items/ponyCoins.js) in chunky pixel art: a gilded ring round a disc in the variety's own coat colour, with a pony
 * head in profile in its mane colours (and its signature sparkle). One painter draws them for the item icons and for the Coin Poster, so a coin
 * looks the same in your bag and on the wall. Whole-pixel rectangles only: draw with image smoothing off. */
const PonyCoinArt = (() => {
  const INK = '#1d120a';
  /** A 12 x 12 pony head in profile, facing right. 'h' head, 'm' mane, 'e' eye, 'n' nose. */
  const HEAD = [
    '.....mm.....',
    '....mmhh....',
    '...mmhhhh...',
    '..mmhhhhh...',
    '..mhhhhhhh..',
    '..mhhhehhhh.',
    '...hhhhhhhhn',
    '...hhhhhhhhn',
    '....hhhhhhh.',
    '....mhhhhh..',
    '...mm.hhh...',
    '...m........'
  ];
  const look = id => {
    const V = PonyVariantTable.all().find(v => v.id === id), P = PonyPalette;
    const coats = V && V.coats ? V.coats : P.coats, manes = V && V.manes ? V.manes : P.manes;
    return { coat: coats[0], mane: manes[0], glow: V && V.glow, accessory: V && V.accessory };
  };
  /** Draw the coin of `varietyId` centred at (x, y), radius r (whole pixels). `dim` paints an empty slot's outline instead. */
  function draw(g, x, y, r, varietyId, dim = false) {
    x = Math.round(x); y = Math.round(y); r = Math.round(r);
    const disc = (rad, color) => { g.fillStyle = color; for (let j = -rad; j <= rad; j++) { const w = Math.round(Math.sqrt(Math.max(0, rad * rad - j * j))); g.fillRect(x - w, y + j, w * 2 + 1, 1); } };
    if (dim) { disc(r + 1, 'rgba(29,18,10,0.55)'); disc(r - 1, 'rgba(90,70,45,0.35)'); return; }
    const L = look(varietyId);
    disc(r + 1, INK); disc(r, '#8a5a1a'); disc(r - 1, '#d9a23a'); disc(r - 2, '#f2cf6a'); disc(r - 3, '#c28a1a');        // inked, then a milled gold rim
    disc(r - 4, PixelCharacter.util.shade(L.mane[0], 0.55));                                                                  // the field: a deep shade of the mane colour, so the pale coat head reads
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - r + 4, y - r + 4, Math.max(1, Math.round(r / 3)), 1);                // a glint
    const s = Math.max(1, Math.floor((r - 3) * 2 / 13)), ox = x - Math.round(6 * s), oy = y - Math.round(6 * s);
    const col = { h: L.coat, m: L.mane[0], e: INK, n: L.mane[1] || L.mane[0] };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) HEAD.forEach((rowStr, j) => { for (let i = 0; i < rowStr.length; i++) if (rowStr[i] !== '.') { g.fillStyle = INK; g.fillRect(ox + i * s + dx * Math.max(1, Math.round(s * 0.7)), oy + j * s + dy * Math.max(1, Math.round(s * 0.7)), s, s); } });
    HEAD.forEach((rowStr, j) => { for (let i = 0; i < rowStr.length; i++) { const c = rowStr[i]; if (c === '.') continue; g.fillStyle = c === 'h' ? col.h : col[c]; g.fillRect(ox + i * s, oy + j * s, s, s); } });
    if (L.glow) { g.fillStyle = L.glow; g.fillRect(x + r - 6, y - r + 3, 2, 2); }
  }
  return { draw };
})();
