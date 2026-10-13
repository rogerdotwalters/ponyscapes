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
    const sexTag = o => { if (!o.sex) return ''; const s = PonyLook.sexInfo(o.sex); return `<span class="stSex ${o.sex === 'f' ? 'f' : 'm'}" title="${s.name}" aria-label="${s.name}">${s.symbol}</span>`; };
    const inside = menu.inside || (menu.mode === 'out' ? menu.options : []), addable = menu.addable || (menu.mode === 'in' ? menu.options : []), cap = menu.cap || 1;
    this.title.textContent = `Stall (${inside.length + (menu.others || 0)}/${cap})`;
    const row = (o, act) => `<div class="stCard ${o.sex === 'f' ? 'f' : o.sex ? 'm' : ''}">` +
      `<div class="stInfo">${sexTag(o)}<div class="stName">${esc(o.name)}<small>${esc(kind(o.type))} &middot; Lv ${o.level}</small></div></div>` +
      `<div class="stActs">` +
      (act === 'out' ? `<button class="stTake" data-act="out" data-id="${esc(o.id)}">Take out</button><button class="stRoam" data-act="roam" data-id="${esc(o.id)}" title="Let it out to roam the village">Let out</button>`
        : `<button class="stAdd" data-act="in" data-id="${esc(o.id)}">Add to stall</button>`) + '</div></div>';
    const section = t => `<h4 class="stHead">${t}</h4>`;
    let html = '';
    if (menu.gate) html += `<button class="stGate${menu.gate.open ? ' open' : ''}" data-act="gate">${menu.gate.open ? '\ud83d\udeaa Close the gate' : '\ud83d\udeaa Open the gate'}</button>`;
    const br = menu.breed;
    if (br && (inside.length || br.busy)) {                       // breeding: exactly two of your ponies, a stallion and a mare, alone in the stall
      const pair = inside.length === 2 ? `<div class="stPair">${sexTag(inside[0])}<b>${esc(inside[0].name)}</b><i>\u2764</i><b>${esc(inside[1].name)}</b>${sexTag(inside[1])}</div>` : '';
      html += section('Breeding') + '<div class="stBreedBox">' + pair;
      if (br.busy) html += `<p class="stHint">Breeding... ${br.pct}%</p><div class="stProg"><i style="width:${Math.max(0, Math.min(100, br.pct | 0))}%"></i></div><button class="stStop" data-act="breedStop">Stop breeding</button>`;
      else html += `<button class="stBreed${br.can ? '' : ' off'}" data-act="breed"${br.can ? '' : ' disabled'}>\u2764 Breed these two</button>` + (br.can ? '' : `<p class="stHint">${esc(br.reason)}</p>`);
      html += '</div>';
    }
    if (inside.length) html += section('In this stall') + inside.map(o => row(o, 'out')).join('');
    if (addable.length) html += section(inside.length ? `Add another pony (up to ${cap} share a stall)` : 'Which pony goes in this stall?') + addable.map(o => row(o, 'in')).join('');
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
