'use strict';
/* DATA - the pony COINS: a collector's coin for every pony variety (meadow, moss, jungle, candy, ember...), one item each (`pony_coin_<variety id>`).
 * A wild pony sheds the coin of its own variety when you lasso it (data/ponies/variants.js). They are not money: bring them home and press them onto the
 * Coin Poster on your wall (data/furniture/basic.js, shared/ponyPoster.js). Retired (legacy) varieties have no coin. The HYBRID varieties (data/ponies/hybrids.js) have one too: a hybrid is never wild, so a hybrid foal being born sheds its coin (stableSystem.js). */
const PonyCoins = (() => {
  const RARITY = { meadow: 'common', moss: 'uncommon', frost: 'uncommon', jungle: 'uncommon', orchard: 'uncommon', candy: 'rare', crystal: 'rare', ember: 'rare', starlit: 'epic', rainbow: 'legendary', water: 'rare', sun: 'rare', lightning: 'epic', star: 'legendary' };
  const varieties = PonyVariantTable.all().filter(v => !v.legacy);
  for (const v of varieties) Materials.register({ id: 'pony_coin_' + v.id, name: v.name + ' Pony Coin', maxStack: 99, rarity: RARITY[v.id] || (HybridTable.get(v.id) || {}).rarity || 'rare', ponyCoin: v.id });
  const ids = varieties.map(v => v.id);
  return Object.freeze({
    /** The variety ids that have a coin, in poster order. */
    ids,
    /** The most coins one poster slot keeps. */
    MAX_PINNED: 999999,
    itemOf: varietyId => (ids.includes(varietyId) ? 'pony_coin_' + varietyId : null),
    /** The variety id a coin item stands for (or null if it is not a pony coin). */
    varietyOf: item => (typeof item === 'string' && item.startsWith('pony_coin_') && ids.includes(item.slice(10)) ? item.slice(10) : null)
  });
})();
