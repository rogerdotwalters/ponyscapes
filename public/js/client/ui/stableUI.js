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
    const inside = menu.inside || (menu.mode === 'out' ? menu.options : []), addable = menu.addable || (menu.mode === 'in' ? menu.options : []), cap = menu.cap || 1, care = menu.care;
    this.title.textContent = `${menu.name || 'Stall'} (${inside.length + (menu.others || 0)}/${cap})`;
    const bar = (cls, icon, v) => `<div class="stBar ${cls}" title="${v}%"><b>${icon}</b><i><u style="width:${Math.max(0, Math.min(100, v))}%"></u></i></div>`;
    const stats = o => (o.care ? `<div class="stStats">${bar('hun', '\uD83C\uDF4E', o.care[0])}${bar('thi', '\uD83D\uDCA7', o.care[1])}${bar('hap', o.care[2] < 30 ? '\u2639' : '\u263A', o.care[2])}<span class="stHearts" title="Friendship">\u2665 ${o.care[3]}</span></div>` : '');
    const row = (o, act) => `<div class="stCard ${o.sex === 'f' ? 'f' : o.sex ? 'm' : ''}">` +
      `<div class="stInfo">${sexTag(o)}<div class="stName">${esc(o.name)}<small>${esc(kind(o.type))} &middot; Lv ${o.level}</small></div></div>${stats(o)}` +
      (o.locked ? '<div class="stLock">\u2764 Breeding: they cannot be touched until the foal is born</div>' : '<div class="stActs">' +
        (act === 'out' ? `<button class="stTake" data-act="out" data-id="${esc(o.id)}">Take out</button><button class="stRoam" data-act="roam" data-id="${esc(o.id)}" title="Let it out to roam the village">Let out</button>`
          : `<button class="stAdd" data-act="in" data-id="${esc(o.id)}">Add to stall</button>`) + '</div>') + '</div>';
    const section = t => `<h4 class="stHead">${t}</h4>`;
    const coins = n => `${n} coin${n === 1 ? '' : 's'}`;
    const bowlRow = (label, icon, what, b) => {
      const up = b.upCost === null ? '<button disabled>Biggest bowl</button>' : `<button class="stUp" data-act="care" data-what="up${what}"${care.mine ? '' : ' disabled'}>Bigger bowl &middot; ${coins(b.upCost)}</button>`;
      const auto = b.auto ? '<button class="stOn" disabled>Automated \u2713</button>' : !b.tank ? `<button disabled title="Buy a ${label.toLowerCase()} tank at the stable desk">Auto: needs a tank</button>`
        : b.room <= 0 ? '<button disabled title="Buy another or a bigger tank at the desk">Auto: tank is full</button>' : `<button class="stAuto" data-act="care" data-what="auto${what}"${care.mine ? '' : ' disabled'}>Automate &middot; ${coins(b.autoCost)}</button>`;
      return `<div class="stBowl"><div class="stBowlHead"><b>${icon} ${label} bowl</b><span>Lv ${b.level + 1} &middot; ${b.units}/${b.size}</span></div>${bar(what === 'Food' ? 'hun' : 'thi', icon, Math.round(b.units / b.size * 100))}` +
        `<div class="stActs"><button class="stFill" data-act="care" data-what="fill${what}">${what === 'Food' ? 'Fill with apples' : 'Fill with water'}</button>${up}${auto}</div></div>`;
    };
    let html = `<div class="stRename"><input id="stName" maxlength="16" value="${esc(menu.name || '')}" aria-label="Stable name" autocomplete="off"><button data-act="rename">Rename</button></div>`;
    if (menu.gate) html += `<button class="stGate${menu.gate.open ? ' open' : ''}" data-act="gate">${menu.gate.open ? '\uD83D\uDEAA Close the gate' : '\uD83D\uDEAA Open the gate'}</button>`;
    const br = menu.breed;
    if (br && (inside.length || br.busy)) {                       // breeding: exactly two of your ponies, a stallion and a mare, alone in the stall
      const pair = inside.length === 2 ? `<div class="stPair">${sexTag(inside[0])}<b>${esc(inside[0].name)}</b><i>\u2764</i><b>${esc(inside[1].name)}</b>${sexTag(inside[1])}</div>` : '';
      html += section('Breeding') + '<div class="stBreedBox">' + pair;
      if (br.busy) html += `<p class="stHint">Breeding... ${br.pct}%</p><div class="stProg"><i style="width:${Math.max(0, Math.min(100, br.pct | 0))}%"></i></div><button class="stStop" data-act="breedStop">Stop breeding</button>`;
      else html += `<button class="stBreed${br.can ? '' : ' off'}" data-act="breed"${br.can ? '' : ' disabled'}>\u2764 Breed these two</button>` + (br.can ? '' : `<p class="stHint">${esc(br.reason)}</p>`);
      html += '</div>';
    }
    if (inside.length) html += section('In this stall') + inside.map(o => row(o, 'out')).join('');
    if (care) html += section('Food &amp; water') + bowlRow('Food', '\uD83C\uDF4E', 'Food', care.food) + bowlRow('Water', '\uD83D\uDCA7', 'Water', care.water) +
      `<div class="stBowl"><div class="stBowlHead"><b>\uD83D\uDECF Bedding</b><span>Lv ${care.comfort.level + 1}</span></div><div class="stActs">` +
      (care.comfort.upCost === null ? '<button disabled>Comfiest</button>' : `<button class="stUp" data-act="care" data-what="upComfort"${care.mine ? '' : ' disabled'}>Comfier stall &middot; ${coins(care.comfort.upCost)}</button>`) + `</div></div>` +
      `<p class="stHint">Stable desk bank: ${coins(care.bank)} (upgrades are paid from it)</p>`;
    if (addable.length) html += section(inside.length ? (care ? 'A mate may join to breed' : `Add another pony (up to ${cap} share a stall)`) : 'Which pony goes in this stall?') + addable.map(o => row(o, 'in')).join('');
    else if (!inside.length) html += '<p class="stHint">No pony of yours is on a leash. Press Leash beside a pony of yours, then come back.</p>';
    else if (inside.length + (menu.others || 0) >= cap) html += `<p class="stHint">${care ? 'Every pony has its own stall. Only a stallion and a mare can share one, to breed.' : `This stall is full (${cap} ponies).`}</p>`;
    else html += '<p class="stHint">To add another pony, put it on a leash (the Leash button) and come back.</p>';
    this.body.innerHTML = html;
    this.body.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.pick(b.dataset.act, b.dataset.id, b.dataset.act === 'rename' ? this.body.querySelector('#stName').value : b.dataset.what)));
  }
  /** The stable desk (shared/ponyCare.js): the bank for pony coins and the office for tanks. @param {{fx, fy, bank, food, water, mine}} d */
  showDesk(d) {
    this.requestOpen();
    this.menu = { desk: true, fx: d.fx, fy: d.fy };
    this.title.textContent = 'Stable Desk';
    const coins = n => `${n} coin${n === 1 ? '' : 's'}`;
    const tank = (kind, label, icon, t) => `<div class="stBowl"><div class="stBowlHead"><b>${icon} ${label} tank</b><span>${t.count ? `${t.count} of ${t.max} &middot; Lv ${t.size}` : 'none yet'}</span></div>` +
      `<p class="stHint">${t.count ? `Feeds ${t.supply} stalls (${t.used} connected). Open a stall's menu and press Automate to connect it.` : `Buy one to automate stalls. Each tank feeds ${t.perTank} stalls.`}</p><div class="stActs">` +
      (t.buyCost === null ? '<button disabled>All tanks bought</button>' : `<button class="stUp" data-desk="buyTank" data-kind="${kind}"${d.mine ? '' : ' disabled'}>${t.count ? 'Another tank' : 'Buy a tank'} &middot; ${coins(t.buyCost)}</button>`) +
      (t.count ? (t.upCost === null ? '<button disabled>Biggest tanks</button>' : `<button class="stAuto" data-desk="upTank" data-kind="${kind}"${d.mine ? '' : ' disabled'}>Bigger tanks &middot; ${coins(t.upCost)}</button>`) : '') + '</div></div>';
    this.body.innerHTML = `<h4 class="stHead">Bank</h4><div class="stBowl"><div class="stBowlHead"><b>\uD83E\uDE99 Pony coins</b><span>${d.bank} stored</span></div>` +
      `<p class="stHint">Keep your pony coins here: stall upgrades and tanks are paid from the bank.</p><div class="stActs"><button class="stTake" data-desk="storage">Open the bank</button></div></div>` +
      `<h4 class="stHead">Tanks</h4>` + tank('water', 'Water', '\uD83D\uDCA7', d.water) + tank('food', 'Food', '\uD83C\uDF4E', d.food) + (d.mine ? '' : '<p class="stHint">This is not your stable.</p>');
    this.body.querySelectorAll('button[data-desk]').forEach(b => b.addEventListener('click', () => {
      this.game.deskPick({ act: b.dataset.desk, kind: b.dataset.kind || '', fx: d.fx, fy: d.fy });
      if (b.dataset.desk === 'storage') this.close();
    }));
  }
  pick(act, animal, what) {
    const m = this.menu; if (!m || m.desk) return;
    this.game.stallPick({ act, animal: animal || '', fx: m.fx, fy: m.fy, what: what || '' });
    if (act !== 'care' && act !== 'rename') this.close();                           // (the care buttons keep the menu open: the server sends it again with the new numbers)
  }
}
