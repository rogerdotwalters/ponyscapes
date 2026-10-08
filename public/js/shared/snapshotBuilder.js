'use strict';
/* SHARED - turns the server's state into the messages a player receives. One place, used by the solo LocalAdapter and by the host
 * of an online session, so a remote friend gets exactly what a local player gets.
 * GRIDS: a player is only sent what is on THEIR grid (people, animals, items on the ground, and the events that happened there); villagers and
 * boats only in the overworld. The overworld's buildings, trees and stockpiles are always sent (the client keeps the overworld while indoors). */
const SnapshotBuilder = {
  /** Only what is on this grid: a { id: thing } table filtered by each thing's `grid`. */
  onGrid(table, grid) { const out = {}; for (const k in table || {}) if (gridOf(table[k]) === grid) out[k] = table[k]; return out; },
  /** Events this player should see: everything addressed to them, plus what happened on their grid (or nowhere in particular). */
  eventsFor(events, id, grid) { return events.filter(e => e.to === id || (e.to === undefined && (e.grid === undefined ? !grid || (e.x === undefined && e.tx === undefined) : e.grid === grid))); },
  /** Everything a player needs to start: their seat, the world seed, and the full state around them. */
  welcomeFor(server, id) {
    const player = server.players[id], grid = gridOf(player), outside = !grid, on = t => SnapshotBuilder.onGrid(t, grid);
    return {
      id, slot: player.slot, mapSeed: server.map.seed, tickRate: CONFIG.sim.tickRate, tick: server.tick, player,
      inventory: server.inventoryUpdateFor(id), coins: (server.coinsSent[id] = server.inventories[id].purse || 0), questLog: (server.quests.sentRev[id] = server.quests.rev, server.quests.wire()), pack: (delete server.packSent[id], server.packUpdateFor(id)), built: server.builtUpdateFor(id), floors: server.floorsUpdateFor(id), farm: server.farmUpdateFor(id), stockpiles: server.stockpilesUpdateFor(id), host: id === server.hostId,
      boats: outside ? server.boatStates() : {}, drops: on(server.dropStates()), trees: collectTreeStates(server.map), forage: collectForageStates(server.map),
      animals: on(server.animals.states(server._humans())), npcs: on(server.npcs.states()), friends: server.friendship.fullFor(id), progress: server.progressUpdateFor(id), treasure: server.treasureUpdateFor(id),
      pets: server.petsFor(id), book: server.bookFor(id), varieties: server.varietiesFor(id), rings: server.ringsUpdateFor(id) || server.worldProgress.toWire(), settings: server.settingsUpdateFor(id), admin: (server.adminSentRev[id] = server.adminRev, GameSettings.wire()), weather: (server.weather.sentRev[id] = server.weather.rev, server.weather.wire())
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
    const snapshot = Object.assign({}, base), grid = gridOf(server.players[id]), on = t => SnapshotBuilder.onGrid(t, grid);
    snapshot.players = on(base.players); snapshot.animals = on(base.animals); snapshot.drops = on(base.drops);            // only your own grid
    snapshot.npcs = on(base.npcs);                                                                                      // (a villager is on their own grid: a shopkeeper stands in their shop's room)
    if (grid) snapshot.boats = {};
    snapshot.events = SnapshotBuilder.eventsFor(base.events, id, grid);
    snapshot.pets = server.petsFor(id); snapshot.book = server.bookFor(id); snapshot.varieties = server.varietiesFor(id);   // the Pony Book, every snapshot (it is small)
    const inventory = server.inventoryUpdateFor(id);   if (inventory) snapshot.inventory = inventory;
    const coins = server.coinsUpdateFor(id);           if (coins !== null) snapshot.coins = coins;           // the coin purse, only when it changed
    const questLog = server.quests.updateFor(id);      if (questLog) snapshot.questLog = questLog;           // the world's quest log, only when it changed
    const built = server.builtUpdateFor(id);           if (built) snapshot.built = built;
    const floors = server.floorsUpdateFor(id);         if (floors) snapshot.floors = floors;
    const farm = server.farmUpdateFor(id);             if (farm) snapshot.farm = farm;                    // the fields: tilled, watered, growing (farming.js)
    const stock = server.stockpilesUpdateFor(id);      if (stock) snapshot.stockpiles = stock;            // { piles, levels }: the town's storage
    const progress = server.progressUpdateFor(id);     if (progress) snapshot.progress = progress;        // { s: {skill: xp}, a: {attribute: xp} }
    const treasure = server.treasureUpdateFor(id);     if (treasure) snapshot.treasure = treasure;        // [{ key, tx, ty }] where your maps lead
    const rings = server.ringsUpdateFor(id);           if (rings) snapshot.rings = rings;                  // a guardian fell: a ring opened
    const friends = server.friendship.updateFor(id);  if (friends) snapshot.friends = friends;            // your hearts with people and animals, only when they changed
    const settings = server.settingsUpdateFor(id);     if (settings) snapshot.settings = settings;          // the host's testing aids, only when they changed
    const admin = server.adminUpdateFor(id);           if (admin) snapshot.admin = admin;
    const weather = server.weather.updateFor(id);      if (weather) snapshot.weather = weather;          // the sky, only when a new spell begins (weather.js)
    const quests = server.tick % 15 === 0 || !server.wants.marksSent[id] ? server.wants.marksFor(id) : null; if (quests) snapshot.quests = quests;   // lost young you have tracked (map)                  // the Admin page's speed, day split, time and clock (everyone)
    const trade = server.tradeUpdateFor(id);           if (trade) snapshot.trade = trade;                  // { state }, only when it changed
    const pack = server.packUpdateCheck(id);           if (pack !== null) snapshot.pack = pack;            // the pack of the pony you can reach (false: none), only when it changed
    const chest = server.chestUpdateFor(id);           if (chest !== null) snapshot.chest = chest;         // the chest you have open (false: closed), only when it changed
    return snapshot;
  }
};
