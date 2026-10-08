'use strict';
/* SERVER-SIDE - what a swing does, per tool kind (strategy pattern). ToolSystem owns the swing timing;
 * a handler answers: what is in reach (find), is it still valid at impact (isValid), and what happens (apply).
 * A target is { ref, x, y } where `ref` is whatever the handler needs to find it again. */
const IMPACT_REACH_SLACK = 0.35 / TILE_SCALE;   // forgiveness if the player drifts a little during the swing

class TreeHarvestHandler {
  /** @param {{map, trees:TreeSystem, getInventory, emit, markInventoryChanged}} deps */
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
    if (gridOf(p)) return null;                                          // (trees, buildings and water are in the overworld)
    const hit = findTreeInReach(this.map, p, tool.reach);
    return hit ? { ref: tileKey(hit.tx, hit.ty), x: hit.tree.x, y: hit.tree.y, tx: hit.tx, ty: hit.ty } : null;
  }

  isValid(p, target, tool) {
    const tree = treeAt(this.map, target.tx, target.ty);
    return !!tree && tree.alive && Math.hypot(tree.x - p.x, tree.y - p.y) - tree.r <= tool.reach + IMPACT_REACH_SLACK;
  }

  apply(id, target, tool) {
    const tree = treeAt(this.map, target.tx, target.ty), lv = this.getPlayer(id).lv;
    const { felled } = this.trees.damage(target.tx, target.ty, tool.damage + Skills.damageBonus(lv));       // Strength: harder blows
    this.emit({ type: 'chop', key: target.ref, x: tree.x, y: tree.y, by: id });
    this.award(id, 'woodcutting', 18);
    if (felled) { this.award(id, 'woodcutting', 30); this._harvest(id, target.ref, tree); }
  }

  /** The tree topples AWAY from the woodcutter (sideways on screen) and, when it hits the ground, breaks into logs lying along the trunk.
   *  Pick them up with the interact key (one press gathers the whole lot). */
  _harvest(id, key, tree) {
    const p = this.getPlayer(id), side = (tree.x - tree.y) - (p.x - p.y) >= 0 ? 1 : -1;            // (screen x runs along x - y)
    this.emit({ type: 'fell', key, x: tree.x, y: tree.y, by: id, side });
    const bonus = this.rng() < Skills.bonusYieldChance(p.lv, 'woodcutting') + luckChance(p) ? 1 : 0;     // a sharper (or luckier) woodcutter gets more logs
    const count = this.trees.rollLogCount() + bonus, ux = side / Math.SQRT2, uy = -side / Math.SQRT2;   // along the fall, on the ground
    this.later(TreeDef.fallSeconds, () => {
      for (let i = 0; i < count; i++) {
        const d = 0.75 + i * 0.7, j = i % 2 ? 0.2 : -0.2;
        let x = tree.x + ux * d - uy * j, y = tree.y + uy * d + ux * j;
        if (isWaterTile(this.map.tile(Math.floor(x), Math.floor(y)))) { x = tree.x + (i - 1) * 0.35; y = tree.y + 0.55; }   // (never into the water)
        this.dropOnGround(TreeDef.dropItemId, 1, x, y, '');
      }
      const species = TreeSpecies.get(TreeSpecies.of(tree)), [lo, hi] = species.saplings || [1, 1], n = lo + Math.floor(this.rng() * (hi - lo + 1));
      if (n > 0) this.dropOnGround('sapling_' + species.id, n, tree.x - uy * 0.35, tree.y + ux * 0.35, '');      // every tree leaves saplings of its kind (data/trees/trees.js)
    });
  }
}

/** Shears: Use beside a sheep (any creature whose data has `shear`: { item, min, max, regrowSeconds }) that still has its wool. The tufts
 *  pop off one after another and land around it, to be picked up (one press gathers them all); a wild one scurries off, and the wool
 *  grows back after regrowSeconds. */
