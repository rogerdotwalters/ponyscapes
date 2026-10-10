'use strict';
/* CLIENT - keyboard. Reports a SCREEN-space move axis (W = up on screen) and emits UI events. Which key does what comes from Controls
 * (controlSettings.js), so it can be rebound; the tool bar digits 1-9 and Esc are fixed. */
const PREVENT_DEFAULT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

/** action id -> (bus, shift) => emit. */
const KEY_EVENTS = {
  debug: bus => bus.emit('toggleDebug'),
  inventory: bus => bus.emit('toggleInventory'),
  crafting: bus => bus.emit('toggleCrafting'),
  journal: bus => bus.emit('toggleJournal'),
  map: bus => bus.emit('toggleMap'),
  fly: bus => bus.emit('ability'),
  mainPony: bus => bus.emit('mainPony'),                    // riding one of your ponies: make it your main pony
  dismount: bus => bus.emit('dismount'),                    // get off your pony, even with something to pick nearby
  release: bus => bus.emit('release'),                      // let go / untie (a separate key from the action key; a catch asks first)
  rotate: bus => bus.emit('rotateBuild'),
  interact: bus => bus.emit('interact'),
  gear: bus => bus.emit('toggleGear'),
  ponies: bus => bus.emit('togglePonies'),
  emotes: bus => bus.emit('toggleEmotes'),
  power1: bus => bus.emit('ponyPower', 1),                  // the ridden pony's first rarity ability (rare ponies and better)
  power2: bus => bus.emit('ponyPower', 2),                  // ...and its second (legendary)
  power3: bus => bus.emit('ponyPower', 3),                  // the skills a pony learns as it levels up (ponySkills.js) follow its rarity abilities
  power4: bus => bus.emit('ponyPower', 4),
  lasso: bus => bus.emit('throwLasso'),                     // the lasso in the lasso slot (whatever is in your hand)
  drop: (bus, shift) => bus.emit('dropHeld', shift),        // drop what is in your hand (Shift: the whole stack)
  town: bus => bus.emit('toggleTown')                       // stockpiles and building upgrades
};

class KeyboardInput {
  constructor(bus) {
    this.bus = bus; this.down = new Set();
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  /** x: right = +1, y: down = +1 (screen space), normalised so diagonals are not faster. */
  get moveAxis() {
    const x = this._axis('moveRight', 'moveLeft');
    const y = this._axis('moveDown', 'moveUp');
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }
  get actionHeld() { return Controls.isDown('use', this.down); }

  _axis(positive, negative) { return (Controls.isDown(positive, this.down) ? 1 : 0) - (Controls.isDown(negative, this.down) ? 1 : 0); }

  _onKeyDown(e) {
    if (Controls.capturing) return;                               // the Controls window is listening for a key to bind
    if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) this._emitOneShotEvents(e.code, e.shiftKey);
    this.down.add(e.code);
  }

  _emitOneShotEvents(code, shift) {
    const action = Controls.actionFor(code);
    if (action && KEY_EVENTS[action]) KEY_EVENTS[action](this.bus, shift);
    if (code === 'Escape') this.bus.emit('closePanels');
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) this.bus.emit('selectSlot', Number(digit[1]) - 1);
  }
}
