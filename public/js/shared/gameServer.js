'use strict';
/* SERVER-SIDE authoritative world. No timers, no sockets: whoever hosts it (LocalAdapter now,
 * a Durable Object later) calls step() at tickRate and ships takeSnapshot() / *UpdateFor(). */
/** Which skill a forageable trains. */
const ForageSkill = { bush: 'foraging', flax: 'foraging', apple_tree: 'foraging', bottle: 'foraging', stone: 'digging', clay: 'digging', mound: 'digging' };
const SERVER_STREAM_RADIUS = 2, SERVER_KEEP_RADIUS = 6, BOAT_SYNC_RADIUS = 90;     // chunks / chunks / tiles
const SERVER_CHUNKS_PER_TICK = 2;                                                    // new chunks (beyond the nearest 3 x 3) made per player per tick

/** The server's event list. Each event remembers the grid it happened on (GameServer.eventGrid at the time), so a puff of dust in a cave is only
 *  shown to the people in that cave. Events with no position, or addressed to one player, go wherever they are meant to. */
class GridEvents extends Array {
  static get [Symbol.species]() { return Array; }
  static of(server) { const list = new GridEvents(); list.server = server; return list; }
  push(...events) {
    const grid = this.server ? this.server.eventGrid : '';
    if (grid) for (const e of events) if (e && typeof e === 'object' && e.grid === undefined) e.grid = grid;
    return super.push(...events);
  }
}

class GameServer {
  /** @param {number} seed  @param {{world?: object}} [options] world: a sanitized saved world (SaveData.sanitizeWorld) to continue instead of starting fresh */
  constructor(seed, options = {}) {
    GameSettings.startHost();                                                // the Admin page's values (this browser's, else js/content/gameSettings.js): before any land is made
    this.map = new World(seed);                                              // THE OVERWORLD grid ('')
    this.grids = new GridSet(seed, this.map);                                // ...and every instance (rooms, caves: js/shared/grids.js), built when first entered
    this.eventGrid = '';                                                     // which grid the events pushed now happened on
    if (options.world) SaveData.applyMapState(this.map, options.world);      // before any chunk exists, so props are generated already felled / picked
    this.map.onChunkGenerated = chunk => this._onChunkGenerated(chunk);
    this.tick = 0;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.players = {}; this.inputQueues = {}; this.bots = {};
    this.inventories = {}; this.inventoryRev = {}; this.inventorySentRev = {}; this.packSent = {}; this.packCheck = {};
    this.builtRev = 1; this.builtSentRev = {}; this.floorsRev = 1; this.floorsSentRev = {};
    this.stockRev = 1; this.stockSentRev = {}; this.carryNoticeAt = {};
    this.playerKeys = {}; this.keyTokens = {}; this.tokenKeys = {}; this.tokenSeq = 0; this.petsClaimed = {};   // who owns what across seats (serverOwned.js): seat id -> player key, key <-> away token
    this.drops = {}; this.nextDropId = 1; this.dropsRev = 1; this.later = [];            // (later: things that happen a moment from now, such as a felled tree breaking into logs)                            // items lying on the ground      // the town's stockpiles + building levels (stockpiles.js), and when each player was last told they carry too much
    this.progress = new Progression({ emit: e => this.pendingEvents.push(e), onLevels: (id, lv) => this._applyLevels(id, lv) });
    this.progressSent = {};                                // id -> { value }: which XP revision the client has
    this.treasureMaps = {}; this.treasureRev = {}; this.treasureSent = {}; this.rideAcc = {};
    this.hostId = null; this.vitalSettings = {};          // the host (first human) sets hunger / thirst modes per player slot
    this.boats = {};
    this.pendingEvents = GridEvents.of(this);
    this.trees = new TreeSystem(this.map, this.rng, () => this.tick);
    this.forage = new ForageSystem(this.map, this.rng, () => this.tick);
    this.vitals = new VitalsSystem({ emit: e => this.pendingEvents.push(e), markInventoryChanged: id => { this.inventoryRev[id]++; } });
    this.lightCache = [];                                  // campfires + held torches, rebuilt every tick
    this.animals = new AnimalSystem({ map: this.map, mapOf: a => this.mapOf(a), rng: this.rng, getTick: () => this.tick, emit: e => this._emitFrom(this.animals.active, e),
      damagePlayer: (id, amount) => this._damagePlayer(id, amount), getLights: () => this.lightCache, onKilled: (a, def) => this.dungeons.onKilled(a, def) });
    this.npcs = new NpcSystem({ map: this.map, rng: this.rng });                                    // the villagers (placed once the server is fully built, below)
    this.friendship = new FriendshipSystem(this);                                                   // the heart meter, for people and animals alike
    Object.assign(InteractionHandlers, {
      talk: (srv, id, p, act) => srv.friendship.act(id, srv.npcs.npcs[act.npc.id], 'talk'),
      gift: (srv, id, p, act) => srv.friendship.act(id, srv.npcs.npcs[act.npc.id], 'gift', p.held),
      pet:  (srv, id, p, act) => srv.friendship.act(id, srv.animals.animals[act.animal.id], 'pet'),
      treat: (srv, id, p, act) => srv._treat(id, p, act)
    });
    this.trade = new TradeSystem({ players: this.players, inventories: this.inventories, bots: this.bots, rng: this.rng,
      emit: e => this.pendingEvents.push(e), markInventoryChanged: id => { this.inventoryRev[id]++; }, notice: (id, text) => this._notice(id, text) });
    this.everTamed = {};                                   // ownerId -> { animalType: true }: the Pony Book remembers every kind you have kept
    this.worldProgress = new WorldProgress(this.map.layers.rings);                       // which guardians are down; which rings are open
    this.dungeons = new DungeonSystem(this); this.ringsSentRev = {};
    this.interiors = new InteriorSystem(this);                               // rooms inside buildings (interiorSystem.js)
    this.wants = new WantSystem(this);                                       // what creatures ask for, and the bosses you can appease (wantSystem.js)
    this.settings = { hostilesOff: false, testPony: false }; this.settingsRev = 1; this.settingsSentRev = {}; this.adminRev = 1; this.adminSentRev = {}; this.testPonyId = '';      // the host's testing aids
    this.everVariants = {};                                // ownerId -> { variantIndex: true }: ...and every biome variety
    this.populatedChunks = new Set();                      // chunks whose animal group has been spawned (killed ones are replaced by respawns, not by regeneration)
    this.tools = new ToolSystem({ handlers: this._createToolHandlers(), heldFor: (id, p, inventory, input) => this._heldFor(id, p, inventory, input),
      onImpact: (id, p) => { if (p.mount) this._ponyXp(this.animals.animals[p.mount], CONFIG.sim.ponyLeveling.taskXp); } });   // work done from the saddle trains the pony
    if (options.world) SaveData.applyTimers(this, options.world);                // the clock and regrow timers: the home and paddock are already in the saved map
    if (options.world) SaveData.applyOwned(this, options.world);                 // everybody's ponies (waiting for their owners) and the items on the ground
    else if (CONFIG.sim.testKit) { this._buildStarterHome(); this._buildStarterPaddock(); this._buildStarterStockpiles(); this._spawnTutorialPony(); }
    this.npcs.populate();                                  // the villagers move in
  }

  /** The World an entity (player, animal, item on the ground) is on: the overworld or its instance. */
  mapOf(entity) { return this.grids.of(entity); }
  /** An event that happened where `who` is (its grid), e.g. an animal biting. */
  _emitFrom(who, e) { if (who && who.grid && e.grid === undefined) e.grid = who.grid; this.pendingEvents.push(e); }
  /** Move someone to another grid (through a door, into a cave, back out): their mount and any pet on their rope come along. */
  _moveToGrid(id, p, grid, x, y) {
    const map = this.grids.get(grid);
    grid = map.grid;                                                         // (an unknown grid id means the overworld)
    map.ensureAround(x, y, SERVER_STREAM_RADIUS);
    p.grid = grid; p.x = x; p.y = y; p.vx = p.vy = 0;
    if (p.flying) { p.flying = false; p.flyT = 0; }
    const mount = p.mount && this.animals.animals[p.mount];
    if (mount) { mount.grid = grid; mount.x = x; mount.y = y; mount.vx = mount.vy = 0; }
    for (const a of Object.values(this.animals.animals)) {                  // a pet on a rope comes too, and so does your main pony
      if ((a.leashed && (a.owner === id || a.captor === id) || (a.main && a.owner === id)) && a.id !== p.mount) { a.grid = grid; a.x = x - 0.8; a.y = y + 0.4; a.vx = a.vy = 0; a.home = { x: a.x, y: a.y }; }
    }
    this.eventGrid = grid;
  }

