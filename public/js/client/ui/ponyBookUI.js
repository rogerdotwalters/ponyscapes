'use strict';
/* CLIENT - the Pony Book: the four kinds of pony you can collect (earth, pegasus, unicorn, alicorn) and every animal you
 * keep, with a portrait, its name, and whether it is on a leash, roaming near home or safe in a pen. */
const PONY_KIND_COLORS = { pony_plain: '#d7ccc8', pony_earth: '#8bc34a', pony_pegasus: '#64b5f6', pony_unicorn: '#ce93d8', pony_alicorn: '#ffd54f' };

class PonyBookUI {
  constructor({ panel, body, closeButton, game }) {
    this.panel = panel; this.body = body; this.game = game;
    closeButton.addEventListener('click', () => this.close());
    this.view = null; this.herd = null;                                                                      // view: the family tree being shown (the server's 'lineage' event); herd: the herd's diversity ('herdGenetics')
    body.addEventListener('click', e => {
      const b = e.target.closest('button.prelease'); if (b) { this.game.requestReleasePet(b.dataset.id); return; }
      const t = e.target.closest('button.gtree'); if (t) { this.game.lineage(t.dataset.id); return; }
      if (e.target.closest('button.gbackbtn')) { this.view = null; this.refresh(); }
    });
    body.addEventListener('change', e => { if (e.target.classList.contains('gtog')) GeneticsView.set(e.target.checked); });
    GeneticsView.onChange(() => { if (this.isOpen) { this._askHerd(); this.refresh(); } });
    game.events.on('lineage', e => { this.view = e; if (this.isOpen) this.refresh(); });
    game.events.on('herdGenetics', e => { this.herd = e.herd; if (this.isOpen && !this.view) this.refresh(); });
    game.events.on('petsChanged', () => this.isOpen && this._refreshSoon());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.view = null; this._askHerd(); this.refresh(); }
  close() { this.panel.hidden = true; }
  /** With the genetics switch on, ask the server for the herd's diversity (it changes when a foal is born or a pony leaves). */
  _askHerd() { if (GeneticsView.on && this.game.hasPony()) this.game.herdGenetics(); }

  /** What the panel actually shows: positions are NOT part of it, so ponies wandering about never rebuild the buttons under a finger. */
  _signature() {
    const g = this.game;
    return JSON.stringify([g.pets.map(p => [p.id, p.type, p.level, p.look, p.leashed, p.inPen, p.penArea, p.gentling, p.riding, p.foalMin, p.xp && p.xp.into, p.main, p.stalled, p.roam, p.gen]), g.book, g.varieties, GeneticsView.on, g.pets.length]);
  }
  _refreshSoon() {                                      // pets arrive every snapshot: redraw only when what is shown changed (a rebuild in the middle of a tap loses the tap)
    const sig = this._signature();
    if (sig !== this.lastSignature) this.refresh();
  }

  /** Rarity badge, buffs and abilities of a pony. */
  static traits(look, type, level = 1) {
    const t = PonyRarity.of(look, type), r = t.rarity;
    const buffs = t.buffs.map(b => `<span class="pbuff" title="${b.description}${b.affectsOthers ? ` (and everyone within ${b.range} tiles)` : ''}">${b.name}: ${b.label}${b.affectsOthers ? ' \u25CE' : ''}</span>`);
    const active = t.abilities.filter(a => !a.passive), abilities = t.abilities.map(a => `<span class="pability" style="--c:${a.color}" title="${a.description}${a.passive ? '' : ` (${a.cooldown}s)`}">${a.glyph} ${a.name}${a.passive ? '' : ` <kbd>${['H', 'K', 'Y', 'O'][active.indexOf(a)]}</kbd>`}</span>`);
    const tree = PonySkills.tree(look, type, level), slots = active.length;                                                   // the skill tree: unlocked as the pony levels up (data/ponies/skills.js)
    const skills = tree.map((s, i) => s.ability ? `<span class="pability${s.unlocked ? '' : ' locked'}" style="--c:${s.ability.color}" title="${s.ability.description} (${s.ability.cooldown}s) \u00b7 ${s.text}">${s.ability.glyph} ${s.name}${s.unlocked ? ` <kbd>${['H', 'K', 'Y', 'O'][slots + tree.slice(0, i).filter(q => q.unlocked).length]}</kbd>` : ` <small>(level ${s.level})</small>`}</span>` : `<span class="pability locked" title="${s.text}">${s.label} <small>(level ${s.level})</small></span>`);
    return `<div class="ptraits"><span class="prarity" style="--c:${r.color}">${r.name}</span>${buffs.join('')}${abilities.join('')}${skills.join('')}${!buffs.length && !abilities.length && !skills.length ? '<span class="pbuff">No special traits</span>' : ''}</div>`;
  }

