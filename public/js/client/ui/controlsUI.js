'use strict';
/* CLIENT - the Controls window (Menu > Controls): a KEYS tab to rebind every keyboard action (click a key, press the new one; Backspace clears it;
 * a key already used by another action moves to this one) and a MOUSE & TOUCH tab with what clicks and taps do and the tap-to-walk switch. */
class ControlsUI {
  constructor({ panel, tabs, body, closeButton }) {
    this.panel = panel; this.tabs = tabs; this.body = body; this.tab = 'keys'; this.waiting = null;       // waiting: { id, index } while a key is awaited
    tabs.innerHTML = '<button data-tab="keys">Keys</button><button data-tab="pointer">Mouse &amp; touch</button>';
    tabs.addEventListener('click', e => { const t = e.target.closest('button'); if (t) this.show(t.dataset.tab); });
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => this._click(e));
    body.addEventListener('change', e => {
      const set = { ctlTapMove: 'setTapToMove', ctlFixedStick: 'setFixedJoystick', ctlWalkToAct: 'setWalkToAct' }[e.target.id];
      if (set) { Controls[set](e.target.checked); this.refresh(); }
    });
    window.addEventListener('keydown', e => this._onKey(e), true);
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.show(this.tab); }
  close() { this._stopWaiting(); this.panel.hidden = true; }
  show(tab) {
    this.tab = tab; this._stopWaiting();
    for (const b of this.tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === tab);
    this.refresh();
  }
  _stopWaiting() { this.waiting = null; Controls.capturing = false; }

  _click(e) {
    const key = e.target.closest('button[data-bind]');
    if (key) {
      const [id, index] = key.dataset.bind.split(':');
      this.waiting = { id, index: Number(index) }; Controls.capturing = true; this.refresh();
      return;
    }
    const reset = e.target.closest('button[data-reset]');
    if (reset) { this._stopWaiting(); if (reset.dataset.reset === 'all') Controls.resetAll(); else Controls.resetAction(reset.dataset.reset); this.refresh(); }
  }

  /** The key the player pressed while a binding is waiting. */
  _onKey(e) {
    if (!this.waiting || !this.isOpen) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const { id, index } = this.waiting;
    if (e.code === 'Escape') { this._stopWaiting(); this.refresh(); return; }                                 // changed my mind
    if (e.code === 'Backspace' || e.code === 'Delete') { const old = Controls.keysOf(id)[index]; if (old) Controls.unbind(id, old); this._stopWaiting(); this.refresh(); return; }
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'].includes(e.code)) return;   // (modifiers on their own do not count)
    if (Controls.reserved(e.code)) { this.note = `${Controls.label(e.code)} is fixed and cannot be used`; this.refresh(); return; }
    Controls.bind(id, index, e.code); this.note = ''; this._stopWaiting(); this.refresh();
  }

  refresh() { this.body.innerHTML = this.tab === 'keys' ? this._keys() : this._pointer(); }

  _keys() {
    let group = '', html = '';
    for (const a of Controls.actions) {
      if (a.group !== group) { group = a.group; html += `<div class="gtitle">${group}</div>`; }
      const keys = Controls.keysOf(a.id), cells = [0, 1].map(i => {
        const waiting = this.waiting && this.waiting.id === a.id && this.waiting.index === i;
        return `<button class="ctlKey${waiting ? ' wait' : ''}" data-bind="${a.id}:${i}" tabindex="-1">${waiting ? 'press a key...' : Controls.label(keys[i])}</button>`;
      }).join('');
      const changed = !!Controls.map[a.id];
      html += `<div class="ctlRow"><span>${a.label}</span>${cells}<button class="ctlReset" data-reset="${a.id}" tabindex="-1" title="Back to the default"${changed ? '' : ' disabled'}>&#8634;</button></div>`;
    }
    return (this.note ? `<div class="ctlNote">${this.note}</div>` : '') +
      '<div class="ctlHelp">Click a key, then press the one you want. <b>Backspace</b> clears it, <b>Esc</b> cancels. Tool bar slots <b>1-9</b> and <b>Esc</b> are fixed.</div>' +
      html + `<div class="admRow"><button data-reset="all" tabindex="-1"${Controls.isDefault() ? ' disabled' : ''}>Reset all keys</button></div>`;
  }

  _pointer() {
    const rows = CONTROL_POINTER_HELP.map(([what, does]) => `<div class="ctlHelpRow"><b>${what}</b><span>${does}</span></div>`).join('');
    return '<div class="gtitle">Joystick</div>' +
      `<label class="chk"><input type="checkbox" id="ctlFixedStick"${Controls.fixedJoystick ? ' checked' : ''}><span><b>Fixed joystick</b><small>On: the stick stays put and only moves when you drag it, so taps never move it. Off: it floats to wherever your thumb lands.</small></span></label>` +
      '<div class="gtitle">Taps</div>' +
      `<label class="chk"><input type="checkbox" id="ctlWalkToAct"${Controls.walkToAct ? ' checked' : ''}><span><b>Walk to it, then act</b><small>Tap a villager, animal, door, stockpile, crop or shop counter out of reach: walk there and do the action. Off: nothing happens when it is out of reach.</small></span></label>` +
      `<label class="chk"><input type="checkbox" id="ctlTapMove"${Controls.tapToMove ? ' checked' : ''}><span><b>Tap the ground to walk there</b><small>On by default. A tap on bare ground walks there (the joystick and keys still steer). Off: a tap near you uses your tool or interacts instead.</small></span></label>` +
      '<div class="gtitle">What clicks and taps do</div>' + rows;
  }
}
