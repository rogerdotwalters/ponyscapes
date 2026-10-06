'use strict';
/* SHARED - crafting rules. The client uses canCraft() to enable buttons; the server uses craft() as the authority.
 * `stations` is the Set of station ids within reach of the crafter (BuildSystem.stationsNear). */
const CraftingSystem = {
  hasIngredients(inventory, recipe) { return recipe.ingredients.every(i => inventory.has(i.item, i.count)); },
  hasTools(inventory, recipe) { return recipe.tools.every(t => inventory.has(t, 1)); },
  hasStation(recipe, stations) { const need = stationList(recipe); return !need.length || need.some(id => stations.has(id)); },

  /** Everything is in place AND the outputs would fit once the ingredients are gone. */
  canCraft(inventory, recipe, stations = new Set()) {
    if (!this.hasStation(recipe, stations) || !this.hasTools(inventory, recipe) || !this.hasIngredients(inventory, recipe)) return false;
    const trial = Inventory.fromJSON(inventory.toJSON());
    recipe.ingredients.forEach(i => trial.remove(i.item, i.count));
    return recipe.outputs.every(o => trial.add(o.item, o.count) === 0);
  },

  /** @returns {{ok:boolean, reason?:string, outputs?:Array}} */
  craft(inventory, recipeId, stations = new Set()) {
    const recipe = RecipeDefs[recipeId];
    if (!recipe) return { ok: false, reason: 'Unknown recipe' };
    if (!this.hasStation(recipe, stations)) return { ok: false, reason: 'Needs a ' + stationList(recipe).map(id => StationNames[id]).join(' or ') + ' nearby' };
    const missingTool = recipe.tools.find(t => !inventory.has(t, 1));
    if (missingTool) return { ok: false, reason: 'You need a ' + ItemDefs[missingTool].name };
    if (!this.hasIngredients(inventory, recipe)) return { ok: false, reason: 'Missing ingredients' };
    if (!this.canCraft(inventory, recipe, stations)) return { ok: false, reason: 'Inventory full' };
    recipe.ingredients.forEach(i => inventory.remove(i.item, i.count));
    recipe.outputs.forEach(o => inventory.add(o.item, o.count));
    return { ok: true, outputs: recipe.outputs };
  }
};