  /** Three stockpiles in the home's yard, already holding some of what the testing kit used to put in your pack. */
  _buildStarterStockpiles() {
    const spots = [[18, 29], [18, 30], [18, 31], [19, 29], [19, 30], [13, 29], [13, 30], [13, 31]];
    const free = ([tx, ty]) => !isWaterTile(this.map.tile(tx, ty)) && !this.map.objAt(tx, ty) && !this.map.propAt(tx, ty) && !this.map.built[tileKey(tx, ty)];
    for (const [type, items] of [['stockpile_wood', { log: 30, plank: 40 }], ['stockpile_stone', { stone: 20 }], ['stockpile_clay', { clay: 10 }]]) {
      const spot = spots.find(free);
      if (!spot) return;
      BuildSystem.place(this.map, spot[0], spot[1], type, 'c');
      Stockpiles.ensure(this.map, spot[0], spot[1]);
      Object.assign(this.map.stockpiles[tileKey(spot[0], spot[1])].items, items);
    }
    this.builtRev++; this.stockRev++;
  }

  /** The testing version starts with an open-air crafting table in the yard of the player home (the home itself is a building you walk into). */
  _buildStarterHome() {
    const W = Village.workshop;
    BuildSystem.place(this.map, W.x, W.y, 'crafting_table', 'c');
    this.builtRev++;
  }

  /** A fenced paddock with a gate and a stable in it, next to the home: somewhere to lead a caught wild pony and feed it apples. */
  _buildStarterPaddock() {
    const P = Village.paddock, put = (tx, ty, type, slot) => BuildSystem.place(this.map, tx, ty, type, slot), midY = Math.floor((P.y0 + P.y1) / 2);
    for (let tx = P.x0; tx <= P.x1; tx++) { put(tx, P.y0, 'wood_fence', 'n'); put(tx, P.y1, 'wood_fence', 's'); }
    for (let ty = P.y0; ty <= P.y1; ty++) { put(P.x0, ty, 'wood_fence', 'w'); put(P.x1, ty, 'wood_fence', 'e'); }
    put(P.x0, midY, 'wood_gate', 'w');                         // the gate faces the home
    put(P.x1 - 1, midY - 1, 'stable', 'c');                    // the stable stands against the far fence
    this.builtRev++;
  }

  /** A shy wild earth pony grazing just outside the paddock, to practise on. */
  _spawnTutorialPony() {
    const P = Village.paddock;
    for (const [dx, dy] of [[6, 2], [6, 0], [7, 3], [5, 4], [8, 1], [6, 5]]) {
      const tx = P.x1 + dx, ty = P.y0 + dy;
      if (this.map.tile(tx, ty) === TILE.GRASS && !this.map.navBlocked(tx, ty)) { this.tutorialPony = this.animals.spawn('pony_earth', tx + 0.5, ty + 0.5, 424242, { level: 1, variant: 0 }); return; }
    }
  }

  /** Every player of the testing version owns one tamed earth pony, free to roam near the home and rideable. */
  _giveStarterPony(id) {
    const p = this.players[id], spawn = Village.spawns[p.slot];
    const pony = this.animals.release('pony_earth', spawn.x - 2.2, spawn.y + 0.6, id, 7000 + p.slot * 13, { level: 1, variant: 0, rarity: 'rare' });   // rare: its ability can be tried at once (ride it, press H)
    pony.starter = true;                                                     // (it makes way if this player's own ponies are waiting in the world)
    pony.main = true;                                                        // ...and it is their main pony: it follows them about
    this._ponyBags(pony).bags[0] = CONFIG.sim.inventory.starterPonyBag;      // ...wearing the Starter Side Pack (10 slots): the rest of the test kit is in it
    this._ponyBags(pony);
    if (CONFIG.sim.testKit) TestKitPony.forEach(([item, count]) => pony.pack.add(item, count));
    this._remember(id, pony);
    return pony;
  }

  /** A new chunk may carry a boat (shoreline) and a herd of animals; both are created once and then live on as entities. */
  _onChunkGenerated(chunk) {
    if (chunk.boatSpot) {
      const id = 'b' + chunk.cx + '_' + chunk.cy;
      if (!this.boats[id]) this.boats[id] = createBoat(id, chunk.boatSpot);
    }
    const key = chunkKey(chunk.cx, chunk.cy);
    if (chunk.animals.length && !this.populatedChunks.has(key)) {
      this.populatedChunks.add(key);
      for (const a of chunk.animals) this.animals.spawn(a.type, a.x, a.y, a.gene, { variant: a.variant, level: a.level });
    }
  }

  _createToolHandlers() {
    const deps = {
      map: this.map, trees: this.trees,
      getInventory: id => this.inventories[id],
      emit: event => this.pendingEvents.push(event),
      markInventoryChanged: id => { this.inventoryRev[id]++; },
      markBuiltChanged: layer => { if (layer === 'floors') this.floorsRev++; else this.builtRev++; },
      markStockChanged: () => { this.stockRev++; },
      getPlayer: id => this.players[id], rng: this.rng, animals: this.animals,
      award: (id, skill, xp) => this.progress.award(id, skill, xp),
      pickUp: (id, found) => this._pickUp(id, found), digTreasure: (id, site) => this._digTreasure(id, site),
      mapSitesOf: id => this.treasureMaps[id],
      dropOnGround: (item, count, x, y, grid) => this._dropOnGround(item, count, x, y, grid),
      tick: () => this.tick,
      till: (id, cx, cy) => this._till(id, cx, cy), water: (id, cx, cy) => this._water(id, cx, cy),
      later: (seconds, fn) => this.later.push({ at: this.tick + Math.max(1, Math.round(seconds / TICK_DT)), fn }), groom: (id, a, item) => this._groom(id, a, item)
    };
    const hunt = new HuntHandler(deps), grass = new GrassCutHandler(Object.assign({}, deps, { cutGrass: (id, tiles) => this._cutGrass(id, tiles) }));
    this.toolDeps = deps;                                                     // (pony abilities strike animals the way weapons do)
    deps.onTamed = (ownerId, animal) => this._remember(ownerId, animal);
    return { brush: new GroomHandler(deps), leash: new LeashHandler(deps), axe: new TreeHarvestHandler(deps), hammer: new DemolishHandler(deps), knife: withGrass(hunt, grass), spear: hunt, sword: withGrass(hunt, grass), sickle: grass, bow: new BowHandler(deps), rod: new FishingHandler(deps), shovel: new ShovelHandler(deps), shears: withGrass(new ShearHandler(deps), grass), hoe: new HoeHandler(deps), water: new WaterHandler(deps) };
  }

  /* ---- membership ---- */
  addPlayer(isBot) {
    const slot = this._freeSlot();
    if (slot >= CONFIG.sim.maxPlayers) return null;
    const id = 'p' + (slot + 1);
    this.players[id] = createPlayer(slot, Village.spawns[slot]);
    Object.assign(this.players[id], this.vitalSettings[id] || {});
    if (!isBot && !this.hostId) this.hostId = id;
    this.map.ensureAround(this.players[id].x, this.players[id].y, SERVER_STREAM_RADIUS);
    this.inventories[id] = createStarterInventory();
    this.progress.ensure(id); this.progressSent[id] = { value: -1 }; this.treasureMaps[id] = []; this.treasureRev[id] = 1; this.treasureSent[id] = 0;
    this.players[id].lv = this.progress.levels(id); this.players[id].maxHp = Skills.maxHp(this.players[id].lv); this.players[id].hp = this.players[id].maxHp;
    if (CONFIG.sim.testKit && !isBot) this._giveStarterPony(id);
    this.inventoryRev[id] = 1; this.inventorySentRev[id] = 0; this.builtSentRev[id] = 0; this.floorsSentRev[id] = 0; this.stockSentRev[id] = 0;
    this._updateCompanions();
    if (isBot) this.bots[id] = createBotBrain(); else this.inputQueues[id] = [];
    return id;
  }
  removePlayer(id) {
    this._dismount(id, this.players[id]);
    this._parkPets(id);                                                  // their ponies stay in the world, waiting for them (serverOwned.js)
    this.friendship.forget(id);                                          // the next person to sit here must not inherit these friendships
    this.trade.cancel(id, 'Trade cancelled: player left');
    delete this.playerKeys[id]; delete this.petsClaimed[id];
    const boat = this.boats[this.players[id] && this.players[id].boat];
    if (boat) boat.occupant = '';
    [this.players, this.inputQueues, this.bots, this.inventories, this.inventoryRev, this.inventorySentRev, this.packSent, this.packCheck, this.builtSentRev, this.floorsSentRev, this.stockSentRev, this.carryNoticeAt, this.progressSent, this.treasureMaps, this.treasureRev, this.treasureSent, this.rideAcc]
      .forEach(t => delete t[id]);
    delete this.ringsSentRev[id]; delete this.settingsSentRev[id];
    delete this.progress.data[id]; delete this.progress.rev[id]; delete this.everTamed[id]; delete this.everVariants[id];   // (else the next person to sit here would inherit this one's skills and Pony Book)
  }
  /** Who is a person (as opposed to a bot): their ids, in seat order. */
  humanIds() { return Object.keys(this.inputQueues).sort(); }

