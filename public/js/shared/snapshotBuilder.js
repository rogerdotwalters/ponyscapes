'use strict';
/* SHARED - turns the server's state into the messages a player receives. One place, used by the solo LocalAdapter and by the host
 * of an online session, so a remote friend gets exactly what a local player gets. */
const SnapshotBuilder = {
  /** Everything a player needs to start: their seat, the world seed, and the full state around them. */
  welcomeFor(server, id) {
    const player = server.players[id];
    return {
      id, slot: player.slot, mapSeed: server.map.seed, tickRate: CONFIG.sim.tickRate, tick: server.tick, player,
      inventory: server.inventoryUpdateFor(id), built: server.builtUpdateFor(id), floors: server.floorsUpdateFor(id), stockpiles: server.stockpilesUpdateFor(id), host: id === server.hostId,
      boats: server.boatStates(), drops: server.dropStates(), trees: collectTreeStates(server.map), forage: collectForageStates(server.map),
      animals: server.animals.states(server._humans()), npcs: server.npcs.states(), friends: server.friendship.fullFor(id), progress: server.progressUpdateFor(id), treasure: server.treasureUpdateFor(id),
      pets: server.petsFor(id), book: server.bookFor(id), varieties: server.varietiesFor(id), rings: server.ringsUpdateFor(id) || server.worldProgress.toWire(), settings: server.settingsUpdateFor(id)
    };
  },

  /** Take ONE broadcast snapshot (this drains the server's events) and make a personal copy for each id. */
  snapshotsFor(server, ids) {
    const base = server.takeSnapshot(), out = {};
    for (const id of ids) out[id] = SnapshotBuilder.personalize(server, base, id);
    return out;
  },

  /** The shared part plus what only this player may see: their pack, maps, trade window, ponies, and events addressed to them. */
  personalize(server, base, id) {
    const snapshot = Object.assign({}, base);
    snapshot.events = base.events.filter(e => e.to === undefined || e.to === id);
    snapshot.pets = server.petsFor(id); snapshot.book = server.bookFor(id); snapshot.varieties = server.varietiesFor(id);   // the Pony Book, every snapshot (it is small)
    const inventory = server.inventoryUpdateFor(id);   if (inventory) snapshot.inventory = inventory;
    const built = server.builtUpdateFor(id);           if (built) snapshot.built = built;
    const floors = server.floorsUpdateFor(id);         if (floors) snapshot.floors = floors;
    const stock = server.stockpilesUpdateFor(id);      if (stock) snapshot.stockpiles = stock;            // { piles, levels }: the town's storage
    const progress = server.progressUpdateFor(id);     if (progress) snapshot.progress = progress;        // { s: {skill: xp}, a: {attribute: xp} }
    const treasure = server.treasureUpdateFor(id);     if (treasure) snapshot.treasure = treasure;        // [{ key, tx, ty }] where your maps lead
    const rings = server.ringsUpdateFor(id);           if (rings) snapshot.rings = rings;                  // a guardian fell: a ring opened
    const friends = server.friendship.updateFor(id);  if (friends) snapshot.friends = friends;            // your hearts with people and animals, only when they changed
    const settings = server.settingsUpdateFor(id);     if (settings) snapshot.settings = settings;          // the host's testing aids, only when they changed
    const trade = server.tradeUpdateFor(id);           if (trade) snapshot.trade = trade;                  // { state }, only when it changed
    return snapshot;
  }
};
