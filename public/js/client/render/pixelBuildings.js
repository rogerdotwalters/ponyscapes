'use strict';
/* CLIENT - the village's buildings in retro pixel art: medieval fantasy cottages and halls. Each building is RAY-CAST once, art pixel by art
 * pixel, from a small 3D description (a stone ground floor; a jettied, timber-framed upper floor; a steep shingled roof with a gable end; a stone
 * chimney; a dormer on the bigger ones), textured by what each pixel hits (fieldstone, oak beams and braces, plaster / stone / plank infill,
 * leaded windows, shingles with moss, an arched plank door in a stone arch), outlined, given its props (a lantern, firewood, barrels, crates,
 * flower boxes, a hanging sign) and cached.
 *
 * It is drawn in vertical SLICES, one per front tile of its footprint, each at that tile's depth: someone in front of the building is drawn
 * over it and someone behind it is hidden, exactly as with the old per-tile boxes.
 *
 * Its look comes from the building's data (js/data/buildings/): exterior { wall (infill), roof, trim (timber), stone, glass, infill: 'plaster' |
 * 'stone' | 'planks', chimney, dormer, boarded, props: ['lantern', 'firewood', 'barrels', 'crates', 'flowers', 'hay'] }. */
const PixelBuildings = (() => {
  const { shade, light, mix } = PixelCharacter.util;
  const ART = 1.5;                                                             // world pixels per art pixel
  const HWa = TILE_HALF_W / ART, HHa = TILE_HALF_H / ART, LEN = Math.hypot(HWa, HHa);   // a tile's half width / height in art pixels; a tile's edge length
  const F = 46, U = 36, J = 0.14, O = 0.2;                                     // ground floor and upper floor heights (art px); jetty and roof overhang (tiles)
  const OUTLINE = '#1c140e';
  const cache = new Map();
  const hash = (a, b, c = 0) => { let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263 + c * 2246822519) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const frac = v => v - Math.floor(v);
  const tones = (c, k) => [shade(c, 0.78 * k), shade(c, 0.9 * k), k === 1 ? c : shade(c, k), light(shade(c, k), 0.14)];

  /** The building's measurements and colours. */
  function specOf(site) {
    const e = site.def.exterior || {}, w = site.w, h = site.h;
    const ym = h / 2 + J / 2, ye = h + J + O, yn = -O, E = F + U, R = (ye - ym) * 44;      // a steep roof
    return {
      w, h, ym, ye, yn, E, R, door: site.doorX - site.x0,
      infill: e.infill || 'plaster', chimney: e.chimney !== false, dormer: e.dormer !== undefined ? e.dormer : w >= 5, boarded: !!e.boarded, props: ['sign', ...(e.props || ['lantern'])],
      stone: e.stone || '#8d8a83', wall: e.wall || '#dccca6', roof: e.roof || '#8a5a36', trim: e.trim || '#4a3322', glass: e.glass || '#aab7e4',
      chimneyX: w * 0.72, dormerX: w * 0.38
    };
  }

  /* ---- the 3D: surfaces a ray from an art pixel can hit. Each returns { n (nearness), mat, u, v, x, y, z } or null. ---- */
  /** A vertical face y = c (facing the camera's left): x in [x0, x1], z in [z0, z1(x)]. */
  function faceS(X, Y, c, x0, x1, z0, z1, mat) {
    const x = X / HWa + c, z = (x + c) * HHa - Y;
    if (x < x0 || x > x1 || z < z0 || z > (typeof z1 === 'function' ? z1(x) : z1)) return null;
    return { n: (x + c) * HHa + z, mat, x, y: c, z, side: 's' };
  }
  /** A vertical face x = c (facing the camera's right): y in [y0, y1], z in [z0, z1(y)]. */
  function faceE(X, Y, c, y0, y1, z0, z1, mat) {
    const y = c - X / HWa, z = (c + y) * HHa - Y;
    if (y < y0 || y > y1 || z < z0 || z > (typeof z1 === 'function' ? z1(y) : z1)) return null;
    return { n: (c + y) * HHa + z, mat, x: c, y, z, side: 'e' };
  }
  /** A slope z = a + b * y (a roof facing south or north): x in [x0, x1], y in [y0, y1]. */
  function slopeY(X, Y, a, b, x0, x1, y0, y1, mat) {
    const y = (a + Y - X * HHa / HWa) / (2 * HHa - b), x = X / HWa + y, z = a + b * y;
    if (x < x0 || x > x1 || y < y0 || y > y1) return null;
    return { n: (x + y) * HHa + z, mat, x, y, z, side: 'r' };
  }
  /** A slope z = a + b * x (a dormer's roof facing east): x in [x0, x1], y in [y0, y1]. */
  function slopeX(X, Y, a, b, x0, x1, y0, y1, mat) {
    const y = (a + Y + b * X / HWa - X * HHa / HWa) / (2 * HHa - b), x = X / HWa + y, z = a + b * x;
    if (x < x0 || x > x1 || y < y0 || y > y1) return null;
    return { n: (x + y) * HHa + z, mat, x, y, z, side: 'r' };
  }
  /** The top of a box, z = c. */
  function top(X, Y, c, x0, x1, y0, y1, mat) {
    const y = (c + Y - X * HHa / HWa) / (2 * HHa), x = X / HWa + y;
    if (x < x0 || x > x1 || y < y0 || y > y1) return null;
    return { n: (x + y) * HHa + c, mat, x, y, z: c, side: 't' };
  }

  /** Everything at one art pixel: the nearest surface hit. */
  function cast(S, X, Y) {
    const { w, h, ym, ye, yn, E, R } = S, roofS = y => E + R * (ye - y) / (ye - ym), roofN = y => E + R * (y - yn) / (ym - yn), roofAt = y => Math.min(roofS(y), roofN(y));
    const hits = [
      faceS(X, Y, h, 0, w, 0, F, 'stone'),                                      // the ground floor
      faceE(X, Y, w, 0, h, 0, F, 'stone'),
      faceS(X, Y, h + J, 0, w + J, F, E, 'frame'),                              // the jettied upper floor
      faceE(X, Y, w + J, 0, h + J, F, y => Math.max(E, roofAt(y)), 'frame'),    // ... and its gable end
      slopeY(X, Y, E + R * ye / (ye - ym), -R / (ye - ym), -O, w + J + O, ym, ye, 'roofS'),
      slopeY(X, Y, E - R * yn / (ym - yn), R / (ym - yn), -O, w + J + O, yn, ym, 'roofN')
    ];
    for (let i = 0; i <= w; i++) {                                              // corbels: beam ends under the jetty
      const cx = Math.min(w - 0.05, Math.max(0.05, i));
      hits.push(faceS(X, Y, h + J, cx - 0.05, cx + 0.05, F - 7, F, 'beam'), faceE(X, Y, cx + 0.05, h, h + J, F - 7, F, 'beam'));
    }
    if (S.chimney) {                                                            // a fieldstone chimney through the back slope
      const x0 = S.chimneyX, x1 = x0 + 0.45, y0 = ym - 0.55, y1 = ym - 0.1, zt = E + R + 16;
      hits.push(faceS(X, Y, y1, x0, x1, E, zt, 'chimney'), faceE(X, Y, x1, y0, y1, E, zt, 'chimney'), top(X, Y, zt, x0, x1, y0, y1, 'soot'));
    }
    if (S.dormer) {                                                             // a dormer window on the front slope, with its own little roof
      const x0 = S.dormerX, x1 = x0 + 0.9, xc = (x0 + x1) / 2, yf = ym + (ye - ym) * 0.55, zf = roofS(yf), zt = zf + 22, rd = 12;
      hits.push(faceS(X, Y, yf, x0, x1, zf - 2, x => zt + rd * (1 - Math.abs(x - xc) / ((x1 - x0) / 2)), 'dormer'));
      const side = faceE(X, Y, x1, ym, yf, 0, zt, 'dormerSide');
      if (side && side.z >= roofS(side.y)) hits.push(side);                     // (only the part of its side above the roof)
    }
    let best = null;
    for (const hit of hits) if (hit && (!best || hit.n > best.n)) best = hit;
    return best;
  }

  /* ---- textures: what colour a hit is ---- */
  function stoneAt(S, u, v, k, base = S.stone) {
    const row = Math.floor(v / 7), off = hash(row, 3) * 13, col = Math.floor((u + off) / 13);
    if (v - row * 7 < 1 || frac((u + off) / 13) * 13 < 1) return shade(base, 0.62 * k);                  // mortar
    const t = tones(base, k)[Math.floor(hash(row, col, 1) * 3)];
    return v - row * 7 > 5.5 || frac((u + off) / 13) * 13 < 2 ? light(t, 0.12) : t;                         // a lit edge on each stone
  }
  function plankAt(S, u, v, k, base) { const b = Math.floor(u / 5); return (u - b * 5) < 1 ? shade(base, 0.6 * k) : tones(base, k)[Math.floor(hash(b, Math.floor(v / 23), 7) * 3)]; }
  function infillAt(S, u, v, k) {
    if (S.infill === 'stone') return stoneAt(S, u * 0.8, v * 0.8, k * 1.04, mix(S.stone, '#9a958c', 0.4));
    if (S.infill === 'planks') return plankAt(S, u, v, k, S.wall);
    const n = hash(Math.floor(u / 2), Math.floor(v / 2), 9);                                                   // plaster, a little weathered
    return n < 0.08 ? shade(S.wall, 0.86 * k) : n > 0.95 ? light(S.wall, 0.08) : shade(S.wall, k);
  }
  /** A leaded window: a dark frame, panes in a diamond lattice, a glint. p, q: 0..1 across it. */
  function windowAt(S, p, q, k, u, v) {
    if (S.boarded) return plankAt(S, v * 1.3, u, k, mix(S.trim, '#7a6a55', 0.5));
    if (p < 0.12 || p > 0.88 || q < 0.12 || q > 0.88) return shade(S.trim, 0.85 * k);
    if (Math.abs(p - 0.5) < 0.05 || Math.abs(q - 0.5) < 0.05) return shade(S.trim, 0.7 * k);
    if ((Math.floor(u) + Math.floor(v)) % 4 === 0) return shade(S.glass, 0.72);
    return p < 0.4 && q > 0.55 ? light(S.glass, 0.35) : S.glass;
  }

  function colourOf(S, hit) {
    const k = hit.side === 'e' ? 0.78 : 1;
    const u = (hit.side === 'e' ? (S.h + J - hit.y) : hit.x) * LEN, v = hit.z;
    switch (hit.mat) {
      case 'stone': {
        if (hit.side === 's' && v < 3 && hash(Math.floor(u / 2), 1, 2) < 0.5) return mix('#5f7a3a', '#3f5a2a', hash(Math.floor(u), 2));   // moss and grass at the foot
        if (hit.side === 's') {
          const local = hit.x - S.door;
          if (local > 0.2 && local < 0.8) {                                        // the door: arched oak planks, iron straps, in a stone arch
            const p = (local - 0.2) / 0.6, cxp = Math.abs(p - 0.5), arch = 30 + Math.sqrt(Math.max(0, 0.25 - cxp * cxp)) * 16;
            if (v < arch) {
              if (v > 13 && v < 15.5 || v > 25 && v < 27.5) return '#3a3430';                                   // iron straps
              if (Math.abs(p - 0.72) < 0.05 && Math.abs(v - 18) < 2.5) return '#c9a24a';                       // the ring
              return plankAt(S, p * 22, 0, 0.82, mix(S.trim, '#8a5a32', 0.55));
            }
            if (v < arch + 4) return Math.floor((Math.atan2(v - 30, (p - 0.5) * 22) * 6)) % 2 ? light(S.stone, 0.18) : light(S.stone, 0.05);   // the arch's stones
          }
          const t = Math.floor(hit.x), cell = hit.x - t;
          if (t !== S.door && t >= 0 && t < S.w && hash(t, 17) > 0.35 && cell > 0.32 && cell < 0.68 && v > 17 && v < 33) {    // a small window, shuttered
            return windowAt(S, (cell - 0.32) / 0.36, 1 - (v - 17) / 16, 1, u, v);
          }
          if (t !== S.door && hash(t, 17) > 0.35 && v > 16 && v < 34 && ((cell > 0.22 && cell < 0.31) || (cell > 0.69 && cell < 0.78))) return plankAt(S, u * 2, v, 0.9, S.trim);   // shutters
        } else if (hit.y > 0.3 && hit.y < 0.7 && v > 17 && v < 33 && S.h >= 3) return windowAt(S, (hit.y - 0.3) / 0.4, 1 - (v - 17) / 16, k, u, v);
        return stoneAt(S, u, v, k * (v < 6 ? 0.88 : 1));
      }
      case 'frame': {
        const zf = v - F;
        if (zf < 3 || (zf > U - 2.5 && zf < U + 1)) return tones(S.trim, k)[zf < 3 ? 1 : 2];                    // sill and top plate
        if (zf > U) {                                                                                         // the gable: a king post, a collar, braces, a window
          const yc = (S.h + J) / 2, d = hit.y - yc, g = zf - U;
          if (Math.abs(d) < 0.05 || (g > 14 && g < 17)) return tones(S.trim, k)[2];
          if (g < 14 && Math.abs(Math.abs(d) * 16 - g) < 1.6 && Math.abs(d) < 0.9) return tones(S.trim, k)[1];
          if (g > 18 && g < 30 && Math.abs(d) > 0.12 && Math.abs(d) < 0.38) return windowAt(S, (Math.abs(d) - 0.12) / 0.26, 1 - (g - 18) / 12, k, u, v);
          return infillAt(S, u, v, k * (g > 30 ? 0.9 : 1));
        }
        const len = hit.side === 'e' ? S.h + J : S.w + J, span = len / Math.max(1, Math.round(len)), a = (hit.side === 'e' ? S.h + J - hit.y : hit.x) / span, panel = Math.floor(a), p = a - panel, q = zf / U;
        if (p < 0.07 || p > 0.93) return tones(S.trim, k)[2];                                                // posts
        const win = hash(panel, hit.side === 'e' ? 31 : 37) > 0.42;
        if (win && p > 0.28 && p < 0.72 && q > 0.28 && q < 0.8) return windowAt(S, (p - 0.28) / 0.44, 1 - (q - 0.28) / 0.52, k, u, v);
        if (Math.abs(q - 0.5) < 0.05) return tones(S.trim, k)[1];                                             // the middle rail
        if (!win && (panel % 2 ? Math.abs(q - p) < 0.07 : Math.abs(q - (1 - p)) < 0.07)) return tones(S.trim, k)[1];   // braces
        if (win && q < 0.45 && Math.abs(q - Math.abs(p - 0.5) * 0.9) < 0.06) return tones(S.trim, k)[1];
        return infillAt(S, u, v, k * (q > 0.85 ? 0.9 : 1));
      }
      case 'beam': return tones(S.trim, k)[v > F - 3 ? 2 : 1];
      case 'roofS': case 'roofN': case 'dormerRoof': {
        const north = hit.mat === 'roofN', kk = north ? 0.74 : hit.mat === 'dormerRoof' ? 0.86 : 1;
        const s = (north ? hit.y - S.yn : S.ye - hit.y) * 26, along = hit.x * LEN;
        const nearRidge = !north && hit.mat === 'roofS' && hit.y - S.ym < 0.07;
        if (nearRidge) return tones(S.trim, 1)[2];                                                            // the ridge beam
        if ((hit.x < -O + 0.08 || hit.x > S.w + J + O - 0.08) && hit.mat !== 'dormerRoof') return tones(S.trim, kk)[hit.x < 0 ? 1 : 2];   // barge boards
        const row = Math.floor(s / 5), off = (row % 2) * 3.5, col = Math.floor((along + off) / 7);
        if (s - row * 5 < 1) return shade(S.roof, 0.55 * kk);                                                 // the shadow under each row
        const moss = hash(Math.floor(along / 2), Math.floor(s / 2), 5) < (s < 12 ? 0.07 : 0.012) && hash(Math.floor(along / 9), Math.floor(s / 6), 6) < 0.5;
        if (moss) return mix(shade(S.roof, kk), '#6a8a3f', 0.5);                                               // a little moss, mostly low on the roof
        const t = tones(S.roof, kk)[Math.floor(hash(row, col, 4) * 3)];
        return frac((along + off) / 7) * 7 < 1 ? shade(t, 0.8) : s - row * 5 > 4 ? light(t, 0.1) : t;
      }
      case 'chimney': return stoneAt(S, u * 1.2, v, k * 0.95, mix(S.stone, '#a0948a', 0.3));
      case 'soot': return '#2a2622';
      case 'dormer': {
        const p = (hit.x - S.dormerX) / 0.9, zz = v;
        const yf = S.ym + (S.ye - S.ym) * 0.55, zf = S.E + S.R * (S.ye - yf) / (S.ye - S.ym);
        if (p > 0.22 && p < 0.78 && zz > zf + 4 && zz < zf + 19) return windowAt(S, (p - 0.22) / 0.56, 1 - (zz - zf - 4) / 15, 1, u, v);
        const hw = Math.abs(p - 0.5) * 2, peak = zf + 22 + 12 * (1 - hw);
        if (p < 0.08 || p > 0.92 || zz > zf + 21 && zz < zf + 23.5 || zz > peak - 3) return tones(S.trim, 1)[zz > peak - 3 ? 1 : 2];   // its frame and barge boards
        return infillAt(S, u, v, 1);
      }
      case 'dormerSide': return infillAt(S, u, v, 0.78);
    }
    return '#f0f';
  }

  /* ---- props: little pixel sprites stood against the front wall ---- */
  function props(S, g, P) {
    const px = (x, y, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const at = (x, y, z) => P(x, y, z);
    const spots = [S.door - 0.6, S.door + 1.45, S.door - 1.6, S.door + 2.4].filter(x => x > 0.15 && x < S.w - 0.15);
    let i = 0;
    for (const prop of S.props) {
      if (prop === 'lantern') {                                                   // an iron lantern on a bracket beside the door
        const [x, y] = at(S.door + 0.92, S.h, 36);
        rect(x - 4, y - 1, 5, 1, '#2a2420'); rect(x - 4, y, 1, 3, '#2a2420');
        rect(x - 6, y + 3, 5, 7, '#2a2420'); rect(x - 5, y + 4, 3, 5, '#ffd877'); px(x - 4, y + 5, '#fff3c4'); rect(x - 6, y + 10, 5, 1, '#2a2420');
        g.fillStyle = 'rgba(255,214,120,.18)'; g.beginPath(); g.arc(x - 3.5, y + 6.5, 9, 0, Math.PI * 2); g.fill();
        continue;
      }
      if (prop === 'sign') {                                                      // a board hanging from the jetty beside the door (its picture: drawn live)
        const [x, y] = at(S.door - 0.12, S.h + J + 0.1, F - 1);
        rect(x - 1, y - 2, 12, 1, '#2a2420'); rect(x + 1, y - 1, 1, 3, '#2a2420'); rect(x + 8, y - 1, 1, 3, '#2a2420');
        rect(x - 3, y + 2, 16, 12, S.trim); rect(x - 2, y + 3, 14, 10, mix(S.wall, '#f2e6c8', 0.6));
        continue;
      }
      const sx = spots[i++ % spots.length];
      if (sx === undefined) continue;
      const [x, y] = at(sx, S.h + 0.18, 0);
      if (prop === 'firewood') {                                                  // a stack of split logs, ends out
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4 - r; c++) {
          const lx = x - 9 + c * 5 + r * 2.5, ly = y - 4 - r * 4;
          rect(lx, ly, 5, 4, '#6b4a2a'); rect(lx + 1, ly + 1, 3, 2, '#c99a62'); px(lx + 2, ly + 1, '#8a5a32');
        }
      } else if (prop === 'barrels') {
        for (const [dx, dy] of [[-8, 0], [1, 1]]) {
          rect(x + dx, y + dy - 13, 8, 13, '#7a5232'); rect(x + dx + 1, y + dy - 13, 2, 13, '#946840');
          rect(x + dx, y + dy - 11, 8, 1, '#3a3430'); rect(x + dx, y + dy - 4, 8, 1, '#3a3430'); rect(x + dx + 1, y + dy - 14, 6, 1, '#5a3a22');
        }
      } else if (prop === 'crates') {
        for (const [dx, dy, s] of [[-9, 0, 10], [1, 0, 9], [-5, -9, 8]]) {
          rect(x + dx, y + dy - s, s, s, '#a07a4a'); rect(x + dx, y + dy - s, s, 1, '#c9a26b');
          g.strokeStyle = '#5a3f2a'; g.lineWidth = 1; g.strokeRect(Math.round(x + dx) + 0.5, Math.round(y + dy - s) + 0.5, s - 1, s - 1);
          px(x + dx + 2, y + dy - s + 2, '#5a3f2a'); px(x + dx + s - 3, y + dy - 3, '#5a3f2a');
        }
      } else if (prop === 'flowers') {                                            // a planter of flowers
        rect(x - 8, y - 5, 16, 5, '#7a5232'); rect(x - 8, y - 5, 16, 1, '#946840');
        for (let f = 0; f < 6; f++) { const fx = x - 7 + f * 2.6, fy = y - 8 - (f % 2) * 2; rect(fx, fy + 1, 1, 3, '#3f7a3a'); px(fx, fy, ['#e05a5a', '#f2c94c', '#e88ac0', '#f4f0e6'][f % 4]); }
      } else if (prop === 'hay') {
        rect(x - 9, y - 9, 16, 9, '#d9b45a'); rect(x - 9, y - 9, 16, 2, '#efd27a');
        for (let s = 0; s < 6; s++) px(x - 8 + s * 3, y - 5 + (s % 2), '#b08a3a');
        rect(x - 9, y - 6, 16, 1, '#8a6a2a');
      }
    }
  }

  /** The finished picture of a building: { canvas, minX, minY } in art pixels relative to its north-west ground corner. */
  function art(site) {
    const key = site.index + '|' + JSON.stringify(site.def.exterior || {});
    if (cache.has(key)) return cache.get(key);
    const S = specOf(site), M = 6;
    const minX = Math.floor(-(S.h + J + 2 * O) * HWa) - M, maxX = Math.ceil((S.w + J + 2 * O) * HWa) + M;
    const minY = Math.floor(-2 * O * HHa - (S.E + S.R + 30)) - M, maxY = Math.ceil((S.w + S.h + 2 * J + 2 * O) * HHa) + M;
    const canvas = document.createElement('canvas'); canvas.width = maxX - minX; canvas.height = maxY - minY;
    const g = canvas.getContext('2d'), img = g.createImageData(canvas.width, canvas.height), d = img.data;
    const rgb = {};
    const parse = c => rgb[c] || (rgb[c] = (() => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c); if (m) return [+m[1], +m[2], +m[3]]; const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; })());
    for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
      const hit = cast(S, px + minX + 0.5, py + minY + 0.5);
      if (!hit) continue;
      const [r, gg, b] = parse(colourOf(S, hit)), i = (py * canvas.width + px) * 4;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
    for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {          // the dark outline round the silhouette
      const i = (py * canvas.width + px) * 4;
      if (d[i + 3]) continue;
      const solid = (x, y) => x >= 0 && y >= 0 && x < canvas.width && y < canvas.height && d[(y * canvas.width + x) * 4 + 3] === 255;
      if (solid(px + 1, py) || solid(px - 1, py) || solid(px, py + 1) || solid(px, py - 1)) { d[i] = 0x1c; d[i + 1] = 0x14; d[i + 2] = 0x0e; d[i + 3] = 254; }
    }
    g.putImageData(img, 0, 0);
    props(S, g, (x, y, z) => [(x - y) * HWa - minX, (x + y) * HHa - z - minY]);
    const out = { canvas, minX, minY, spec: S };
    cache.set(key, out);
    return out;
  }

  /* ---- the village's walls and watchtowers: one tile each, the same stone, cast the same way ---- */
  const WALL_STONE = '#9a958b', TOWER_ROOF = '#7a3b30';
  /** A picture of one tile of wall (crenellated) or of a watchtower (a pointed shingle roof and a pennant): { canvas, minX, minY }. */
  function pieceArt(kind) {
    if (cache.has(kind)) return cache.get(kind);
    const tower = kind === 'tower', H = (tower ? CONFIG.view.towerH : CONFIG.view.wallH) / ART, M = 4;
    const S = { stone: WALL_STONE, trim: '#4a3322', roof: TOWER_ROOF, wall: '#cfc6b4', glass: '#2a2a33', boarded: false, ym: 0.5, ye: 1.12, yn: -0.12, h: 1, w: 1 };
    const Rr = tower ? 54 : 0, apex = H + Rr;
    const minX = Math.floor(-1.2 * HWa) - M, maxX = Math.ceil(1.2 * HWa) + M, minY = Math.floor(-apex - 26) - M, maxY = Math.ceil(2.2 * HHa) + M;
    const canvas = document.createElement('canvas'); canvas.width = maxX - minX; canvas.height = maxY - minY;
    const g = canvas.getContext('2d');
    for (let py = 0; py < canvas.height; py++) for (let px = 0; px < canvas.width; px++) {
      const X = px + minX + 0.5, Y = py + minY + 0.5, hits = [faceS(X, Y, 1, 0, 1, 0, H, 'stone'), faceE(X, Y, 1, 0, 1, 0, H, 'stone')];
      if (tower) {                                                                      // a pyramid roof with eaves: its south and east slopes
        const o = 0.12, slope = Rr / (0.5 + o);
        const sHit = slopeY(X, Y, H + Rr + slope * 0.5, -slope, -o, 1 + o, 0.5, 1 + o, 'roofS'), eHit = slopeX(X, Y, H + Rr + slope * 0.5, -slope, 0.5, 1 + o, -o, 1 + o, 'roofE');
        if (sHit && Math.abs(sHit.y - 0.5) >= Math.abs(sHit.x - 0.5)) hits.push(sHit);
        if (eHit && Math.abs(eHit.x - 0.5) >= Math.abs(eHit.y - 0.5)) hits.push(eHit);
      } else {                                                                          // crenellations: merlons along the top
        hits.push(top(X, Y, H, 0, 1, 0, 1, 'walltop'));
        for (const [x0, x1] of [[0, 0.32], [0.68, 1]]) for (const [y0, y1] of [[0, 0.32], [0.68, 1]]) {
          hits.push(faceS(X, Y, y1, x0, x1, H, H + 9, 'stone'), faceE(X, Y, x1, y0, y1, H, H + 9, 'stone'), top(X, Y, H + 9, x0, x1, y0, y1, 'walltop'));
        }
      }
      let best = null; for (const hit of hits) if (hit && (!best || hit.n > best.n)) best = hit;
      if (!best) continue;
      const k = best.side === 'e' ? 0.78 : 1, u = (best.side === 'e' ? 1 - best.y : best.x) * LEN, v = best.z;
      let c;
      if (best.mat === 'walltop') c = light(WALL_STONE, 0.1);
      else if (best.mat === 'roofS' || best.mat === 'roofE') {
        const kk = best.mat === 'roofE' ? 0.78 : 1, along = (best.mat === 'roofE' ? best.y : best.x) * LEN * 0.8, sDist = (apex - v) * 0.9, row = Math.floor(sDist / 5);
        c = sDist - row * 5 < 1 ? shade(TOWER_ROOF, 0.55 * kk) : tones(TOWER_ROOF, kk)[Math.floor(hash(row, Math.floor((along + (row % 2) * 3) / 6), 8) * 3)];
      } else {
        c = stoneAt(S, u, v, k * (v < 6 ? 0.88 : 1), WALL_STONE);
        if (tower && best.side === 's' && Math.abs(best.x - 0.5) < 0.07 && v > H - 34 && v < H - 14) c = '#1e1a18';     // an arrow slit
        if (tower && best.side === 'e' && Math.abs(best.y - 0.5) < 0.07 && v > H * 0.45 && v < H * 0.45 + 18) c = '#1e1a18';
        if (best.side === 's' && v < 3 && hash(Math.floor(u / 2), 1, 2) < 0.5) c = mix('#5f7a3a', '#3f5a2a', hash(Math.floor(u), 2));
      }
      g.fillStyle = c; g.fillRect(px, py, 1, 1);
    }
    const img = g.getImageData(0, 0, canvas.width, canvas.height), d = img.data, W = canvas.width;     // the outline
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < canvas.height && d[(y * W + x) * 4 + 3] === 255;
    const edge = [];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < W; x++) if (!d[(y * W + x) * 4 + 3] && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) edge.push(x, y);
    if (tower) { g.fillStyle = OUTLINE; for (let i = 0; i < edge.length; i += 2) g.fillRect(edge[i], edge[i + 1], 1, 1); }   // (walls run on into each other: no outline between them)
    if (tower) {                                                                      // a pennant on a pole at the apex
      const [x, y] = [(0.5 - 0.5) * HWa - minX, (0.5 + 0.5) * HHa - apex - minY];
      g.fillStyle = '#3b2a1c'; g.fillRect(Math.round(x), Math.round(y) - 14, 1, 14);
      g.fillStyle = '#d9b45a'; g.fillRect(Math.round(x) + 1, Math.round(y) - 14, 7, 2); g.fillRect(Math.round(x) + 1, Math.round(y) - 12, 5, 2); g.fillRect(Math.round(x) + 1, Math.round(y) - 10, 3, 1);
    }
    const out = { canvas, minX, minY };
    cache.set(kind, out);
    return out;
  }
  /** Draw a tile of wall or a watchtower standing on tile (tx, ty) (its ground centre at cx, cy in world pixels). */
  function drawPiece(ctx, kind, cx, cy) {
    const A = pieceArt(kind), ox = cx, oy = cy - TILE_HALF_H, smooth = ctx.imageSmoothingEnabled;   // (the art's origin: the tile's north corner)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(A.canvas, ox + A.minX * ART, oy + A.minY * ART, A.canvas.width * ART, A.canvas.height * ART);
    ctx.imageSmoothingEnabled = smooth;
  }

  /** Draw the slice of a building that belongs to one of its front tiles (the south row and the east column), at that tile's depth. Returns
   *  false for its other tiles (nothing to draw). */
  function drawTile(ctx, site, tx, ty) {
    const front = ty === site.y1, side = tx === site.x1;
    if (!front && !side) return false;
    const A = art(site), S = A.spec, ox = (site.x0 - site.y0) * TILE_HALF_W, oy = (site.x0 + site.y0) * TILE_HALF_H;
    const slice = (a, b) => {                                                     // art x from a to b (clipped to the picture)
      const x0 = Math.max(0, Math.floor(a - A.minX)), x1 = Math.min(A.canvas.width, Math.ceil(b - A.minX));
      if (x1 <= x0) return;
      ctx.drawImage(A.canvas, x0, 0, x1 - x0, A.canvas.height, ox + (x0 + A.minX) * ART, oy + A.minY * ART, (x1 - x0) * ART, A.canvas.height * ART);
    };
    const smooth = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    if (front) { const lx = tx - site.x0; slice(lx === 0 ? -1e4 : (lx - S.h) * HWa, (lx + 1 - S.h) * HWa); }               // its slice of the south face
    if (side) { const ly = ty - site.y0; slice((S.w - ly - 1) * HWa, ly === 0 ? 1e4 : (S.w - ly) * HWa); }                  // ... of the east face
    ctx.imageSmoothingEnabled = smooth;
    return true;
  }
  /** Where a building's hanging sign is (world pixels, its centre), for the glyph drawn over it. */
  function signAt(site) {
    const S = art(site).spec, x = S.door - 0.12, y = S.h + J + 0.1, z = F - 1;
    return { x: (site.x0 - site.y0) * TILE_HALF_W + (x - y) * TILE_HALF_W, y: (site.x0 + site.y0) * TILE_HALF_H + ((x + y) * HHa - z) * ART };
  }
  /** How tall the ground floor is in world pixels (the name banner floats above the door). */
  const groundFloorHeight = () => F * ART;

  return { art, drawTile, drawPiece, signAt, groundFloorHeight, ART };
})();
