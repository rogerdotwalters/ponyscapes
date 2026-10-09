'use strict';
/* CLIENT - the coins in chunky medieval pixel art: an inked disc with a reeded edge (its thickness), a face in the kind's metal with a stamped ring and a
 * heraldic mark (a cross, a fleur-de-lis, a crown, a shield, a tower; the gem coins carry a cut stone), lit from the top left. One painter draws them
 * for the coin bag, the coin that follows your pointer, and the item icons, so a coin looks the same everywhere (and a shop's "x2" matches the coin you
 * drag). Everything is whole-pixel rectangles: draw with image smoothing off. */
const CoinArt = (() => {
  const INK = '#1d120a';
  /** 7 x 7 marks, one per kind of coin (copper to titanium). '#' is stamped dark, 'o' is the lit rim of the stamp. */
  const MARKS = [
    ['...#...', '...#...', '.#####.', '...#...', '...#...', '...#...', '...#...'],            // copper: a cross
    ['..#.#..', '...#...', '.#.#.#.', '.#####.', '..###..', '...#...', '..###..'],            // silver: a fleur-de-lis
    ['#.#.#.#', '#######', '#######', '.#####.', '.......', '.......', '.......'],            // gold: a crown
    ['#######', '#.....#', '#.....#', '.#...#.', '..#.#..', '...#...', '.......'],            // platinum: a shield
    ['#.#.#.#', '#######', '.#####.', '.#.#.#.', '.#####.', '.#...#.', '.#####.'],            // titanium: a tower
  ];
  const row = (g, cx, cy, rx, ry, color) => {                                                   // a filled ellipse as scan-lines of whole pixels
    g.fillStyle = color;
    for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (ry ? (j * j) / (ry * ry) : 0)))); g.fillRect(cx - w, cy + j, w * 2 + 1, 1); }
  };

  /** Draw a coin of kind `tier` (index into Coins.TIERS) centred at (x, y) with radius r. f (0.5..1): how squashed it looks (a tumbling coin is thinner). */
  function draw(g, x, y, r, f, tier, lifted = false) {
    const T = Coins.TIERS[tier]; x = Math.round(x); y = Math.round(y);
    const rx = Math.round(r), ry = Math.max(3, Math.round(r * f)), th = Math.max(2, Math.round(r * 0.3));
    const cy = y - Math.round(th / 2);
    for (let d = th; d >= 0; d--) row(g, x, cy + d, rx + 1, ry + 1, INK);                         // the ink outline round the disc and its thickness
    for (let d = th; d >= 1; d--) row(g, x, cy + d, rx, ry, d > th * 0.5 ? T.edge[1] : T.edge[0]);      // the edge: dark below, lighter above
    g.fillStyle = T.edge[1]; for (let k = -rx + 1; k < rx; k += 2) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (k * k) / (rx * rx)))), yy = cy + ry * Math.sqrt(Math.max(0, 1 - (k * k) / (rx * rx))); if (w >= 0) g.fillRect(x + k, Math.round(yy) + 1, 1, th - 1); }   // reeded: a tick every other column down the edge
    row(g, x, cy, rx, ry, T.face[2]);                                                              // the rim, in shadow
    row(g, x, cy, rx - 1, Math.max(1, ry - 1), lifted ? T.face[0] : T.face[1]);                    // the face
    g.fillStyle = T.face[0]; for (let k = -rx + 2; k < 0; k++) { const w = Math.sqrt(Math.max(0, 1 - (k * k) / (rx * rx))); g.fillRect(x + k, Math.round(cy - ry * w) + 1, 1, 1); }   // the lit rim, top left
    g.fillStyle = T.face[2]; const sr = Math.max(2, rx - 3), sy = Math.max(1, ry - 3);              // the stamped ring
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; g.fillRect(x + Math.round(Math.cos(t) * sr), cy + Math.round(Math.sin(t) * sy), 1, 1); }
    if (T.gem) {                                                                                   // a cut stone in the middle: a diamond shape with a lit facet
      const gr = Math.max(3, Math.round(r * 0.42)), gy = Math.max(2, Math.round(gr * f));
      for (let j = -gy - 1; j <= gy + 1; j++) { const w = Math.max(0, Math.round((gr + 1) * (1 - Math.abs(j) / (gy + 1)))); g.fillStyle = INK; g.fillRect(x - w - 1, cy + j, w * 2 + 3, 1); }
      for (let j = -gy; j <= gy; j++) { const w = Math.round(gr * (1 - Math.abs(j) / (gy + 1))); g.fillStyle = T.gem; g.fillRect(x - w, cy + j, w * 2 + 1, 1); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - w, cy + j, Math.max(1, Math.round(w * 0.55)), 1); }
      g.fillStyle = '#fff'; g.fillRect(x - Math.round(gr * 0.4), cy - Math.round(gy * 0.45), 2, 1);
    } else {
      const m = MARKS[Math.min(tier, MARKS.length - 1)], s = r >= 10 ? 2 : 1, mw = 7 * s, mh = Math.max(1, Math.round(7 * s * f));
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        if (m[j][i] !== '#') continue;
        const px = x - Math.floor(mw / 2) + i * s, py = cy - Math.floor(mh / 2) + Math.round(j * s * f), ph = Math.max(1, Math.round(s * f));
        g.fillStyle = T.face[0]; g.fillRect(px + 1, py + 1, s, ph); g.fillStyle = T.face[2]; g.fillRect(px, py, s, ph);          // the mark, stamped: dark with a lit edge below
      }
    }
    g.fillStyle = '#fffbe0'; g.fillRect(x - Math.round(rx * 0.55), cy - Math.round(ry * 0.55), 2, 1); g.fillRect(x - Math.round(rx * 0.55), cy - Math.round(ry * 0.55) + 1, 1, 1);   // a glint
  }
  /** A small canvas holding one coin (for icons and the dragged coin), r radius, at integer scale `k`. */
  function canvas(tier, r, k = 1, f = 0.9) {
    const th = Math.max(2, Math.round(r * 0.3)), w = (2 * r + 4), h = (2 * Math.round(r * f) + th + 4), c = document.createElement('canvas');
    c.width = w * k; c.height = h * k; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.scale(k, k);
    draw(g, w / 2, h / 2 + th / 2 - 0.5, r, f, tier); return c;
  }
  return { draw, canvas, INK };
})();
