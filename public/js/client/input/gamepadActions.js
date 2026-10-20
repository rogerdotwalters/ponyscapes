'use strict';
/* CLIENT - what the controller's buttons DO (the Switch layout; the list the player sees is PAD_LAYOUT in gamepadInput.js).
 *
 *   playing   Left stick  move                         A   use your tool / talk and shop / enter a building / pet
 *             B  pick, pick up and hold, feed, pet     Y   untie / let go, or leash your pony        X  mount / dismount
 *             ZR lasso                                 R   the stall, stable or building menu beside you (else the Town)
 *             - map, + menu                            L   fly / land     ZL  pony power     D-pad  tool bar
 *   a window  D-pad jumps between the buttons, right stick moves a pointer, A clicks it, B closes the window; hold L and the right stick scrolls a list or pans the map.
 *
 * Nothing here changes a game rule: every button ends in the same call the keyboard or the touch buttons make (bus events, ClientGame methods). */
const PAD_A_KINDS = ['talk', 'gift', 'door', 'loot', 'stockpile'];       // A always takes these (villagers, shops, doors, chests, stockpiles)...
const PAD_A_SOFT_KINDS = ['pet', 'treat', 'give', 'feed'];               // ...and these when no tool is in hand (with a tool, A uses it and B pets)
const PAD_POINTER_SPEED = 1000;                                         // pointer: pixels per second at full push
const PAD_SCROLL_SPEED = 900;
const PAD_DIRS = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } };
const PAD_FOCUSABLE = 'button, input, select, a[href], label, [data-bind], [data-act], [data-track], .gslot';
const PAD_REPEAT_FIRST_MS = 380, PAD_REPEAT_MS = 110;                   // holding a direction keeps moving
const PAD_POINTER_ID = 7331;                                            // (not the mouse's id: a made-up pointer of our own)

class GamepadActions {
  constructor({ bus, game, pad, panels, mapUI, cursor }) {
    this.bus = bus; this.game = game; this.pad = pad; this.panels = panels; this.mapUI = mapUI; this.cursor = cursor;
    this.menuMode = false;
    this.aUsing = false;                          // A went down on "use the tool" (so holding it keeps swinging)
    this.cx = 0; this.cy = 0;                     // the pointer
    this.downTarget = null; this.hoverEl = null; this.heldDir = null;
    swallowSyntheticCapture();
    bus.on('padActive', on => { document.body.classList.toggle('padActive', on); if (!on) this._setHover(null); });
  }

  /** Left stick as a screen-space unit direction, or null (also null while a window is open: the stick moves the pointer then). */
  get moveAxis() { const l = this.pad.left; return !this.menuMode && l.mag > 0 ? { x: l.x, y: l.y } : null; }
  get actionHeld() { return !this.menuMode && this.aUsing && this.pad.isDown('A'); }

  /** Once per frame, from the game loop. */
  update(ms) {
    const pad = this.pad; pad.poll();
    if (!pad.connected) return;
    const open = this.panels.anyOpen();
    if (open !== this.menuMode) { this.menuMode = open; if (open) this._enterMenu(); else this._leaveMenu(); }
    for (const name of pad.pressed) { this._pressedAny(name); if (open) this._pressedInMenu(name); else this._pressedInWorld(name); }
    for (const name of pad.released) if (name === 'A') { this.aUsing = false; this._pointerUp(); }
    if (open) this._menuTick(ms / 1000);
  }

  /* ---------------------------------------------------------------- playing */

  _pressedAny(name) {
    if (name === 'MINUS') this.bus.emit('toggleMap');
    else if (name === 'PLUS') this.bus.emit('toggleMenu');
  }

  _pressedInWorld(name) {
    const g = this.game;
    if (!g.local || g.local.asleep) return;
    switch (name) {
      case 'A': this._primary(); break;
      case 'B': this._secondary(); break;
      case 'Y': this._untieOrLeash(); break;
      case 'X': g.toggleRide(); break;
      case 'ZR': this.bus.emit('throwLasso'); break;
      case 'R': if (g.stallHint()) g.openStall(); else this.bus.emit('toggleTown'); break;
      case 'L': this.bus.emit('ability'); break;
      case 'ZL': { const i = g.abilityState().findIndex(a => !(a.cooldown > 0)); if (i >= 0) this.bus.emit('ponyPower', i + 1); break; }
      case 'LEFT': case 'UP': g.cycleSlot(-1); break;                 // the D-pad changes the tool in your hand
      case 'RIGHT': case 'DOWN': g.cycleSlot(1); break;
      case 'RS': this.bus.emit('toggleJournal'); break;
    }
  }