  /** A person joins. A bot gives up its seat if the table is full. Returns the new player id, or null if four people already sit here.
   *  `character` is a saved character (SaveData) to restore; without one they get a fresh starter pack. */
  /** `key` is the person's player key (their identity across sessions): their ponies left in the world come back to them. */
  joinHuman(character, name = '', appearance = null, key = '') {
    if (this._freeSlot() >= CONFIG.sim.maxPlayers) {
      const bot = Object.keys(this.bots).sort()[0];
      if (!bot) return null;
      this.removePlayer(bot);
    }
    const id = this.addPlayer(false);
    if (!id) return null;
    this.players[id].name = name;
    if (key) { this.playerKeys[id] = key; this.petsClaimed[id] = this._claimPets(id, key); }
    if (character) SaveData.importCharacter(this, id, character);
    const look = CharacterLook.sanitize(appearance);                    // what they chose on the character screen wins over what was saved
    if (look) { this.players[id].appearance = look; this.fitWardrobe(id); }
    return id;
  }
  /** A person leaves: their seat goes back to a bot (up to the configured number) so the village stays lively. */
  leaveHuman(id) {
    this.removePlayer(id);
    if (Object.keys(this.bots).length < CONFIG.net.bots && this._freeSlot() < CONFIG.sim.maxPlayers) this.addPlayer(true);
  }

  _freeSlot() {
    const used = Object.values(this.players).map(p => p.slot);
    let slot = 0; while (used.includes(slot)) slot++;
    return slot;
  }

  /* ---- messages from clients ---- */
  receiveInput(id, input) {
    const queue = this.inputQueues[id];
    if (!queue) return;
    queue.push(sanitizeInput(input));
    if (queue.length > CONFIG.sim.maxInputsPerTick * 4) queue.shift();
  }

  receiveCommand(id, cmd) {
    const inventory = this.inventories[id];
    if (!inventory || !cmd) return;
    switch (cmd.type) {
      case 'setting': if (id === this.hostId) this.applySetting(cmd.key, !!cmd.value); break;           // host-only testing aids
      case 'admin': if (id === this.hostId && cmd.values) { GameSettings.setLive(cmd.values, this.tick); this.adminRev++; } break;   // the Admin page: speed, day split, time (sent to everyone)
      case 'ability': this._useAbility(id, cmd.id); break;
      case 'dismount': if (this.players[id].mount) this._dismount(id, this.players[id]); break;
      case 'mainPony': this._makeMainPony(id); break;                                                       // riding one of your ponies: it becomes the one that follows you                // the dedicated way off a pony (Z)
      case 'moveSlot': this._handleMoveSlot(id, inventory, cmd); break;
      case 'equip': this._handleEquip(id, inventory, cmd.from); break;
      case 'packMove': this._packMove(id, inventory, cmd); break;                                           // between your bag and your pony's pack (packSystem.js)
      case 'ponyBagOn': this._ponyBagOn(id, inventory, cmd.from); break;
      case 'ponyBagOff': this._ponyBagOff(id, inventory, cmd.index); break;
      case 'buy': if (typeof cmd.item === 'string') this._buy(id, cmd.item); break;                          // at a shop counter (shopSystem.js)
      case 'unequip': this._handleUnequip(id, inventory, cmd.slot); break;
      case 'emote': this._handleEmote(id, cmd.id); break;
      case 'release': this._handleRelease(id, cmd); break;
      case 'tradeRequest': this.trade.request(id, cmd.target); break;
      case 'tradeAccept': this.trade.accept(id); break;
      case 'tradeCancel': this.trade.cancel(id); break;
      case 'tradeOffer': this.trade.offer(id, cmd.item, cmd.count); break;
      case 'tradeConfirm': this.trade.confirm(id, cmd.value); break;
      case 'craft': this._craftWithLasso(id, inventory, cmd); break;
      case 'place': this._handlePlace(id, inventory, cmd); break;
      case 'setVitals': this._handleSetVitals(id, cmd); break;
      case 'stockTake': this._handleStockTake(id, inventory, cmd); break;
      case 'upgrade': this._handleUpgrade(id, inventory, cmd); break;
      case 'drop': case 'destroy': {
        const from = cmd.pack ? this._packPonyOf(id) : null;
        if (cmd.pack && !from) break;
        if (cmd.type === 'drop') this._handleDrop(id, from ? from.pack : inventory, cmd); else this._handleDestroy(id, from ? from.pack : inventory, cmd);
        break;
      }
    }
  }

  _handleCraft(id, inventory, cmd) {
    const p = this.players[id], map = this.mapOf(p), supply = Stockpiles.supplyFor(map, p);      // the crafting table pulls from (and stores into) the stockpiles linked to it
    const result = CraftingSystem.craft(inventory, cmd.recipe, BuildSystem.stationsNear(map, p), supply);
    if (!result.ok) { this._notice(id, result.reason); return; }
    this.inventoryRev[id]++;
    if (result.usedSupply) this.stockRev++;
    this.progress.award(id, 'crafting', RecipeDefs[cmd.recipe].station ? 14 : 8);
    result.outputs.forEach(o => this.pendingEvents.push({ type: 'gain', to: id, item: o.item, count: o.count }));
  }

  /** Build the item in a hotbar slot: a wall piece on a tile side, a floor on a tile, or a station that fills the tile. */
  _handlePlace(id, inventory, cmd) {
    const player = this.players[id];
    if (player.boat) return;                                       // no building from a boat
    if (gridOf(player)) { this._notice(id, 'You cannot build in here'); return; }       // (only the overworld is built on, for now)
    const slotIndex = Number.isInteger(cmd.slot) ? sanitizeSlot(cmd.slot) : player.sel;
    const itemId = inventory.itemIdAt(slotIndex), placeable = ItemDB.getPlaceable(itemId);
    if (!placeable || !Number.isInteger(cmd.tx) || !Number.isInteger(cmd.ty)) return;
    if (!CONFIG.sim.construction && StructureDefs[placeable.structure].layer !== 'station') { this._notice(id, 'Building walls, floors and fences is switched off'); return; }
    if (StructureDefs[placeable.structure].layer === 'wall' && !SIDES.includes(cmd.side)) return;
    const slot = slotFor(placeable.structure, cmd.side);

    const check = BuildSystem.canPlace(this.map, cmd.tx, cmd.ty, slot, Object.values(this.players), player, placeable.structure);
    if (!check.ok) { this._notice(id, check.reason); return; }

    const replaced = StructureDefs[placeable.structure].insert ? builtAt(this.map, cmd.tx, cmd.ty, slot) : null;   // a window / door takes the wall's place
    if (replaced && !inventory.canAdd(StructureDefs[replaced].refundItemId, 1) && inventory.count(itemId) !== 1) { this._notice(id, 'Inventory full'); return; }
    inventory.remove(itemId, 1);
    if (replaced) inventory.add(StructureDefs[replaced].refundItemId, 1);                                       // ...and the wall item comes back
    BuildSystem.place(this.map, cmd.tx, cmd.ty, placeable.structure, slot);
    if (StructureDefs[placeable.structure].stockpile) { Stockpiles.ensure(this.map, cmd.tx, cmd.ty); this.stockRev++; }
    this.inventoryRev[id]++;
    if (slot === 'f') this.floorsRev++; else this.builtRev++;
    this.progress.award(id, 'building', 12);
    this.pendingEvents.push({ type: 'built', tx: cmd.tx, ty: cmd.ty, side: slot, by: id });
  }

  /** Host only: set how hunger / thirst behave for a player slot (p1..p4). */
  _handleSetVitals(id, cmd) {
    const modes = CONFIG.sim.vitalModes, target = cmd.target;
    if (id !== this.hostId || !/^p[1-9]$/.test(target || '')) return;
    const settings = this.vitalSettings[target] || (this.vitalSettings[target] = { hungerMode: 'normal', thirstMode: 'normal' });
    if (modes[cmd.hunger]) settings.hungerMode = cmd.hunger;
    if (modes[cmd.thirst]) settings.thirstMode = cmd.thirst;
    if (this.players[target]) Object.assign(this.players[target], settings);
  }

