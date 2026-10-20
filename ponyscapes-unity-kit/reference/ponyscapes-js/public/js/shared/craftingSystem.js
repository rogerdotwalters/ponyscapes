'use strict';
/* SHARED - crafting rules. The client uses canCraft() to enable buttons; the server uses craft() as the authority.
 * `stations` is the Set of station ids within reach of the crafter (BuildSystem.stationsNear).
 * `supply` (optional, a StockSupply) is the town's stockpiles linked to those stations: ingredients you do not carry are pulled from it,
 * and outputs your pack cannot hold (you carry only so many stacks of wood, stone and clay) are stored in it. */
const NO_SUPPLY = Object.freeze({ empty: true, count: () => 0, take: () => 0, put: (item, n) => n, clone() { return this; } });

const CraftingSystem = {
  /** How many of an ingredient are within reach: your pack plus the linked stockpiles. */
  available(inventory, item, supply = NO_SUPPLY) { return inventory.count(item) + supply.count(item); },
  hasIngredients(inventory, recipe, supply = NO_SUPPLY) { return recipe.ingredients.every(i => CraftingSystem.available(inventory, i.item, supply) >= i.count); },
  hasTools(inventory, recipe) { return recipe.tools.every(t => inventory.has(t, 1)); },
  hasStation(recipe, stations) { const need = stationList(recipe); return !need.length || need.some(id => stations.has(id)); },

  /** Take the ingredients (pack first, then stockpiles) and hand out the outputs (pack first, then stockpiles). False if an output had nowhere to go. */
  _apply(inventory, recipe, supply) {
    for (const i of recipe.ingredients) {
      const fromPack = Math.min(inventory.count(i.item), i.count);
      if (fromPack) inventory.remove(i.item, fromPack);
      if (i.count > fromPack) supply.take(i.item, i.count - fromPack);
    }
    return recipe.outputs.every(o => supply.put(o.item, inventory.add(o.item, o.count)) === 0);
  },

  /** Everything is in place AND the outputs would fit once the ingredients are gone. */
  canCraft(inventory, recipe, stations = new Set(), supply = NO_SUPPLY) {
    if (!this.hasStation(recipe, stations) || !this.hasTools(inventory, recipe) || !this.hasIngredients(inventory, recipe, supply)) return false;
    return this._apply(inventory.clone(), recipe, supply.clone());
  },

  /** @returns {{ok:boolean, reason?:string, outputs?:Array, usedSupply?:boolean}} */
  craft(inventory, recipeId, stations = new Set(), supply = NO_SUPPLY) {
    const recipe = RecipeDefs[recipeId];
    if (!recipe) return { ok: false, reason: 'Unknown recipe' };
    if (!this.hasStation(recipe, stations)) return { ok: false, reason: 'Needs a ' + stationList(recipe).map(id => StationNames[id]).join(' or ') + ' nearby' };
    const missingTool = recipe.tools.find(t => !inventory.has(t, 1));
    if (missingTool) return { ok: false, reason: 'You need a ' + ItemDefs[missingTool].name };
    if (!this.hasIngredients(inventory, recipe, supply)) return { ok: false, reason: 'Missing ingredients' };
    if (!this.canCraft(inventory, recipe, stations, supply)) return { ok: false, reason: supply.empty ? 'No room: your pack is full (or you carry all the stacks of that resource you can)' : 'No room in your pack or the stockpiles' };
    this._apply(inventory, recipe, supply);
    return { ok: true, outputs: recipe.outputs, usedSupply: !supply.empty };
  }
};
