'use strict';
/* CLIENT - the stable's menu (shared/stableSystem.js). The server sends a 'stallMenu' event when you press the interact key beside a stall:
 *   mode 'in'   the ponies you have on a leash: pick one and it goes into the stall you stand at
 *   mode 'out'  the ponies of yours in this stable: TAKE OUT (it stands in front of the gate) or LET OUT (it roams the village area)
 * Either way a button opens or shuts the stall's gate. */
class StableUI {
  /** @param {{panel, title, body, closeButton, game, requestOpen:()=>void}} opts */
  constructor({ panel, title, body, closeButton, game, requestOpen }) {
    Object.assign(this, { panel, title, body, game, requestOpen }); this.menu = null;
    closeButton.addEventListener('click', () => this.close());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; }
  close() { this.panel.hidden = true; this.menu = null; }
  /** @param {{mode, fx, fy, gate, options:[{id,name,level,type}]}} menu */
  show(menu) {
    this.requestOpen();                                         // (opening closes every panel, this one included: so fill in the details AFTER)
    this.menu = menu;
    this.title.textContent = menu.mode === 'in' ? 'Stable a pony' : 'Ponies in this stable';
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const kind = type => (AnimalDefs[type] ? AnimalDefs[type].name : '');
    let html = '';
    if (menu.gate) html += `<button class="stGate" data-act="gate">${menu.gate.open ? 'Close the gate' : 'Open the gate'}</button>`;
    if (!menu.options.length) html += `<p class="stHint">${menu.mode === 'in' ? 'No pony of yours is on a leash. Press Leash beside a pony of yours, then come back.' : 'Nobody is stabled here yet.'}</p>`;
    else html += `<p class="stHint">${menu.mode === 'in' ? 'Which pony goes in this stall?' : 'Which pony do you want?'}</p>` + menu.options.map(o =>
      `<div class="stRow"><button class="stPony" data-act="${menu.mode}" data-id="${esc(o.id)}">${esc(o.name)}<small>${esc(kind(o.type))} &middot; Lv ${o.level}</small></button>` +
      (menu.mode === 'out' ? `<button class="stRoam" data-act="roam" data-id="${esc(o.id)}" title="Let it out to roam the village">Let out</button>` : '') + '</div>').join('');
    this.body.innerHTML = html;
    this.body.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.pick(b.dataset.act, b.dataset.id)));
  }
  pick(act, animal) {
    const m = this.menu; if (!m) return;
    this.game.stallPick({ act, animal: animal || '', fx: m.fx, fy: m.fy });
    this.close();
  }
}
