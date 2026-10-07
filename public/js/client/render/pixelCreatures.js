'use strict';
/* CLIENT - retro pixel-art creatures, in the style of the pixel characters and ponies. Each creature kind (a sprite.kind in the creature data)
 * has a painter here that draws its PROFILE, facing right, into a small canvas; the result is outlined, cached and drawn scaled up with hard
 * edges. One drawing serves every size (a whelp and an elder dragon): the painter draws it AT the data's sprite.scale, so every creature has
 * the same pixel size on screen, a big one just has more pixels. Left is the mirror; walking towards
 * or away from the camera shows the last profile, as before.
 * Each frame knows: i (0-3 of the walk, or of the idle loop), moving, swing (-1 / 0 / 1: legs apart one way or the other), bob, hunting,
 * and t (a time-based frame, for wings and wriggles). A kind with no painter here keeps its smooth drawing (creatures/*.js). */
const PixelCreatures = (() => {
  const { shade, light, mix, tones, outline } = PixelCharacter.util;
  const PX = 1.25, cache = new Map(), kinds = {};
  const OUTLINE = '#1c130e', RED = '#ff3a2a';

  /** The painter works in ART coordinates, but paints at the creature's real size (m = its scale): outlines, bodies, lines and wings
   *  are drawn at full resolution, so a boss has the same pixel size as a rabbit, just more of them. */
  function painter(ctx, m = 1) {
    let ox = 0, oy = 0;
    const X = x => Math.round((x + ox) * m), Y = y => Math.round((y + oy) * m);
    const dot = (cx, cy, c) => { ctx.fillStyle = c; ctx.fillRect(cx, cy, 1, 1); };                 // one real pixel, in canvas space
    const P = {
      at(dx, dy, fn) { const sx = ox, sy = oy; ox += dx; oy += dy; fn(); ox = sx; oy = sy; },
      /** A block of art space: x, y, w, h in art pixels. */
      rect(x, y, w, h, c) {
        if (!c || w <= 0 || h <= 0) return;
        const x0 = X(x), y0 = Y(y), x1 = Math.max(x0 + 1, X(x + w)), y1 = Math.max(y0 + 1, Y(y + h));
        ctx.fillStyle = c; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      },
      px(x, y, c) {                                                                                   // one art pixel; on a big creature, a block with its own 1-pixel shading
        if (!c) return;
        P.rect(Math.round(x), Math.round(y), 1, 1, c);
        if (m >= 1.5) { const x0 = X(Math.round(x)), y0 = Y(Math.round(y)), x1 = X(Math.round(x) + 1), y1 = Y(Math.round(y) + 1); ctx.fillStyle = shade(c, 0.82); ctx.fillRect(x0, y1 - 1, x1 - x0, 1); ctx.fillRect(x1 - 1, y0, 1, y1 - y0); ctx.fillStyle = light(c, 0.18); ctx.fillRect(x0, y0, 1, 1); }
      },
      row(y, x0, x1, c) { P.rect(Math.min(x0, x1), y, Math.abs(Math.round(x1) - Math.round(x0)) + 1, 1, c); },
      /** A line w art pixels thick, drawn at full resolution. */
      line(x0, y0, x1, y1, c, w = 1) {
        const ax = (x0 + ox + 0.5) * m, ay = (y0 + oy + 0.5) * m, bx = (x1 + ox + 0.5) * m, by = (y1 + oy + 0.5) * m, t = Math.max(1, Math.round(w * m));
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 1.5)), steep = Math.abs(by - ay) >= Math.abs(bx - ax);
        ctx.fillStyle = c;
        for (let s = 0; s <= n; s++) { const x = Math.floor(ax + (bx - ax) * s / n), y = Math.floor(ay + (by - ay) * s / n); if (steep) ctx.fillRect(x - (t >> 1), y, t, 1); else ctx.fillRect(x, y - (t >> 1), 1, t); }
      },
      /** Ellipses merged into one shape, shaded as one: lit along the top, shadowed underneath (belly: a lighter underside instead). */
      shape(parts, t, opts = {}) {
        const cols = {}, pts = [];
        for (const [acx, acy, arx, ary] of parts) {
          const cx = (acx + ox + 0.5) * m, cy = (acy + oy + 0.5) * m, rx = (arx + 0.5) * m, ry = (ary + 0.5) * m;
          for (let y = Math.ceil(cy - ry); y < cy + ry; y++) {
            const ny = (y + 0.5 - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - ny * ny));
            for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) { const c = cols[x] || (cols[x] = new Set()); if (!c.has(y)) { c.add(y); pts.push([x, y]); } }
          }
        }
        const span = {}, lit = Math.max(1, Math.round((opts.lit || 1) * m)), dark = Math.max(1, Math.round(2 * m));
        for (const x in cols) { const ys = [...cols[x]]; span[x] = [Math.min(...ys), Math.max(...ys)]; }
        for (const [x, y] of pts) {
          const [top, bot] = span[x];
          let c = y - top < lit ? t.l : bot - y < dark ? (opts.belly || t.d) : t.b;
          if (opts.texture !== false && c === t.b && (x * 3 + y * 5) % (opts.grain || 11) === 0) c = t.d;
          dot(x, y, c);
        }
      },
      /** A leg from (x, top) to the ground, w wide, swung dx at the foot and lifted; a paw / hoof / claw at the bottom. */
      leg(x, top, ground, dx, lift, w, t, foot) {
        const end = ground - lift;
        for (let y = top; y <= end; y++) { const k = (y - top) / Math.max(1, end - top), xx = x + Math.round(dx * k); P.rect(xx, y, w, 1, t.b); if (w > 1) P.px(xx + w - 1, y, t.d); }
        if (foot) P.rect(x + dx - (w > 2 ? 0 : 0), end, w + 1, 1, foot);
      },
      /** A filled polygon ([[x, y], ...]) in art space, at full resolution. */
      poly(pts, c) {
        const q = pts.map(([x, y]) => [(x + ox + 0.5) * m, (y + oy + 0.5) * m]), xs = q.map(p => p[0]), ys = q.map(p => p[1]);
        ctx.fillStyle = c;
        for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
          let inside = false;
          for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi) inside = !inside; }
          if (inside) ctx.fillRect(x, y, 1, 1);
        }
      },
      clear(x, y) { const x0 = X(Math.round(x)), y0 = Y(Math.round(y)); ctx.clearRect(x0, y0, Math.max(1, X(Math.round(x) + 1) - x0), Math.max(1, Y(Math.round(y) + 1) - y0)); },
      eye(x, y, F, color = '#1a110c', big = false) {
        if (F.hunting) { P.px(x, y, RED); if (big) { P.px(x + 1, y, RED); P.px(x, y + 1, '#ffb0a0'); } return; }
        P.px(x, y, color); if (big) { P.px(x + 1, y, color); P.px(x, y + 1, color); P.px(x + 1, y + 1, color); P.px(x, y, '#ffffff'); }
      },
    };
    return P;
  }

  /* ---- frames ---- */
  const SWING = [1, 0, -1, 0], BOB = [0, -1, 0, -1];
  function frameOf(kind, anim) {
    const two = Math.PI * 2, phase = ((anim.phase % two) + two) % two, moving = anim.moving;
    const i = moving ? Math.floor(phase / (Math.PI / 2)) % 4 : Math.floor((anim.now / 450 + anim.seed * 3) % 4);
    const F = { i, moving, swing: moving ? SWING[i] : 0, bob: moving ? BOB[i] : (i === 2 ? -1 : 0), hunting: !!anim.hunting, t: 0, v: anim.variant || '', extra: anim.extra || '' };
    if (kind.tick) F.t = Math.floor(anim.now / (typeof kind.tick === 'function' ? kind.tick(F) : kind.tick)) % (kind.ticks || 4);
    return F;
  }

  /**
   * Registers a creature: { id, W, H, ground (the row the feet stand on), anchor (the column over the footprint), shadow [rx, ry] in art pixels,
   * tick (ms per time-frame, optional), ticks, palette(sprite, variant) -> colours, paint(P, C, F, ctx) }.
   */
  function register(k) { kinds[k.id] = k; }
  const has = kindId => !!kinds[kindId];

  /** Draws a creature at its footprint. sprite: the data's sprite { kind, color, variant, scale, antlers }. flip: 1 faces right, -1 left. */
  function draw(ctx, sprite, sx, sy, flip, anim) {
    const k = kinds[sprite.kind], C = k.palette(sprite, anim), F = frameOf(k, Object.assign({}, anim, { variant: sprite.variant }));
    const m = (sprite.scale || 1) * (C.k || 1), u = PX * m;                                          // u: screen size of one ART pixel; real pixels are always PX
    const key = `${sprite.kind}|${sprite.variant || ''}|${sprite.color || ''}|${sprite.antlers || ''}|${m}|${anim.extra || ''}|${F.i}${F.moving ? 'm' : 's'}${F.t}${F.hunting ? 'h' : ''}`;
    let canvas = cache.get(key);
    if (!canvas) {
      if (cache.size > 1500) cache.clear();
      canvas = document.createElement('canvas'); canvas.width = Math.ceil(k.W * m); canvas.height = Math.ceil(k.H * m);
      const c2 = canvas.getContext('2d'); k.paint(painter(c2, m), C, F, c2); outline(c2, C.outline || OUTLINE, canvas.width, canvas.height);
      cache.set(key, canvas);
    }
    const [srx, sry] = k.shadow || [k.W * 0.3, 3], lifted = k.flying ? k.flying(F) : 0;
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, srx * u, sry * u, 0, 0, Math.PI * 2); ctx.fill();
    const top = sy - (k.ground + 1) * u - lifted * u, left = -k.anchor * u, d = Math.max(1, Math.round(m)) * PX;   // (live sparks and flames: art-pixel sized, on the same grid)
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(sx, 0); ctx.scale(flip < 0 ? -1 : 1, 1);
    ctx.drawImage(canvas, left, top, canvas.width * PX, canvas.height * PX);
    if (k.live) k.live(ctx, C, F, anim, (ax, ay, color, a = 1) => { ctx.globalAlpha = Math.max(0, Math.min(1, a)); ctx.fillStyle = color; ctx.fillRect(left + Math.round(ax * m) * PX, top + Math.round(ay * m) * PX, d, d); ctx.globalAlpha = 1; });
    ctx.restore();
    return { h: (k.ground + 1 - (k.top || 0)) * u };
  }

  /** A leathery wing: a solid membrane between the leading edge (root -> tip) and the body (rear), with finger bones fanning out to a
   *  scalloped trailing edge. */
  function membrane(P, root, tip, rear, t) {
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    P.poly([root, tip, rear], t.b);
    const ribs = [0.33, 0.66];
    for (const k of ribs) { const e = lerp(rear, tip, k); P.line(root[0], root[1], e[0], e[1], t.d); }
    for (const [a, b] of [[0, 0.33], [0.33, 0.66], [0.66, 1]]) {                                         // a bite out of the edge between each pair of bones
      const m = lerp(lerp(rear, tip, a), lerp(rear, tip, b), 0.5), toward = lerp(m, root, 0.12);
      P.clear(m[0], m[1]); P.clear((m[0] + toward[0]) / 2, (m[1] + toward[1]) / 2);
    }
    P.line(root[0], root[1], tip[0], tip[1], t.l, 2);
  }

  return { register, has, draw, util: { tones, shade, light, mix, membrane } };
})();

