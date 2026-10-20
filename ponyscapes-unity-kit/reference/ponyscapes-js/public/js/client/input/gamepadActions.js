'use strict';
/* CLIENT - what the controller's buttons DO (the Switch layout; the list the player sees is PAD_LAYOUT in gamepadInput.js).
 *
 *   playing   Left stick  move                         A   talk and shop / enter a building / pet
 *             B  pick, pick up and hold, feed          Y   untie / let go, or leash your pony        X  mount / dismount
 *             ZR the tool in hand (swing, chop, cast, till, lasso...)   R   the stall, stable or building menu beside you (else the Town)
 *             - map, + menu, L3 bag      L   fly / land     ZL  pony power     D-pad left / right: tool, up / down: which thing is selected (targetSelector.js)
 *   a window  D-pad jumps between the buttons, right stick moves a pointer, A clicks it, B closes the window; hold L and the right stick scrolls a list or pans the map.
 *
 * Nothing here changes a game rule: every button ends in the same call the keyboard or the touch buttons make (bus events, ClientGame methods). */
const PAD_B_KINDS = ['pick', 'pickDrop', 'pickup', 'board', 'exit', 'revive', 'drink', 'fill', 'feed', 'treat', 'give', 'stallFeed', 'camp', 'track', 'plant_hedge', 'plant_tree', 'trim', 'cut', 'digHedge'];   // B: pick, pick up and hold, board, drink...
const PAD_USE_KINDS = ['mash'];                                          // a tug of war: A is plain Use (mash it)
const PAD_LIFT = { npc: 60, animal: 46, pony: 58, tree: 58, door: 52, building: 70, prop: 40, me: 70 };   // how far above the spot the bubble floats (logical pixels)
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
    this.selector = new TargetSelector({ game, targetOf: a => this._target(a), isMoving: () => this.pad.left.mag > 0 || Math.hypot((game.local && game.local.vx) || 0, (game.local && game.local.vy) || 0) > 0.4 });
    this.cx = 0; this.cy = 0;                     // the pointer
    this.downTarget = null; this.hoverEl = null; this.heldDir = null; this.intro = null;
    swallowSyntheticCapture();
    bus.on('padActive', on => { document.body.classList.toggle('padActive', on); if (!on) this._setHover(null); });
  }

  /** Left stick as a screen-space unit direction, or null (also null while a window is open: the stick moves the pointer then). */
  get moveAxis() { const l = this.pad.left; return !this.menuMode && l.mag > 0 ? { x: l.x, y: l.y } : null; }
  /** The tool button: the right trigger uses what is in hand (swing, cast, chop, till, throw the lasso, place) for as long as it is held. */
  get actionHeld() { return !this.menuMode && this.pad.isDown('ZR'); }

  /** Once per frame, from the game loop. */
  update(ms) {
    const pad = this.pad; pad.poll();
    if (!pad.connected) return;
    const open = this.panels.anyOpen();
    if (open !== this.menuMode) { this.menuMode = open; if (open) this._enterMenu(); else this._leaveMenu(); }
    for (const name of pad.pressed) { this._pressedAny(name); if (open) this._pressedInMenu(name); else this._pressedInWorld(name); }
    for (const name of pad.released) if (name === 'A') this._pointerUp();
    if (open) this._menuTick(ms / 1000); else this.selector.update(ms);
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
      case 'X': this._ride(); break;
      case 'R': if (g.stallHint()) g.openStall(); else this.bus.emit('toggleTown'); break;
      case 'L': this.bus.emit('ability'); break;
      case 'ZL': { const i = g.abilityState().findIndex(a => !(a.cooldown > 0)); if (i >= 0) this.bus.emit('ponyPower', i + 1); break; }
      case 'LEFT': g.cycleSlot(-1); break;                              // left / right: the tool in your hand
      case 'RIGHT': g.cycleSlot(1); break;
      case 'UP': this.selector.cycle(-1); break;                        // up / down: which of the things around you the buttons mean (a hard select: see targetSelector.js)
      case 'DOWN': this.selector.cycle(1); break;
      case 'LS': this.bus.emit('toggleInventory'); break;               // click the left stick: the Bag
      case 'RS': this.bus.emit('toggleJournal'); break;
    }
    // (ZR, the tool button, is not a press: it is held, and the game reads it as Use: actionHeld)
  }

  /** The selected thing: { key, action, target, score } or null. */
  _selected() { return this.selector.current; }
  /** Does A take this (rather than B)? A: talking, shops, doors and every way in or out, chests, stations, petting. B: picking, picking up, feeding, boarding, drinking. */
  _aTakes(action) { return !!action && !PAD_USE_KINDS.includes(action.kind) && !PAD_B_KINDS.includes(action.kind); }
  _primary() {
    const sel = this._selected();
    if (!sel || !this._aTakes(sel.action)) return;
    if (sel.action.npc) this._talk(sel.action.npc); else this.game.requestInteract(sel.key);
  }
  /** A villager: the dialogue window, like a tap on them (it offers their shop, their quests, and a gift if you hold one they like). */
  _talk(npc) {
    const id = Object.keys(this.game.npcs).find(k => this.game.npcs[k] === npc);
    if (id) this.bus.emit('talkTo', Object.assign({ id }, npc));
  }
  _secondary() {
    const sel = this._selected();
    if (sel) this.game.requestInteract(sel.key);
    else this.game.events.emit('notice', { to: this.game.myId, text: 'Nothing to pick up or feed here' });
  }
  /** The animal that is selected, if the selection is one. */
  _selectedAnimal() { const sel = this._selected(); return sel && sel.action.animal && sel.action.animal.id ? sel.action.animal : null; }
  /** What Y would do to this animal (or, with none, the nearest): { label, run } or null. */
  _yFor(an) {
    const g = this.game, L = g.local;
    if (!an) {
      const release = g.releaseTarget();
      if (release) return { label: release.label, run: () => g.requestRelease(release) };
      return g.leashHint() ? { label: 'Leash', run: () => g.leashPony() } : null;
    }
    const pool = { [an.id]: an }, release = findRelease(L, pool, g.myId);
    if (release) return { label: release.label, run: () => g.requestRelease(release) };
    return Stable.leashTarget(pool, L, g.myId, null) ? { label: 'Leash', run: () => g.leashPony(an.id) } : null;
  }
  _untieOrLeash() {
    const y = this._yFor(this._selectedAnimal()) || this._yFor(null);
    if (y) y.run(); else this.game.events.emit('notice', { to: this.game.myId, text: 'Nothing to untie, and no pony of yours to leash' });
  }
  /** What X would do: get off, or get on this pony (or, with none selected, the nearest). */
  _xFor(an) {
    const g = this.game, L = g.local;
    if (L.mount) return { label: 'Dismount', run: () => g.toggleRide() };
    if (an) return findRide(L, { [an.id]: an }, g.myId) ? { label: 'Ride', run: () => g.toggleRide(an.id) } : null;
    return g.rideHint() ? { label: g.rideHint(), run: () => g.toggleRide() } : null;
  }
  _ride() { const x = this._xFor(this._selectedAnimal()) || this._xFor(null); if (x) x.run(); else this.game.toggleRide(); }

  /* ---------------------------------------------------------------- the on-screen button hints */

  /** The prompts for the situation right now: [{ button, text, target? }] (Switch button names; GamepadHints prints them).
   *  Only the SELECTED thing gets a bubble above it (so the prompts never crowd each other): what A, B, Y and X would do to it, and the arrows when there are
   *  other things to step to. The rest go in the corner strip. */
  hints() {
    const out = [], g = this.game, L = g.local;
    if (this.menuMode) {
      out.push({ button: 'A', text: 'Select' }, { button: 'B', text: 'Back' }, { button: 'DPAD', text: 'Move' }, { button: 'RSTICK', text: 'Pointer' }, { button: 'L', text: 'Hold + R Stick: scroll' }, { button: 'PLUS', text: 'Menu' }, { button: 'MINUS', text: 'Map' });
      return out;
    }
    if (!L || L.asleep) return out;
    const sel = this._selected(), target = sel ? sel.target : null, an = this._selectedAnimal();
    if (sel) {
      const act = sel.action, text = act.npc ? `Talk to ${act.npc.name}` : act.label;
      if (this._aTakes(act)) out.push({ button: 'A', text, target });
      else if (!PAD_USE_KINDS.includes(act.kind)) out.push({ button: 'B', text, target });
      if (an) {
        const y = this._yFor(an); if (y) out.push({ button: 'Y', text: y.label, target });
        const x = !L.mount ? this._xFor(an) : null; if (x) out.push({ button: 'X', text: x.label, target });
      }
      const pos = this.selector.position;
      if (pos.count > 1) out.push({ button: 'UPDOWN', text: `Next ${pos.index}/${pos.count}`, target });
    }
    if (L.mount) out.push({ button: 'X', text: 'Dismount' });
    if (!an) {                                                                         // (no animal selected to untie or ride: the nearest one, in the strip)
      const y = this._yFor(null); if (y) out.push({ button: 'Y', text: y.label });
      const x = !L.mount ? this._xFor(null) : null; if (x) out.push({ button: 'X', text: x.label });
    }
    out.push({ button: 'ZR', text: toolVerb(g.heldItemId()) });
    const stall = g.stallHint();
    out.push({ button: 'R', text: stall ? stall.name : 'Town' });
    const fly = g.abilityHint(); if (fly) out.push({ button: 'L', text: fly.label });
    const power = g.abilityState().find(a => !(a.cooldown > 0)); if (power) out.push({ button: 'ZL', text: power.ability.name });
    out.push({ button: 'DPAD', text: 'Tool' }, { button: 'LS', text: 'Bag' }, { button: 'MINUS', text: 'Map' }, { button: 'PLUS', text: 'Menu' });
    return out;
  }

  /** Where in the world an interaction is, as { id, kind, x, y, lift }: people and animals are looked up again each frame (locate()), so the bubble follows them. */
  _target(a) {
    const g = this.game, me = g.local, at = (id, kind, x, y, lift) => ({ id, kind, x, y, lift });
    if (a.npc) { const id = Object.keys(g.npcs).find(k => g.npcs[k] === a.npc) || a.npc.name; return at('npc:' + id, 'npc', a.npc.x, a.npc.y, PAD_LIFT.npc); }
    if (a.animal) { const an = a.animal; return at('animal:' + an.id, 'animal', an.x, an.y, AnimalDefs[an.type] && AnimalDefs[an.type].pony ? PAD_LIFT.pony : PAD_LIFT.animal); }
    if (a.forage) return at('tile:' + a.forage.tx + ',' + a.forage.ty, 'spot', a.forage.prop.x, a.forage.prop.y, PAD_LIFT.tree);
    if (a.chest) return at('prop:' + a.chest.prop.x + ',' + a.chest.prop.y, 'spot', a.chest.prop.x, a.chest.prop.y, PAD_LIFT.prop);
    if (a.drop) return at('drop:' + a.drop.x + ',' + a.drop.y, 'spot', a.drop.x, a.drop.y, PAD_LIFT.prop);
    if (a.boat) return at('boat', 'spot', a.boat.x, a.boat.y, PAD_LIFT.prop);
    if (a.water) return at('water', 'spot', a.water.x, a.water.y, PAD_LIFT.prop);
    if (a.door) return at('tile:' + a.door.tx + ',' + a.door.ty, 'spot', a.door.tx + 0.5, a.door.ty + 0.5, PAD_LIFT.door);
    if (a.pile) return at('tile:' + a.pile.tx + ',' + a.pile.ty, 'spot', a.pile.tx + 0.5, a.pile.ty + 0.5, PAD_LIFT.door);
    if (a.who) { const o = g.latestPlayers()[a.who]; if (o) return at('player:' + a.who, 'spot', o.x, o.y, PAD_LIFT.npc); }
    if (typeof a.site === 'number' && !g.grid && typeof BuildingSites !== 'undefined' && BuildingSites.list[a.site]) { const f = BuildingSites.doorFront(BuildingSites.list[a.site]); return at('site:' + a.site, 'spot', f.x, f.y, PAD_LIFT.building); }
    if (typeof a.fx === 'number') return at('tile:' + a.fx + ',' + a.fy, 'spot', a.fx + 0.5, a.fy + 0.5, PAD_LIFT.door);
    if (typeof a.tx === 'number' && typeof a.ty === 'number') return at('tile:' + a.tx + ',' + a.ty, 'spot', a.tx + 0.5, a.ty + 0.5, PAD_LIFT.door);
    if (typeof a.x === 'number' && typeof a.y === 'number') return at('spot:' + Math.round(a.x) + ',' + Math.round(a.y), 'spot', a.x, a.y, PAD_LIFT.prop);
    return { id: 'me', kind: 'me', lift: PAD_LIFT.me };                               // (nothing to point at: over your own head)
  }

  /** The target's world position right now (a moving animal or villager as it is drawn), with its lift. */
  locate(t) {
    const g = this.game;
    const view = g.getRenderState(1);
    if (t.kind === 'me') { const me = view.players[g.myId] || g.local; return me ? { x: me.x, y: me.y, lift: t.lift } : null; }
    if (t.kind === 'npc' || t.kind === 'animal') {
      const live = (t.kind === 'npc' ? view.npcs : view.animals)[t.id.slice(t.id.indexOf(':') + 1)];
      if (live) return { x: live.x, y: live.y, lift: t.lift };
    }
    return { x: t.x, y: t.y, lift: t.lift };
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
    if (this.intro && this.intro.isOpen) { if (name === 'A' || name === 'B') this.intro.close(); return; }      // the first-time guide: A or B puts it away
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
