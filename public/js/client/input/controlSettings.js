'use strict';
/* CLIENT - the player's control settings: which keys do what, and whether a tap on the ground walks there. Kept in this browser (localStorage).
 * Every keyboard action has a stable id (the same ids KeyboardInput emits events for) and up to two key codes (KeyboardEvent.code).
 * The mouse and touch are fixed (see CONTROL_POINTER_HELP): left click / tap = use the thing in your hand on what you point at, right click = lasso. */
const CONTROL_STORAGE_KEY = 'ponyscapes.controls.v1';

/** group -> actions. `keys` are the defaults. Digits 1-9 (tool bar) and Esc (close windows) are fixed and listed separately. */
const CONTROL_ACTIONS = [
  { id: 'moveUp',    group: 'Movement', label: 'Move up',    keys: ['KeyW', 'ArrowUp'] },
  { id: 'moveDown',  group: 'Movement', label: 'Move down',  keys: ['KeyS', 'ArrowDown'] },
  { id: 'moveLeft',  group: 'Movement', label: 'Move left',  keys: ['KeyA', 'ArrowLeft'] },
  { id: 'moveRight', group: 'Movement', label: 'Move right', keys: ['KeyD', 'ArrowRight'] },
  { id: 'use',       group: 'Actions', label: 'Use (tool, weapon, place)', keys: ['KeyE', 'Space', 'Enter'] },
  { id: 'interact',  group: 'Actions', label: 'Interact (pick, board, talk)', keys: ['KeyF'] },
  { id: 'lasso',     group: 'Actions', label: 'Throw lasso', keys: ['KeyL'] },
  { id: 'drop',      group: 'Actions', label: 'Drop held item (Shift: all)', keys: ['KeyX'] },
  { id: 'release',   group: 'Actions', label: 'Let go / untie', keys: ['KeyU'] },
  { id: 'rotate',    group: 'Actions', label: 'Rotate what you build', keys: ['KeyR'] },
  { id: 'dismount',  group: 'Riding', label: 'Get off your pony', keys: ['KeyZ'] },
  { id: 'fly',       group: 'Riding', label: 'Fly / land', keys: ['KeyB'] },
  { id: 'power1',    group: 'Riding', label: 'Pony power 1', keys: ['KeyH'] },
  { id: 'power2',    group: 'Riding', label: 'Pony power 2', keys: ['KeyK'] },
  { id: 'mainPony',  group: 'Riding', label: 'Make this your main pony', keys: ['KeyN'] },
  { id: 'inventory', group: 'Windows', label: 'Bag', keys: ['KeyI', 'Tab'] },
  { id: 'crafting',  group: 'Windows', label: 'Crafting', keys: ['KeyQ'] },
  { id: 'journal',   group: 'Windows', label: 'Journal', keys: ['KeyJ'] },
  { id: 'map',       group: 'Windows', label: 'Map', keys: ['KeyM'] },
  { id: 'gear',      group: 'Windows', label: 'Wardrobe', keys: ['KeyG'] },
  { id: 'ponies',    group: 'Windows', label: 'Pony book', keys: ['KeyP'] },
  { id: 'town',      group: 'Windows', label: 'Town', keys: ['KeyT'] },
  { id: 'emotes',    group: 'Windows', label: 'Emotes', keys: ['KeyV'] },
  { id: 'debug',     group: 'Windows', label: 'Debug overlay', keys: ['Backquote'] }
];

/** What the pointer does (not rebindable). Shown on the Controls window. */
const CONTROL_POINTER_HELP = [
  ['Left click / tap', 'Use what is in your hand where you point: water, plant, hoe, chop, swing or shoot a weapon, build. Hold the mouse button to keep going.'],
  ['On a villager', 'Talk: a window offers their shop or quests, or they just say hello.'],
  ['On an animal', 'Hold food to feed it, a lasso to rope it, a weapon to attack; otherwise you pet it.'],
  ['Right click', 'Throw your lasso at the animal under the pointer (PC). Phones have a Lasso button.'],
  ['Mouse wheel', 'Change the tool bar slot.'],
  ['1 - 9 / Esc', 'Pick a tool bar slot / close windows (fixed).']
];