/* =========================================================================================================================
 * THE CREATURES (each draws its profile facing right)
 * ========================================================================================================================= */
(() => {
  const { tones, shade, light, mix, membrane } = PixelCreatures.util;
  const HOOF = '#2e2622';

  /* ---- RABBIT: hops ---- */
  PixelCreatures.register({
    id: 'rabbit', W: 24, H: 22, ground: 20, anchor: 11, shadow: [8, 2.5],
    palette: s => ({ coat: tones(s.color || '#a98d6c'), ear: '#e8b3b3' }),
    paint(P, C, F) {
      const hop = F.moving ? [0, 3, 4, 2][F.i] : 0, ear = !F.moving && F.i === 1 ? 1 : 0, stretch = F.moving && F.i === 2;
      P.at(0, -hop, () => {
        P.rect(stretch ? 4 : 6, 19, 4, 1, C.coat.d);                                                       // the long hind foot
        P.shape([[10, 15, 6.5, 4], [6, 15, 4, 4]], C.coat);                                              // body and haunch
        P.shape([[4, 13, 1.6, 1.6]], tones('#f3efe6'), { texture: false });                              // the white tail
        P.rect(stretch ? 17 : 15, 17, 2, 3, C.coat.b);                                                    // front paw
        P.shape([[17, 11, 3.6, 3]], C.coat, { texture: false });                                          // head
        P.rect(13, 3 + ear, 2, 6, C.coat.d); P.rect(16, 2, 2, 7, C.coat.b); P.rect(16, 3, 1, 5, C.ear);  // ears
        P.eye(18, 10, F); P.px(21, 11, '#d98a8a');
      });
    },
  });

  /* ---- SHEEP (as in its portrait): a deep, round cream fleece in lumpy locks over short pale legs with dark hooves; a pale face
   *      with a woolly topknot, a pink-lined ear and a pink nose ---- */
  const SHEEP_FLEECE = [[18, 16, 11, 7.5], [9, 17, 5.5, 5.5], [26, 16, 5, 6.5], [16, 10, 8, 4.5], [23, 11, 5, 4], [6, 14, 2.2, 2.2]];
  const inFleece = (x, y, k) => SHEEP_FLEECE.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < k);
  PixelCreatures.register({
    id: 'sheep', W: 40, H: 30, ground: 28, anchor: 18, shadow: [14, 4],
    palette: s => { const col = s.color || '#f2dfbf'; return { wool: tones(col), curl: shade(col, 0.82), deep: shade(col, 0.72), face: tones('#f7ecdd'), leg: tones('#e2cba6'), ear: '#ec9d9a', nose: '#d9837f', hoof: '#3a3330' }; },
    paint(P, C, F) {
      const sw = F.swing, shorn = F.extra === 'shorn', far = { b: shade(C.leg.b, 0.8), d: shade(C.leg.d, 0.8) };
      const leg = (x, d, t) => { P.leg(x, 21, 28, d, 0, 3, t, C.hoof); P.rect(x + d, 27, 4, 1, C.hoof); };   // short, sturdy, a two-row dark hoof
      leg(13, -sw, far); leg(24, sw, far);                                                                 // far legs
      leg(9, sw, C.leg); leg(20, -sw, C.leg);                                                              // near legs (the fleece hangs over their tops)
      P.at(0, F.bob, () => {
        if (shorn) {                                                                                       // shorn: a slim pinkish body with a short fuzz
          const skin = tones('#e3cdbf');
          P.shape([[18, 17, 9.5, 5], [11, 17, 4.5, 4.5], [25, 16, 4, 4]], skin, { texture: false });
          for (let y = 13; y < 21; y += 2) for (let x = 10 + (y % 4 ? 1 : 0); x < 28; x += 3) P.px(x, y, '#f4ebe0');   // stubble
          P.px(7, 15, '#f4ebe0'); P.px(6, 14, '#f4ebe0');                                                   // a little tuft left on its tail
        } else {
          P.shape(SHEEP_FLEECE, C.wool, { texture: false, lit: 2 });
          for (let r = 0, y = 7; y < 23; y += 3, r++) for (let x = 5 + (r % 2) * 3; x < 31; x += 6) {      // the locks: a shadowed curve under each, a lit tip on top
            const lock = [[x, y + 1, C.curl], [x + 1, y + 2, C.curl], [x + 2, y + 2, y > 16 ? C.deep : C.curl], [x + 3, y + 1, C.curl], [x + 1, y, C.wool.l], [x + 2, y, C.wool.l]];
            for (const [px, py, c] of lock) if (inFleece(px, py, 0.8)) P.px(px, py, c);
          }
        }
      });
      P.at(0, F.bob + (!F.moving && F.i === 3 ? 4 : 0), () => {                                          // (it grazes now and then)
        const hx = 32, hy = 10;
        P.shape([[hx, hy, 4.5, 4.6], [hx + 3.5, hy + 3, 2.8, 2.6]], C.face, { texture: false, lit: 1 });   // the pale face, long in the muzzle
        for (let y = hy - 3; y <= hy + 4; y++) P.px(Math.round(hx - 4.5 * Math.sqrt(Math.max(0, 1 - ((y - hy) / 4.6) ** 2))) + 1, y, C.curl);   // the back of the head, set off from the fleece
        if (!shorn) { P.shape([[hx - 1.5, hy - 4, 3.6, 2.4]], C.wool, { texture: false }); P.px(hx - 3, hy - 3, C.curl); P.px(hx - 1, hy - 2, C.curl); P.px(hx + 1, hy - 3, C.curl); }   // the woolly topknot
        P.rect(hx - 8, hy - 2, 4, 2, C.face.b); P.row(hy - 2, hx - 7, hx - 5, C.ear); P.px(hx - 8, hy - 1, C.face.d);   // the ear, sticking back, pink inside
        P.eye(hx, hy - 1, F, '#241811'); P.px(hx + 1, hy - 1, '#241811'); P.px(hx, hy, '#5a3e2a'); P.px(hx - 1, hy - 2, C.face.d);   // a dark eye under its brow
        P.px(hx + 6, hy + 2, C.nose); P.px(hx + 6, hy + 3, C.nose); P.px(hx + 5, hy + 2, C.nose); P.px(hx + 5, hy + 3, C.nose); P.row(hy + 5, hx + 3, hx + 5, C.face.d);   // pink nose, mouth
      });
    },
  });

  /* ---- GOAT: horned and bearded ---- */
  PixelCreatures.register({
    id: 'goat', W: 32, H: 28, ground: 26, anchor: 15, shadow: [12, 4],
    palette: s => ({ coat: tones(s.color || '#e4dccb'), horn: tones('#8a7a63'), leg: tones('#8a7866') }),
    paint(P, C, F) {
      const sw = F.swing;
      for (const [x, d] of [[10, -sw], [21, sw]]) P.leg(x, 18, 26, d, 0, 2, { b: C.leg.d, d: shade(C.leg.d, 0.8) }, HOOF);
      P.at(0, F.bob, () => {
        P.shape([[15, 15, 9, 5]], C.coat);
        P.px(5, 11, C.coat.d); P.px(6, 11, C.coat.b); P.px(6, 12, C.coat.b);                            // stubby tail
        P.line(21, 14, 24, 9, C.coat.b, 3);                                                              // neck
      });
      for (const [x, d] of [[8, sw], [19, -sw]]) P.leg(x, 18, 26, d, 0, 2, C.leg, HOOF);
      P.at(0, F.bob + (!F.moving && F.i === 3 ? 1 : 0), () => {
        P.shape([[25, 8, 3.6, 3.2], [28, 9, 2.2, 1.8]], C.coat, { texture: false });                       // head and muzzle
        P.line(24, 5, 21, 2, C.horn.b, 1); P.line(25, 5, 22, 1, C.horn.l, 1); P.px(20, 3, C.horn.d);     // horns sweeping back
        P.px(22, 6, C.coat.d); P.px(21, 7, C.coat.d);                                                    // ear
        P.px(26, 7, F.hunting ? '#ff3a2a' : '#c9a227'); P.px(30, 9, '#3a2a22');                          // a goat's golden eye, the nose
        P.rect(27, 11, 1, 3, C.coat.l); P.px(28, 12, C.coat.l);                                          // beard
      });
    },
  });

  /* ---- CANINES: dog, fox, wolf, cat ---- */
  const CANINE = {
    dog:  { k: 1.0,  body: '#c49a62', belly: '#e4cfa6', leg: '#a9814d', ear: 'floppy', snout: 3, tail: 'up',   tip: null,      nose: '#2a1c14' },
    fox:  { k: 0.95, body: '#d9742b', belly: '#f6efe2', leg: '#3a2a22', ear: 'point',  snout: 4, tail: 'bush', tip: '#f6efe2', nose: '#1a1410' },
    wolf: { k: 1.2,  body: '#8b8f96', belly: '#c9ccd1', leg: '#6b6f76', ear: 'point',  snout: 4, tail: 'low',  tip: null,      nose: '#1a1410' },
    cat:  { k: 0.75, body: '#9a9a9a', belly: '#e8e4dc', leg: '#808080', ear: 'point',  snout: 1, tail: 'curl', tip: null,      nose: '#d98a8a' },
  };
  PixelCreatures.register({
    id: 'canine', W: 34, H: 26, ground: 24, anchor: 15, shadow: [11, 3.5],
    palette: s => { const V = CANINE[s.variant] || CANINE.dog; return { V, k: V.k, body: tones(s.color || V.body), belly: V.belly, leg: tones(V.leg) }; },
    paint(P, C, F) {
      const V = C.V, sw = F.swing, wag = !F.moving ? [0, 1, 0, -1][F.i] : 0;
      for (const [x, d] of [[10, -sw], [20, sw]]) P.leg(x, 16, 24, d * 2, 0, 2, { b: shade(C.leg.b, 0.78), d: shade(C.leg.d, 0.8) });
      P.at(0, F.bob, () => {
        // the tail
        if (V.tail === 'up') P.line(7, 12, 4 + wag, 5, C.body.b, 2);
        else if (V.tail === 'bush') { P.line(7, 12, 2, 18 + wag, C.body.b, 3); P.rect(1, 17 + wag, 3, 3, V.tip); }
        else if (V.tail === 'low') P.line(7, 12, 3, 20, C.body.d, 2);
        else { P.line(7, 12, 4, 6, C.body.b, 2); P.line(4, 6, 6 + wag, 3, C.body.b, 2); }
        P.shape([[15, 13, 8.5, 4.2]], C.body, { belly: V.belly });
        if (sprite_is(C, 'wolf')) P.row(9, 13, 21, C.body.d);                                             // a darker ruff
      });
      for (const [x, d] of [[8, sw], [18, -sw]]) P.leg(x, 16, 24, d * 2, 0, 2, C.leg, shade(C.leg.d, 0.6));
      P.at(0, F.bob, () => {
        P.line(21, 12, 24, 8, C.body.b, 3);                                                              // neck
        P.shape([[25, 8, 3.8, 3.4]], C.body, { texture: false });                                         // head
        P.rect(28, 8, V.snout + 1, 3, V.belly); P.row(8, 28, 27 + V.snout, C.body.b);                   // the muzzle
        P.px(28 + V.snout, 8, V.nose); if (F.hunting && V.snout > 2) { P.px(29, 11, '#ffffff'); P.px(31, 11, '#ffffff'); }   // bared teeth
        if (V.ear === 'floppy') { P.rect(22, 6, 2, 5, shade(C.body.b, 0.7)); }
        else { P.line(23, 5, 23, 1, C.body.b, 2); P.line(25, 5, 26, 1, C.body.b, 2); P.px(23, 3, '#e8b3b3'); }
        P.eye(26, 7, F);
        if (V.ear === 'point' && sprite_is(C, 'cat')) { P.px(30, 9, '#ffffff'); P.px(31, 8, '#ffffff'); P.px(31, 10, '#ffffff'); }   // whiskers
      });
    },
  });
  function sprite_is(C, v) { return C.V === CANINE[v]; }

  /* ---- DEER (and the elk): long legs, a white tail, antlers on stags ---- */
  PixelCreatures.register({
    id: 'deer', W: 38, H: 44, ground: 42, anchor: 17, shadow: [14, 4],
    palette: s => ({ coat: tones(s.color || '#a8794a'), belly: '#d2b080', antler: tones('#d9c9a6'), great: s.antlers === 'great' }),
    paint(P, C, F) {
      const sw = F.swing, stag = C.great || F.extra === 'stag';
      for (const [x, d] of [[11, -sw], [23, sw]]) P.leg(x, 28, 42, d * 2, 0, 2, { b: C.coat.d, d: shade(C.coat.d, 0.8) }, HOOF);
      P.at(0, F.bob, () => {
        P.shape([[17, 25, 10, 5]], C.coat, { belly: C.belly });
        P.rect(6, 21, 2, 3, '#f3efe6');                                                                  // the white tail
        for (const [x, y] of [[13, 22], [18, 21], [10, 24]]) P.px(x, y, '#f0e6d2');                        // dapples
        P.line(24, 23, 28, 13, C.coat.b, 4);                                                             // neck
      });
      for (const [x, d] of [[9, sw], [21, -sw]]) P.leg(x, 28, 42, d * 2, 0, 2, C.coat, HOOF);
      P.at(0, F.bob + (!F.moving && F.i === 3 ? 3 : 0), () => {
        P.shape([[31, 12, 3.8, 2.8], [34, 13, 2.2, 1.8]], C.coat, { texture: false });
        P.px(36, 12, '#2a1e16'); P.rect(27, 8, 2, 3, C.coat.d); P.eye(31, 11, F);                          // nose, ear, eye
        if (stag) {                                                                                       // antlers
          const a = C.antler.b;
          P.line(30, 9, 28, 2, a); P.line(29, 5, 32, 2, a); P.line(28, 3, 26, 1, a);
          if (C.great) { P.line(31, 9, 32, -0, a); P.line(32, 4, 36, 1, a); P.line(28, 2, 24, 0, a); P.line(32, 1, 34, -1, a); }
        }
      });
    },
  });

  /* ---- BOAR: low and bulky, bristles, tusks ---- */
  PixelCreatures.register({
    id: 'boar', W: 36, H: 26, ground: 24, anchor: 16, shadow: [13, 4],
    palette: s => ({ coat: tones(s.color || '#6b4a3a'), snout: light(s.color || '#6b4a3a', 0.3) }),
    paint(P, C, F) {
      const sw = F.swing, legs = { b: '#3a2a22', d: '#2a1c16' };
      for (const [x, d] of [[11, -sw], [21, sw]]) P.leg(x, 18, 24, d, 0, 3, legs);
      P.at(0, F.bob, () => {
        P.shape([[16, 13, 10.5, 6], [24, 14, 5, 5]], C.coat);
        for (let x = 8; x < 25; x += 2) { P.px(x, 6 + (x % 4 ? 0 : -1), C.coat.d); P.px(x + 1, 6, C.coat.d); }   // the bristled crest
        P.px(4, 11, C.coat.d); P.px(3, 10, C.coat.d); P.px(4, 9, C.coat.d);                              // curly tail
      });
      for (const [x, d] of [[8, sw], [19, -sw]]) P.leg(x, 18, 24, d, 0, 3, { b: '#4a3628', d: '#2a1c16' });
      P.at(0, F.bob + (!F.moving && F.i === 3 ? 1 : 0), () => {
        P.shape([[28, 14, 4.5, 4]], tones(shade(C.coat.b, 0.9)), { texture: false });
        P.rect(31, 13, 3, 4, C.snout); P.px(33, 14, '#2a1c14');                                          // snout, nostril
        P.px(32, 17, '#f3eee3'); P.px(33, 16, '#f3eee3'); P.px(33, 15, '#f3eee3');                        // tusk
        P.px(26, 9, C.coat.d); P.px(27, 9, C.coat.d); P.px(26, 8, C.coat.d);                             // ear
        P.eye(29, 12, F);
      });
    },
  });

  /* ---- BEAR (the cub, the bear, the Cave Bear): hump-shouldered, heavy paws ---- */
  PixelCreatures.register({
    id: 'bear', W: 48, H: 36, ground: 34, anchor: 22, shadow: [20, 5],
    palette: s => ({ coat: tones(s.color || '#5a3a22'), muzzle: '#cdb08a' }),
    paint(P, C, F) {
      const sw = F.swing, far = { b: shade(C.coat.b, 0.72), d: shade(C.coat.d, 0.75) };
      for (const [x, d] of [[11, -sw], [29, sw]]) P.leg(x, 24, 34, d * 2, 0, 5, far, shade(C.coat.d, 0.5));
      P.at(0, F.bob, () => {
        P.shape([[22, 20, 14, 8], [17, 14, 7, 5], [34, 20, 6, 7]], C.coat);
        P.shape([[6, 18, 2.4, 2.4]], C.coat, { texture: false });                                       // stub tail
      });
      for (const [x, d] of [[15, sw], [33, -sw]]) P.leg(x, 24, 34, d * 2, 0, 5, C.coat, shade(C.coat.d, 0.6));
      P.at(0, F.bob, () => {
        P.shape([[40, 16, 5.6, 5]], C.coat, { texture: false });
        P.shape([[44, 18, 3, 2.4]], tones(C.muzzle), { texture: false }); P.rect(46, 16, 2, 2, '#1c1410');   // muzzle, nose
        P.shape([[37, 11, 1.8, 1.8], [41, 10.5, 1.8, 1.8]], tones(C.coat.d), { texture: false });            // ears
        P.eye(42, 15, F);
        if (F.hunting) { P.row(20, 42, 46, '#3a1010'); P.px(43, 20, '#f2ead8'); P.px(45, 20, '#f2ead8'); } // a roar
      });
    },
  });

  /* ---- LION and MANTICORE (bat wings, a scorpion's tail) ---- */
  const lion = manticore => ({
    id: manticore ? 'manticore' : 'lion', W: 50, H: manticore ? 52 : 38, ground: manticore ? 50 : 36, anchor: 22, shadow: [18, 4.5],
    tick: 260,
    palette: s => { const col = s.color || '#c9a24a'; return { coat: tones(col), mane: tones(manticore ? '#5a2a1a' : shade(col, 0.62)), face: tones(manticore ? '#e0b48a' : col), wing: tones('#a3452a') }; },
    paint(P, C, F) {
      const G = manticore ? 50 : 36, sw = F.swing, far = { b: shade(C.coat.b, 0.72), d: shade(C.coat.d, 0.75) };
      if (manticore) {                                                                                   // bat wings behind the shoulders
        const up = [-4, -1, 2, -1][F.t];
        for (const [dx, t] of [[-4, tones(shade(C.wing.b, 0.75))], [0, C.wing]]) membrane(P, [24 + dx, G - 22], [6 + dx, G - 44 + up * 2], [12 + dx, G - 18], t);
      }
      for (const [x, d] of [[12, -sw], [30, sw]]) P.leg(x, G - 12, G, d * 2, 0, 3, far);
      P.at(0, F.bob, () => {
        if (manticore) {                                                                                 // the scorpion's tail, arching over the back
          const segs = [[9, G - 16], [5, G - 22], [4, G - 29], [6, G - 35], [11, G - 38], [16, G - 37]];
          segs.forEach(([x, y], i) => P.shape([[x, y, 2.6 - i * 0.2, 2.4 - i * 0.2]], tones(shade(C.coat.b, 0.85 - i * 0.03)), { texture: false }));
          P.line(17, G - 37, 20, G - 34, '#3a1f1a', 2);
        } else { P.line(9, G - 17, 4, G - 24, C.coat.b, 2); P.shape([[4, G - 26, 2, 2.4]], C.mane, { texture: false }); }   // tail with a dark tuft
        P.shape([[21, G - 17, 12, 5.5]], C.coat);
      });
      for (const [x, d] of [[15, sw], [33, -sw]]) P.leg(x, G - 12, G, d * 2, 0, 3, C.coat, shade(C.coat.d, 0.6));
      P.at(0, F.bob, () => {
        P.shape([[37, G - 21, 7.5, 7.5]], C.mane, { grain: 5 });                                          // the shaggy mane
        for (let a = 0; a < 12; a++) { const r = 8.5, x = 37 + Math.cos(a / 12 * Math.PI * 2) * r, y = G - 21 + Math.sin(a / 12 * Math.PI * 2) * r; if (a % 2) P.px(x, y, C.mane.d); }
        P.shape([[40, G - 20, 4.5, 4], [44, G - 18, 2.4, 2]], C.face, { texture: false });                 // face and muzzle
        P.px(46, G - 19, '#2a1a14'); P.px(38, G - 26, C.mane.d); P.eye(41, G - 21, F);
        if (F.hunting) { P.row(G - 16, 42, 45, '#3a1010'); P.px(43, G - 16, '#f4ecd6'); }
      });
    },
  });
  PixelCreatures.register(lion(false));
  PixelCreatures.register(lion(true));
})();

