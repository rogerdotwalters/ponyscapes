'use strict';
/* CLIENT - keyboard. Reports a SCREEN-space move axis (W = up on screen) and emits UI events. */
const ACTION_KEYS = ['KeyE', 'Space', 'Enter'];
const PREVENT_DEFAULT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

class KeyboardInput {
  constructor(bus) {
    this.bus = bus; this.down = new Set();
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  /** x: right = +1, y: down = +1 (screen space), normalised so diagonals are not faster. */
  get moveAxis() {
    const x = this._axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const y = this._axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }
  get actionHeld() { return ACTION_KEYS.some(k => this.down.has(k)); }

  _axis(positive, negative) {
    return (positive.some(k => this.down.has(k)) ? 1 : 0) - (negative.some(k => this.down.has(k)) ? 1 : 0);
  }

  _onKeyDown(e) {
    if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) this._emitOneShotEvents(e.code, e.shiftKey);
    this.down.add(e.code);
  }

  _emitOneShotEvents(code, shift) {
    if (code === 'Backquote') this.bus.emit('toggleDebug');
    if (code === 'KeyI' || code === 'Tab') this.bus.emit('toggleInventory');
    if (code === 'KeyQ') this.bus.emit('toggleCrafting');
    if (code === 'KeyJ') this.bus.emit('toggleJournal');
    if (code === 'KeyM') this.bus.emit('toggleMap');
    if (code === 'KeyB') this.bus.emit('ability');
    if (code === 'KeyN') this.bus.emit('mainPony');                     // riding one of your ponies: make it your main pony                      // a pony's ability: take off / land
    if (code === 'KeyZ') this.bus.emit('dismount');                     // get off your pony, even with something to pick nearby
    if (code === 'KeyU') this.bus.emit('release');                      // let go / untie (a separate key from the action key; a catch asks first)
    if (code === 'KeyR') this.bus.emit('rotateBuild');
    if (code === 'KeyF') this.bus.emit('interact');
    if (code === 'KeyG') this.bus.emit('toggleGear');
    if (code === 'KeyP') this.bus.emit('togglePonies');
    if (code === 'KeyV') this.bus.emit('toggleEmotes');
    if (code === 'KeyH') this.bus.emit('ponyPower', 1);            // the ridden pony's first rarity ability (rare ponies and better)
    if (code === 'KeyK') this.bus.emit('ponyPower', 2);            // ...and its second (legendary)
    if (code === 'KeyL') this.bus.emit('throwLasso');              // the lasso in the lasso slot (whatever is in your hand)
    if (code === 'KeyX') this.bus.emit('dropHeld', shift);         // drop what is in your hand (Shift: the whole stack)
    if (code === 'KeyT') this.bus.emit('toggleTown');              // stockpiles and building upgrades
    if (code === 'Escape') this.bus.emit('closePanels');
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) this.bus.emit('selectSlot', Number(digit[1]) - 1);
  }
}
