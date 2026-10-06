'use strict';
/* CLIENT - crafting panel. Lists RecipeDefs; shows ingredients, the tools you must carry, the station you must stand
 * next to, and what is missing. The server re-checks everything. */
class CraftingUI {
  constructor({ panel, list, closeButton, game }) {
    this.panel = panel; this.game = game; this.sinceRefresh = 0;
    this.rows = Object.values(RecipeDefs).map(recipe => this._createRow(recipe, list));
    closeButton.addEventListener('click', () => this.close());
    game.events.on('inventoryChanged', () => this.refresh());
    game.events.on('stockpilesChanged', () => this.isOpen && this.refresh());
    this.refresh();
  }

  get isOpen() { return !this.panel.hidden; }
  open() { this.panel.hidden = false; this.refresh(); }
  close() { this.panel.hidden = true; }

  /** Stations come and go as you walk around, so while the panel is open it re-checks a few times a second. */
  tick(frameMs) { if (this.isOpen && (this.sinceRefresh += frameMs) > 250) { this.sinceRefresh = 0; this.refresh(); } }

  _createRow(recipe, list) {
    const output = recipe.outputs[0];
    const el = document.createElement('div');
    el.className = 'recipe';
    const chip = (item, text, cls = '') => `<span class="need ${cls}"><img alt="" src="${ItemIcons.url(item)}"><b>${text}</b></span>`;
    el.innerHTML =
      `<div class="out"><img alt="" src="${ItemIcons.url(output.item)}"><span class="qty">${output.count > 1 ? output.count : ''}</span></div>` +
      `<div class="info"><div class="name">${recipe.name}</div><div class="needs">` +
      recipe.ingredients.map(i => chip(i.item, '')).join('') +
      recipe.tools.map(t => chip(t, '', 'tool')).join('') +
      `</div><div class="where"></div></div><button class="craftBtn" tabindex="-1">Craft</button>`;
    const button = el.querySelector('.craftBtn');
    button.addEventListener('click', () => this.game.craft(recipe.id));
    list.appendChild(el);
    const chips = [...el.querySelectorAll('.need')];
    return { recipe, el, button, ingredientChips: chips.slice(0, recipe.ingredients.length), toolChips: chips.slice(recipe.ingredients.length), where: el.querySelector('.where') };
  }

  refresh() {
    const stations = this.game.nearbyStations(), supply = this.game.nearbySupply();     // a crafting table pulls from the stockpiles linked to it
    const lasso = this.game.gear.lasso, inventory = lasso ? this.game.inventory.clone() : this.game.inventory;
    if (lasso) inventory.add(lasso, 1);                                                 // the lasso in its slot counts too (the next lasso is made from it)
    for (const row of this.rows) {
      const { recipe } = row;
      recipe.ingredients.forEach((ing, i) => {
        const have = CraftingSystem.available(inventory, ing.item, supply), stored = supply.count(ing.item);
        row.ingredientChips[i].querySelector('b').textContent = `${have}/${ing.count}`;
        row.ingredientChips[i].classList.toggle('missing', have < ing.count);
        row.ingredientChips[i].classList.toggle('stocked', stored > 0);
        row.ingredientChips[i].title = `${ItemDefs[ing.item].name}: ${inventory.count(ing.item)} in your pack` + (stored ? `, ${stored} in the stockpiles` : '');
      });
      recipe.tools.forEach((tool, i) => {
        const has = inventory.has(tool, 1);
        row.toolChips[i].querySelector('b').textContent = ItemDefs[tool].name;
        row.toolChips[i].classList.toggle('missing', !has);
      });
      const stationOk = CraftingSystem.hasStation(recipe, stations);
      row.where.textContent = recipe.station ? (stationOk ? 'at the ' : 'needs a ') + StationNames[recipe.station] : '';
      row.where.classList.toggle('missing', !stationOk);
      row.button.disabled = !CraftingSystem.canCraft(inventory, recipe, stations, supply);
    }
  }
}
