'use strict';
/* CLIENT - the controller's button prompts. They appear when the player starts using a controller and vanish when the keyboard, mouse or a finger takes over.
 *   - Bubbles floating above the thing a button would act on: the door ("A Enter Tavern"), the tree ("B Pick apples"), the villager, the animal ("Y Untie"),
 *     the stall. Prompts that share a thing share its bubble.
 *   - A small strip in the corner for what has no thing to point at: Use, Lasso, Town, Fly, the + / - buttons, and what the buttons do inside a window.
 *   - The + / - badges on the Menu and Map buttons.
 * The prompts come from GamepadActions.hints(); the buttons are printed with the names of the pad in use (Switch letters unless it is an Xbox or PlayStation pad). */
const PAD_HINT_EVERY_MS = 120;

class GamepadHints {
  constructor({ root, bubbles, pad, actions, camera, badges = {} }) {
    this.root = root; this.bubbleRoot = bubbles; this.pad = pad; this.actions = actions; this.camera = camera; this.badges = badges;   // badges: { PLUS: menu button, MINUS: map button }
    this.key = ''; this.since = 1e9;
    this.bubbles = new Map();                       // target id -> { el, target, key }
  }

  /** Button name -> a printed chip: round for the face buttons, a pill for the shoulders, a wide one for the sticks. */
  chip(name) {
    const shape = 'ABXY'.includes(name) && name.length === 1 ? 'face' : /^(L|R|ZL|ZR)$/.test(name) ? 'shoulder' : /STICK|DPAD/.test(name) ? 'stick' : 'small';
    return `<kbd class="padBtn ${shape}" data-b="${name}">${this.pad.label(name)}</kbd>`;
  }
  row(h) { return `<div class="padHint">${this.chip(h.button)}<span>${padEscape(h.text)}</span></div>`; }

  /** Once per frame, AFTER the camera has moved (the bubbles are placed on screen from it). */
  update(ms) {
    this.since += ms;
    const show = this.pad.connected && this.pad.active;
    if (this.root.hidden === show) this.root.hidden = !show;
    if (this.bubbleRoot.hidden === show) this.bubbleRoot.hidden = !show;
    if (!show) return;
    if (this.since >= PAD_HINT_EVERY_MS) { this.since = 0; this._rebuild(this.actions.hints()); }
    this._place();
  }

  /** The strip and the bubbles for this list of prompts (only touches the page when something changed). */
  _rebuild(list) {
    const strip = list.filter(h => !h.target), anchored = list.filter(h => h.target);
    const key = this.pad.family + '|' + list.map(h => h.button + ':' + h.text + ':' + (h.target ? h.target.id : '')).join('|');
    if (key === this.key) return;
    this.key = key;
    this.root.innerHTML = strip.map(h => this.row(h)).join('');
    for (const name in this.badges) { const el = this.badges[name]; if (el) el.dataset.pad = this.pad.label(name); }
    const groups = new Map();
    for (const h of anchored) { if (!groups.has(h.target.id)) groups.set(h.target.id, { target: h.target, rows: [] }); groups.get(h.target.id).rows.push(h); }
    for (const [id, b] of this.bubbles) if (!groups.has(id)) { b.el.remove(); this.bubbles.delete(id); }
    for (const [id, g] of groups) {
      let b = this.bubbles.get(id);
      if (!b) { const el = document.createElement('div'); el.className = 'padBubble'; this.bubbleRoot.appendChild(el); b = { el, target: g.target }; this.bubbles.set(id, b); }
      b.target = g.target;
      b.el.innerHTML = g.rows.map(h => this.row(h)).join('');
    }
  }

  /** Put every bubble above its thing: world -> iso -> screen, the way the camera frames the game. */
  _place() {
    const cam = this.camera;
    for (const b of this.bubbles.values()) {
      const at = this.actions.locate(b.target);
      if (!at) { b.el.style.visibility = 'hidden'; continue; }
      const sx = (isoX(at.x, at.y) - cam.x + cam.w / 2) * cam.zoom, sy = (isoY(at.x, at.y) - cam.y + cam.h / 2 - at.lift) * cam.zoom;
      const off = sx < -40 || sy < -40 || sx > cam.cssW + 40 || sy > cam.cssH + 40;
      b.el.style.visibility = off ? 'hidden' : '';
      b.el.style.transform = `translate(${Math.round(clamp(sx, 70, cam.cssW - 70))}px,${Math.round(Math.max(sy, 30))}px) translate(-50%,-100%)`;
    }
  }
}

function padEscape(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
