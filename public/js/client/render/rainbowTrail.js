'use strict';
/* CLIENT - the RAINBOW a pony with a trail (the `trail` gene: PonyGenes, look.trail = { level, colors }) leaves behind it as it runs, ridden or not. Its colours are the pony's own mane colours.
 * The pony sprite calls `note()` each frame with where its tail is (and how deep in the picture the pony stands); the renderer asks `items()` for the ribbon as DEPTH-SORTED PIECES and draws each
 * with `drawPiece()` in its place among everything else, so the rainbow goes behind the pony that lays it and behind anything that stands in front of it (a tree, a wall, another pony), and
 * in front of what stands behind it. A pony that stops stops laying rainbow, and what it laid fades out. */
const RainbowTrail = (() => {
  const BAND = 4.5, LIFE = 1700, LIFE_OF = { 1: 1100, 2: 1700, 3: 2300 }, MAX_POINTS = 90, MIN_STEP = 3, MAX_GAP = 90;            // band thickness (px), ms a point lasts, points kept, spacing, jump that breaks the ribbon
  const CHUNK = 14, OWN_REACH = 1.6, BEHIND = 0.15;                                      // points to a depth-sorted piece; how close (in depth) a piece must be to its own pony to be kept behind it; how far behind its place a piece sorts
  const DEFAULT = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'];                       // (a trail with no colours given: the classic rainbow)
  const trails = new Map();                                                                // pony id -> { pts: [{ x, y, d, t, brk }], seen, trail, depth }
  let swept = 0;

  /** The pony's tail is at (x, y) (iso pixels) this frame; `moving` says whether it lays rainbow now. `trail` is the look's { level, colors } (the colours are the pony's mane colours; the level, 1 short,
   *  2 rainbow, 3 grand, sets how long it lasts and how many bands it has). `depth` is where the pony stands in the picture's depth order (world x + y), so the pieces can be sorted with everything else. */
  function note(id, x, y, now, moving, trail, depth = 0) {
    if (now - swept > 4000) { swept = now; for (const [k, t] of trails) if (now - t.seen > 5000) trails.delete(k); }          // (where nobody draws the pieces, such as the editor: do not keep them for ever)
    let tr = trails.get(id);
    if (!tr) { if (!moving) return; tr = { pts: [], seen: now, trail, depth }; trails.set(id, tr); }
    tr.seen = now; tr.depth = depth; if (trail) tr.trail = trail;
    if (!moving) return;
    const last = tr.pts[tr.pts.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < MIN_STEP) return;
      tr.pts.push({ x, y, d: depth, t: now, brk: d > MAX_GAP });
    } else tr.pts.push({ x, y, d: depth, t: now, brk: true });
    if (tr.pts.length > MAX_POINTS) tr.pts.shift();
  }

  const lifeOf = tr => LIFE_OF[tr.trail ? tr.trail.level : 2] || LIFE;

  /** The ribbon as depth-sorted items for the renderer: [{ kind: 'trail', depth, gx, gy, id, pts (a snapshot), first (index of pts[0] in the whole ribbon), count (points in the whole ribbon), trail, life }].
   *  A piece sorts at the depth of the middle of it, a little behind (so at its own spot it is under the pony); a piece within reach of its own pony is always kept behind that pony. */
  function items(now) {
    const out = [];
    for (const [id, tr] of trails) {
      const pts = tr.pts, life = lifeOf(tr);
      while (pts.length && now - pts[0].t > life) pts.shift();
      if (!pts.length) { if (now - tr.seen > life) trails.delete(id); continue; }
      let from = 0;
      while (from < pts.length) {
        let to = Math.min(pts.length, from + CHUNK);
        for (let i = from + 1; i < to; i++) if (pts[i].brk) { to = i; break; }               // (a break ends a piece)
        const slice = pts.slice(from, Math.min(pts.length, to + 1 - (to < pts.length && pts[to].brk ? 1 : 0))), mid = slice[slice.length >> 1];
        let depth = mid.d - BEHIND;
        if (Math.abs(mid.d - tr.depth) < OWN_REACH) depth = Math.min(depth, tr.depth - 0.05);
        out.push({ kind: 'trail', depth, gx: slice[0].x, gy: slice[0].y, id, pts: slice, first: from, count: pts.length, trail: tr.trail, life });
        from = to;
      }
    }
    return out;
  }

  /** Paint one piece: for each band a wavy stroke through its points, fading along the ribbon. Works on a 2D context (the canvas backend, and the recorder the Pixi backend draws items through). */
  function drawPiece(ctx, item, now) {
    const COLORS = item.trail ? item.trail.colors : DEFAULT, life = item.life, band = Math.max(2.4, Math.min(BAND, 27 / COLORS.length)), pts = item.pts;
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.lineWidth = band + 0.8;
    for (let j = 0; j < COLORS.length; j++) {
      const off = (j - (COLORS.length - 1) / 2) * band;
      let run = null, runAlpha = 0;
      const flush = () => {
        if (run && run.length > 1) { ctx.globalAlpha = runAlpha; ctx.strokeStyle = COLORS[j]; ctx.beginPath(); ctx.moveTo(run[0][0], run[0][1]); for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]); ctx.stroke(); }
        run = null;
      };
      for (let k = 0; k < pts.length; k++) {
        const b = pts[k], i = item.first + k, age = Math.min(1, (now - b.t) / life), wob = Math.sin(now / 160 - i * 0.55) * 3 * (1 - age * 0.5);
        const point = [b.x, b.y + off + wob];
        if (b.brk) { flush(); run = [point]; continue; }
        const alpha = Math.max(0, 0.9 * (1 - age) * (1 - age * 0.3)) * Math.min(1, (item.count - i) / 4 + 0.35);     // (the newest few points swell in: the ribbon grows out of the tail)
        if (!run) run = [point];
        else { run.push(point); runAlpha = alpha; if (run.length >= 5) { flush(); run = [point]; } }
      }
      flush();
    }
    ctx.restore();
  }

  return { note, items, drawPiece };
})();
