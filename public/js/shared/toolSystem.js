'use strict';
/* SERVER-SIDE - the swing state machine for ANY tool: equip -> begin -> impact -> done.
 * What a swing actually does is delegated to a handler chosen by tool.kind (see toolHandlers.js). */
class ToolSystem {
  /** @param {{ handlers: Object<string, {find, isValid, apply}> }} deps */
  constructor({ handlers, heldFor }) { this.handlers = handlers; this.heldFor = heldFor; this.targets = {}; }

  update(id, p, inventory, input, dt) {
    p.held = this.heldFor(id, p, inventory, input);          // the drawn sword, or the selected bar slot
    const tool = ItemDB.getTool(p.held);

    if (p.swingT > 0) { if (tool) this._advanceSwing(id, p, tool, dt); else this._cancelSwing(id, p); }
    if (input.action && tool && p.swingT <= 0) this._beginSwing(id, p, tool);
  }

  _beginSwing(id, p, tool) {
    p.swingT = tool.swingTime; p.swingHit = false;
    const handler = this.handlers[tool.kind];
    if (handler && handler.precheck && !handler.precheck(id, tool)) {   // e.g. a bow with no arrows: a dud swing, so the message is not repeated every tick
      p.swingHit = true; this.targets[id] = null; return;
    }
    const target = handler ? handler.find(p, tool, id) : null;      // aim assist: lock on at swing start
    this.targets[id] = target;
    if (target) p.facing = snapAngle8(Math.atan2(target.y - p.y, target.x - p.x));
  }

  _advanceSwing(id, p, tool, dt) {
    p.swingT = Math.max(0, p.swingT - dt);
    if (!p.swingHit && tool.swingTime - p.swingT >= tool.impactTime) { p.swingHit = true; this._impact(id, p, tool); }
  }

  _cancelSwing(id, p) { p.swingT = 0; p.swingHit = false; delete this.targets[id]; }

  _impact(id, p, tool) {
    const target = this.targets[id];
    delete this.targets[id];
    const handler = this.handlers[tool.kind];
    if (target && handler && handler.isValid(p, target, tool)) handler.apply(id, target, tool);
  }
}