  /* ---- the town: stockpiles and building upgrades ---- */
  /** Deliver everything of the stockpile's resource you carry. */
  _deposit(id, pile) {
    const inventory = this.inventories[id], resource = Stockpiles.resourceAt(this.map, pile.key);
    if (!resource) return;
    const result = Stockpiles.deposit(this.map, pile.key, inventory), name = ResourceTypes[resource].name.toLowerCase();
    if (!result.count) { this._notice(id, result.full ? 'This stockpile is full: upgrade it in the Town window (T)' : `You carry no ${name} to deliver`); return; }
    this.inventoryRev[id]++; this.stockRev++;
    this.progress.award(id, 'building', Math.min(20, 2 + Math.ceil(result.count / 10)));
    this.pendingEvents.push({ type: 'deposit', to: id, x: pile.tx + 0.5, y: pile.ty + 0.5, moved: result.moved, full: result.full });
  }

  /** Take an item out of a stockpile you are standing at. */
  _handleStockTake(id, inventory, cmd) {
    if (!Number.isInteger(cmd.tx) || !Number.isInteger(cmd.ty) || typeof cmd.item !== 'string' || !ItemDefs[cmd.item]) return;
    const key = tileKey(cmd.tx, cmd.ty), p = this.players[id];
    if (gridOf(p) || !this.map.stockpiles[key]) return;
    if (Math.hypot(cmd.tx + 0.5 - p.x, cmd.ty + 0.5 - p.y) > STATION_RANGE + 0.5) { this._notice(id, 'Walk up to the stockpile to take things out'); return; }
    inventory.limitHit = null;
    const taken = Stockpiles.withdraw(this.map, key, inventory, cmd.item, clamp(cmd.count | 0, 1, 999));
    if (!taken) { this._notice(id, inventory.limitHit ? this._carryText(id, inventory.limitHit) : 'No room in your pack'); inventory.limitHit = null; return; }
    this.inventoryRev[id]++; this.stockRev++;
    this.pendingEvents.push({ type: 'gain', to: id, item: cmd.item, count: taken });
  }

  /** Level up a building, paying from the stockpiles round it (then your pack). */
  _handleUpgrade(id, inventory, cmd) {
    if (!Number.isInteger(cmd.tx) || !Number.isInteger(cmd.ty)) return;
    const result = Buildings.upgrade(this.map, tileKey(cmd.tx, cmd.ty), inventory);
    if (!result.ok) { this._notice(id, result.reason); return; }
    this.inventoryRev[id]++; this.stockRev++;
    this.progress.award(id, 'building', 40 * result.level);
    this.pendingEvents.push({ type: 'upgraded', tx: cmd.tx, ty: cmd.ty, name: result.name, level: result.level, by: id });
  }

  _carryText(id, resource) {
    const name = ResourceTypes[resource] ? ResourceTypes[resource].name.toLowerCase() : resource, n = this.players[id].carryStacks;
    return `You can carry only ${n} stack${n === 1 ? '' : 's'} of ${name}: deliver it to a ${name} stockpile (Constitution and ponies with you let you carry more)`;
  }

  /** A player was turned away for carrying too much: say why (now and then, not every tick). */
  _carryNotices() {
    for (const id in this.inputQueues) {
      const inventory = this.inventories[id];
      if (!inventory || !inventory.limitHit) continue;
      const resource = inventory.limitHit; inventory.limitHit = null;
      if (this.tick - (this.carryNoticeAt[id] || -1e9) < secondsToTicks(CONFIG.sim.carry.noticeSeconds)) continue;
      this.carryNoticeAt[id] = this.tick;
      this._notice(id, this._carryText(id, resource));
    }
  }

  /* ---- ponies with you: buffs, carrying, abilities ---- */
  /** Who has which ponies with them (ridden or on a leash), what their buffs add up to (their own ponies' buffs, plus the
   *  affectsOthers buffs of anyone's pony within range), how much they may carry, and which abilities the pony they ride has. */
  _updateCompanions() {
    const withOwner = Object.values(this.animals.animals).filter(a => a.look && a.owner && this.players[a.owner] && (a.rider === a.owner || a.leashed));
    for (const id in this.players) {
      const p = this.players[id], buffs = noBuffs();
      let companions = 0, abilities = [];
      for (const a of withOwner) {
        const traits = PonyRarity.of(a.look, a.type), mine = a.owner === id;
        if (mine) companions++;
        for (const b of traits.buffs) if (mine || (b.affectsOthers && sameGrid(a, p) && Math.hypot(a.x - p.x, a.y - p.y) <= b.range)) buffs[b.type] += b.value;
        if (mine && a.rider === id) abilities = traits.abilities.filter(ab => !ab.passive).map(ab => ab.id);
      }
      p.buffs = buffs; p.companions = companions; p.abilities = abilities;
      p.carryStacks = Carry.stacksFor(p);
      if (this.inventories[id]) this.inventories[id].carryStacks = this.bots[id] ? null : p.carryStacks;      // (a bot's trading stock is not limited)
      const maxHp = Skills.maxHp(p.lv) + buffs.health;
      if (maxHp !== p.maxHp) { if (maxHp > p.maxHp) p.hp += maxHp - p.maxHp; p.maxHp = maxHp; p.hp = Math.min(p.hp, p.maxHp); }
    }
  }

  /** H / K (or the ability button) while riding: fire the pony's first / second rarity ability. (Flight is separate: B, _useAbility.) */
  _useRarityAbility(id, p, index) {
    if (!p.mount) return;
    const ability = AbilityDefs[p.abilities[index]];
    if (!ability) { this._notice(id, index ? 'Your pony has no second ability (only legendary ponies have two)' : 'Your pony has no ability (rare ponies and better have one)'); return; }
    if (p.abilityCd[index] > 0) return;
    p.abilityCd = p.abilityCd.slice(); p.abilityCd[index] = ability.cooldown;
    for (const effect of ability.effectDefs) this._applyEffect(id, p, effect);
    this.pendingEvents.push({ type: 'ability', ability: ability.id, x: p.x, y: p.y, facing: p.facing, by: id });
  }

  _applyEffect(id, p, effect) {
    if (effect.shape === 'self') { if (effect.kind === 'speed') { p.dashT = effect.duration; p.dashBoost = effect.value; } return; }
    for (const aid of Object.keys(this.animals.animals)) {
      const a = this.animals.animals[aid], def = a && AnimalDefs[a.type];
      if (!a || a.owner || a.captor || a.rider || def.protected || !sameGrid(a, p)) continue;            // never pets, never ponies; only on your grid
      if ((effect.target === 'hostile' && !def.hostile) || !effect.covers(p, p.facing, a.x, a.y)) continue;
      if (effect.kind === 'damage') strikeAnimal(this.toolDeps, id, aid, effect.value);
      else if (effect.kind === 'slow') { a.slowT = effect.duration; a.slowF = Math.max(0.1, 1 - effect.value / 100); }
      else if (effect.kind === 'scare') this.animals.startle(aid, p);
    }
  }

  /** Open / close the door the player is standing at. */
  _toggleDoor(found) {
    const next = StructureDefs[found.type].toggles;
    setBuiltSide(this.map, found.tx, found.ty, found.slot, next);
    this.builtRev++;
    this.pendingEvents.push({ type: 'door', tx: found.tx, ty: found.ty, side: found.slot, open: next === 'wood_door_open' });
  }

  /** Levels changed: publish them on the player, and grow maximum health with Constitution. */
  _applyLevels(id, lv) {
    const p = this.players[id];
    if (!p) return;
    const before = p.maxHp;
    p.lv = lv; p.maxHp = Skills.maxHp(lv) + ((p.buffs && p.buffs.health) || 0);
    if (p.maxHp > before) p.hp += p.maxHp - before;
  }

  /* ---- equipment ---- */
  _handleMoveSlot(id, inventory, cmd) {
    if (inventory.move(cmd.from, cmd.to)) this.inventoryRev[id]++;
  }

