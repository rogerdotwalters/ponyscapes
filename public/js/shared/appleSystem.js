'use strict';
/* SHARED + SERVER-SIDE - the Apple button. Apples are for ponies: press the button (key C) and one apple from your bag goes to the pony you ride, or else the nearest of your
 * own ponies close by. It restores a share of that pony's health AT ONCE, and a special apple does more (data/items/foods.js: each apple's `pony` block):
 *   heal       the share of its maximum health restored          speed      [% faster, seconds] for the rider        cooldowns   the share of the rider's power cooldowns taken off
 *   xp         pony experience                                    regen      [hp a second, seconds] health regeneration for YOU
 * Regeneration is the ONLY thing an apple does for the player (no hunger, no thirst, nothing else). An apple that would do nothing (the pony is unhurt and the apple has no special
 * effect) is not used up. Which apple the button gives: the player's choice (cycle with a long press / Shift+C), else the plainest one they carry. */
const AppleRules = {
  /** What an apple does: { heal, regen: [rate, seconds] | null, speed, cooldowns, xp }. */
  of(item) {
    const p = (ItemDefs[item] && ItemDefs[item].pony) || {};
    return { heal: +p.heal || 0.3, regen: Array.isArray(p.regen) ? p.regen : [1.5, 6], speed: Array.isArray(p.speed) ? p.speed : null, cooldowns: +p.cooldowns || 0, xp: +p.xp || 0 };
  },
  /** Does it do something besides heal? */
  special: item => { const r = AppleRules.of(item); return !!(r.speed || r.cooldowns || r.xp); },
  /** Every kind of apple there is: [item ids], plainest first. */
  kinds: () => Object.keys(ItemDefs).filter(id => ItemDB.isApple(id)).sort((a, b) => (AppleRules.special(a) - AppleRules.special(b)) || ItemDefs[a].name.localeCompare(ItemDefs[b].name)),
  /** The apples in a bag: [{ item, count }], plainest first. `has(item)` counts one kind. */
  carried: has => AppleRules.kinds().map(item => ({ item, count: has(item) })).filter(a => a.count > 0),
  /** The apple the button gives: `choice` if you still have it, else the plainest you carry ('' when you have none). */
  pick: (carried, choice) => (carried.find(a => a.item === choice) || carried[0] || { item: '' }).item,
  /** The pony an apple goes to: the one you ride, else your own nearest within `reach` tiles. */
  target(animals, p, id, reach = 4) {
    const ridden = p.mount && animals[p.mount];
    if (ridden) return ridden;
    let best = null, bestD = reach;
    for (const a of Object.values(animals)) {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (a.owner === id && a.look && sameGrid(a, p) && d <= bestD) { best = a; bestD = d; }
    }
    return best;
  }
};

Object.assign(GameServer.prototype, {
  /** The Apple button: give one `item` to your pony (see above). */
  _giveApple(id, item) {
    const p = this.players[id], inventory = this.inventories[id];
    if (!p || p.down > 0 || p.hp <= 0 || p.asleep) return;
    if (!ItemDB.isApple(item) || !inventory.has(item, 1)) { this._notice(id, 'You have no apples'); return; }
    const pony = AppleRules.target(this.animals.animals, p, id);
    if (!pony) { this._notice(id, 'Ride your pony, or stand next to it, to give it an apple'); return; }
    const rule = AppleRules.of(item), hurt = pony.hp < pony.maxHp;
    if (!hurt && !AppleRules.special(item)) { this._notice(id, 'Your pony is already at full health'); return; }
    inventory.remove(item, 1); this.inventoryRev[id]++;
    const before = pony.hp;
    pony.hp = Math.min(pony.maxHp, pony.hp + Math.ceil(pony.maxHp * rule.heal));
    const riding = p.mount === pony.id;
    if (rule.speed && riding) { p.dashT = Math.max(p.dashT, rule.speed[1]); p.dashBoost = Math.max(p.dashBoost || 0, rule.speed[0]); }
    if (rule.cooldowns) { p.abilityCd = (p.abilityCd || []).map(t => t * (1 - rule.cooldowns)); p.flyCd = (p.flyCd || 0) * (1 - rule.cooldowns); }
    if (rule.xp) this._ponyXp(pony, rule.xp);
    if (rule.regen) { p.regenT = Math.min(20, (p.regenT || 0) + rule.regen[1]); p.regenRate = Math.max(p.regenRate || 0, rule.regen[0]); }          // (the only effect on the player)
    this.pendingEvents.push({ type: 'apple', to: id, item, healed: Math.round(pony.hp - before), x: pony.x, y: pony.y });
  }
});
