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

const FORAGE_VERB = { clay: 'Dig', mound: 'Dig up', flax: 'Harvest', apple_tree: 'Pick apples', bottle: 'Grab bottle', loot: 'Pick up' };

/** Anything on your rope that you could let go of. It has its OWN button (and key) so it can never be hit by accident while riding or feeding:
 *  { kind: 'release', label: 'Let go' | 'Untie', animal, dist, losesCatch } or null. Letting go of a caught wild pony LOSES it (it bolts), so that one needs confirming. */
const RELEASE_RANGE = 2.4;
function findRelease(p, animals, selfId = p.id) {
  let best = null;
  for (const id in animals) {
    const a = animals[id], d = Math.hypot(a.x - p.x, a.y - p.y), caught = a.captor === selfId, tied = a.owner === selfId && a.leashed;
    if (!(caught || tied) || !sameGrid(a, p) || d > RELEASE_RANGE || (best && d >= best.dist)) continue;
    best = { kind: 'release', label: caught ? 'Let go' : 'Untie', dist: d, animal: a, losesCatch: caught };
  }
  return best;
}

/** The pony the Ride button would put you on: your own, loose (not on a leash, not stabled), the nearest within riding range. { kind: 'ride', label: 'Ride', dist, animal } or null.
 *  Riding has its OWN button and key, so it never shares the action button with picking, feeding, boarding and the rest. */
function findRide(p, animals, selfId = p.id) {
  if (p.mount || p.boat || p.asleep || p.down > 0) return null;
  let best = null;
  for (const id in animals) {
    const a = animals[id], def = AnimalDefs[a.type], d = def ? Math.hypot(a.x - p.x, a.y - p.y) : Infinity;
    if (!def || !def.pony || a.owner !== selfId || a.rider || a.foal > 0 || a.stall || a.captor || !sameGrid(a, p) || d > CONFIG.sim.ride.range || (best && d >= best.dist)) continue;
    best = { kind: 'ride', label: 'Ride', dist: d, animal: a };
  }
  return best;
}

/** What each extra kind of interaction DOES (server side): kind -> (server, playerId, player, action). Systems register here (caves do). */
const InteractionHandlers = {};