  /** Put on the crown, outfit or cape in inventory slot `from`; whatever was in that slot goes back where the item came from. */
  _handleEquip(id, inventory, from) {
    const p = this.players[id], gear = p.gear;
    if (!Number.isInteger(from) || from < 0 || from >= inventory.size) return;
    const item = inventory.itemIdAt(from), slot = item && Wardrobe.slotFor(item);          // (a lasso goes into the lasso slot)
    if (Bags.isPonyBag(item)) { this._ponyBagOn(id, inventory, from); return; }             // a pony bag: onto the pony you can reach
    if (slot === 'bag') { this._equipBag(id, inventory, from); return; }                     // a bigger bag: everything moves into it (packSystem.js)
    if (!slot) { if (item) this._notice(id, 'You cannot wear that'); return; }
    if (!Wardrobe.fits(item, p.appearance)) { this._notice(id, `That is ${Wardrobe.forWhom(item)}`); return; }
    const previous = gear[slot];
    inventory.slots[from].count -= 1;
    if (inventory.slots[from].count <= 0) inventory.slots[from] = previous ? { id: previous, count: 1 } : null;
    else if (previous) inventory.add(previous, 1);
    gear[slot] = item;
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'equip', to: id, item });
  }

  _handleUnequip(id, inventory, slot) {
    const gear = this.players[id].gear, item = gear[slot];
    if (slot === 'bag') { if (item) this._notice(id, 'You always carry a bag: wear a bigger one to swap it'); return; }
    if (!item || !(WardrobeSlots.includes(slot) || slot === 'lasso')) return;
    if (inventory.add(item, 1) > 0) { this._notice(id, 'Inventory full'); return; }
    gear[slot] = '';
    this.inventoryRev[id]++;
  }

  /** After a person's look changes (their character screen choice): anything they now cannot wear goes back in the bag. */
  fitWardrobe(id) {
    const p = this.players[id], inventory = this.inventories[id];
    if (!p || !inventory) return;
    for (const slot of WardrobeSlots) { const item = p.gear[slot]; if (item && !Wardrobe.fits(item, p.appearance)) { if (inventory.add(item, 1) === 0) { p.gear[slot] = ''; this.inventoryRev[id]++; } } }
  }

  _heldFor(id, p, inventory, input) {
    p.sel = input.slot;
    if (p.lassoSwing && p.gear.lasso) return p.gear.lasso;             // throwing the lasso from its own slot (L)
    return inventory.itemIdAt(p.sel);
  }

  /* ---- health ---- */
  _damagePlayer(id, amount) {
    const p = this.players[id];
    if (!p || p.hp <= 0) return;
    const taken = Math.max(1, Math.round(amount * (1 - Wardrobe.damageReduction(p.gear))));
    p.hp = Math.max(0, p.hp - taken); p.hurtT = 0.4;
    this.pendingEvents.push({ type: 'hurt', to: id, amount: taken, hp: p.hp });
    if (p.hp <= 0) this._knockOut(id);
  }

  /** Knocked out: back to the village with half health. Nothing is lost. */
  _knockOut(id) {
    const p = this.players[id], boat = this.boats[p.boat];
    if (boat) { boat.occupant = ''; p.boat = ''; }
    this._dismount(id, p);
    p.flying = false; p.flyT = 0; p.flyCd = 0;
    const spawn = Village.spawns[p.slot];
    p.grid = ''; p.x = spawn.x; p.y = spawn.y; p.vx = p.vy = 0;                // (back in the overworld, wherever it happened)
    p.hp = p.maxHp * CONFIG.sim.health.respawnFraction;
    p.hunger = Math.max(p.hunger, 40); p.thirst = Math.max(p.thirst, 40);
    this.map.ensureAround(p.x, p.y, SERVER_STREAM_RADIUS);
    this.pendingEvents.push({ type: 'died', to: id });
  }

  /* ---- chest, emotes ---- */
  _openChest(id, p) {
    const inventory = this.inventories[id];
    if (p.looted) { this._notice(id, 'You already emptied this chest'); return; }
    const trial = inventory.clone();
    if (!StarterLoot.every(l => trial.add(l.item, l.count) === 0)) { this._notice(id, 'Make room in your pack first'); return; }
    for (const l of StarterLoot) { inventory.add(l.item, l.count); this.pendingEvents.push({ type: 'gain', to: id, item: l.item, count: l.count }); }
    p.looted = true; this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'loot', to: id });
  }

  _handleEmote(id, emote) {
    if (!isEmote(emote)) return;
    const p = this.players[id]; p.emote = emote; p.emoteT = CONFIG.sim.emoteSeconds;
  }

  /** Per-tick upkeep for everyone: timers, slow health regeneration, torches burning down, bots waving at people. */
  _tickPlayer(id, p) {
    const S = CONFIG.sim;
    p.hurtT = Math.max(0, p.hurtT - TICK_DT); p.emoteT = Math.max(0, p.emoteT - TICK_DT);
    if (p.abilityCd[0] > 0 || p.abilityCd[1] > 0) p.abilityCd = p.abilityCd.map(t => Math.max(0, t - TICK_DT));
    this.dungeons.tickHints(id, p);
    if (p.emoteT === 0) p.emote = '';
    if (p.hp > 0 && p.hp < p.maxHp && p.hunger > 0 && p.thirst > 0) p.hp = Math.min(p.maxHp, p.hp + S.health.regenPerSecond * TICK_DT);
    if (p.held === 'torch' && LightSources.isDark(this.tick) && !this.bots[id]) {
      p.torchT += TICK_DT;
      if (p.torchT >= S.light.torchSeconds) {
        p.torchT = 0; this.inventories[id].remove('torch', 1); this.inventoryRev[id]++;
        this._notice(id, 'Your torch burned out');
      }
    }
    if (this.bots[id] && p.emoteT === 0 && this.rng() < 0.002) {
      const human = this._humans().find(h => sameGrid(h, p) && Math.hypot(h.x - p.x, h.y - p.y) < 5);
      if (human) this._handleEmote(id, 'wave');
    }
  }

  _notice(id, text) { this.pendingEvents.push({ type: 'notice', to: id, text }); }

  /* ---- simulation ---- */
  step() {
    this.tick++;
    this._farmDays();                                                                 // a new day: crops grow (farming.js)
    if (this.later.length) { const due = this.later.filter(l => l.at <= this.tick); if (due.length) { this.later = this.later.filter(l => l.at > this.tick); due.forEach(l => l.fn()); } }
    let focus = null;
    for (const id in this.inputQueues) {
      const queue = this.inputQueues[id];
      // Each input is applied exactly once with a fixed dt, so client prediction matches bit-for-bit.
      this.eventGrid = gridOf(this.players[id]);                                       // (what they do is shown on their grid)
      for (let n = 0; n < CONFIG.sim.maxInputsPerTick && queue.length; n++) this._applyInput(id, queue.shift());
      if (!focus) focus = this.players[id];
    }
    for (const id in this.bots) {
      const bot = this.players[id]; this.eventGrid = gridOf(bot);
      this._applyInput(id, sanitizeInput(botInput(this.bots[id], bot, this.mapOf(bot), this.rng, TICK_DT, focus && sameGrid(focus, bot) ? focus : null)));
    }
    this.eventGrid = '';
    for (const id in this.boats) {                                                   // drifting boats glide to a stop, then sleep
      const boat = this.boats[id];
      if (!boat.occupant && (boat.vx !== 0 || boat.vy !== 0)) stepBoat(boat, NO_INPUT, TICK_DT, this.map);
    }
    for (const id in this.players) {                                                   // hunger / thirst drain for everyone (bots never starve)
      const p = this.players[id];
      if (this.bots[id]) { p.hunger = CONFIG.sim.hunger.max; p.thirst = CONFIG.sim.thirst.max; } else this.vitals.drain(p, TICK_DT);
    }
    this.lightCache = LightSources.collect(this.map, Object.values(this.players), this.animals.animals, LightSources.isDark(this.tick));
    if (this.tick % 10 === 0) this._updateCompanions();
    this._carryNotices();
    for (const id in this.players) this._tickPlayer(id, this.players[id]);
    this.trade.update();
    this.trees.update(this.tick);
    this.forage.update(this.tick);
    this.animals.update(this.tick, this._humans());
    this.npcs.update(this.tick, this._humans().filter(h => !gridOf(h))); this.friendship.update(this.tick); this.wants.update(this.tick);
    if (this.tick % 15 === 0) this._keepMainPoniesClose();      // (the villagers live in the overworld)
    this._streamWorld();
  }

  /** Keep the chunks around every player generated; forget chunks nobody is near (walls / tree states are kept on the World). */
  _humans() { return Object.keys(this.inputQueues).map(id => this.players[id]); }

  _streamWorld() {
    const humans = this._humans();
    for (const p of humans) {                                                          // the chunk you stand in and its neighbours at once (walls, water); the
      const map = this.mapOf(p);                                                      // rest of the ring a couple of chunks a tick, nearest first, so
      map.ensureAround(p.x, p.y, 1); map.ensureAround(p.x, p.y, SERVER_STREAM_RADIUS, SERVER_CHUNKS_PER_TICK);   // crossing a chunk edge never stalls a tick
    }
    if (this.tick % 150 !== 0) return;
    const everyone = Object.values(this.players);
    for (const id of this.grids.ids()) {                                               // each grid keeps what its own people are near; an empty instance is forgotten
      const here = everyone.filter(p => gridOf(p) === id);
      if (id && !here.length) this.grids.drop(id); else this.grids.get(id).unloadFar(here, SERVER_KEEP_RADIUS);
    }
  }

  _applyInput(id, input) {
    const p = this.players[id], inventory = this.inventories[id];
    if (p.flyCd > 0) p.flyCd = Math.max(0, +(p.flyCd - TICK_DT).toFixed(4));                  // the wings rest between flights
    if (p.boat) this._row(id, p, inventory, input);
    else if (p.mount) this._ride(id, p, inventory, input);
    else {
      stepPlayer(p, input, TICK_DT, this.mapOf(p));
      this.tools.update(id, p, inventory, this._lassoInput(id, p, input), TICK_DT); this._lassoDone(p);
      this.vitals.consumeHeld(id, p, inventory, input, TICK_DT);
      this._useCarriedAnimal(id, p, inventory, input, TICK_DT);
      this._useItem(id, p, inventory, input);
    }
    if (input.interact) this._interact(id, p);
    if (input.power) this._useRarityAbility(id, p, input.power - 1);
  }

  _row(id, p, inventory, input) {
    const boat = this.boats[p.boat];
    if (!boat) { p.boat = ''; return; }
    stepRider(p, boat, input, TICK_DT, this.map);
    p.held = this._heldFor(id, p, inventory, input);
    p.swingT = 0; p.swingHit = false;
  }

  /** The interact key: get off whatever we are on (boat or pony), otherwise do the NEAREST of pick up / ride / board / drink / fill. */
  _interact(id, p) {
    if (p.flying) return;                                                                          // nothing to pick, open or enter from the air: land first
    const map = this.mapOf(p), outside = !gridOf(p);
    if (!p.boat) { const cave = findCaveInteraction(map, p); if (cave) { InteractionHandlers[cave.kind](this, id, p, cave); return; } }   // a cave mouth wins, even from a pony's back
    if (p.boat) {
      const boat = this.boats[p.boat], spot = BoatSystem.findLanding(this.map, boat);
      if (spot) BoatSystem.leave(p, boat, spot); else this._notice(id, 'No shore nearby');
      return;
    }
    const action = Interactions.find(map, outside ? this.boats : {}, p, p.held, this.animals.animals, id, outside ? this.npcs.npcs : {}, this.drops);   // (boats and villagers are in the overworld)
    if (!action) return;
    if (action.kind === 'dismount') this._dismount(id, p);
    else if (action.kind === 'pick') this._pickUp(id, action.forage);
    else if (action.kind === 'loot') this._openChest(id, p);
    else if (action.kind === 'door') this._toggleDoor(action.door);
    else if (action.kind === 'board') BoatSystem.board(id, p, action.boat);
    else if (action.kind === 'ride') this._mount(id, p, action.animal);
    else if (action.kind === 'feed') this._feedPony(id, action.animal);
    else if (action.kind === 'pickup') this._carryAnimal(id, action.animal);
    else if (action.kind === 'fill') this.vitals.fillJug(id, this.inventories[id]);
    else if (action.kind === 'stockpile') this._deposit(id, action.pile);
    else if (action.kind === 'pickDrop') this._pickUpDrop(id, action.drop);
    else if (InteractionHandlers[action.kind]) InteractionHandlers[action.kind](this, id, p, action);          // caves, and anything added later
    else this.vitals.drinkFromSource(id, p, action.water);
  }

  /** The separate Let go / Untie button. Letting go of a CAUGHT wild pony loses it, so the server insists on an explicit confirmation
   *  (the client asks first); untying a pet you already own is safe (it stays yours). `cmd.animal` lets the Pony Book name the animal. */
  _handleRelease(id, cmd) {
    const p = this.players[id];
    if (!p) return;
    let target = null;
    if (typeof cmd.animal === 'string') {
      const a = this.animals.animals[cmd.animal];
      if (a && (a.captor === id || (a.owner === id && a.leashed))) target = { animal: a, losesCatch: a.captor === id };
    } else target = findRelease(p, this.animals.animals, id);
    if (!target) return;
    if (target.losesCatch && cmd.confirm !== true) { this._notice(id, 'Not let go: confirm first'); return; }
    this._untie(id, target.animal);
  }

  /** Take the lasso off a pet: it stays where it is (near its new home). A caught wild pony bolts instead. */
  _untie(id, animal) {
    const wasCaught = animal.captor === id;
    if (wasCaught) this.animals.releaseWild(animal.id); else this.animals.unleash(animal.id);
    this._returnLasso(id, animal);                                        // (only an animal caught in an older save still holds a lasso)
    this.pendingEvents.push({ type: wasCaught ? 'letGo' : 'untied', to: id, x: animal.x, y: animal.y });
  }

  /** Feed an apple to a pony you have caught. It only eats in a stable or a closed pen; enough apples and it settles in as your pet. */
  _feedPony(id, animal) {
    const p = this.players[id], inventory = this.inventories[id], def = AnimalDefs[animal.type];
    if (!ItemDB.isApple(p.held) || !inventory.has(p.held, 1)) { this._notice(id, 'Hold an apple to feed it'); return; }
    if (!Shelter.find(this.mapOf(animal), animal.x, animal.y)) { this._notice(id, 'It will not eat out here: lead it to a stable or a closed pen first'); return; }
    inventory.remove(p.held, 1); this.inventoryRev[id]++;
    const result = this.animals.feed(animal.id, id, Buildings.appleDiscountAt(this.mapOf(animal), animal.x, animal.y));
    this.progress.award(id, 'horsemanship', 12);
    this.pendingEvents.push({ type: 'fed', to: id, x: animal.x, y: animal.y, have: result.have, need: result.need });
    if (!result.done) return;                                                  // (the client shows "Apple 1/2")
    this._remember(id, animal);
    this._returnLasso(id, animal);                                                                        // (older saves only)
    animal.xp = PonyXp.xpFor(animal.level);                                                               // from now on it grows with you
    this.progress.award(id, 'horsemanship', 80);
    this.pendingEvents.push({ type: 'tamed', to: id, x: animal.x, y: animal.y, animal: animal.type, id: animal.id });
  }

  /** A small animal (a rabbit) is simply picked up. */
  _carryAnimal(id, animal) {
    const type = animal.type, item = Object.keys(ItemDefs).find(k => ItemDefs[k].creature === type), inventory = this.inventories[id], w = Wants.of(type), name = AnimalDefs[type].name.toLowerCase();
    if (animal.delivered) { this._notice(id, `The ${name} is home with its mother`); return; }
    if (w && w.unlocks === 'pickup' && !animal.fed) { this._notice(id, `The ${name} squirms away: it wants ${ItemDefs[w.items[0]].name.toLowerCase()} first`); return; }   // (a lost cub: feed it a fish)
    const wild = !animal.owner && !Wants.isQuestCreature(type) && AnimalLevels.tooWild(animal, this.players[id].lv);   // (your own pet, or a lost cub, always comes)
    if (wild) { this._notice(id, wild); return; }
    if (!item || !inventory.canAdd(item, 1)) { this._notice(id, 'Inventory full'); return; }
    this.animals.pickup(animal.id);
    inventory.add(item, 1); this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'carried', to: id, x: animal.x, y: animal.y, animal: type });
    if (Wants.isQuestCreature(type)) this._notice(id, `You carry the ${AnimalDefs[type].name.toLowerCase()}. Hold it in your hand (toolbar) in the cave: its mother will not attack you, and F gives it back to her`);
  }

  /** Holding a carried animal and pressing Use sets it down next to you as your pet. */
  _useCarriedAnimal(id, p, inventory, input, dt) {
    const def = ItemDB.get(p.held);
    if (!input.action || !def || !def.creature || p.eatT > 0) return;
    const x = p.x + Math.cos(p.facing) * 0.7, y = p.y + Math.sin(p.facing) * 0.7;
    inventory.remove(p.held, 1); this.inventoryRev[id]++;
    p.eatT = 0.8;
    if (Wants.isQuestCreature(def.creature)) {                                   // a lost cub is set down as it was (fed, still lost), never kept as a pet
      const cub = this.animals.animals[this.animals.spawn(def.creature, x, y, undefined, { grid: gridOf(p), level: 1 })];
      cub.fed = true; cub.quest = true; this.wants.refresh(cub);
      this.pendingEvents.push({ type: 'released', to: id, x, y, animal: def.creature });
      return;
    }
    const pet = this.animals.release(def.creature, x, y, id, undefined, { grid: gridOf(p) });
    this.pendingEvents.push({ type: 'released', to: id, x: pet.x, y: pet.y, animal: def.creature });
  }

  /** The Pony Book remembers every kind (and every biome variety) of pony you have ever kept. */
  _remember(ownerId, animal) {
    (this.everTamed[ownerId] = this.everTamed[ownerId] || {})[animal.type] = true;
    if (AnimalDefs[animal.type].pony) (this.everVariants[ownerId] = this.everVariants[ownerId] || {})[(animal.look && animal.look[4]) | 0] = true;
  }

  /** The Pony Book: what you have ever kept, and what you keep now. */
  petsFor(id) { return this.animals.petsOf(id, this.tick); }
  /** Every biome variety of pony: { index, id, name, biome, seen, owned }. */
  varietiesFor(id) {
    const kept = this.everVariants[id] || {}, now = {};
    for (const pet of this.animals.petsOf(id, this.tick)) if (!pet.gentling && pet.look) { const v = pet.look[4] | 0; now[v] = (now[v] || 0) + 1; }
    return PonyVariants.map((v, i) => ({ index: i, id: v.id, name: v.name, biome: v.biome, theme: v.theme || '', legacy: !!v.legacy, seen: !!kept[i], owned: now[i] || 0 }))
      .filter(v => !v.legacy || v.seen || v.owned);                                    // retired varieties only show if you already have one
  }
  bookFor(id) {
    const kept = this.everTamed[id] || {}, now = {};
    for (const pet of this.animals.petsOf(id, this.tick)) now[pet.type] = (now[pet.type] || 0) + 1;
    return Object.keys(AnimalDefs).filter(t => AnimalDefs[t].pony).map(t => ({ type: t, seen: !!kept[t], owned: now[t] || 0 }));
  }

  /** Berries, apples, stones, clay, flax, a bottle: whatever the forageable gives. Skill decides the bonus. */
  _pickUp(id, found) {
    const inventory = this.inventories[id], p = this.players[id], kind = forageKind(found.prop), item = found.prop.drop;
    const skill = ForageSkill[kind] || 'foraging';
    const wanted = this.forage.rollYield(found.prop) + (this.rng() < Skills.bonusYieldChance(p.lv, skill) + luckChance(p) ? 1 : 0);
    const gained = wanted - inventory.add(item, wanted);
    if (gained === 0) { if (!inventory.limitHit) this._notice(id, 'Inventory full'); return; }      // (a full carry limit explains itself)
    this.forage.pick(found.tx, found.ty, found.prop);
    this.inventoryRev[id]++;
    this.progress.award(id, skill, 9 * gained);
    this.pendingEvents.push({ type: 'pick', prop: kind, key: tileKey(found.tx, found.ty), x: found.prop.x, y: found.prop.y, by: id });
    this.pendingEvents.push({ type: 'gain', to: id, item, count: gained });
  }

  /* ---- riding ---- */
  _mount(id, p, animal) {
    const need = AnimalLevels.rideLevel(animal.type, animal.owner === id ? 1 : animal.level), have = Skills._s(p.lv, 'horsemanship');   // (your own pony never outgrows you as it levels up)
    if (have < need && !animal.trial) { this._notice(id, `A level ${animal.level} ${AnimalDefs[animal.type].name} needs Horsemanship ${need} to ride (you have ${have})`); return; }
    p.mountLevel = animal.level; p.mountType = animal.type;              // its speed: PonySpeed (kind's base speed x the level curve)
    animal.rider = id; animal.leashed = false; animal.state = 'idle'; animal.vx = animal.vy = 0;
    p.mount = animal.id; p.x = animal.x; p.y = animal.y; p.vx = p.vy = 0; p.swingT = 0; p.swingHit = false;
    this.progress.award(id, 'horsemanship', 15);
    this.pendingEvents.push({ type: 'mounted', to: id, x: animal.x, y: animal.y });
  }

  /** Get off: the pony stays here as your free pet and you step down beside it. */
  _dismount(id, p) {
    if (p && p.flying) this._land(id, p, true);
    const a = p && this.animals.animals[p.mount];
    if (p && p.mount) p.mount = '';
    if (!a) return;
    a.rider = ''; a.home = { x: a.x, y: a.y }; a.state = 'idle'; a.vx = a.vy = 0;
    const side = p.facing + Math.PI / 2, spot = { x: a.x + Math.cos(side) * 0.9, y: a.y + Math.sin(side) * 0.9 };
    if (!circleBlocked(this.mapOf(p), spot.x, spot.y, CONFIG.sim.playerRadius)) { p.x = spot.x; p.y = spot.y; }
    p.vx = p.vy = 0;
  }

  /** On a pony: you steer it (stepPlayer uses the ride speeds), it follows your position, and riding trains Horsemanship. */
  _ride(id, p, inventory, input) {
    const a = this.animals.animals[p.mount];
    if (!a) { p.mount = ''; p.flying = false; return; }
    if (p.flying) { p.flyT = Math.max(0, +(p.flyT - TICK_DT).toFixed(4)); if (p.flyT <= 0) this._land(id, p, false); }
    stepPlayer(p, input, TICK_DT, this.mapOf(p));
    this.tools.update(id, p, inventory, this._lassoInput(id, p, input), TICK_DT); this._lassoDone(p);   // everything works from the saddle: lasso, spear, sword, bow, rod, knife, axe...
    if (a.owner === id) this._rideXp(p, a);                             // your own pony grows with the miles
    a.x = p.x; a.y = p.y; a.vx = p.vx; a.vy = p.vy; a.facing = p.facing; a.state = Math.hypot(p.vx, p.vy) > 0.2 ? 'ride' : 'idle';
    this.vitals.consumeHeld(id, p, inventory, input, TICK_DT);
    if (a.state === 'ride') {                                      // a little Horsemanship XP for every few seconds in the saddle
      this.rideAcc[id] = (this.rideAcc[id] || 0) + TICK_DT * 2;
      if (this.rideAcc[id] >= 4) { this.rideAcc[id] = 0; this.progress.award(id, 'horsemanship', 6); }
    }
  }

  /* ---- the host's testing aids (Settings) ---- */
  applySetting(key, value) {
    if (key === 'hostilesOff') { this.settings.hostilesOff = value; this.animals.hostilesOff = value; }
    else if (key === 'testPony') { this.settings.testPony = value; this._setTestPony(value); }
    else return;
    this.settingsRev++;
  }

  /** On: a level 12 pegasus appears beside the host, theirs to ride with no Horsemanship needed. Off: it goes away (and the host is set down first). */
  _setTestPony(on) {
    const host = this.players[this.hostId];
    if (!host) return;
    const existing = this.animals.animals[this.testPonyId];
    if (on && !existing) {
      const spot = findLanding(this.mapOf(host), host.x + 1.6, host.y, CONFIG.sim.ride.radius);
      const pet = this.animals.release('pony_pegasus', spot.x, spot.y, this.hostId, this.rng() * 1000 | 0, { level: 12, grid: gridOf(host) });
      pet.trial = true; pet.leashed = false; this.testPonyId = pet.id;
      this._notice(this.hostId, 'Your test pegasus is here: ride it, then press B (or the Fly button)');
    } else if (!on && existing) {
      if (host.mount === existing.id) this._dismount(this.hostId, host);
      delete this.animals.animals[existing.id]; this.testPonyId = '';
    }
  }

  /** The Admin page's live values and the clock, for EVERY player (their movement and clock must match the server's); only when they changed. */
  adminUpdateFor(id) {
    if (this.adminSentRev[id] === this.adminRev) return null;
    this.adminSentRev[id] = this.adminRev;
    return GameSettings.wire();
  }

  /** What the host's Settings panel shows; sent only to the host, and only when it changed (else null). */
  settingsUpdateFor(id) {
    if (id !== this.hostId || this.settingsSentRev[id] === this.settingsRev) return null;
    this.settingsSentRev[id] = this.settingsRev;
    return Object.assign({}, this.settings);
  }

  /* ---- pony abilities ---- */
  /** A button press for a pony ability. Flight: takes off; pressed again in the air, it lands early. */
  _useAbility(id, abilityId) {
    const p = this.players[id];
    if (!p || p.hp <= 0 || abilityId !== 'fly') return;
    const a = !p.boat && this.animals.animals[p.mount];
    if (!a) { this._notice(id, 'Ride a pegasus to fly'); return; }
    if (!PonyAbilityRules.has(a.type, 'fly')) { this._notice(id, `${AnimalDefs[a.type].name}s cannot fly`); return; }
    if (gridOf(p)) { this._notice(id, 'There is no room to fly in here'); return; }
    if (p.flying) { this._land(id, p, true); return; }
    if (p.flyCd > 0) { this._notice(id, `Its wings are resting (${Math.ceil(p.flyCd)}s)`); return; }
    p.flyDur = p.flyT = PonyAbilityRules.flightDuration(a.level, Wardrobe.power(p.gear)); p.flying = true;
    this.pendingEvents.push({ type: 'fly', x: p.x, y: p.y, by: id });
  }

  /** Come down: where the flight ends, or at the nearest place a pony can stand if that is water, a tree or a house. Starts the cooldown. */
  _land(id, p, early) {
    if (!p.flying) return;
    const a = this.animals.animals[p.mount], used = Math.max(0, p.flyDur - p.flyT);
    p.flying = false; p.flyT = 0;
    if (a) {
      const spot = findLanding(this.mapOf(p), p.x, p.y, CONFIG.sim.ride.radius);
      p.x = a.x = spot.x; p.y = a.y = spot.y; p.vx = p.vy = a.vx = a.vy = 0;
      p.flyCd = +(PonyAbilityRules.flightCooldown(a.level, Wardrobe.power(p.gear)) * (early ? Math.max(0.25, Math.min(1, used / Math.max(0.01, p.flyDur))) : 1)).toFixed(2);
    }
    p.flyDur = 0;
    this.pendingEvents.push({ type: 'landed', x: p.x, y: p.y, by: id });
  }

  /* ---- treasure ---- */
  /** Using a message in a bottle opens it; using a treasure map reads it and adds it to your journal. */
  _useItem(id, p, inventory, input) {
    const use = ItemDB.getUse(p.held);
    if (!input.action || !use || p.eatT > 0) return;
    p.eatT = 0.8;
    if (use.opens || use.opensAny) {
      let found = use.opens;
      if (use.opensAny) { let roll = this.rng() * use.opensAny.reduce((n, [, w]) => n + w, 0); found = use.opensAny[0][0]; for (const [item, w] of use.opensAny) { if ((roll -= w) < 0) { found = item; break; } } }   // a map, or a scroll
      if (!inventory.canAdd(found, 1) && inventory.count(p.held) !== 1) { this._notice(id, 'Inventory full'); return; }
      inventory.remove(p.held, 1); inventory.add(found, 1); this.inventoryRev[id]++;
      this.progress.award(id, 'digging', 15);
      this.pendingEvents.push({ type: 'opened', to: id }); this.pendingEvents.push({ type: 'gain', to: id, item: found, count: 1 });
    } else if (use.reveals) this._revealMap(id, p, inventory);
    else if (use.revealsCave) this._revealCave(id, p, inventory);
  }

  /** A cave scroll shows where the cave of the ring you are STANDING in is hidden (and goes on your map). */
  _revealCave(id, p, inventory) {
    const rings = this.map.layers.rings, ring = rings.at(p.x, p.y).index, maps = this.treasureMaps[id];
    if (gridOf(p)) { this._notice(id, 'The scroll only works under the open sky'); return; }
    if (this.worldProgress.isDefeated(ring)) { this._notice(id, 'The scroll crumbles: the lair of this area has already been cleared'); return; }
    if (maps.some(m => m.kind === 'dungeon' && m.ring === ring)) { this._notice(id, 'You already know where the cave in this area is'); return; }
    if (maps.length >= TREASURE.maxMaps) { this._notice(id, 'Your journal is full of maps: dig up a treasure first'); return; }
    const site = this.map.layers.dungeons.site(ring);
    inventory.remove(p.held, 1); this.inventoryRev[id]++;
    maps.push({ key: 'cave' + ring, tx: Math.floor(site.x), ty: Math.floor(site.y), kind: 'dungeon', ring }); this.treasureRev[id]++;
    this.pendingEvents.push({ type: 'mapAdded', to: id, tx: Math.floor(site.x), ty: Math.floor(site.y), kind: 'dungeon', ringName: rings.def(ring).name });
  }

  _revealMap(id, p, inventory) {
    const maps = this.treasureMaps[id];
    if (gridOf(p)) { this._notice(id, 'Read it under the open sky'); return; }
    if (maps.length >= TREASURE.maxMaps) { this._notice(id, 'Your journal is full of maps: dig up a treasure first'); return; }
    const site = TreasureSites.findFor(this.map, p.x, p.y, new Set(maps.map(m => m.key)));
    if (!site) { this._notice(id, 'The map is blank: no treasure is left to find nearby'); return; }
    inventory.remove(p.held, 1); this.inventoryRev[id]++;
    maps.push({ key: site.key, tx: site.tx, ty: site.ty }); this.treasureRev[id]++;
    this.progress.award(id, 'digging', 20);
    this.pendingEvents.push({ type: 'mapAdded', to: id, tx: site.tx, ty: site.ty });
  }

  /** The shovel found it: loot goes into the pack, the site is gone for everybody, and the map is used up. */
  _digTreasure(id, site) {
    if (this.map.treasureDug[site.key]) return;
    const inventory = this.inventories[id], loot = TreasureSites.rollLoot(this.rng);
    this.map.treasureDug[site.key] = true;
    let lost = false;
    for (const l of loot) {
      const gained = l.count - inventory.add(l.item, l.count);
      if (gained < l.count) lost = true;
      if (gained > 0) this.pendingEvents.push({ type: 'gain', to: id, item: l.item, count: gained });
    }
    this.inventoryRev[id]++;
    for (const other in this.treasureMaps) {                       // everybody's map to this spot is used up
      const before = this.treasureMaps[other].length;
      this.treasureMaps[other] = this.treasureMaps[other].filter(m => m.key !== site.key);
      if (this.treasureMaps[other].length !== before) this.treasureRev[other]++;
    }
    this.progress.award(id, 'digging', 160);
    this.pendingEvents.push({ type: 'treasure', to: id, x: site.tx + 0.5, y: site.ty + 0.5, loot });
    if (lost) this._notice(id, 'Inventory full: some of the treasure was lost');
  }

  /* ---- outgoing ---- */
  /** Broadcast part of a snapshot: { tick, players, trees, events }. Events are drained. */
  takeSnapshot() {
    const players = {};
    for (const id in this.players) players[id] = clonePlayer(this.players[id]);
    const snapshot = { tick: this.tick, players, boats: this.boatStates(), trees: collectTreeStates(this.map), forage: collectForageStates(this.map), animals: this.animals.states(this._humans()), npcs: this.npcs.states(), drops: this.dropStates(), events: this.pendingEvents };
    this.pendingEvents = GridEvents.of(this);
    return snapshot;
  }
  /** Boats near a human player (the rest are not worth sending). */
  boatStates() {
    const out = {}, humans = this._humans().filter(p => !gridOf(p));                        // (boats are in the overworld)
    for (const id in this.boats) {
      const b = this.boats[id];
      if (humans.some(p => Math.hypot(p.x - b.x, p.y - b.y) < BOAT_SYNC_RADIUS)) out[id] = cloneBoat(b);
    }
    return out;
  }
  /** Private: the player's inventory, only when it changed since last sent (else null). */
  inventoryUpdateFor(id) {
    if (this.inventorySentRev[id] === this.inventoryRev[id]) return null;
    this.inventorySentRev[id] = this.inventoryRev[id];
    return this.inventories[id].toJSON();
  }
  /** Which rings are open and which guardians are down, only when that changed since last sent (else null). */
  ringsUpdateFor(id) {
    if (this.ringsSentRev[id] === this.worldProgress.rev) return null;
    this.ringsSentRev[id] = this.worldProgress.rev;
    return this.worldProgress.toWire();
  }
  /** Skill / attribute XP for the Journal, only when it changed (else null). */
  progressUpdateFor(id) { return this.progress.updateFor(id, this.progressSent[id]); }
  /** The player's treasure maps (where the X is), only when they changed (else null). */
  treasureUpdateFor(id) {
    if (this.treasureSent[id] === this.treasureRev[id]) return null;
    this.treasureSent[id] = this.treasureRev[id];
    return this.treasureMaps[id].map(m => Object.assign({}, m));
  }
  /** The player's trade window state, only when it changed (else null). */
  tradeUpdateFor(id) { return this.trade.updateFor(id); }
  /** Floors, only when one was built / removed since last sent (else null). */
  floorsUpdateFor(id) {
    if (this.floorsSentRev[id] === this.floorsRev) return null;
    this.floorsSentRev[id] = this.floorsRev;
    return Object.assign({}, this.map.floors);
  }
  /** Shared: the town's stockpiles and building levels, only when they changed (else null). */
  stockpilesUpdateFor(id) {
    if (this.stockSentRev[id] === this.stockRev) return null;
    this.stockSentRev[id] = this.stockRev;
    return Stockpiles.exportState(this.map);
  }
  /** Shared: all built structures, only when something was built / demolished since last sent (else null). */
  builtUpdateFor(id) {
    if (this.builtSentRev[id] === this.builtRev) return null;
    this.builtSentRev[id] = this.builtRev;
    return JSON.parse(JSON.stringify(this.map.built));
  }
}
