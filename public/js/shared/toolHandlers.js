'use strict';
/* SERVER-SIDE - what a swing does, per tool kind (strategy pattern). ToolSystem owns the swing timing;
 * a handler answers: what is in reach (find), is it still valid at impact (isValid), and what happens (apply).
 * A target is { ref, x, y } where `ref` is whatever the handler needs to find it again. */
const IMPACT_REACH_SLACK = 0.35 / TILE_SCALE;   // forgiveness if the player drifts a little during the swing

class TreeHarvestHandler {
  /** @param {{map, trees:TreeSystem, getInventory, emit, markInventoryChanged}} deps */
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
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

  _harvest(id, key, tree) {
    this.emit({ type: 'fell', key, x: tree.x, y: tree.y, by: id });
    const lv = this.getPlayer(id).lv, bonus = this.rng() < Skills.bonusYieldChance(lv, 'woodcutting') ? 1 : 0;     // a sharper woodcutter gets more logs
    const wanted = this.trees.rollLogCount() + bonus;
    const gained = wanted - this.getInventory(id).add(TreeDef.dropItemId, wanted);
    if (gained > 0) {
      this.markInventoryChanged(id);
      this.emit({ type: 'gain', to: id, item: TreeDef.dropItemId, count: gained });
    }
  }
}

class DemolishHandler {
  /** @param {{map, getInventory, emit, markInventoryChanged, markBuiltChanged:(layer)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
    const hit = BuildSystem.findDemolishable(this.map, p, tool.reach);
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
    if (!inventory.canAdd(def.refundItemId, 1)) { this.emit({ type: 'notice', to: id, text: 'Inventory full' }); return; }
    BuildSystem.remove(this.map, target.tx, target.ty, target.slot);
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
    if (gained < drop.count) lost = true;
    if (gained > 0) deps.emit({ type: 'gain', to: id, item: drop.item, count: gained });
  }
  deps.markInventoryChanged(id);
  if (lost) deps.emit({ type: 'notice', to: id, text: 'Inventory full: some drops were lost' });
}

/** The knife and the spear: melee against animals. Kills drop meat, hide, wool or antler straight into the hunter's inventory. */
class HuntHandler {
  /** @param {{animals:AnimalSystem, getInventory, emit, markInventoryChanged}} deps */
  constructor(deps) { Object.assign(this, deps); this.deps = deps; }

  find(p, tool) {
    const hit = this.animals.nearestInReach(p, tool.reach);
    return hit ? { ref: hit.id, x: hit.animal.x, y: hit.animal.y } : null;
  }

  isValid(p, target, tool) {
    const a = this.animals.animals[target.ref];
    return !!a && Math.hypot(a.x - p.x, a.y - p.y) - AnimalDefs[a.type].radius <= tool.reach + IMPACT_REACH_SLACK;
  }

  apply(id, target, tool) { strikeAnimal(this.deps, id, target.ref, tool.damage); }
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

/** The lasso: THROW it at a tameable animal up to 5 tiles away (inside a cone in front of you). It may miss: calm, lured animals
 *  are easy, running ones hard, and Horsemanship helps. A caught deer or sheep is simply yours; a caught wild PONY follows you
 *  on the rope but must be led to a stable or closed pen and fed apples before it settles and becomes your pet. */
class LeashHandler {
  /** @param {{animals:AnimalSystem, getInventory, emit, markInventoryChanged, getPlayer, award, rng, onTamed:(ownerId, animal)=>void}} deps */
  constructor(deps) { Object.assign(this, deps); }

  find(p, tool) {
    const hit = this.animals.nearestLassoable(p, tool.reach);
    if (!hit) { this.emit({ type: 'notice', to: p.id, text: 'Nothing to lasso in front of you (ponies come to apples)' }); return null; }
    return { ref: hit.id, x: hit.animal.x, y: hit.animal.y };
  }

  isValid(p, target, tool) {
    const a = this.animals.animals[target.ref];
    if (!a || a.captor || a.rider) return false;
    const def = AnimalDefs[a.type], free = !a.owner || (a.owner === p.id && !a.leashed);
    return def.tameable && free && Math.hypot(a.x - p.x, a.y - p.y) - def.radius <= tool.reach + 1.2;     // it may have moved while the loop was in the air
  }

  apply(id, target) {
    const inventory = this.getInventory(id), a = this.animals.animals[target.ref], p = this.getPlayer(id), def = AnimalDefs[a.type];
    if (!inventory.has('leash', 1)) return;
    const dist = Math.hypot(a.x - p.x, a.y - p.y), mine = a.owner === id;
    const landed = mine || this.rng() < this.animals.lassoChance(a, dist, p.lv);
    this.emit({ type: 'lasso', x0: p.x, y0: p.y, x1: a.x, y1: a.y, hit: landed, by: id });
    if (!landed) {
      this.animals.startle(target.ref, p);
      this.award(id, 'horsemanship', 4);
      this.emit({ type: 'notice', to: id, text: 'The loop missed! It bolted' });
      return;
    }
    inventory.remove('leash', 1);                                        // the lasso stays on the animal; untie it to get it back
    this.markInventoryChanged(id);
    if (def.pony && !mine) {
      this.animals.capture(target.ref, id);
      this.award(id, 'horsemanship', Math.round(40 * AnimalLevels.xpFactor(a.level)));
      const need = AnimalLevels.applesNeeded(def, a.level);
      this.emit({ type: 'caught', to: id, x: a.x, y: a.y, animal: a.type, id: a.id, need });
      this.emit({ type: 'notice', to: id, text: `Caught! Lead it to a stable or a fenced pen and feed it ${need} apples` });
      return;
    }
    const tamed = this.animals.tame(target.ref, id);
    this.award(id, 'horsemanship', def.pony ? 20 : 25);
    this.onTamed(id, tamed);
    this.emit({ type: 'tamed', to: id, x: tamed.x, y: tamed.y, animal: tamed.type, id: tamed.id });
  }
}
