'use strict';
/* CLIENT - isometric (2:1 diamond) projection between world tiles and screen pixels. */
const TILE_HALF_W = CONFIG.view.tileW / 2;
const TILE_HALF_H = CONFIG.view.tileH / 2;
const isoX = (x, y) => (x - y) * TILE_HALF_W;
const isoY = (x, y) => (x + y) * TILE_HALF_H;

const IsoProjection = {
  /** Screen pixel offset (iso space) -> world tile coordinates. */
  toWorld(sx, sy) { return { x: (sx / TILE_HALF_W + sy / TILE_HALF_H) / 2, y: (sy / TILE_HALF_H - sx / TILE_HALF_W) / 2 }; },
  /** World delta -> screen delta. */
  worldDeltaToScreen(wx, wy) { return [(wx - wy) * TILE_HALF_W, (wx + wy) * TILE_HALF_H]; },
  /** Screen direction (right = +x, down = +y) -> unit WORLD direction. Screen-up maps to world (-1,-1). */
  screenDirToWorld(dx, dy) {
    const wx = dx + 2 * dy, wy = 2 * dy - dx, len = Math.hypot(wx, wy) || 1;
    return [wx / len, wy / len];
  }
};
