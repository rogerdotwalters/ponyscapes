'use strict';
/* CLIENT - the Pony Book: the four kinds of pony you can collect (earth, pegasus, unicorn, alicorn) and every animal you
 * keep, with a portrait, its name, and whether it is on a leash, roaming near home or safe in a pen. */
const PONY_KIND_COLORS = { pony_earth: '#8bc34a', pony_pegasus: '#64b5f6', pony_unicorn: '#ce93d8', pony_alicorn: '#ffd54f' };

class PonyBookUI {
  constructor({ panel, body, closeButton, game }) {
    this.panel = panel; this.body = body; this.game = game;
    closeButton.addEventListener('click', () => this.close());
    body.addEventListener('click', e => { const b = e.target.closest('button.prelease'); if (b) this.game.requestReleasePet(b.dataset.id); });
    game.events.on('petsChanged', () => this.isOpen && this._refreshSoon());
  }
  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }

  /** What the panel actually shows: positions are NOT part of it, so ponies wandering about never rebuild the buttons under a finger. */
  _signature() {
    const g = this.game;
    return JSON.stringify([g.pets.map(p => [p.id, p.type, p.level, p.look, p.leashed, p.inPen, p.penArea, p.gentling, p.riding]), g.book, g.varieties]);
  }
  _refreshSoon() {                                      // pets arrive every snapshot: redraw only when what is shown changed (a rebuild in the middle of a tap loses the tap)
    const sig = this._signature();
    if (sig !== this.lastSignature) this.refresh();
  }

  static status(pet) {
    if (pet.gentling) {                                                          // a caught wild pony
      const g = pet.gentling, apples = `${g.have}/${g.need} apples`;
      return g.sheltered ? `Calm in shelter: ${apples}. Hold an apple and press Feed.` : `Wild, on your lasso (${apples}). Lead it to a stable or closed pen${g.restless >= 50 ? ' - it is getting restless!' : ''}`;
    }
    if (pet.riding) return 'Carrying you';
    if (pet.leashed) return 'Following you on a leash';
    if (pet.inPen) return `Safe in a pen (${pet.penArea} tiles)`;
    return 'Roaming near its home';
  }

  refresh() {
    this.lastRefresh = performance.now(); this.lastSignature = this._signature();
    const g = this.game, owned = g.pets.filter(p => !p.gentling).length;
    const kinds = g.book.map(k => {
      const def = AnimalDefs[k.type], color = PONY_KIND_COLORS[k.type];
      return `<div class="pkind${k.seen ? ' got' : ''}" style="--c:${color}"><b>${k.seen ? '\u2713' : '?'}</b><span>${def.name}</span><i>${k.owned ? '\u00d7' + k.owned : ''}</i></div>`;
    }).join('');
    const order = g.pets.map((pet, i) => i).sort((a, b) => (!!g.pets[b].gentling - !!g.pets[a].gentling) || (!!g.pets[b].leashed - !!g.pets[a].leashed));   // ponies you are gentling first (they need you), then ones on a rope
    const cards = order.map(i => {
      const pet = g.pets[i], def = AnimalDefs[pet.type], name = pet.look ? PonyLook.describe(pet.look).name : def.name;
      const mystical = def.mystical ? '<em>mystical</em>' : '';
      return `<div class="pcard"><canvas class="portrait" width="92" height="80" data-i="${i}"></canvas>` +
        `<div class="pinfo"><div class="pname">${name} ${mystical}<span class="plv">Lv ${pet.level || 1}</span></div><div class="ptype">${PonyLook.describe(pet.look).variantName} ${def.name}</div><div class="pstat">${PonyBookUI.status(pet)}</div>${pet.gentling || pet.leashed ? `<button class="prelease" data-id="${pet.id}">${pet.gentling ? 'Let go' : 'Untie'}</button>` : ''}</div></div>`;
    }).join('');
    const summary = `<div class="gsum">Collected ${g.book.filter(k => k.seen).length} of ${g.book.length} pony kinds &middot; ${owned} animal${owned === 1 ? '' : 's'} kept</div>`;
    const varieties = (g.varieties || []).map(v => {
      const color = v.index ? PonyVariants[v.index].coats[0] : PonyPalette.coats[1];
      return `<div class="pkind pvar${v.seen ? ' got' : ''}" style="--c:${color}"><b>${v.seen ? '\u2713' : '?'}</b><span>${v.seen ? v.name : '???'}</span><i>${BiomeNames[v.biome]}</i></div>`;
    }).join('');
    const varHtml = varieties ? `<div class="gtitle">Biome ponies <small>one kind lives in each biome</small></div><div class="pkinds pvars">${varieties}</div>` : '';
    const kindsHtml = `<div class="pkinds">${kinds}</div>${varHtml}`;
    const animalsHtml = '<div class="gtitle">Your animals</div>' + (cards || '<div class="gempty">Nothing yet. Hold an apple to calm a wild pony, then throw your lasso at it. Lead it to a stable (or a closed fenced pen) and feed it apples to tame it.</div>');
    const gentling = g.pets.some(p => p.gentling);                               // a pony you are gentling needs you: show it before the collection grid
    this.body.innerHTML = summary + (gentling ? animalsHtml + kindsHtml : kindsHtml + animalsHtml);
    this.body.querySelectorAll('canvas.portrait').forEach(canvas => {
      const pet = g.pets[Number(canvas.dataset.i)];
      if (pet) renderAnimalPortrait(canvas, pet.type, pet.look);
    });
  }
}