  /** What the interact button would do now, as { kind, label } (the stall is the R button's, so it is left out here). */
  _nearby() { return this.game.interactAction(['stall']); }
  _aTakes(action) {
    if (!action) return false;
    return PAD_A_KINDS.includes(action.kind) || (PAD_A_SOFT_KINDS.includes(action.kind) && !ItemDB.getTool(this.game.heldItemId()));
  }
  _primary() {
    const near = this._nearby();
    if (this._aTakes(near)) {
      this.aUsing = false;
      if (near.npc) this._talk(near.npc); else this.game.requestInteract();
    } else this.aUsing = true;                                       // nothing to talk to or enter: A swings the tool in your hand, and keeps going while held
  }
  /** A villager: the dialogue window, like a tap on them (it offers their shop, their quests, and a gift if you hold one they like). */
  _talk(npc) {
    const id = Object.keys(this.game.npcs).find(k => this.game.npcs[k] === npc);
    if (id) this.bus.emit('talkTo', Object.assign({ id }, npc));
  }
  _secondary() {
    if (this._nearby()) this.game.requestInteract();
    else this.game.events.emit('notice', { to: this.game.myId, text: 'Nothing to pick up or feed here' });
  }
  _untieOrLeash() {
    const g = this.game;
    if (g.releaseTarget()) g.requestRelease();
    else if (g.leashHint()) g.leashPony();
    else g.events.emit('notice', { to: g.myId, text: 'Nothing to untie, and no pony of yours to leash' });
  }

  /* ---------------------------------------------------------------- the on-screen button hints */

  /** The prompts for the situation right now: [{ button, text }] (the names are Switch names; GamepadHints prints them). */
  hints() {
    const out = [], g = this.game, L = g.local;
    if (this.menuMode) {
      out.push({ button: 'A', text: 'Select' }, { button: 'B', text: 'Back' }, { button: 'RSTICK', text: 'Pointer' }, { button: 'DPAD', text: 'Move' }, { button: 'L', text: 'Hold + R Stick: scroll' }, { button: 'PLUS', text: 'Menu' }, { button: 'MINUS', text: 'Map' });
      return out;
    }
    if (!L || L.asleep) return out;
    const near = this._nearby(), held = ItemDB.getTool(g.heldItemId());
    if (this._aTakes(near)) out.push({ button: 'A', text: near.npc ? `Talk to ${near.npc.name}` : near.label });
    else out.push({ button: 'A', text: held && WEAPON_KINDS.includes(held.kind) ? 'Attack' : 'Use' });
    if (near && !this._aTakes(near)) out.push({ button: 'B', text: near.label });
    const release = g.releaseHint(), leash = g.leashHint();
    if (release) out.push({ button: 'Y', text: release }); else if (leash) out.push({ button: 'Y', text: leash });
    const ride = g.rideHint(); if (ride) out.push({ button: 'X', text: ride });
    if (L.gear && L.gear.lasso) out.push({ button: 'ZR', text: 'Lasso' });
    const stall = g.stallHint(); out.push({ button: 'R', text: stall ? stall.name : 'Town' });
    const fly = g.abilityHint(); if (fly) out.push({ button: 'L', text: fly.label });
    const power = g.abilityState().find(a => !(a.cooldown > 0)); if (power) out.push({ button: 'ZL', text: power.ability.name });
    out.push({ button: 'MINUS', text: 'Map' }, { button: 'PLUS', text: 'Menu' });
    return out;
  }

  /* ---------------------------------------------------------------- a window is open: the pointer */

  _enterMenu() {
    document.body.classList.add('padMenu');
    const open = Object.values(this.panels.panels).find(p => p.isOpen && p.panel && p.panel.getBoundingClientRect);
    const r = open ? open.panel.getBoundingClientRect() : null;
    this.cx = r ? r.left + r.width / 2 : innerWidth / 2; this.cy = r ? r.top + Math.min(r.height / 2, 220) : innerHeight / 2;
    this._place();
  }
  _leaveMenu() {
    document.body.classList.remove('padMenu');
    this._pointerUp(); this._setHover(null);
  }

  _pressedInMenu(name) {
    if (name === 'A') this._pointerDown();
    else if (name === 'B') this.bus.emit('closePanels');
    else if (PAD_DIRS[name]) { this.heldDir = { name, next: performance.now() + PAD_REPEAT_FIRST_MS }; this._navigate(PAD_DIRS[name]); }
  }

