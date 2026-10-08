'use strict';
/* CLIENT - pointer (finger / mouse) on the game canvas.
 *   - holding a placeable item (e.g. a wall): press = preview under the finger, drag = move it, release = place
 *   - mouse: left press = use what is in your hand where you point (hold to repeat), right press = throw the lasso there
 *   - finger: a quick tap = the same as a left click (TapActions decides what it means; it only walks if tap-to-walk is on) */
const TAP_MAX_MS = 500, TAP_MAX_MOVE_PX = 12;

class CanvasPointer {
  constructor({ canvas, bus, game, camera, tapActions, input }) {
    this.bus = bus; this.game = game; this.camera = camera; this.tapActions = tapActions; this.input = input;
    this.holdPointer = null;             // the mouse button that is keeping Use going
    this.presses = new Map();            // pointerId -> { x, y, t, building }
    this.buildPointer = null;            // only one finger aims at a time
    canvas.addEventListener('pointerdown', e => this._down(e, canvas));
    canvas.addEventListener('pointermove', e => this._move(e));
    canvas.addEventListener('pointerup', e => this._up(e));
    canvas.addEventListener('pointercancel', e => this._cancel(e));
    window.addEventListener('blur', () => this._stopHold());
  }

  _stopHold() { this.holdPointer = null; this.input.releaseHold(); }

  _down(e, canvas) {
    const mouse = e.pointerType === 'mouse';
    if (mouse && e.button === 2) { this.tapActions.handle(e.clientX, e.clientY, 'lasso', true); return; }      // right click: the lasso
    if (mouse && e.button !== 0) return;
    const building = this.game.holdingPlaceable() && this.buildPointer === null;
    this.presses.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), building });
    if (building) { this.buildPointer = e.pointerId; canvas.setPointerCapture(e.pointerId); this._aim(e); return; }
    if (mouse) {                                                                                                // left click: act at once, and keep going while held
      this.presses.delete(e.pointerId);
      if (this.tapActions.handle(e.clientX, e.clientY, 'use', true)) { this.holdPointer = e.pointerId; canvas.setPointerCapture(e.pointerId); this.input.startHold(e.clientX, e.clientY); }
    }
  }

  _move(e) {
    if (e.pointerId === this.buildPointer) this._aim(e);
    else if (e.pointerId === this.holdPointer) this.input.moveHold(e.clientX, e.clientY);
  }

  _up(e) {
    if (e.pointerId === this.holdPointer) { this._stopHold(); return; }
    const press = this.presses.get(e.pointerId);
    this.presses.delete(e.pointerId);
    if (!press) return;
    if (press.building) { this._aim(e); this.buildPointer = null; this.game.commitBuild(); return; }   // release places
    const quick = performance.now() - press.t < TAP_MAX_MS && Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_MAX_MOVE_PX;
    if (quick) this.bus.emit('tap', { x: e.clientX, y: e.clientY });
  }

  _cancel(e) {
    if (e.pointerId === this.holdPointer) this._stopHold();
    this.presses.delete(e.pointerId);
    if (e.pointerId === this.buildPointer) { this.buildPointer = null; this.game.cancelBuild(); }
  }

  _aim(e) {
    const world = this.camera.screenToWorld(e.clientX, e.clientY);
    this.game.setBuildCursor(Math.floor(world.x), Math.floor(world.y));
  }
}