const Interactions = {
  /** Extra finders other systems add: (map, player) => action | null. They are asked first, so a cave mouth works even on a pony. */
  extra: [],
  /** @returns {{kind:'pick'|'door'|'board'|'untie'|'pickup'|'drink'|'fill', label:string, dist:number, forage?, door?, boat?, water?}|null} */
  find(map, boats, p, heldItemId, animals = {}, selfId = p.id, npcs = {}, drops = {}) { return Interactions.list(map, boats, p, heldItemId, animals, selfId, npcs, drops)[0] || null; },

  /** EVERYTHING the interact key could do from here, the nearest first (find() is its first entry). The controller steps through it (targetSelector.js) and
   *  tells the server which one it means (keyOf / choose), so the thing whose bubble you see is the thing that happens. */
  list(map, boats, p, heldItemId, animals = {}, selfId = p.id, npcs = {}, drops = {}) {
    const extras = [];
    for (const finder of Interactions.extra) { const found = finder(map, p, heldItemId, animals, selfId); if (found) extras.push(found); }
    const mounted = !!p.mount;                           // in the saddle you can still pick, open and loot: only when there is nothing to do does the key get you off
    const primary = [];
    for (const id in animals) {                          // tied pets can be untied, small animals picked up
      const a = animals[id], def = AnimalDefs[a.type], d = def ? Math.hypot(a.x - p.x, a.y - p.y) : Infinity;
      if (!def || a.game || !sameGrid(a, p)) continue;
      const mark = n => { for (let k = n; k < primary.length; k++) primary[k].ref = id; };      // (each of this animal's entries remembers whose it is)
      const before = primary.length;      // (only what is on your grid; a minigame's sheep are for the lasso only)
      if (mounted) {                                     // (the rest needs two feet on the ground, but from the saddle you can still feed the wild pony on your lasso)
        if (a.captor === selfId && d <= UNTIE_RANGE && ItemDB.isApple(heldItemId)) primary.push({ kind: 'feed', label: 'Feed ' + ItemDefs[heldItemId].name.toLowerCase(), dist: d - 1, animal: a });
        continue;
      }
      if (Wants.accepts(a, heldItemId) && d <= WANT_REACH + def.radius) primary.push({ kind: 'give', label: `Give ${ItemDefs[heldItemId].creature ? AnimalDefs[ItemDefs[heldItemId].creature].name : ItemDefs[heldItemId].name}`, dist: d - 0.8, animal: a });   // what it asks for (its bubble)
      // (riding is its own button and key now: findRide below, so Ride never competes with Feed, Pick, Board...)
      if (a.captor === selfId && d <= UNTIE_RANGE && ItemDB.isApple(heldItemId)) primary.push({ kind: 'feed', label: 'Feed ' + ItemDefs[heldItemId].name.toLowerCase(), dist: d - 1, animal: a });   // a caught wild pony: hold an apple and feed it (wins over a gate next to it)
      else if (def.carry && Wants.isQuestCreature(a.type) && d <= PICKUP_RANGE && a.state !== 'flee' && (!a.owner || a.owner === selfId)) primary.push({ kind: 'pickup', label: 'Pick up', dist: d, animal: a });
      if (canBefriendAnimal(a.type) && !a.captor && !a.rider && d <= CONFIG.sim.friendship.petReach) {            // make friends: a treat it likes, or a pet (which loses to riding / picking up when they compete)
        const opinion = Friendship.opinion(animalTastes(a.type), heldItemId);
        const mineToRide = false;
        if (opinion === 'liked' || opinion === 'loved') primary.push({ kind: 'treat', label: `Give ${ItemDefs[heldItemId].name}`, dist: mineToRide ? d + 0.3 : d - 0.3, animal: a });
        else primary.push({ kind: 'pet', label: `Pet ${def.name}`, dist: d + 0.6, animal: a });
      }
      mark(before);
    }
    for (const id in npcs) {                              // people: talk, or give the thing you are holding if they have an opinion about it (works from the saddle too)
      const npc = npcs[id], d = Math.hypot(npc.x - p.x, npc.y - p.y);
      if (d > CONFIG.sim.friendship.reach || !sameGrid(npc, p)) continue;
      const tastes = Npcs.get(npc.type) && Npcs.get(npc.type).tastes;
      if (heldItemId && Friendship.opinion(tastes, heldItemId) !== 'neutral') primary.push({ kind: 'gift', label: `Give ${ItemDefs[heldItemId].name}`, dist: d - 0.4, npc, ref: id });
      else primary.push({ kind: 'talk', label: `Talk to ${npc.name}`, dist: d, npc, ref: id });                       // (the nearest thing wins: a pony beside you is ridden, not chatted to)
    }                                  // things you pick up, open or climb into win over water (boats always sit next to water)
    const forage = findForageable(map, p, FORAGE_RANGE, heldItemId);
    if (forage) primary.push({ kind: 'pick', label: FORAGE_VERB[forageKind(forage.prop)] || 'Pick', dist: forage.dist, forage });
    const chest = findChest(map, p);
    if (chest && !p.looted) primary.push({ kind: 'loot', label: 'Open', dist: chest.dist, chest });
    for (const [dropId, d] of Object.entries(drops)) {    // items lying on the ground
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      if (dist <= CONFIG.sim.drops.pickupRange && sameGrid(d, p)) primary.push({ kind: 'pickDrop', label: 'Pick up', dist: dist - 0.2, drop: d, ref: dropId });
    }
    const pile = Stockpiles.nearest(map, p);
    if (pile && map.stockpiles[pile.key]) primary.push({ kind: 'stockpile', label: 'Deliver', dist: pile.dist + 0.3, pile });     // deliver the resource you carry
    const door = BuildSystem.findDoor(map, p);
    if (door) primary.push({ kind: 'door', label: StructureDefs[door.type].verb, dist: door.dist, door });
    const boat = BoatSystem.findBoardable(boats, p);
    if (boat && !mounted) primary.push({ kind: 'board', label: 'Board', dist: Math.hypot(boat.x - p.x, boat.y - p.y), boat });
    if (primary.length) return extras.concat(primary.sort((a, b) => a.dist - b.dist));
    if (mounted) return extras;                           // (getting off is the Ride button's job (Z), so the action button only shows what else there is to do from the saddle)
    const water = CONFIG.sim.vitals ? findWaterSource(map, p) : null;      // (no drinking or jug filling while hunger and thirst are off)
    if (!water) { const camp = Sleep.find(map, p, heldItemId, animals); return camp && camp.kind === 'camp' ? extras.concat(camp) : extras; }   // nothing else to do here: tired in the woods, you may camp
    const fill = heldItemId === 'jug';                    // an empty jug gets filled
    return extras.concat({ kind: fill ? 'fill' : 'drink', label: fill ? 'Fill' : 'Drink', dist: water.dist, water });
  },

  /** A name for one entry of list(), the same on the client and the server: kind + which thing (an animal's or villager's id, a tile, a prop...). */
  keyOf(a) {
    const at = (x, y) => Math.round(x * 2) / 2 + ',' + Math.round(y * 2) / 2;
    let who = a.ref !== undefined ? a.ref : a.animal ? a.animal.id : a.who ? a.who : a.forage ? a.forage.tx + ',' + a.forage.ty : a.door ? a.door.tx + ',' + a.door.ty + ',' + a.door.slot
      : a.chest ? at(a.chest.prop.x, a.chest.prop.y) : a.pile ? a.pile.key : a.boat ? (a.boat.id || at(a.boat.x, a.boat.y)) : a.water ? at(a.water.x, a.water.y)
      : typeof a.site === 'number' ? a.site : typeof a.fx === 'number' ? a.fx + ',' + a.fy : typeof a.tx === 'number' ? a.tx + ',' + a.ty : a.node !== undefined ? a.node : a.dungeon !== undefined ? a.dungeon : '';
    return a.kind + ':' + who;
  },

  /** The entry of `list` the player picked (by its key), else the first. */
  choose(list, key) { return (key && list.find(a => Interactions.keyOf(a) === key)) || list[0] || null; }
};