  /** D-pad in a window: jump the pointer to the nearest button / slot / field in that direction (scrolling it into view). */
  _navigate(dir) {
    const from = this.hoverEl && this.hoverEl.isConnected ? this.hoverEl.getBoundingClientRect() : null;
    const ox = from ? from.left + from.width / 2 : this.cx, oy = from ? from.top + from.height / 2 : this.cy;
    const roots = Object.values(this.panels.panels).filter(p => p.isOpen && p.panel && p.panel.querySelectorAll).map(p => p.panel);
    let best = null;
    for (const root of roots) for (const el of root.querySelectorAll(PAD_FOCUSABLE)) {
      if (el === this.hoverEl) continue;
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || el.disabled || el.closest('[hidden]')) continue;
      const dx = r.left + r.width / 2 - ox, dy = r.top + r.height / 2 - oy;
      const along = dx * dir.x + dy * dir.y, across = Math.abs(dx * dir.y) + Math.abs(dy * dir.x);
      if (along < 4 || across > along * 2.5 + 60) continue;                      // (behind, or too far off to the side)
      const score = along + across * 2;
      if (!best || score < best.score) best = { el, score };
    }
    if (!best) return;
    best.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = best.el.getBoundingClientRect();
    this.cx = clamp(r.left + r.width / 2, 0, innerWidth - 1); this.cy = clamp(r.top + r.height / 2, 0, innerHeight - 1);
    this._place();
  }

  _menuTick(dt) {
    const pad = this.pad, stick = pad.right.mag > 0 ? pad.right : pad.left;
    if (pad.isDown('L')) {                                                // scroll / pan instead of moving the pointer
      const dx = stick.x * stick.mag * PAD_SCROLL_SPEED * dt, dy = stick.y * stick.mag * PAD_SCROLL_SPEED * dt;
      if (this.mapUI && this.mapUI.isOpen) this.mapUI.panView(dx, dy); else if (dy) this._scrollAt(dy);
      return;
    }
    if (this.heldDir && !pad.isDown(this.heldDir.name)) this.heldDir = null;
    if (this.heldDir && performance.now() >= this.heldDir.next) { this.heldDir.next += PAD_REPEAT_MS; this._navigate(PAD_DIRS[this.heldDir.name]); }
    if (stick.mag > 0) {
      const k = Math.pow(stick.mag, 1.4) * PAD_POINTER_SPEED * dt;       // (gentle near the centre: easy to land on a small button)
      this.cx = clamp(this.cx + stick.x * k, 0, innerWidth - 1); this.cy = clamp(this.cy + stick.y * k, 0, innerHeight - 1);
      this._place();
      this._pointerMove();
    }
  }

  _place() { if (this.cursor) { this.cursor.style.transform = `translate(${this.cx}px,${this.cy}px)`; this._hover(); } }
  _under() { return document.elementFromPoint(this.cx, this.cy); }
  _hover() { const el = this._under(); this._setHover(el && el.closest ? el.closest('button, label, input, select, a, [data-bind], [data-act], [data-track]') : null); }
  _setHover(el) {
    if (el === this.hoverEl) return;
    if (this.hoverEl) this.hoverEl.classList.remove('padHover');
    this.hoverEl = el; if (el) el.classList.add('padHover');
  }

  /** A pointer event as if from a mouse at the cursor. */
  _send(type, target, buttons) {
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: this.cx, clientY: this.cy, screenX: this.cx, screenY: this.cy, button: 0, buttons };
    const ev = type.startsWith('pointer') ? new PointerEvent(type, Object.assign(init, { pointerId: PAD_POINTER_ID, pointerType: 'mouse', isPrimary: true })) : new MouseEvent(type, init);
    target.dispatchEvent(ev);
  }
  _pointerDown() {
    const el = this._under(); if (!el) return;
    this.downTarget = el;
    this._send('pointerdown', el, 1); this._send('mousedown', el, 1);
    if (el.tagName === 'INPUT' && el.type === 'range') this._slider(el);
  }
  _pointerMove() {
    const down = this.downTarget, el = down || this._under(); if (!el) return;
    this._send('pointermove', el, down ? 1 : 0); this._send('mousemove', el, down ? 1 : 0);
    if (down && down.tagName === 'INPUT' && down.type === 'range') this._slider(down);
  }
  _pointerUp() {
    const down = this.downTarget; if (!down) return;
    this.downTarget = null;
    const under = this._under() || down;
    this._send('pointerup', down, 0); this._send('mouseup', down, 0);
    const target = down.contains(under) ? down : under.contains(down) ? under : null;      // (a click lands on whatever both ends share)
    if (target && target.isConnected) {
      if (target.tagName === 'INPUT' && target.type === 'range') return;                    // (a slider was already set while it was held)
      this._send('click', target, 0);
    }
  }
  /** A range slider does not answer made-up pointer events: set its value from where the pointer is along it. */
  _slider(el) {
    const r = el.getBoundingClientRect(), min = Number(el.min || 0), max = Number(el.max || 100), step = Number(el.step) || 1;
    const t = clamp((this.cx - r.left) / (r.width || 1), 0, 1), v = Math.round((min + t * (max - min)) / step) * step;
    if (String(v) === el.value) return;
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Scroll the list under the pointer (or the nearest scrollable parent of whatever is there). */
  _scrollAt(dy) {
    for (let el = this._under(); el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollTop += dy; return; }
    }
  }
}

/** The pointer cursor presses with a pointer id of its own, which the browser does not know: asking to capture it throws.
 *  Swallow exactly that (a drag on a map or a bag still works: the cursor sends the moves to the element that was pressed). */
function swallowSyntheticCapture() {
  for (const name of ['setPointerCapture', 'releasePointerCapture']) {
    const original = Element.prototype[name];
    if (!original || original._padSafe) continue;
    const safe = function (id) { if (id === PAD_POINTER_ID) return undefined; return original.call(this, id); };
    safe._padSafe = true;
    Element.prototype[name] = safe;
  }
}
