'use strict';
/* CLIENT - pointer (finger / mouse) on the game canvas.
 *   - holding a placeable item (e.g. a wall): press = preview under the finger, drag = move it, release = place
 *   - otherwise: a quick tap walks there (tap-to-move) */
const TAP_MAX_MS = 500, TAP_MAX_MOVE_PX = 12;

class CanvasPointer {
  constructor({ canvas, bus, game, camera }) {
    this.bus = bus; this.game = game; this.camera = camera;
    this.presses = new Map();            // pointerId -> { x, y, t, building }
    this.buildPointer = null;            // only one finger aims at a time
    canvas.addEventListener('pointerdown', e => this._down(e, canvas));
    canvas.addEventListener('pointermove', e => this._move(e));
    canvas.addEventListener('pointerup', e => this._up(e));
    canvas.addEventListener('pointercancel', e => this._cancel(e));
  }

  _down(e, canvas) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const building = this.game.holdingPlaceable() && this.buildPointer === null;
    this.presses.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), building });
    if (building) { this.buildPointer = e.pointerId; canvas.setPointerCapture(e.pointerId); this._aim(e); }
  }

  _move(e) { if (e.pointerId === this.buildPointer) this._aim(e); }

  _up(e) {
    const press = this.presses.get(e.pointerId);
    this.presses.delete(e.pointerId);
    if (!press) return;
    if (press.building) { this._aim(e); this.buildPointer = null; this.game.commitBuild(); return; }   // release places
    const quick = performance.now() - press.t < TAP_MAX_MS && Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_MAX_MOVE_PX;
    if (quick) this.bus.emit('tap', { x: e.clientX, y: e.clientY });
  }

  _cancel(e) {
    this.presses.delete(e.pointerId);
    if (e.pointerId === this.buildPointer) { this.buildPointer = null; this.game.cancelBuild(); }
  }

  _aim(e) {
    const world = this.camera.screenToWorld(e.clientX, e.clientY);
    this.game.setBuildCursor(Math.floor(world.x), Math.floor(world.y));
  }
}