class ShearHandler {
  constructor(deps) { Object.assign(this, deps); }
  find(p, tool) {
    let best = null, shorn = null;
    for (const a of Object.values(this.animals.animals)) {
      const def = AnimalDefs[a.type];
      if (!def.shear || a.rider || !sameGrid(a, p)) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d > tool.reach + def.radius) continue;
      if (a.shornUntil) { shorn = a; continue; }
      if (!best || d < best.d) best = { a, d };
    }
    if (!best) {
      this.emit({ type: 'notice', to: p.id, text: shorn ? `That ${AnimalDefs[shorn.type].name.toLowerCase()} is already shorn: its wool grows back in a while` : 'Stand beside a sheep to shear it (lure it with food, or get close: Dexterity and Animal Friendship help)' });
      return null;
    }
    return { ref: best.a.id, x: best.a.x, y: best.a.y };
  }
  isValid(p, target, tool) { const a = this.animals.animals[target.ref]; return !!a && !a.shornUntil && Math.hypot(a.x - p.x, a.y - p.y) <= tool.reach + 0.6; }
  apply(id, target) {
    const a = this.animals.animals[target.ref], S = AnimalDefs[a.type].shear, p = this.getPlayer(id), x0 = a.x, y0 = a.y, grid = a.grid || '';
    const count = S.min + Math.floor(this.rng() * (S.max - S.min + 1)) + (this.rng() < Skills.bonusYieldChance(p.lv, 'animal_friendship') ? 1 : 0);
    a.shornUntil = this.tick() + Math.round((S.regrowSeconds || 240) / TICK_DT);
    this.emit({ type: 'shear', id: a.id, x: x0, y: y0, by: id, count });
    this.award(id, 'animal_friendship', 12);
    if (!a.owner) this.animals.startle(a.id, p);                                          // a wild one scurries off; your own stays put
    const turn = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) this.later(0.12 + i * 0.15, () => {                   // the tufts pop off one by one, spread round it (far enough apart not to merge)
      const ang = turn + i * Math.PI * 2 / count, r = 0.75 + this.rng() * 0.2;
      let x = x0 + Math.cos(ang) * r, y = y0 + Math.sin(ang) * r;
      if (!grid && isWaterTile(this.map.tile(Math.floor(x), Math.floor(y)))) { x = x0; y = y0; }
      this.dropOnGround(S.item, 1, x, y, grid);
    });
  }
}

class DemolishHandler {
  /** @param {{map, getInventory, emit, markInventoryChanged, markBuiltChanged:(layer)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
    if (gridOf(p)) return null;                                          // (trees, buildings and water are in the overworld)
    const hit = BuildSystem.findDemolishable(this.map, p, tool.reach, !CONFIG.sim.construction);      // with construction off, only stations come down
    return hit ? { ref: `${hit.tx},${hit.ty},${hit.slot}`, x: hit.x, y: hit.y, tx: hit.tx, ty: hit.ty, slot: hit.slot } : null;
  }

  _typeAt(t) { return t.slot === 'f' ? this.map.floors[tileKey(t.tx, t.ty)] : builtAt(this.map, t.tx, t.ty, t.slot); }

  isValid(p, target, tool) {
    if (!this._typeAt(target)) return false;
    const [x0, y0, x1, y1] = slabBox(target.tx, target.ty, target.slot);
    return Math.hypot(p.x - clamp(p.x, x0, x1), p.y - clamp(p.y, y0, y1)) <= tool.reach + IMPACT_REACH_SLACK;
  }

  apply(id, target) {
    const def = StructureDefs[this._typeAt(target)], inventory = this.getInventory(id);
    if (target.slot === 'f') {                                                  // a floor is the foundation: take the walls on it down first
      const tile = this.map.built[tileKey(target.tx, target.ty)] || {};
      if (SIDES.some(s => tile[s])) { this.emit({ type: 'notice', to: id, text: 'Remove the walls on this floor first' }); return; }
    }
    if (def.stockpile && !Stockpiles.isEmpty(this.map, tileKey(target.tx, target.ty))) { this.emit({ type: 'notice', to: id, text: 'Empty the stockpile first (take its contents out in the Town window)' }); return; }
    if (!inventory.canAdd(def.refundItemId, 1)) { this.emit({ type: 'notice', to: id, text: 'Inventory full' }); return; }
    BuildSystem.remove(this.map, target.tx, target.ty, target.slot);
    if (target.slot === 'c') { Stockpiles.forget(this.map, target.tx, target.ty); this.markStockChanged(); }   // its level (and empty pile) go with it
    inventory.add(def.refundItemId, 1);
    this.markBuiltChanged(target.slot === 'f' ? 'floors' : 'built'); this.markInventoryChanged(id);
    this.emit({ type: 'demolished', tx: target.tx, ty: target.ty, side: target.slot, by: id });
    this.emit({ type: 'gain', to: id, item: def.refundItemId, count: 1 });
  }
}

/** Damage an animal and hand out its drops. Shared by every weapon. */
function strikeAnimal(deps, id, animalId, damage) {
  const lv = deps.getPlayer(id).lv;
  const result = deps.animals.damage(animalId, damage + Skills.damageBonus(lv)), a = result.animal;
  deps.emit({ type: 'hit', x: a.x, y: a.y, by: id });
  deps.award(id, 'hunting', 8);
  if (!result.killed) return;
  deps.award(id, 'hunting', 12 * AnimalDefs[a.type].hp * AnimalLevels.xpFactor(a.level));          // tougher (higher-level) animals pay more
  deps.emit({ type: 'kill', x: a.x, y: a.y, animal: a.type, by: id });
  const inventory = deps.getInventory(id);
  let lost = false;
  for (const drop of result.drops) {
    const gained = drop.count - inventory.add(drop.item, drop.count);
    if (gained < drop.count) { lost = true; deps.dropOnGround(drop.item, drop.count - gained, a.x, a.y, gridOf(a)); }      // what does not fit falls on the ground
    if (gained > 0) deps.emit({ type: 'gain', to: id, item: drop.item, count: gained });
  }
  deps.markInventoryChanged(id);
  if (lost) deps.emit({ type: 'notice', to: id, text: 'Your pack is full: the rest fell on the ground' });
}

/** The knife and the spear: melee against animals. Kills drop meat, hide, wool or antler straight into the hunter's inventory. */
const SWEEP_HALF_ANGLE = 1.05;                 // a sword sweep covers a 120 degree fan in front of you
class HuntHandler {
  /** @param {{animals:AnimalSystem, getInventory, emit, markInventoryChanged}} deps  @param {{sweep:boolean}} opts sweep: hit EVERY animal in the fan, not just the nearest (swords). */
  constructor(deps, { sweep = false } = {}) { Object.assign(this, deps); this.deps = deps; this.sweep = sweep; }

