'use strict';
/* SERVER-SIDE - hunger and thirst: they drain over time, eating / drinking restores them.
 * Holding food or a full jug and pressing Use consumes one every `eatSeconds`; the interact key drinks straight
 * from water or fills an empty jug. At 0 a character is slowed and cannot sprint (see stepPlayer). */
class VitalsSystem {
  /** @param {{emit:(event)=>void, markInventoryChanged:(id)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); }

  /** Hunger and thirst fall at a rate set by the player's mode (off / superficial / relaxed / normal / hard). */
  drain(p, dt) {
    if (!CONFIG.sim.vitals) { p.hunger = CONFIG.sim.hunger.max; p.thirst = CONFIG.sim.thirst.max; return; }     // switched off: always full
    const S = CONFIG.sim, modeOf = mode => S.vitalModes[mode] || S.vitalModes.normal;
    const stamina = Skills.drainFactor(p.lv);                           // Endurance: slower hunger and thirst
    p.hunger = p.hungerMode === 'off' ? S.hunger.max : Math.max(0, p.hunger - S.hunger.decayPerSecond * modeOf(p.hungerMode).drain * stamina * dt);
    p.thirst = p.thirstMode === 'off' ? S.thirst.max : Math.max(0, p.thirst - S.thirst.decayPerSecond * modeOf(p.thirstMode).drain * stamina * dt);
  }

  /** Use button with food / a full jug in hand. Does nothing if the benefit would mostly be wasted. */
  consumeHeld(id, p, inventory, input, dt) {
    if (!CONFIG.sim.vitals) return;                                   // (food is for ponies now)
    const S = CONFIG.sim;
    if (p.eatT > 0) p.eatT = Math.max(0, p.eatT - dt);
    if (!input.action || p.eatT > 0) return;
    const food = ItemDB.getFood(p.held), drink = ItemDB.getDrink(p.held);
    const hungerGain = food ? food.hunger : 0, thirstGain = (food ? food.thirst : 0) + (drink ? drink.thirst : 0);
    const hungerWanted = food && S.hunger.max - p.hunger >= food.hunger * 0.5;
    const thirstWanted = drink && S.thirst.max - p.thirst >= drink.thirst * 0.5;
    if (!hungerWanted && !thirstWanted) return;                         // not hungry / thirsty enough to benefit

    const item = p.held;
    inventory.remove(item, 1);
    if (drink && drink.returns) inventory.add(drink.returns, 1);       // the jug comes back empty
    const hungerBefore = p.hunger, thirstBefore = p.thirst;
    p.hunger = Math.min(S.hunger.max, p.hunger + (food ? hungerGain : 0));
    p.thirst = Math.min(S.thirst.max, p.thirst + thirstGain);
    p.eatT = S.hunger.eatSeconds;
    this.markInventoryChanged(id);
    this.emit({ type: drink ? 'drink' : 'eat', to: id, item, hunger: Math.round(p.hunger - hungerBefore), thirst: Math.round(p.thirst - thirstBefore) });
  }

  /** Interact key at a lake or well: drink from it. */
  drinkFromSource(id, p, source) {
    const S = CONFIG.sim, gain = SOURCE_THIRST[source.kind];
    if (S.thirst.max - p.thirst < 5) { this.emit({ type: 'notice', to: id, text: 'Not thirsty' }); return; }
    const before = p.thirst;
    p.thirst = Math.min(S.thirst.max, p.thirst + gain);
    this.emit({ type: 'drink', to: id, item: '', hunger: 0, thirst: Math.round(p.thirst - before), source: source.kind });
  }

  /** Interact key at water with an empty jug in hand: fill it. */
  fillJug(id, inventory) {
    inventory.remove('jug', 1);
    if (inventory.add('jug_water', 1) > 0) {                            // no room for the full jug: undo
      inventory.add('jug', 1);
      this.emit({ type: 'notice', to: id, text: 'Inventory full' });
      return;
    }
    this.markInventoryChanged(id);
    this.emit({ type: 'fill', to: id });
  }
}
