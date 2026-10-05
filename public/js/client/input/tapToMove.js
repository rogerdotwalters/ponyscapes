'use strict';
/* CLIENT - turns a tap / click into a path for the InputController. */
const MARKER_LINGER_MS = 300;

class TapToMove {
  constructor({ bus, game, camera, input }) {
    this.game = game; this.camera = camera; this.input = input; this.marker = null;
    bus.on('tap', ({ x, y }) => this.handleTap(x, y));
  }

  handleTap(cssX, cssY) {
    const map = this.game.map;
    if (!map || !this.game.local || this.game.riding) return;
    if (this.game.holdingPlaceable()) {                          // a quick tap with a wall selected builds there
      const w = this.camera.screenToWorld(cssX, cssY);
      this.game.setBuildCursor(Math.floor(w.x), Math.floor(w.y));
      this.game.commitBuild();
      return;
    }
    const target = this._resolveTarget(map, this.camera.screenToWorld(cssX, cssY));
    if (!target) return;
    const path = findPath(map, this.game.local.x, this.game.local.y, target.x, target.y);
    if (!path) return;
    this.input.setPath(path);
    this.marker = { x: target.x, y: target.y, since: performance.now() };
  }

  /** Where we can actually go: the clicked point, or the nearest free tile if it is blocked. */
  _resolveTarget(map, world) {
    const tx = Math.floor(world.x), ty = Math.floor(world.y);
    if (navBlocked(map, tx, ty)) return nearestFreeTile(map, tx, ty, 3);
    if (circleBlocked(map, world.x, world.y, CONFIG.sim.playerRadius)) return { x: tx + 0.5, y: ty + 0.5 };
    return world;
  }

  currentMarker(now) {
    if (this.marker && !this.input.hasPath() && now - this.marker.since > MARKER_LINGER_MS) this.marker = null;
    return this.marker;
  }
}