  find(p, tool) {
    const hit = this.animals.nearestInReach(p, tool.reach);
    return hit ? { ref: hit.id, x: hit.animal.x, y: hit.animal.y } : null;
  }

  isValid(p, target, tool) {
    const a = this.animals.animals[target.ref];
    return !!a && Math.hypot(a.x - p.x, a.y - p.y) - AnimalDefs[a.type].radius <= tool.reach + IMPACT_REACH_SLACK;
  }

  apply(id, target, tool) {
    strikeAnimal(this.deps, id, target.ref, tool.damage);
    if (!this.sweep) return;
    const p = this.getPlayer(id);
    for (const other of this.animals.inArc(p, tool.reach, SWEEP_HALF_ANGLE)) if (other.id !== target.ref && this.animals.animals[other.id]) strikeAnimal(this.deps, id, other.id, tool.damage);
  }
}

/** The bow: needs arrows; the arrow flies instantly to the nearest animal in front of you (within ~30 degrees). */
const BOW_HALF_ANGLE = 0.52;
class BowHandler {
  constructor(deps) { Object.assign(this, deps); this.deps = deps; }

  precheck(id) {
    if (this.getInventory(id).has('arrow', 1)) return true;
    this.emit({ type: 'notice', to: id, text: 'No arrows' });
    return false;
  }

  find(p, tool) {
    const hit = this.animals.nearestInCone(p, tool.reach, BOW_HALF_ANGLE);
    return hit ? { ref: hit.id, x: hit.animal.x, y: hit.animal.y } : null;
  }

  isValid(p, target, tool) {
    const a = this.animals.animals[target.ref];
    return !!a && Math.hypot(a.x - p.x, a.y - p.y) <= tool.reach + 1;
  }

  apply(id, target, tool) {
    const inventory = this.getInventory(id), a = this.animals.animals[target.ref];
    if (!inventory.remove('arrow', 1)) return;
    this.markInventoryChanged(id);
    const shooter = this.getPlayer(id);
    this.emit({ type: 'arrow', x0: shooter.x, y0: shooter.y, x1: a.x, y1: a.y });
    strikeAnimal(this.deps, id, target.ref, tool.damage);
  }
}

/** The fishing rod: cast toward water in front of you; half the casts catch something. */
const FISH_CHANCE = 0.5;
class FishingHandler {
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
    if (gridOf(p)) return null;                                          // (trees, buildings and water are in the overworld)
    for (let d = 1; d <= tool.reach; d += 0.5) {
      const tx = Math.floor(p.x + Math.cos(p.facing) * d), ty = Math.floor(p.y + Math.sin(p.facing) * d);
      if (isWaterTile(this.map.tile(tx, ty))) return { ref: tileKey(tx, ty), x: tx + 0.5, y: ty + 0.5 };
    }
    return null;
  }

  isValid() { return true; }

  apply(id, target) {
    const lv = this.getPlayer(id).lv;
    if (this.rng() >= Skills.catchChance(lv)) { this.emit({ type: 'notice', to: id, text: 'No bite...' }); this.award(id, 'fishing', 4); return; }
    const inventory = this.getInventory(id);
    if (inventory.add('raw_fish', 1) > 0) { this.emit({ type: 'notice', to: id, text: 'Inventory full' }); return; }
    this.markInventoryChanged(id);
    this.award(id, 'fishing', 40);
    this.emit({ type: 'fish', x: target.x, y: target.y, by: id });
    this.emit({ type: 'gain', to: id, item: 'raw_fish', count: 1 });
  }
}

