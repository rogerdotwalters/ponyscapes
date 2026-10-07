'use strict';
/* CLIENT - merges keyboard, joystick and click-to-move into ONE input object per tick:
 *   { moveX, moveY, action, seq }   (moveX/Y are WORLD axes; slot is added by ClientGame). There is no run or sneak: every push is full speed.
 * Movement is camera-relative: W / stick-up always means "up on the screen". */
class InputController {
  constructor({ bus, keyboard, touch }) {
    this.keyboard = keyboard; this.touch = touch; this.bus = bus;
    this.nav = null;
    this.last = { moveX: 0, moveY: 0, action: false, seq: 0 };
  }

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
    const action = this.keyboard.actionHeld || this.touch.actionHeld;
    return (this.last = { moveX, moveY, action, seq });
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
