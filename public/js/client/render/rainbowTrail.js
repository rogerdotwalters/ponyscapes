'use strict';
/* CLIENT - the RAINBOW a rainbow pony leaves behind it as it runs (a pony whose look.accessory is 'rainbow', ridden or not). The pony sprite calls `note()` each frame
 * with where its tail is; `draw()` (called from Effects.draw, on the real canvas and not through the sprite cache) paints a wavy ribbon of six bands through the
 * recent positions that fades away behind it. A pony that stops stops laying rainbow, and what it laid fades out. */
const RainbowTrail = (() => {
  const COLORS = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'];
  const BAND = 4.5, LIFE = 1700, MAX_POINTS = 70, MIN_STEP = 3, MAX_GAP = 90;            // band thickness (px), ms a point lasts, points kept, spacing, jump that breaks the ribbon
  const trails = new Map();                                                                // pony id -> { pts: [{ x, y, t, brk }], seen }

  /** The pony's tail is at (x, y) (iso pixels) this frame; `moving` says whether it lays rainbow now. */
  function note(id, x, y, now, moving) {
    let tr = trails.get(id);
    if (!tr) { if (!moving) return; tr = { pts: [], seen: now }; trails.set(id, tr); }
    tr.seen = now;
    if (!moving) return;
    const last = tr.pts[tr.pts.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < MIN_STEP) return;
      tr.pts.push({ x, y, t: now, brk: d > MAX_GAP });
    } else tr.pts.push({ x, y, t: now, brk: true });
    if (tr.pts.length > MAX_POINTS) tr.pts.shift();
  }

  /** The ribbon as strokes: calls stroke(points, colour, alpha) for each short piece of each of the six bands (a piece is a few points sharing one alpha, so the ribbon
   *  fades smoothly along its length). Points are [x, y] in iso pixels. Used by both backends: `draw` (a 2D context) and `drawPixi` (a PIXI.Graphics). */
  function strokes(now, stroke) {
    for (const [id, tr] of trails) {
      const pts = tr.pts;
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      if (!pts.length) { if (now - tr.seen > LIFE) trails.delete(id); continue; }
      for (let j = 0; j < COLORS.length; j++) {
        const off = (j - (COLORS.length - 1) / 2) * BAND;
        let run = null, runAlpha = 0;
        const flush = () => { if (run && run.length > 1) stroke(run, COLORS[j], runAlpha); run = null; };
        for (let i = 0; i < pts.length; i++) {
          const b = pts[i], age = (now - b.t) / LIFE, wob = Math.sin(now / 160 - i * 0.55) * 3 * (1 - age * 0.5);
          const point = [b.x, b.y + off + wob];
          if (b.brk) { flush(); run = [point]; continue; }
          const alpha = Math.max(0, 0.9 * (1 - age) * (1 - age * 0.3)) * Math.min(1, (pts.length - i) / 4 + 0.35);     // (the newest few points swell in: the ribbon grows out of the tail)
          if (!run) run = [point];
          else { run.push(point); runAlpha = alpha; if (run.length >= 5) { flush(); run = [point]; } }
        }
        flush();
      }
    }
  }

  function draw(ctx, now) {
    if (!trails.size) return;
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round'; ctx.lineWidth = BAND + 0.8;
    strokes(now, (pts, color, alpha) => {
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    });
    ctx.restore();
  }

  /** The same ribbon on a PIXI.Graphics (cleared and redrawn each frame: it changes every frame, so it must not go through the picture cache). */
  function drawPixi(gfx, now, colour) {
    gfx.clear();
    if (!trails.size) return;
    strokes(now, (pts, color, alpha) => {
      gfx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i][0], pts[i][1]);
      gfx.stroke({ width: BAND + 0.8, color: colour(color), alpha, cap: 'butt', join: 'round' });
    });
  }

  return { note, draw, drawPixi };
})();