const Controls = {
  /** action id -> [codes]. Only what differs from the defaults is saved. */
  map: {},
  tapToMove: false,                       // taps on the ground walk there (pathfinding): off unless you turn it on
  capturing: false,                       // the Controls window is waiting for a key: KeyboardInput stays quiet
  _byCode: null,

  actions: CONTROL_ACTIONS,
  defaultsOf(id) { return CONTROL_ACTIONS.find(a => a.id === id).keys.slice(); },
  keysOf(id) { return this.map[id] ? this.map[id].slice() : this.defaultsOf(id); },
  /** The action a key code triggers (or ''). */
  actionFor(code) {
    if (!this._byCode) { this._byCode = {}; for (const a of CONTROL_ACTIONS) for (const c of this.keysOf(a.id)) this._byCode[c] = a.id; }
    return this._byCode[code] || '';
  },
  isDown(id, down) { return this.keysOf(id).some(c => down.has(c)); },

  /** Put `code` on `id` in position `index` (0 or 1); another action that had that key loses it. */
  bind(id, index, code) {
    for (const a of CONTROL_ACTIONS) if (a.id !== id) { const keys = this.keysOf(a.id); if (keys.includes(code)) this._set(a.id, keys.filter(c => c !== code)); }
    const keys = this.keysOf(id);
    keys[Math.min(index, keys.length)] = code;                           // replaces what was in that position
    this._set(id, keys.filter((c, i) => c && keys.indexOf(c) === i).slice(0, 2));
    this.save();
  },
  unbind(id, code) { this._set(id, this.keysOf(id).filter(c => c !== code)); this.save(); },
  resetAction(id) { delete this.map[id]; this._byCode = null; this.save(); },
  resetAll() { this.map = {}; this._byCode = null; this.save(); },
  isDefault() { return !Object.keys(this.map).length; },
  _set(id, keys) { this.map[id] = keys; this._byCode = null; },

  setTapToMove(on) { this.tapToMove = !!on; this.save(); },

  /** A readable name for a key code: KeyW -> W, ArrowUp -> Up, Space -> Space. */
  label(code) {
    if (!code) return '-';
    return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Backquote', '`').replace('BracketLeft', '[').replace('BracketRight', ']').replace('Semicolon', ';').replace('Quote', "'").replace('Comma', ',').replace('Period', '.').replace('Slash', '/').replace('Backslash', '\\').replace('Minus', '-').replace('Equal', '=').replace('ShiftLeft', 'L-Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'L-Ctrl').replace('ControlRight', 'R-Ctrl').replace('AltLeft', 'L-Alt').replace('AltRight', 'R-Alt');
  },
  /** Keys that cannot be bound (they are fixed or would trap the player). */
  reserved: code => code === 'Escape' || /^Digit[1-9]$/.test(code) || /^(Meta|OS)/.test(code) || code === 'F5' || code === 'F11' || code === 'F12',

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONTROL_STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return;
      this.tapToMove = raw.tapToMove === true;
      for (const a of CONTROL_ACTIONS) {
        const keys = raw.keys && raw.keys[a.id];
        if (Array.isArray(keys)) this.map[a.id] = keys.filter(c => typeof c === 'string' && c.length < 24 && !this.reserved(c)).slice(0, 2);
      }
      this._byCode = null;
    } catch (e) { /* no saved controls (or storage is blocked): the defaults */ }
  },
  save() {
    try { localStorage.setItem(CONTROL_STORAGE_KEY, JSON.stringify({ tapToMove: this.tapToMove, keys: this.map })); } catch (e) { /* kept for this visit only */ }
  }
};
Controls.load();
