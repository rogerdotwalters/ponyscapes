'use strict';
/* CLIENT - merges keyboard, joystick and click-to-move into ONE input object per tick:
 *   { moveX, moveY, action, seq }   (moveX/Y are WORLD axes; slot is added by ClientGame). There is no run or sneak: every push is full speed.
 * Movement is camera-relative: W / stick-up always means "up on the screen". */
class InputController {
  constructor({ bus, keyboard, touch }) {
    this.keyboard = keyboard; this.touch = touch; this.bus = bus;
    this.nav = null; this.camera = null;
    this.pulse = null;                                          // a tap / click: { ax, ay, action, lasso, until } for a moment (world point it aims at)
    this.hold = null;                                           // the mouse button is down: { sx, sy } screen point; Use repeats, aimed at the pointer
    this.last = { moveX: 0, moveY: 0, action: false, seq: 0 };
  }

  setCamera(camera) { this.camera = camera; }
  /** Aim the next moments of Use and / or a lasso throw at a world point (a tap or a click). `ms`: how long the press lasts. */
  aimAt(point, { action = false, lasso = false, ms = 180 } = {}) { this.pulse = { ax: point.x, ay: point.y, action, lasso, until: performance.now() + ms }; }
  /** The mouse button went down at this screen point: Use repeats, aimed at wherever the pointer is, until releaseHold(). */
  startHold(sx, sy) { this.hold = { sx, sy }; }
  moveHold(sx, sy) { if (this.hold) { this.hold.sx = sx; this.hold.sy = sy; } }
  releaseHold() { this.hold = null; }

  setPath(points) { this.nav = points && points.length ? makeNav(points) : null; }
  hasPath() { return !!this.nav; }

  sample(seq, me, dt) {
    let moveX = 0, moveY = 0;
    const intent = this._readScreenIntent();
    if (intent) {
      [moveX, moveY] = this._toWorld(intent);
      this.nav = null;                                          // manual input cancels click-to-move
    } else if (this.nav) {
      const step = steerAlongPath(this.nav, me.x, me.y, dt);
      if (step.done) this.nav = null; else { moveX = step.moveX; moveY = step.moveY; }
    }
    const ptr = this._pointerAim();
    const action = this.keyboard.actionHeld || this.touch.actionHeld || ptr.action;
    return (this.last = { moveX, moveY, action, seq, lasso: ptr.lasso, aim: ptr.aim, ax: ptr.ax, ay: ptr.ay });
  }

  /** What the mouse / finger adds to this tick: an aim point, Use held, a lasso throw. */
  _pointerAim() {
    const now = performance.now(), out = { aim: false, ax: 0, ay: 0, action: false, lasso: false };
    if (this.pulse && now > this.pulse.until) this.pulse = null;
    if (this.hold && this.camera) {
      const w = this.camera.screenToWorld(this.hold.sx, this.hold.sy);
      out.aim = true; out.ax = w.x; out.ay = w.y; out.action = true;
    }
    if (this.pulse) {                                           // (a tap wins over the hold position for its short life)
      out.aim = true; out.ax = this.pulse.ax; out.ay = this.pulse.ay;
      out.action = out.action || this.pulse.action; out.lasso = this.pulse.lasso;
    }
    return out;
  }

  /** Screen-space direction { x, y } (length 1: the stick only steers, every push is full speed), or null when idle. */
  _readScreenIntent() {
    const stick = this.touch.joystick, cfg = CONFIG.input;
    if (stick.active && stick.magnitude > cfg.deadzone) {
      return { x: stick.dx, y: stick.dy };
    }
    const key = this.keyboard.moveAxis;
    if (key.x || key.y) return { x: key.x, y: key.y };
    return null;
  }

  _toWorld(intent) {
    const length = Math.min(1, Math.hypot(intent.x, intent.y));
    const [wx, wy] = IsoProjection.screenDirToWorld(intent.x, intent.y);
    return [wx * length, wy * length];
  }
}