/** The lasso: THROW it at any friendly animal (not a monster or a guardian) up to 5+ tiles away (the one you click / tap, else inside a cone in front of you). A caught animal that is not a wild pony stays on the rope until you untie it; how many you can hold grows with your level (Skills.leashCap). It may miss: calm, lured animals
 *  are easy, running ones hard, and Horsemanship helps. A caught deer or sheep is simply yours; a caught wild PONY follows you
 *  on the rope but must be led to a stable or closed pen and fed apples before it settles and becomes your pet. */
class LeashHandler {
  /** @param {{animals:AnimalSystem, getInventory, emit, markInventoryChanged, getPlayer, award, rng, onTamed:(ownerId, animal)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
    const hit = this.animals.nearestLassoable(p, tool.reach);
    if (!hit) { this.emit({ type: 'notice', to: p.id, text: 'Nothing to lasso there (ponies come to apples)' }); return null; }
    const cap = Skills.leashCap(p.lv), mine = hit.animal.owner === p.id;
    if (!mine && this.animals.leashedCount(p.id) >= cap) { this.emit({ type: 'notice', to: p.id, text: `Your rope is full: ${cap} animals at most (it grows with Animal Friendship and Horsemanship). Untie one first` }); return null; }
    return { ref: hit.id, x: hit.animal.x, y: hit.animal.y };
  }

  isValid(p, target, tool) {
    const a = this.animals.animals[target.ref];
    if (!a || a.captor || a.rider) return false;
    const def = AnimalDefs[a.type], free = !a.owner || (a.owner === p.id && !a.leashed);
    return canBefriendAnimal(a.type) && free && Math.hypot(a.x - p.x, a.y - p.y) - def.radius <= tool.reach + 1.2;     // it may have moved while the loop was in the air
  }

  apply(id, target) {
    const inventory = this.getInventory(id), a = this.animals.animals[target.ref], p = this.getPlayer(id), def = AnimalDefs[a.type];
    const item = p.held, lasso = ItemDB.getLasso(item) || { tier: 1, chance: 0 }, fromSlot = p.lassoSwing && p.gear.lasso === item;   // thrown from the lasso slot (L), or held from the bar
    if (!fromSlot && !inventory.has(item, 1)) return;
    const dist = Math.hypot(a.x - p.x, a.y - p.y), mine = a.owner === id, need = def.pony ? (def.lassoTier || 1) : 1;
    if (!mine && need > lasso.tier) {                                                   // a rarer pony slips out of a plain loop
      const better = Object.values(ItemDefs).find(d => d.lasso && d.lasso.tier === need);
      this.emit({ type: 'lasso', x0: p.x, y0: p.y, x1: a.x, y1: a.y, hit: false, by: id, item });
      this.animals.startle(target.ref, p);
      this.emit({ type: 'notice', to: id, text: `It slips right out of your ${ItemDefs[item].name}: catching a ${def.name} takes a ${better ? better.name : 'better lasso'} or better` });
      return;
    }
    const wild = !mine && AnimalLevels.tooWild(a, p.lv);
    if (wild) {                                                                         // above your level: it shrugs the loop off
      this.emit({ type: 'lasso', x0: p.x, y0: p.y, x1: a.x, y1: a.y, hit: false, by: id, item });
      this.animals.startle(target.ref, p);
      this.emit({ type: 'notice', to: id, text: wild });
      return;
    }
    const landed = mine || this.rng() < this.animals.lassoChance(a, dist, p.lv, p.buffs) + lasso.chance;
    this.emit({ type: 'lasso', x0: p.x, y0: p.y, x1: a.x, y1: a.y, hit: landed, by: id, item });
    if (!landed) {
      this.animals.startle(target.ref, p);
      this.award(id, 'horsemanship', 4);
      this.emit({ type: 'notice', to: id, text: 'The loop missed! It bolted' });
      return;
    }
    // (a lasso is a tool, not used up: it stays in your hand or lasso slot, ready for the next throw)
    if (def.pony && !mine) {
      this.animals.capture(target.ref, id);
      this.award(id, 'horsemanship', Math.round(40 * AnimalLevels.xpFactor(a.level)));
      const need = AnimalLevels.applesNeeded(def, a.level);
      this.onLeashed(id, a);
      this.emit({ type: 'caught', to: id, x: a.x, y: a.y, animal: a.type, id: a.id, need });
      this.emit({ type: 'notice', to: id, text: `Caught! Lead it to a stable or a fenced pen and feed it ${need} apples` });
      return;
    }
    const tamed = this.animals.tame(target.ref, id);
    this.award(id, 'horsemanship', def.pony ? 20 : 25);
    this.onTamed(id, tamed); this.onLeashed(id, tamed);
    this.emit({ type: 'tamed', to: id, x: tamed.x, y: tamed.y, animal: tamed.type, id: tamed.id });
  }
}
