'use strict';
/* CLIENT - the controller's button prompts: a small strip (bottom right) saying what each button does RIGHT NOW (Talk to Bramble, Untie, Dismount...),
 * and the + / - badges on the Menu and Map buttons. They appear when the player starts using a controller and vanish when the keyboard, mouse or a finger takes over.
 * The prompts come from GamepadActions.hints(); the buttons are printed with the names of the pad in use (Switch letters unless it is an Xbox or PlayStation pad). */
const PAD_HINT_EVERY_MS = 120;

class GamepadHints {
  constructor({ root, pad, actions, badges = {} }) {
    this.root = root; this.pad = pad; this.actions = actions; this.badges = badges;   // badges: { PLUS: menu button, MINUS: map button }
    this.key = ''; this.since = 1e9;
  }

  /** Button name -> a printed chip: round for the face buttons, a pill for the shoulders, a wide one for the sticks. */
  chip(name) {
    const shape = 'ABXY'.includes(name) && name.length === 1 ? 'face' : /^(L|R|ZL|ZR)$/.test(name) ? 'shoulder' : /STICK|DPAD/.test(name) ? 'stick' : 'small';
    return `<kbd class="padBtn ${shape}" data-b="${name}">${this.pad.label(name)}</kbd>`;
  }

  update(ms) {
    this.since += ms;
    if (this.since < PAD_HINT_EVERY_MS) return;
    this.since = 0;
    const show = this.pad.connected && this.pad.active;
    if (this.root.hidden === show) this.root.hidden = !show;
    if (!show) return;
    const list = this.actions.hints(), key = this.pad.family + '|' + list.map(h => h.button + ':' + h.text).join('|');
    if (key === this.key) return;
    this.key = key;
    this.root.innerHTML = list.map(h => `<div class="padHint">${this.chip(h.button)}<span>${padEscape(h.text)}</span></div>`).join('');
    for (const name in this.badges) { const el = this.badges[name]; if (el) el.dataset.pad = this.pad.label(name); }
  }
}

function padEscape(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
