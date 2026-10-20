'use strict';
/* CLIENT - the controller itself: polls the Gamepad API and reports which buttons went down / up this frame, the two sticks and the labels to print.
 * The layout is the Nintendo Switch one and is POSITIONAL (the browser's "standard" mapping): A is the right face button, B the bottom one, X the top, Y the left.
 * An Xbox or PlayStation pad has the same buttons in the same places, so it works too; only the printed names change (labels()).
 * What each button DOES lives in gamepadActions.js; the list shown to the player is PAD_LAYOUT below. */

/** Switch button name -> index in the standard mapping. */
const PAD_INDEX = { B: 0, A: 1, Y: 2, X: 3, L: 4, R: 5, ZL: 6, ZR: 7, MINUS: 8, PLUS: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/** How each button is printed, by pad family. */
const PAD_LABELS = {
  nintendo: { A: 'A', B: 'B', X: 'X', Y: 'Y', L: 'L', R: 'R', ZL: 'ZL', ZR: 'ZR', MINUS: '−', PLUS: '+', LS: 'L3', RS: 'R3', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', LSTICK: 'L Stick', RSTICK: 'R Stick', DPAD: 'D-Pad' },
  xbox:     { A: 'B', B: 'A', X: 'Y', Y: 'X', L: 'LB', R: 'RB', ZL: 'LT', ZR: 'RT', MINUS: 'View', PLUS: 'Menu', LS: 'LS', RS: 'RS', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', LSTICK: 'L Stick', RSTICK: 'R Stick', DPAD: 'D-Pad' },
  playstation: { A: '○', B: '✕', X: '△', Y: '□', L: 'L1', R: 'R1', ZL: 'L2', ZR: 'R2', MINUS: 'Create', PLUS: 'Options', LS: 'L3', RS: 'R3', UP: '▲', DOWN: '▼', LEFT: '◀', RIGHT: '▶', LSTICK: 'L Stick', RSTICK: 'R Stick', DPAD: 'D-Pad' }
};

/** What the buttons do, for the Controls window (Menu > Controls > Controller). `world`: while playing; `menu`: while a window is open. */
const PAD_LAYOUT = [
  { button: 'LSTICK', world: 'Move', menu: '' },
  { button: 'A',      world: 'Use your tool / Talk and shop / Enter a building / Pet', menu: 'Click where the pointer is' },
  { button: 'B',      world: 'Pick, pick up and hold, feed, pet, board a boat', menu: 'Back (close the window)' },
  { button: 'Y',      world: 'Untie or let go of an animal / Leash your pony', menu: '' },
  { button: 'X',      world: 'Mount / dismount your pony', menu: '' },
  { button: 'ZR',     world: 'Throw the lasso', menu: '' },
  { button: 'R',      world: 'Open the stall, stable or building menu beside you (else the Town)', menu: '' },
  { button: 'L',      world: 'Fly / land (on a pegasus)', menu: 'Hold: the right stick scrolls and pans' },
  { button: 'ZL',     world: 'Pony power (the first one that is ready)', menu: '' },
  { button: 'MINUS',  world: 'Map', menu: 'Map' },
  { button: 'PLUS',   world: 'Menu', menu: 'Menu' },
  { button: 'RSTICK', world: '', menu: 'Move the pointer' },
  { button: 'DPAD',   world: '◀ ▶ change the tool bar slot, ▲ Bag, ▼ Crafting', menu: '▲ ▼ scroll' },
  { button: 'RS',     world: 'Journal (click the right stick)', menu: '' }
];

const PAD_DEADZONE = 0.2;
const PAD_TRIGGER = 0.5;

class GamepadInput {
  constructor(bus) {
    this.bus = bus;
    this.index = -1;                                // which pad we read
    this.family = 'nintendo';
    this.id = '';
    this.down = new Set();                          // button names held
    this.pressed = new Set();                       // ...that went down since the last poll
    this.released = new Set();
    this.left = { x: 0, y: 0, mag: 0 };             // sticks: x right, y down, dead zone applied, mag 0..1
    this.right = { x: 0, y: 0, mag: 0 };
    this.active = false;                            // the player is using the pad (not the keyboard or mouse): the on-screen hints follow this
    window.addEventListener('gamepadconnected', e => { this._pick(e.gamepad); this.bus.emit('padConnected', this.id); });
    window.addEventListener('gamepaddisconnected', e => { if (e.gamepad.index === this.index) { this.index = -1; this.down.clear(); this._setActive(false); } });
    const mine = e => e.isTrusted;                  // (the pointer cursor sends its own events: those are not the mouse)
    window.addEventListener('keydown', e => { if (mine(e)) this._setActive(false); }, true);
    window.addEventListener('mousedown', e => { if (mine(e)) this._setActive(false); }, true);
    window.addEventListener('touchstart', e => { if (mine(e)) this._setActive(false); }, { capture: true, passive: true });
  }

  get connected() { return this.index >= 0; }
  label(name) { return (PAD_LABELS[this.family] || PAD_LABELS.nintendo)[name] || name; }
  isDown(name) { return this.down.has(name); }
  wasPressed(name) { return this.pressed.has(name); }

  _pick(pad) {
    this.index = pad.index; this.id = pad.id || '';
    const id = this.id.toLowerCase();
    this.family = /057e|nintendo|switch|joy-?con|pro controller/.test(id) ? 'nintendo' : /054c|playstation|dualshock|dualsense|sony/.test(id) ? 'playstation' : /045e|xbox|xinput/.test(id) ? 'xbox' : 'nintendo';
  }
  _setActive(on) { if (on !== this.active) { this.active = on; this.bus.emit('padActive', on); } }

  /** Read the pad. Call once per frame, before anything asks for pressed / released. */
  poll() {
    this.pressed.clear(); this.released.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = this.index >= 0 ? pads[this.index] : null;
    if (!pad || !pad.connected) {                                    // (a pad plugged in before the page loaded only shows up here until a button is pressed)
      this.index = -1; pad = null;
      for (const p of pads) if (p && p.connected) { pad = p; break; }
      if (!pad) { this.left = { x: 0, y: 0, mag: 0 }; this.right = { x: 0, y: 0, mag: 0 }; return; }
      this._pick(pad);
    }
    const now = new Set();
    for (const name in PAD_INDEX) {
      const b = pad.buttons[PAD_INDEX[name]];
      if (b && (b.pressed || b.value > PAD_TRIGGER)) now.add(name);
    }
    for (const name of now) if (!this.down.has(name)) this.pressed.add(name);
    for (const name of this.down) if (!now.has(name)) this.released.add(name);
    this.down = now;
    this.left = stickOf(pad.axes[0], pad.axes[1]);
    this.right = stickOf(pad.axes[2], pad.axes[3]);
    if (this.pressed.size || this.left.mag > 0 || this.right.mag > 0) this._setActive(true);
  }
}

/** Radial dead zone: a stick resting slightly off centre reads as nothing. */
function stickOf(rawX, rawY) {
  const x = rawX || 0, y = rawY || 0, m = Math.hypot(x, y);
  if (m < PAD_DEADZONE) return { x: 0, y: 0, mag: 0 };
  const mag = Math.min(1, (m - PAD_DEADZONE) / (1 - PAD_DEADZONE));
  return { x: x / m, y: y / m, mag };
}
