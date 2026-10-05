'use strict';
/* CLIENT - fixed-timestep simulation, free-running render. */
class GameLoop {
  constructor({ tickMs, onTick, onRender }) { Object.assign(this, { tickMs, onTick, onRender }); this.last = 0; this.accumulator = 0; }
  start() { requestAnimationFrame(t => { this.last = t; this._frame(t); }); }
  _frame(now) {
    requestAnimationFrame(t => this._frame(t));
    const frameMs = Math.min(now - this.last, 250);        // avoid the spiral of death after a tab switch
    this.last = now; this.accumulator += frameMs;
    while (this.accumulator >= this.tickMs) { this.accumulator -= this.tickMs; this.onTick(); }
    this.onRender(this.accumulator / this.tickMs, frameMs, now);
  }
}