(() => {
  const { tones, shade, light, mix, membrane } = PixelCreatures.util;

  /* ---- BAT: flutters above the ground ---- */
  PixelCreatures.register({
    id: 'bat', W: 36, H: 22, ground: 15, anchor: 18, shadow: [6, 2], tick: 70, ticks: 4,
    flying: F => 13 + (F.t % 2),
    palette: s => ({ body: tones(s.color || '#3a2f4a') }),
    paint(P, C, F) {
      const tipY = [1, 6, 11, 6][F.t], far = tones(shade(C.body.b, 0.75));
      membrane(P, [16, 9], [3, tipY], [14, 14], far);
      membrane(P, [20, 9], [33, tipY], [22, 14], C.body);
      P.shape([[18, 10, 3, 4]], C.body, { texture: false }); P.shape([[19, 6, 2.6, 2.4]], C.body, { texture: false });
      P.px(17, 3, C.body.b); P.px(17, 2, C.body.b); P.px(20, 3, C.body.b); P.px(20, 2, C.body.b);         // ears
      P.px(20, 6, F.hunting ? '#ff3030' : '#e84a4a'); P.px(21, 8, '#f0e6e6');                               // eye, a fang
    },
  });

  /* ---- BIRDS: chicken, duck, owl ---- */
  PixelCreatures.register({
    id: 'bird', W: 24, H: 26, ground: 24, anchor: 11, shadow: [6, 2],
    palette: s => ({ v: s.variant || 'chicken' }),
    paint(P, C, F) {
      const v = C.v, legC = '#e0a030', sw = F.swing;
      if (v === 'owl') {                                                                                   // upright, round-headed, big eyes, ear tufts
        const b = tones('#8a6f4d'), blink = !F.moving && F.i === 2;
        P.shape([[11, 16, 5, 6.5]], b); P.shape([[12, 17, 3, 4.5]], tones('#d9c7a3'), { texture: false });
        for (const [x, y] of [[11, 15], [13, 17], [11, 19]]) P.px(x, y, '#a88f6a');
        P.shape([[8, 16, 2, 5]], tones('#6e5639'), { texture: false });
        P.shape([[11, 8, 5, 4.5]], tones('#97795a'), { texture: false });
        P.px(7, 3, '#6e5639'); P.px(8, 4, '#6e5639'); P.px(15, 3, '#6e5639'); P.px(14, 4, '#6e5639');
        for (const x of [8, 12]) { P.rect(x, 7, 3, 3, '#f6e7b4'); if (blink) P.row(8, x, x + 2, '#6e5639'); else P.px(x + 1, 8, F.hunting ? '#ff3030' : '#2a1c14'); }
        P.px(11, 10, '#e0a030'); P.px(11, 11, '#c08020');
        P.rect(9, 23, 2, 1, legC); P.rect(12, 23, 2, 1, legC);
        return;
      }
      const duck = v === 'duck', body = tones(duck ? '#8b6b3e' : '#f4f0e6'), wing = tones(duck ? '#6f5430' : '#e2dac7');
      const peck = !F.moving && F.i === 3, hop = F.moving && F.i % 2 ? -1 : 0;
      P.line(10, 20 + hop, 10 + sw, 24, legC); P.line(13, 20 + hop, 13 - sw, 24, legC); P.px(11 + sw, 24, legC); P.px(14 - sw, 24, legC);
      P.at(0, hop, () => {
        if (duck) P.rect(3, 15, 3, 2, wing.b);
        else { P.line(6, 15, 3, 9, '#e8e1cf', 2); P.line(5, 15, 4, 8, body.l); P.px(3, 8, body.d); }        // a chicken's tail feathers
        P.shape([[11, 16, 6.5, 4.5]], body); P.shape([[10, 16, 3.5, 2.2]], wing, { texture: false });
        const [hx, hy] = peck ? [17, 15] : [16, 10];
        if (duck) { P.shape([[hx, hy, 2.8, 2.6]], tones('#2f6b4b'), { texture: false }); P.row(hy + 3, hx - 2, hx + 1, '#ffffff'); P.rect(hx + 3, hy, 3, 2, '#f2c230'); }
        else {
          P.shape([[hx, hy, 2.6, 2.6]], body, { texture: false });
          P.px(hx - 1, hy - 3, '#d93a2f'); P.px(hx, hy - 4, '#d93a2f'); P.px(hx + 1, hy - 3, '#d93a2f'); P.px(hx, hy - 3, '#d93a2f');   // comb
          P.px(hx + 2, hy + 3, '#d93a2f'); P.px(hx + 2, hy + 2, '#d93a2f');                                       // wattle
          P.rect(hx + 3, hy, 2, 1, '#f0a830');
        }
        P.px(hx + 1, hy - 1, F.hunting ? '#ff3030' : '#241a14');
      });
    },
  });

  /* ---- SPIDER (and the Broodmother) ---- */
  PixelCreatures.register({
    id: 'spider', W: 50, H: 30, ground: 28, anchor: 23, shadow: [19, 5],
    palette: s => ({ body: tones(s.color || '#2b2233'), leg: '#1d1624', mark: mix(s.color || '#2b2233', '#b090e0', 0.45) }),
    paint(P, C, F) {
      const legs = (near) => {
        for (let i = 0; i < 4; i++) {
          if ((i % 2 === 0) !== near) continue;
          const w = F.moving ? ((i + F.i) % 2 ? 2 : -2) : (!F.moving && F.i === 1 && i === 0 ? -1 : 0), col = near ? C.leg : shade(C.leg, 1.6);
          P.line(25, 14, 31 + i * 4, 4 + i + w, col, 2); P.line(31 + i * 4, 4 + i + w, 34 + i * 4 + w, 28, col, near ? 2 : 1);      // forward legs
          P.line(21, 14, 15 - i * 4, 5 + i - w, col, 2); P.line(15 - i * 4, 5 + i - w, 11 - i * 4 - w, 28, col, near ? 2 : 1);      // backward legs
        }
      };
      legs(false);
      P.shape([[16, 14, 9, 7]], C.body, { texture: false });
      for (const [x, y] of [[14, 11], [15, 12], [16, 13], [15, 14], [14, 15], [17, 12], [17, 14]]) P.px(x, y, C.mark);   // a marking on the abdomen
      P.shape([[28, 15, 5, 4]], tones(shade(C.body.b, 1.2)), { texture: false });
      legs(true);
      const eye = F.hunting ? '#ff3030' : '#c24a4a';
      for (const [x, y] of [[30, 13], [31, 13], [32, 14], [30, 14]]) P.px(x, y, eye);
      P.px(32, 18, '#e8e0d0'); P.px(31, 19, '#e8e0d0'); if (F.hunting) { P.px(33, 19, '#e8e0d0'); P.px(32, 20, '#e8e0d0'); }   // fangs
    },
  });

  /* ---- CENTIPEDE (and the Queen): a wriggling row of plates ---- */
  PixelCreatures.register({
    id: 'centipede', W: 70, H: 26, ground: 24, anchor: 32, shadow: [28, 4], tick: F => (F.moving ? 90 : 240), ticks: 8,
    palette: s => ({ body: tones(s.color || '#8a3a2a') }),
    paint(P, C, F) {
      const N = 11, seg = i => [6 + i * 5, 15 - Math.round(Math.sin(F.t * Math.PI / 4 + i * 0.6) * 2) - (i === N - 1 ? 2 : 0)];
      for (let i = 0; i < N; i++) { const [x, y] = seg(i), w = ((i + F.t) % 2 ? 1 : -1); P.line(x, y + 2, x + w, 24, '#3a2420'); P.line(x, y - 2, x - w, y - 7, '#3a2420'); }
      for (let i = 0; i < N; i++) { const [x, y] = seg(i), last = i === N - 1; P.shape([[x, y, last ? 4.4 : 3.4, last ? 4 : 3.4]], i % 2 ? tones(shade(C.body.b, 0.82)) : C.body, { texture: false }); }
      const [hx, hy] = seg(N - 1), eye = F.hunting ? '#ff3030' : '#ffd24a';
      P.px(hx + 2, hy - 1, eye); P.px(hx + 2, hy + 1, eye);
      P.line(hx + 4, hy - 1, hx + 8, hy - 2, '#2a1a16'); P.line(hx + 8, hy - 2, hx + 9, hy + 1, '#2a1a16');                           // mandibles
      P.line(hx + 4, hy + 2, hx + 8, hy + 3, '#2a1a16'); P.line(hx + 8, hy + 3, hx + 9, hy + 1, '#2a1a16');
      P.line(hx + 2, hy - 4, hx + 8, hy - 9, '#3a2420'); P.line(hx + 3, hy - 3, hx + 10, hy - 6, '#3a2420');                          // antennae
    },
  });

  /* ---- DRAGON (whelp, young, dragon, elder, the bosses): one drawing, the data's colour and scale ----
   * A deep, scaled body with pale belly plates; an S-curved neck; a horned head with a brow ridge, a slit-pupilled eye and a jaw that opens
   * on its teeth; spikes from the neck to the tail; a curling tail with a spade; crouched legs with pale claws; great bat wings on arm and
   * finger bones. The wings beat when it moves or hunts and stir now and then at rest; smoke curls from its nose, fire when it hunts. */
  const bez = (p0, p1, p2, p3, n) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; });
  const DG = 62;                                                                                     // the ground row
  // the wing for each beat: elbow, wrist, and three finger tips, relative to the shoulder
  const DRAGON_WING = [
    { E: [3, -11], W: [-3, -22], T: [[5, -34], [-11, -31], [-23, -21]] },
    { E: [4, -8], W: [-1, -16], T: [[8, -27], [-8, -28], [-23, -16]] },
    { E: [5, -4], W: [1, -8], T: [[13, -14], [-4, -18], [-22, -8]] },
    { E: [5, 0], W: [3, 3], T: [[14, 9], [0, 11], [-17, 6]] },
  ];
  function dragonWing(P, C, root, f, far) {
    const S = DRAGON_WING[f], at = d => [root[0] + d[0], root[1] + d[1]], E = at(S.E), Wr = at(S.W), T = S.T.map(at), back = [root[0] - 13, root[1] + 3];
    const mem = far ? C.memFar : C.mem, bone = far ? shade(C.bone, 0.8) : C.bone, mid = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; return [m[0] + (Wr[0] - m[0]) * 0.22, m[1] + (Wr[1] - m[1]) * 0.22]; };
    P.poly([root, E, Wr, T[0], mid(T[0], T[1]), T[1], mid(T[1], T[2]), T[2], mid(T[2], back), back], mem.b);   // the membrane, scalloped between the fingers
    P.poly([Wr, T[1], mid(T[1], T[2]), T[2], back, root], mem.d);                                     // the far half a shade darker
    for (const t of T) P.line(Wr[0], Wr[1], t[0], t[1], bone);                                         // finger bones
    P.line(root[0], root[1], E[0], E[1], far ? C.body.d : C.body.b, 3); P.line(E[0], E[1], Wr[0], Wr[1], far ? C.body.d : C.body.b, 2);   // the arm
    P.px(Wr[0] + 1, Wr[1] - 1, C.claw); P.px(Wr[0] + 2, Wr[1] - 2, C.claw);                          // the wing's thumb claw
  }
  /** A tapering tube along points (neck, tail): lit along its top, a pale underside. */
  function tube(P, pts, w0, w1, C, belly) {
    P.shape(pts.map(([x, y], i) => { const r = (w0 + (w1 - w0) * i / (pts.length - 1)) / 2; return [x, y, r, r]; }), C.body, { texture: false, belly: belly ? C.belly.b : undefined });
  }
  function spikes(P, C, pts, every, h) {
    pts.forEach(([x, y], i) => { if (i % every || i === 0) return; const k = Math.max(1, Math.round(h * (1 - i / pts.length * 0.5))); for (let j = 0; j < k; j++) P.px(x - j * 0.4, y - j, j === k - 1 ? C.spikeTip : C.spike); P.px(x + 1, y, C.spike); });
  }
  function claws(P, C, x, y) { P.px(x + 1, y, C.claw); P.px(x + 3, y, C.claw); P.px(x + 4, y - 1, C.claw); }
  /** A leg: thigh (or shoulder) -> knee -> hock -> foot with claws, moved by the stride. */
  function dragonLeg(P, C, hip, hind, sw, lift, far) {
    const col = far ? C.far : C.body, s = sw * 3, knee = hind ? [hip[0] + 3 + s * 0.3, hip[1] + 6] : [hip[0] + 1 + s * 0.3, hip[1] + 6], hock = hind ? [hip[0] - 2 + s * 0.6, DG - 4 - lift] : [hip[0] + 1 + s * 0.7, DG - 2 - lift], foot = [hock[0] + (hind ? 2 : 1) + s * 0.3, DG - lift];
    P.line(hip[0], hip[1], knee[0], knee[1], col.b, hind ? 6 : 5); P.line(knee[0], knee[1], hock[0], hock[1], col.b, 4); P.line(hock[0], hock[1], foot[0], foot[1], col.d, 3);
    P.rect(foot[0] - 1, foot[1], 5, 1, col.d); claws(P, C, foot[0] - 1, foot[1]);
  }
  PixelCreatures.register({
    id: 'dragon', W: 84, H: 66, ground: DG, anchor: 36, shadow: [24, 5], tick: F => (F.hunting ? 120 : F.moving ? 170 : 330), ticks: 4,
    palette: s => {
      const col = s.color || '#4f9a5a';
      return { body: tones(col), far: tones(shade(col, 0.72)), belly: tones(mix(col, '#f3e2b0', 0.55)), mem: tones(mix(light(col, 0.12), '#d9a070', 0.18)), memFar: tones(shade(mix(col, '#d9a070', 0.15), 0.62)),
        bone: shade(col, 0.5), spike: shade(col, 0.55), spikeTip: mix(col, '#f0e0c0', 0.6), horn: tones('#e8dcc0'), claw: '#f0e6d0', eye: '#ffd24a' };
    },
    paint(P, C, F) {
      const sw = F.swing, wf = F.hunting || F.moving ? F.t : [1, 1, 1, 2][F.t], b = F.bob, root = [38, DG - 28];
      P.at(0, b, () => dragonWing(P, C, [root[0] - 4, root[1] - 2], wf, true));                       // far wing
      dragonLeg(P, C, [25, DG - 17], true, -sw, F.moving && F.i === 3 ? 2 : 0, true);                  // far legs
      dragonLeg(P, C, [45, DG - 16], false, sw, F.moving && F.i === 1 ? 2 : 0, true);
      const tail = bez([20, DG - 20], [7, DG - 17], [10, DG - 3], [1 + (F.moving ? 0 : [0, 1, 0, -1][F.i]), DG - 9], 22);
      const neck = bez([49, DG - 23], [58, DG - 27], [53, DG - 39], [61, DG - 44], 14);
      P.at(0, b, () => {
        tube(P, tail, 9, 2, C, true);                                                                     // the tail
        const [tx, ty] = tail[tail.length - 1]; P.poly([[tx, ty - 3], [tx - 3, ty], [tx, ty + 3], [tx + 2, ty]], C.spike);   // its spade
        P.shape([[35, DG - 21, 14, 8.5], [24, DG - 20, 8, 7.5], [46, DG - 22, 7, 8.5]], C.body, { texture: false, belly: C.belly.b });
        for (let y = DG - 26, r = 0; y < DG - 16; y += 3, r++) for (let x = 19 + (r % 2) * 3; x < 52; x += 6) { P.px(x, y, C.body.d); P.px(x + 1, y + 1, C.body.d); P.px(x + 2, y, C.body.d); P.px(x + 1, y - 1, C.body.l); }   // overlapping scales
        for (let x = 22; x < 50; x++) { P.px(x, DG - 14, C.belly.b); P.px(x, DG - 13, x % 3 ? C.belly.b : C.belly.d); P.px(x, DG - 12, C.belly.d); }   // belly plates
        tube(P, neck, 9, 6, C, true);
        neck.forEach(([x, y], i) => { if (i > 1 && i % 2 === 0) { P.px(x + 3, y + 1, C.belly.b); P.px(x + 3, y + 2, C.belly.d); } });   // throat plates
        spikes(P, C, [...tail].reverse().slice(0, 18), 3, 2);
        spikes(P, C, bez([22, DG - 28], [30, DG - 31], [42, DG - 31], [48, DG - 29], 10), 2, 3);
        spikes(P, C, neck.map(([x, y]) => [x - 3, y - 3]), 2, 3);
      });
      P.at(0, b, () => P.shape([[26, DG - 16, 6.5, 6]], C.body, { texture: false }));                // the haunch over the near hind leg
      dragonLeg(P, C, [27, DG - 14], true, sw, F.moving && F.i === 1 ? 2 : 0, false);                   // near legs
      dragonLeg(P, C, [47, DG - 14], false, -sw, F.moving && F.i === 3 ? 2 : 0, false);
      P.at(0, b, () => {
        const open = F.hunting ? 2 : 0, hx = 63, hy = DG - 46;
        P.shape([[hx + 5, hy + 4 + open, 5, 1.6]], C.belly, { texture: false });                       // the lower jaw
        if (open) { P.row(hy + 4, hx + 3, hx + 10, '#5a1010'); P.row(hy + 5, hx + 4, hx + 9, '#ff7a20'); for (let x = hx + 4; x <= hx + 10; x += 2) { P.px(x, hy + 3, '#ffffff'); P.px(x + 1, hy + 6, '#ffffff'); } }   // jaws open on the fire
        P.shape([[hx, hy, 5.5, 4.5], [hx + 6, hy + 1.5, 5, 2.6]], C.body, { texture: false });         // skull and snout
        P.row(hy - 3, hx - 2, hx + 3, C.body.d); P.row(hy - 4, hx - 1, hx + 2, C.body.d);                // brow ridge
        P.px(hx + 1, hy - 1, C.eye); P.px(hx + 2, hy - 1, F.hunting ? '#ff3a1a' : C.eye); P.px(hx + 2, hy - 2, '#1a1010');   // slit-pupilled eye
        P.px(hx + 10, hy, '#1a1010'); P.row(hy + 3, hx + 3, hx + 9, C.body.d);                           // nostril, mouth line
        if (!open) for (const x of [hx + 5, hx + 8]) P.px(x, hy + 3, '#ffffff');                       // fangs peeking out
        P.line(hx - 2, hy - 4, hx - 7, hy - 8, C.horn.b, 2); P.line(hx - 7, hy - 8, hx - 10, hy - 7, C.horn.d);   // horns sweeping back
        P.line(hx, hy - 4, hx - 4, hy - 9, C.horn.l); P.px(hx - 5, hy - 10, C.horn.l);
        P.line(hx - 4, hy + 3, hx - 7, hy + 5, C.spike);                                                // a spike at the jaw
        dragonWing(P, C, root, wf, false);                                                               // near wing
      });
    },
    live(ctx, C, F, anim, dot) {
      const f = Math.floor(anim.now / 70), mouth = [74, DG - 41 + F.bob];
      if (F.hunting && (anim.now % 1100) < 520) {                                                      // a long gout of fire
        for (let k = 0; k < 22; k++) { const half = Math.floor(k / 4.5) + (k > 4 && (k + f) % 3 === 0 ? 1 : 0); for (let j = -half; j <= half; j++) {
          if (Math.abs(j) === half && half > 0 && (k * 5 + j + f) % 3 === 0) continue;               // ragged edges, a solid core
          const heat = 1 - k / 26 - Math.abs(j) / (half + 1) * 0.45;
          dot(mouth[0] + k, mouth[1] + j + Math.round(Math.sin(k / 3 + f) * 0.6), heat > 0.72 ? '#fff6c0' : heat > 0.52 ? '#ffc400' : heat > 0.32 ? '#ff7a00' : '#e53935', k > 18 ? 0.7 : 0.95);
        } }
      } else if (!F.hunting) for (let i = 0; i < 3; i++) {                                             // smoke curling from the nose
        const t = ((anim.now / 1600) + i / 3) % 1;
        dot(mouth[0] - 1 + Math.sin(t * 6 + i) * 1.5 + t * 2, mouth[1] - 4 - t * 12, t < 0.5 ? '#9a9a9a' : '#c8c8c8', 0.55 * (1 - t));
      }
    },
  });

  /* ---- BEASTMAN: a horned, shaggy brute on two legs, with a club ---- */
  PixelCreatures.register({
    id: 'beastman', W: 38, H: 50, ground: 46, anchor: 16, shadow: [8, 3], tick: 160, ticks: 4,
    palette: s => ({ fur: tones(s.color || '#6b4a2a'), bone: '#e8dcc0', wood: '#7a5a34' }),
    paint(P, C, F) {
      const G = 46, sw = F.swing, dark = tones(shade(C.fur.b, 0.7));
      P.leg(13, G - 15, G, -sw * 2, F.moving && F.i === 3 ? 2 : 0, 3, dark, '#241812');
      P.at(0, F.bob, () => { P.line(11, G - 27, 7, G - 18, dark.b, 3); });                            // the back arm
      P.leg(17, G - 15, G, sw * 2, F.moving && F.i === 1 ? 2 : 0, 3, C.fur, '#241812');
      P.at(0, F.bob, () => {
        P.shape([[16, G - 22, 6.5, 8]], C.fur, { grain: 6 }); P.shape([[17, G - 24, 3.5, 4]], tones(light(C.fur.b, 0.2)), { texture: false });
        P.rect(10, G - 16, 13, 3, '#5a3a22'); for (let x = 10; x < 23; x += 2) P.px(x, G - 13, '#4a2e1a');   // loincloth
        P.shape([[17, G - 35, 5, 5], [21, G - 34, 2.6, 2]], C.fur, { texture: false });                    // head and snout
        P.px(23, G - 35, '#1a100c'); P.eye(19, G - 37, F, '#e8c24a');
        P.line(14, G - 39, 11, G - 43, C.bone, 2); P.line(11, G - 43, 12, G - 46, C.bone); P.line(19, G - 40, 21, G - 44, C.bone, 2); P.line(21, G - 44, 20, G - 47, C.bone);   // horns
        const hand = [23, G - 21], ends = F.hunting ? [[24, G - 44], [32, G - 38], [34, G - 26], [30, G - 40]] : [[27, G - 38]];   // the club: carried, or swung when it attacks
        const end = F.hunting ? ends[F.t] : ends[0];
        P.line(21, G - 28, hand[0], hand[1], C.fur.b, 3);
        P.line(hand[0], hand[1], end[0], end[1], C.wood, 2);
        P.shape([[end[0], end[1], 3, 3.5]], tones('#6a4a28'), { texture: false });
        P.px(end[0] - 1, end[1] - 1, '#8a6a40');
      });
    },
  });
})();
