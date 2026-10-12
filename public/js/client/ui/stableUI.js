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
  /** @param {{mode, fx, fy, gate, options:[{id,name,level,type,sex}], inside, addable, others, cap}} menu
   *  A stall holds up to `cap` ponies (they share the pen): `inside` are yours that are in it now (take out / let out), `addable` the leashed ponies you could add. */
  show(menu) {
    this.requestOpen();                                         // (opening closes every panel, this one included: so fill in the details AFTER)
    this.menu = menu;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const kind = type => (AnimalDefs[type] ? AnimalDefs[type].name : '');
    const sex = o => (o.sex ? ' ' + PonyLook.sexInfo(o.sex).symbol : '');
    const inside = menu.inside || (menu.mode === 'out' ? menu.options : []), addable = menu.addable || (menu.mode === 'in' ? menu.options : []), cap = menu.cap || 1;
    this.title.textContent = `Stall (${inside.length + (menu.others || 0)}/${cap})`;
    const row = (o, act) => `<div class="stRow"><button class="stPony" data-act="${act}" data-id="${esc(o.id)}">${esc(o.name)}${sex(o)}<small>${esc(kind(o.type))} &middot; Lv ${o.level}</small></button>` +
      (act === 'out' ? `<button class="stRoam" data-act="roam" data-id="${esc(o.id)}" title="Let it out to roam the village">Let out</button>` : '') + '</div>';
    let html = '';
    if (menu.gate) html += `<button class="stGate" data-act="gate">${menu.gate.open ? 'Close the gate' : 'Open the gate'}</button>`;
    if (inside.length) html += `<p class="stHint">In this stall: take one out</p>` + inside.map(o => row(o, 'out')).join('');
    if (addable.length) html += `<p class="stHint">${inside.length ? 'Add another pony (up to ' + cap + ' share a stall)' : 'Which pony goes in this stall?'}</p>` + addable.map(o => row(o, 'in')).join('');
    else if (!inside.length) html += '<p class="stHint">No pony of yours is on a leash. Press Leash beside a pony of yours, then come back.</p>';
    else if (inside.length + (menu.others || 0) >= cap) html += `<p class="stHint">This stall is full (${cap} ponies).</p>`;
    else html += '<p class="stHint">To add another pony, put it on a leash (the Leash button) and come back.</p>';
    this.body.innerHTML = html;
    this.body.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.pick(b.dataset.act, b.dataset.id)));
  }
  pick(act, animal) {
    const m = this.menu; if (!m) return;
    this.game.stallPick({ act, animal: animal || '', fx: m.fx, fy: m.fy });
    this.close();
  }
}
