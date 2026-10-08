'use strict';
/* CLIENT - on-screen joystick + Bag / Use buttons (and the rest of the right-thumb cluster). Multi-touch via pointer events. */
class TouchControls {
  /** @param {EventBus} bus  @param {{root, zone, base, knob, btnBag, btnAct}} dom */
  constructor(bus, dom) {
    this.bus = bus; this.dom = dom;
    this.joystick = { active: false, dx: 0, dy: 0, magnitude: 0 };   // dx,dy: unit vector in SCREEN space
    this.actionHeld = false;
    this.pointerId = null; this.touchDownAt = 0; this.startX = 0; this.startY = 0; this.baseX = 0; this.baseY = 0;
    this.defaultBase = { x: 80, y: 200 }; this.radius = CONFIG.input.joyRadius; this.margin = 70;   // set by applyLayout()

    this._bindJoystick();
    this._bindButtons();
    Controls.listeners.push(() => this._applyMode()); this._applyMode();

    if (matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent)) this.show();
    window.addEventListener('touchstart', () => { if (this.dom.root.hidden) this.show(); }, { passive: true, once: true });
  }

  show() { this.dom.root.hidden = false; this.bus.emit('touchUiShown'); }

  /** Called by UiLayout: where the joystick zone is and where its resting base sits (zone-relative). */
  applyLayout(layout) {
    const zone = this.dom.zone;
    zone.style.left = layout.zone.x + 'px'; zone.style.top = layout.zone.y + 'px'; zone.style.width = layout.zone.w + 'px'; zone.style.height = layout.zone.h + 'px';
    this.dom.base.style.setProperty('--joy', layout.base.w + 'px');
    this.radius = layout.baseRadius; this.margin = layout.base.w / 2 + 8;
    this.defaultBase = { x: layout.base.x + layout.base.w / 2 - layout.zone.x, y: layout.base.y + layout.base.h / 2 - layout.zone.y };
    this._placeBaseAtDefault();
  }

  /* ---- joystick ---- */
  _bindJoystick() {
    for (const el of [this.dom.zone, this.dom.base]) {                 // (a fixed stick listens on its base only: taps elsewhere reach the game)
      el.addEventListener('pointerdown', e => { e.stopPropagation(); this._onDown(e); });
      el.addEventListener('pointermove', e => this._onMove(e));
      el.addEventListener('pointerup', e => this._onUp(e));
      el.addEventListener('pointercancel', e => this._onUp(e));
    }
  }
  /** Fixed (default): the stick stays at its resting place and only a touch on it steers. Floating: the whole zone steers and the stick follows the thumb. */
  _applyMode() {
    this.dom.root.classList.toggle('fixedStick', Controls.fixedJoystick);
    if (this.pointerId !== null) return;
    this._placeBaseAtDefault();
  }
  _placeBaseAtDefault() {
    if (this.pointerId !== null) return;
    this._setBase(this.defaultBase.x, this.defaultBase.y);
  }
  _setBase(x, y) { this.baseX = x; this.baseY = y; this.dom.base.style.left = x + 'px'; this.dom.base.style.top = y + 'px'; }

  _onDown(e) {
    if (this.pointerId !== null) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    this.pointerId = e.pointerId; this.touchDownAt = performance.now(); this.startX = e.clientX; this.startY = e.clientY;
    const r = this.dom.zone.getBoundingClientRect();
    if (!Controls.fixedJoystick) this._setBase(clamp(e.clientX - r.left, this.margin, r.width - this.margin), clamp(e.clientY - r.top, this.margin, r.height - this.margin));   // floating stick
    this.dom.base.classList.add('active'); this.joystick.active = true;
    this._onMove(e);
  }
  _onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    const r = this.dom.zone.getBoundingClientRect(), radius = this.radius;
    const dx = e.clientX - (r.left + this.baseX), dy = e.clientY - (r.top + this.baseY), dist = Math.hypot(dx, dy);
    this.joystick.magnitude = Math.min(1, dist / radius);
    this.joystick.dx = dist > 0 ? dx / dist : 0; this.joystick.dy = dist > 0 ? dy / dist : 0;
    const k = Math.min(dist, radius) / (dist || 1);
    this.dom.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  }
  _onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    const wasTap = performance.now() - this.touchDownAt < 250 && Math.hypot(e.clientX - this.startX, e.clientY - this.startY) < 12;
    this.pointerId = null; this.joystick.active = false; this.joystick.magnitude = 0;
    this.dom.knob.style.transform = ''; this.dom.base.classList.remove('active');
    this._placeBaseAtDefault();
    if (wasTap && e.type === 'pointerup' && !Controls.fixedJoystick) this.bus.emit('tap', { x: e.clientX, y: e.clientY });   // (floating stick only) a quick tap in the zone is a tap on the world
  }

  /* ---- buttons ---- */
  _bindButtons() {
    const { btnBag, btnAct, btnRot, btnBoard, btnRelease, btnAbility, btnLasso, btnDrop } = this.dom;
    this._press(btnBoard, () => this.bus.emit('interact'));
    if (btnAbility) this._press(btnAbility, () => this.bus.emit('ponyPower', 0));      // the first rarity ability that is ready
    if (btnLasso) this._press(btnLasso, () => this.bus.emit('throwLasso'));
    if (btnDrop) this._press(btnDrop, () => this.bus.emit('dropHeld', false));
    if (btnRelease) this._press(btnRelease, () => this.bus.emit('release'));
    this._press(btnRot, () => this.bus.emit('rotateBuild'));
    if (btnBag) this._press(btnBag, () => this.bus.emit('toggleInventory'));            // the backpack, one tap away
    this._press(btnAct, () => { this.actionHeld = true; btnAct.classList.add('down'); }, () => setTimeout(() => { this.actionHeld = false; btnAct.classList.remove('down'); }, 120));   // (held for at least a couple of ticks: a very quick tap still counts)
  }
  _press(el, onDown, onUp) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); onDown(); });
    if (onUp) { el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); }
  }
}
