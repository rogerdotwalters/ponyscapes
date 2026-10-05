'use strict';
/* SHARED - what the interact key can do right now. The server uses it to act, the client uses it to label the
 * button ("Pick" / "Board" / "Drink" / "Fill"). Picking up and boarding (nearest first) take priority over drinking. */
const WATER_REACH = 0.85, WELL_REACH = 1.0;      // tiles
const SOURCE_THIRST = { lake: 20, well: 30 };    // thirst restored by one drink

/** Nearest place to drink: a water tile at arm's length, or the village well. { kind, dist, x, y } or null. */
function findWaterSource(map, p) {
  const span = 3, px = Math.floor(p.x), py = Math.floor(p.y);
  let best = null;
  for (let ty = py - span; ty <= py + span; ty++) for (let tx = px - span; tx <= px + span; tx++) {
    if (isWaterTile(map.tile(tx, ty))) {
      const dist = Math.hypot(p.x - clamp(p.x, tx, tx + 1), p.y - clamp(p.y, ty, ty + 1));
      if (dist <= WATER_REACH && (!best || dist < best.dist)) best = { kind: 'lake', dist, x: tx + 0.5, y: ty + 0.5 };
    }
    const prop = map.propAt(tx, ty);
    if (prop && prop.t === 'well') {
      const dist = Math.max(0, Math.hypot(p.x - prop.x, p.y - prop.y) - prop.r);
      if (dist <= WELL_REACH && (!best || dist < best.dist)) best = { kind: 'well', dist, x: prop.x, y: prop.y };
    }
  }
  return best;
}

/** The beginner's loot chest within arm's reach: { prop, dist } or null. */
function findChest(map, p) {
  const px = Math.floor(p.x), py = Math.floor(p.y);
  for (let ty = py - 2; ty <= py + 2; ty++) for (let tx = px - 2; tx <= px + 2; tx++) {
    const prop = map.propAt(tx, ty);
    if (prop && prop.t === 'chest') { const dist = Math.max(0, Math.hypot(p.x - prop.x, p.y - prop.y) - prop.r); if (dist <= 1.0) return { prop, dist }; }
  }
  return null;
}

const FORAGE_VERB = { clay: 'Dig', mound: 'Dig up', flax: 'Harvest', apple_tree: 'Pick apples', bottle: 'Grab bottle' };

/** Anything on your rope that you could let go of. It has its OWN button (and key) so it can never be hit by accident while riding or feeding:
 *  { kind: 'release', label: 'Let go' | 'Untie', animal, dist, losesCatch } or null. Letting go of a caught wild pony LOSES it (it bolts), so that one needs confirming. */
const RELEASE_RANGE = 2.4;
function findRelease(p, animals, selfId = p.id) {
  let best = null;
  for (const id in animals) {
    const a = animals[id], d = Math.hypot(a.x - p.x, a.y - p.y), caught = a.captor === selfId, tied = a.owner === selfId && a.leashed;
    if (!(caught || tied) || d > RELEASE_RANGE || (best && d >= best.dist)) continue;
    best = { kind: 'release', label: caught ? 'Let go' : 'Untie', dist: d, animal: a, losesCatch: caught };
  }
  return best;
}

const Interactions = {
  /** @returns {{kind:'pick'|'door'|'board'|'untie'|'pickup'|'drink'|'fill', label:string, dist:number, forage?, door?, boat?, water?}|null} */
  find(map, boats, p, heldItemId, animals = {}, selfId = p.id) {
    if (p.mount) return { kind: 'dismount', label: 'Dismount', dist: 0 };      // on a pony the interact key always gets you off
    const primary = [];
    for (const id in animals) {                          // tied pets can be untied, small animals picked up
      const a = animals[id], def = AnimalDefs[a.type], d = def ? Math.hypot(a.x - p.x, a.y - p.y) : Infinity;
      if (!def) continue;
      if (a.owner === selfId && !a.leashed && !a.rider && def.pony && !p.mount && d <= CONFIG.sim.ride.range) primary.push({ kind: 'ride', label: 'Ride', dist: d, animal: a });
      else if (a.captor === selfId && d <= UNTIE_RANGE && heldItemId === 'apple') primary.push({ kind: 'feed', label: 'Feed apple', dist: d - 1, animal: a });   // a caught wild pony: hold an apple and feed it (wins over a gate next to it)
      else if (def.carry && d <= PICKUP_RANGE && a.state !== 'flee' && (!a.owner || a.owner === selfId)) primary.push({ kind: 'pickup', label: 'Pick up', dist: d, animal: a });
    }                                  // things you pick up, open or climb into win over water (boats always sit next to water)
    const forage = findForageable(map, p, FORAGE_RANGE, heldItemId);
    if (forage) primary.push({ kind: 'pick', label: FORAGE_VERB[forageKind(forage.prop)] || 'Pick', dist: forage.dist, forage });
    const chest = findChest(map, p);
    if (chest && !p.looted) primary.push({ kind: 'loot', label: 'Open', dist: chest.dist, chest });
    const door = BuildSystem.findDoor(map, p);
    if (door) primary.push({ kind: 'door', label: StructureDefs[door.type].verb, dist: door.dist, door });
    const boat = BoatSystem.findBoardable(boats, p);
    if (boat) primary.push({ kind: 'board', label: 'Board', dist: Math.hypot(boat.x - p.x, boat.y - p.y), boat });
    if (primary.length) return primary.sort((a, b) => a.dist - b.dist)[0];
    const water = findWaterSource(map, p);
    if (!water) return null;
    const fill = heldItemId === 'jug';                    // an empty jug gets filled
    return { kind: fill ? 'fill' : 'drink', label: fill ? 'Fill' : 'Drink', dist: water.dist, water };
  }
};