  static status(pet) {
    if (pet.gentling) {                                                          // a caught wild pony: stay near it to calm it
      const g = pet.gentling, fruit = g.item && ItemDefs[g.item] ? ItemDefs[g.item].name : 'apple';
      return `Stay within ${ROPE_CALM_RANGE} tiles until it calms down (don't let the rope pull tight). A ${fruit} (Feed) speeds it up: ${g.have}/${g.need} fed.<div class="tameBar" title="Calm"><i style="width:${Math.round((g.progress || 0) * 100)}%"></i></div>`;
    }
    if (pet.stalled) return 'Resting in its stall in the stable';
    if (pet.roam) return 'Out roaming the village';
    if (pet.riding) return pet.main ? '\u2605 Your main pony: carrying you' : 'Carrying you (make it your main pony in the bag: I)';
    if (pet.main) return '\u2605 Your main pony: follows you everywhere';
    if (pet.leashed) return 'Following you on a leash';
    if (pet.inPen) return `Safe in a pen (${pet.penArea} tiles)`;
    return 'Roaming near its home';
  }

  refresh() {
    this.lastRefresh = performance.now(); this.lastSignature = this._signature();
    if (this.view) { this.body.innerHTML = GeneticsView.lineageHtml(this.view); return; }
    const g = this.game, owned = g.pets.filter(p => !p.gentling).length;
    const kinds = g.book.map(k => {
      const def = AnimalDefs[k.type], color = PONY_KIND_COLORS[k.type] || rarityOf(def.rarity).color;
      return `<div class="pkind${k.seen ? ' got' : ''}" style="--c:${color}" title="${PonyBookUI.lassoNeed(k.type)}"><b>${k.seen ? '\u2713' : '?'}</b><span>${def.name}</span><i>${k.owned ? '\u00d7' + k.owned : ''}</i></div>`;
    }).join('');
    const order = g.pets.map((pet, i) => i).sort((a, b) => (!!g.pets[b].gentling - !!g.pets[a].gentling) || (!!g.pets[b].leashed - !!g.pets[a].leashed));   // ponies you are gentling first (they need you), then ones on a rope
    const cards = order.map(i => {
      const pet = g.pets[i], def = AnimalDefs[pet.type], name = pet.look ? PonyLook.describe(pet.look).name : def.name;
      const mystical = def.mystical ? '<em>mystical</em>' : '';
      const flies = PonyAbilityRules.has(pet.type, 'fly') ? '<em class="pfly">can fly (' + PonyAbilities.get('fly').key + ')</em>' : '';
      const traits = pet.look ? PonyBookUI.traits(pet.look, pet.type, pet.level) : '';
      return `<div class="pcard"><canvas class="portrait" width="92" height="80" data-i="${i}"></canvas>` +
        `<div class="pinfo"><div class="pname">${name} ${mystical} ${flies}<span class="plv">Lv ${pet.level || 1}</span></div><div class="ptype">${pet.look ? PonyLook.describe(pet.look).variantName + ' ' : ''}${def.name}${pet.foalMin ? ' (foal: grown in ' + pet.foalMin + ' min)' : ''}${pet.look ? ' &middot; ' + PonyLook.sexInfo(PonyLook.sexOf(pet.look)).symbol + ' ' + PonyLook.sexInfo(PonyLook.sexOf(pet.look)).name : ''}</div>${traits}${PonyBookUI.genes(pet)}${GeneticsView.cardHtml(pet)}${PonyBookUI.growth(pet)}<div class="pstat">${PonyBookUI.status(pet)}</div>${pet.gentling || pet.leashed ? `<button class="prelease" data-id="${pet.id}">${pet.gentling ? 'Let go' : 'Untie'}</button>` : ''}</div></div>`;
    }).join('');
    const summary = `<div class="gsum">Collected ${g.book.filter(k => k.seen).length} of ${g.book.length} pony kinds &middot; ${owned} animal${owned === 1 ? '' : 's'} kept</div>`;
    const varieties = (g.varieties || []).map(v => {
      const color = v.index ? PonyVariants[v.index].coats[0] : PonyPalette.coats[1];
      return `<div class="pkind pvar${v.seen ? ' got' : ''}" style="--c:${color}"><b>${v.seen ? '\u2713' : '?'}</b><span>${v.seen ? v.name : '???'}</span><i>${BiomeNames[v.biome] || v.when || (v.id === "moon" ? "Only after dark" : "Retired")}${v.theme ? " \u00b7 " + v.theme : ""}</i></div>`;
    }).join('');
    const varHtml = varieties ? `<div class="gtitle">Pony varieties <small>one lives in each biome; sky ponies come out in the right weather or hour</small></div><div class="pkinds pvars">${varieties}</div>` : '';
    const kindsHtml = `<div class="pkinds">${kinds}</div>${varHtml}`;
    const animalsHtml = '<div class="gtitle">Your animals</div>' + (cards || '<div class="gempty">Nothing yet. Throw your lasso at a wild pony, then stay close until it calms down. Apples help.</div>');
    const gentling = g.pets.some(p => p.gentling);                               // a pony you are gentling needs you: show it before the collection grid
    const genetics = `<div class="gbar">${GeneticsView.toggleHtml()}</div>${GeneticsView.on ? GeneticsView.herdHtml(this.herd) : ''}`;
    this.body.innerHTML = summary + (owned ? genetics : '') + (gentling ? animalsHtml + kindsHtml : kindsHtml + animalsHtml);
    this.body.querySelectorAll('canvas.portrait').forEach(canvas => {
      const pet = g.pets[Number(canvas.dataset.i)];
      if (pet) renderAnimalPortrait(canvas, pet.type, pet.look);
    });
  }
  /** Top speed and how far to the next level (ponies you own): riding, work in the saddle, food and grooming all count. */
  /** The pony's genes as they show (eyes, mane, tail, body, hooves, head), with a swatch for each colour that is not the classic one. */
  static genes(pet) {
    if (!pet.look) return '';
    const rows = PonyLook.describe(pet.look).gene.traits.map(t => `${t.color ? `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.color};margin-right:3px"></i>` : ''}${t.part}: ${t.text}`);
    return `<div class="pgenes"><small>${rows.join(' &middot; ')}</small></div>`;
  }
  static growth(pet) {
    if (!pet.xp || !AnimalDefs[pet.type].pony) return '';
    const speed = PonySpeed.top(pet.type, pet.level), pct = Math.round(pet.xp.fraction * 100);
    return `<div class="pgrow" title="XP from riding, working in the saddle, treats and grooming"><span>Speed ${speed.toFixed(1)} &middot; next level ${pet.xp.into}/${pet.xp.need}</span><i style="--p:${pct}%"></i></div>`;
  }
  /** Which lasso holds a kind of pony. */
  static lassoNeed(type) {
    const tier = AnimalDefs[type].lassoTier || 1, lasso = Object.values(ItemDefs).filter(d => d.lasso && d.lasso.tier >= tier).sort((a, b) => a.lasso.tier - b.lasso.tier)[0];
    return `Needs a ${lasso ? lasso.name : 'tier ' + tier + ' lasso'} (or better) to catch; base speed ${PonySpeed.base(type).toFixed(1)}`;
  }

}
