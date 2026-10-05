'use strict';
/* SERVER-SIDE authoritative world. No timers, no sockets: whoever hosts it (LocalAdapter now,
 * a Durable Object later) calls step() at tickRate and ships takeSnapshot() / *UpdateFor(). */
/** Which skill a forageable trains. */
const ForageSkill = { bush: 'foraging', flax: 'foraging', apple_tree: 'foraging', bottle: 'foraging', stone: 'digging', clay: 'digging', mound: 'digging' };
const SERVER_STREAM_RADIUS = 2, SERVER_KEEP_RADIUS = 6, BOAT_SYNC_RADIUS = 90;     // chunks / chunks / tiles

class GameServer {
  /** @param {number} seed  @param {{world?: object}} [options] world: a sanitized saved world (SaveData.sanitizeWorld) to continue instead of starting fresh */
  constructor(seed, options = {}) {
    this.map = new World(seed);
    if (options.world) SaveData.applyMapState(this.map, options.world);      // before any chunk exists, so props are generated already felled / picked
    this.map.onChunkGenerated = chunk => this._onChunkGenerated(chunk);
    this.tick = 0;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.players = {}; this.inputQueues = {}; this.bots = {};
    this.inventories = {}; this.inventoryRev = {}; this.inventorySentRev = {};
    this.builtRev = 1; this.builtSentRev = {}; this.floorsRev = 1; this.floorsSentRev = {};
    this.progress = new Progression({ emit: e => this.pendingEvents.push(e), onLevels: (id, lv) => this._applyLevels(id, lv) });
    this.progressSent = {};                                // id -> { value }: which XP revision the client has
    this.treasureMaps = {}; this.treasureRev = {}; this.treasureSent = {}; this.rideAcc = {};
    this.hostId = null; this.vitalSettings = {};          // the host (first human) sets hunger / thirst modes per player slot
    this.boats = {};
    this.pendingEvents = [];
    this.trees = new TreeSystem(this.map, this.rng, () => this.tick);
    this.forage = new ForageSystem(this.map, this.rng, () => this.tick);
    this.vitals = new VitalsSystem({ emit: e => this.pendingEvents.push(e), markInventoryChanged: id => { this.inventoryRev[id]++; } });
    this.lightCache = [];                                  // campfires + held torches, rebuilt every tick
    this.animals = new AnimalSystem({ map: this.map, rng: this.rng, getTick: () => this.tick, emit: e => this.pendingEvents.push(e),
      damagePlayer: (id, amount) => this._damagePlayer(id, amount), getLights: () => this.lightCache });
    this.trade = new TradeSystem({ players: this.players, inventories: this.inventories, bots: this.bots, rng: this.rng,
      emit: e => this.pendingEvents.push(e), markInventoryChanged: id => { this.inventoryRev[id]++; }, notice: (id, text) => this._notice(id, text) });
    this.everTamed = {};                                   // ownerId -> { animalType: true }: the Pony Book remembers every kind you have kept
    this.everVariants = {};                                // ownerId -> { variantIndex: true }: ...and every biome variety
    this.populatedChunks = new Set();                      // chunks whose animal group has been spawned (killed ones are replaced by respawns, not by regeneration)
    this.tools = new ToolSystem({ handlers: this._createToolHandlers(), heldFor: (id, p, inventory, input) => this._heldFor(id, p, inventory, input) });
    if (options.world) SaveData.applyTimers(this, options.world);                // the clock and regrow timers: the home and paddock are already in the saved map
    else if (CONFIG.sim.testKit) { this._buildStarterHome(); this._buildStarterPaddock(); this._spawnTutorialPony(); }
  }

  /** The testing version starts with a little home: a floored room with a door, a window and a crafting table. */
  _buildStarterHome() {
    const H = Village.home, put = (tx, ty, type, slot) => BuildSystem.place(this.map, tx, ty, type, slot);
    for (let ty = H.y0; ty <= H.y1; ty++) for (let tx = H.x0; tx <= H.x1; tx++) put(tx, ty, 'wood_floor', 'f');
    for (let tx = H.x0; tx <= H.x1; tx++) { put(tx, H.y0, 'wood_wall', 'n'); put(tx, H.y1, 'wood_wall', 's'); }
    for (let ty = H.y0; ty <= H.y1; ty++) { put(H.x0, ty, 'wood_wall', 'w'); put(H.x1, ty, 'wood_wall', 'e'); }
    put(H.x0 + 1, H.y1, 'wood_door', 's');                  // the door faces south, towards the village
    put(H.x1 - 1, H.y0, 'wood_window', 'n');
    put(H.x1 - 1, H.y0 + 1, 'crafting_table', 'c');
    this.builtRev++; this.floorsRev++;
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
    const pony = this.animals.release('pony_earth', spawn.x - 2.2, spawn.y + 0.6, id, 7000 + p.slot * 13, { level: 1, variant: 0 });
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
      getPlayer: id => this.players[id], rng: this.rng, animals: this.animals,
      award: (id, skill, xp) => this.progress.award(id, skill, xp),
      pickUp: (id, found) => this._pickUp(id, found), digTreasure: (id, site) => this._digTreasure(id, site),
      mapSitesOf: id => this.treasureMaps[id]
    };
    const hunt = new HuntHandler(deps);
    deps.onTamed = (ownerId, animal) => this._remember(ownerId, animal);
    return { leash: new LeashHandler(deps), axe: new TreeHarvestHandler(deps), hammer: new DemolishHandler(deps), knife: hunt, spear: hunt, sword: hunt, bow: new BowHandler(deps), rod: new FishingHandler(deps), shovel: new ShovelHandler(deps) };
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
    this.inventoryRev[id] = 1; this.inventorySentRev[id] = 0; this.builtSentRev[id] = 0; this.floorsSentRev[id] = 0;
    if (isBot) this.bots[id] = createBotBrain(); else this.inputQueues[id] = [];
    return id;
  }
  removePlayer(id) {
    this.trade.cancel(id, 'Trade cancelled: player left');
    this._dismount(id, this.players[id]);
    this.animals.releaseOwner(id);                                       // pets on a leash are let go where they stand
    const boat = this.boats[this.players[id] && this.players[id].boat];
    if (boat) boat.occupant = '';
    [this.players, this.inputQueues, this.bots, this.inventories, this.inventoryRev, this.inventorySentRev, this.builtSentRev, this.floorsSentRev, this.progressSent, this.treasureMaps, this.treasureRev, this.treasureSent, this.rideAcc]
      .forEach(t => delete t[id]);
    delete this.progress.data[id]; delete this.progress.rev[id]; delete this.everTamed[id]; delete this.everVariants[id];   // (else the next person to sit here would inherit this one's skills and Pony Book)
  }
  /** Who is a person (as opposed to a bot): their ids, in seat order. */
  humanIds() { return Object.keys(this.inputQueues).sort(); }

  /** A person joins. A bot gives up its seat if the table is full. Returns the new player id, or null if four people already sit here.
   *  `character` is a saved character (SaveData) to restore; without one they get a fresh starter pack. */
  joinHuman(character, name = '', appearance = null) {
    if (this._freeSlot() >= CONFIG.sim.maxPlayers) {
      const bot = Object.keys(this.bots).sort()[0];
      if (!bot) return null;
      this.removePlayer(bot);
    }
    const id = this.addPlayer(false);
    if (!id) return null;
    this.players[id].name = name;
    if (character) SaveData.importCharacter(this, id, character);
    const look = CharacterLook.sanitize(appearance);                    // what they chose on the character screen wins over what was saved
    if (look) this.players[id].appearance = look;
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
      case 'moveSlot': this._handleMoveSlot(id, inventory, cmd); break;
      case 'equip': this._handleEquip(id, inventory, cmd.from); break;
      case 'unequip': this._handleUnequip(id, inventory, cmd.slot); break;
      case 'emote': this._handleEmote(id, cmd.id); break;
      case 'release': this._handleRelease(id, cmd); break;
      case 'tradeRequest': this.trade.request(id, cmd.target); break;
      case 'tradeAccept': this.trade.accept(id); break;
      case 'tradeCancel': this.trade.cancel(id); break;
      case 'tradeOffer': this.trade.offer(id, cmd.item, cmd.count); break;
      case 'tradeConfirm': this.trade.confirm(id, cmd.value); break;
      case 'craft': this._handleCraft(id, inventory, cmd); break;
      case 'place': this._handlePlace(id, inventory, cmd); break;
      case 'setVitals': this._handleSetVitals(id, cmd); break;
    }
  }

  _handleCraft(id, inventory, cmd) {
    const result = CraftingSystem.craft(inventory, cmd.recipe, BuildSystem.stationsNear(this.map, this.players[id]));
    if (!result.ok) { this._notice(id, result.reason); return; }
    this.inventoryRev[id]++;
    this.progress.award(id, 'crafting', RecipeDefs[cmd.recipe].station ? 14 : 8);
    result.outputs.forEach(o => this.pendingEvents.push({ type: 'gain', to: id, item: o.item, count: o.count }));
  }

  /** Build the item in a hotbar slot: a wall piece on a tile side, a floor on a tile, or a station that fills the tile. */
  _handlePlace(id, inventory, cmd) {
    const player = this.players[id];
    if (player.boat) return;                                       // no building from a boat
    const slotIndex = Number.isInteger(cmd.slot) ? sanitizeSlot(cmd.slot) : player.sel;
    if (Gear.isBeltSlot(slotIndex) && !Gear.hasBelt(player.gear)) return;
    const itemId = inventory.itemIdAt(slotIndex), placeable = ItemDB.getPlaceable(itemId);
    if (!placeable || !Number.isInteger(cmd.tx) || !Number.isInteger(cmd.ty)) return;
    if (StructureDefs[placeable.structure].layer === 'wall' && !SIDES.includes(cmd.side)) return;
    const slot = slotFor(placeable.structure, cmd.side);

    const check = BuildSystem.canPlace(this.map, cmd.tx, cmd.ty, slot, Object.values(this.players), player, placeable.structure);
    if (!check.ok) { this._notice(id, check.reason); return; }

    const replaced = StructureDefs[placeable.structure].insert ? builtAt(this.map, cmd.tx, cmd.ty, slot) : null;   // a window / door takes the wall's place
    if (replaced && !inventory.canAdd(StructureDefs[replaced].refundItemId, 1) && inventory.count(itemId) !== 1) { this._notice(id, 'Inventory full'); return; }
    inventory.remove(itemId, 1);
    if (replaced) inventory.add(StructureDefs[replaced].refundItemId, 1);                                       // ...and the wall item comes back
    BuildSystem.place(this.map, cmd.tx, cmd.ty, placeable.structure, slot);
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
    p.lv = lv; p.maxHp = Skills.maxHp(lv);
    if (p.maxHp > before) p.hp += p.maxHp - before;
  }

  /* ---- equipment ---- */
  _handleMoveSlot(id, inventory, cmd) {
    const gear = this.players[id].gear;
    if ((Gear.isBeltSlot(cmd.from) || Gear.isBeltSlot(cmd.to)) && !Gear.hasBelt(gear)) { this._notice(id, 'Wear a tool belt to use the belt bar'); return; }
    if (inventory.move(cmd.from, cmd.to)) this.inventoryRev[id]++;
  }

  /** Wear / wield the item in inventory slot `from`; whatever was in that gear slot goes back where the item came from. */
  _handleEquip(id, inventory, from) {
    const p = this.players[id], gear = p.gear;
    if (!Number.isInteger(from) || from < 0 || from >= inventory.size) return;
    const item = inventory.itemIdAt(from), slot = item && Gear.slotFor(item);
    if (!slot) { if (item) this._notice(id, 'You cannot wear that'); return; }
    if (slot === 'weapon' && !Gear.hasSheath(gear)) { this._notice(id, 'Wear a scabbard or sword sling first'); return; }
    if (Gear.isBeltSlot(from) && !Gear.hasBelt(gear)) return;
    const previous = gear[slot];
    if (slot === 'belt' && previous && !Gear.beltEmpty(inventory)) { this._notice(id, 'Empty the belt bar first'); return; }
    if (slot === 'back' && previous && gear.weapon && !ItemDefs[item].sheath) return;
    inventory.slots[from].count -= 1;
    if (inventory.slots[from].count <= 0) inventory.slots[from] = previous ? { id: previous, count: 1 } : null;
    else if (previous) inventory.add(previous, 1);
    gear[slot] = item;
    this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'equip', to: id, item });
  }

  _handleUnequip(id, inventory, slot) {
    const p = this.players[id], gear = p.gear, item = gear[slot];
    if (!item || !(slot === 'weapon' || EquipSlots.includes(slot))) return;
    if (slot === 'belt' && !Gear.beltEmpty(inventory)) { this._notice(id, 'Empty the belt bar first'); return; }
    if (slot === 'back' && gear.weapon) { this._notice(id, 'Take the sword out of it first'); return; }
    if (inventory.add(item, 1) > 0) { this._notice(id, 'Inventory full'); return; }
    gear[slot] = '';
    if (slot === 'weapon') p.drawn = false;
    this.inventoryRev[id]++;
  }

  _heldFor(id, p, inventory, input) {
    p.sel = Gear.isBeltSlot(input.slot) && !Gear.hasBelt(p.gear) ? 0 : input.slot;
    return Gear.heldItem(p.gear, p.drawn, inventory.itemIdAt(p.sel));
  }

  /* ---- health ---- */
  _damagePlayer(id, amount) {
    const p = this.players[id];
    if (!p || p.hp <= 0) return;
    const taken = Math.max(1, Math.round(amount * (1 - Gear.damageReduction(p.gear))));
    p.hp = Math.max(0, p.hp - taken); p.hurtT = 0.4;
    this.pendingEvents.push({ type: 'hurt', to: id, amount: taken, hp: p.hp });
    if (p.hp <= 0) this._knockOut(id);
  }

  /** Knocked out: back to the village with half health. Nothing is lost. */
  _knockOut(id) {
    const p = this.players[id], boat = this.boats[p.boat];
    if (boat) { boat.occupant = ''; p.boat = ''; }
    this._dismount(id, p);
    const spawn = Village.spawns[p.slot];
    p.x = spawn.x; p.y = spawn.y; p.vx = p.vy = 0; p.drawn = false;
    p.hp = p.maxHp * CONFIG.sim.health.respawnFraction;
    p.hunger = Math.max(p.hunger, 40); p.thirst = Math.max(p.thirst, 40);
    this.map.ensureAround(p.x, p.y, SERVER_STREAM_RADIUS);
    this.pendingEvents.push({ type: 'died', to: id });
  }

  /* ---- chest, emotes ---- */
  _openChest(id, p) {
    const inventory = this.inventories[id];
    if (p.looted) { this._notice(id, 'You already emptied this chest'); return; }
    const trial = Inventory.fromJSON(inventory.toJSON());
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
      const human = this._humans().find(h => Math.hypot(h.x - p.x, h.y - p.y) < 5);
      if (human) this._handleEmote(id, 'wave');
    }
  }

  _notice(id, text) { this.pendingEvents.push({ type: 'notice', to: id, text }); }

  /* ---- simulation ---- */
  step() {
    this.tick++;
    let focus = null;
    for (const id in this.inputQueues) {
      const queue = this.inputQueues[id];
      // Each input is applied exactly once with a fixed dt, so client prediction matches bit-for-bit.
      for (let n = 0; n < CONFIG.sim.maxInputsPerTick && queue.length; n++) this._applyInput(id, queue.shift());
      if (!focus) focus = this.players[id];
    }
    for (const id in this.bots) {
      this._applyInput(id, sanitizeInput(botInput(this.bots[id], this.players[id], this.map, this.rng, TICK_DT, focus)));
    }
    for (const id in this.boats) {                                                   // drifting boats glide to a stop, then sleep
      const boat = this.boats[id];
      if (!boat.occupant && (boat.vx !== 0 || boat.vy !== 0)) stepBoat(boat, NO_INPUT, TICK_DT, this.map);
    }
    for (const id in this.players) {                                                   // hunger / thirst drain for everyone (bots never starve)
      const p = this.players[id];
      if (this.bots[id]) { p.hunger = CONFIG.sim.hunger.max; p.thirst = CONFIG.sim.thirst.max; } else this.vitals.drain(p, TICK_DT);
    }
    this.lightCache = LightSources.collect(this.map, Object.values(this.players));
    for (const id in this.players) this._tickPlayer(id, this.players[id]);
    this.trade.update();
    this.trees.update(this.tick);
    this.forage.update(this.tick);
    this.animals.update(this.tick, this._humans());
    this._streamWorld();
  }

  /** Keep the chunks around every player generated; forget chunks nobody is near (walls / tree states are kept on the World). */
  _humans() { return Object.keys(this.inputQueues).map(id => this.players[id]); }

  _streamWorld() {
    const humans = this._humans();
    for (const p of humans) this.map.ensureAround(p.x, p.y, SERVER_STREAM_RADIUS);
    if (this.tick % 150 === 0) this.map.unloadFar(Object.values(this.players), SERVER_KEEP_RADIUS);
  }

  _applyInput(id, input) {
    const p = this.players[id], inventory = this.inventories[id];
    p.drawn = !!input.drawn && !!p.gear.weapon && !p.boat && !p.mount;   // the sword is only out while you are on foot and hold one
    if (p.boat) this._row(id, p, inventory, input);
    else if (p.mount) this._ride(id, p, inventory, input);
    else {
      stepPlayer(p, input, TICK_DT, this.map);
      this.tools.update(id, p, inventory, input, TICK_DT);
      this.vitals.consumeHeld(id, p, inventory, input, TICK_DT);
      this._useCarriedAnimal(id, p, inventory, input, TICK_DT);
      this._useItem(id, p, inventory, input);
    }
    if (input.interact) this._interact(id, p);
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
    if (p.mount) { this._dismount(id, p); return; }
    if (p.boat) {
      const boat = this.boats[p.boat], spot = BoatSystem.findLanding(this.map, boat);
      if (spot) BoatSystem.leave(p, boat, spot); else this._notice(id, 'No shore nearby');
      return;
    }
    const action = Interactions.find(this.map, this.boats, p, p.held, this.animals.animals, id);
    if (!action) return;
    if (action.kind === 'pick') this._pickUp(id, action.forage);
    else if (action.kind === 'loot') this._openChest(id, p);
    else if (action.kind === 'door') this._toggleDoor(action.door);
    else if (action.kind === 'board') BoatSystem.board(id, p, action.boat);
    else if (action.kind === 'ride') this._mount(id, p, action.animal);
    else if (action.kind === 'feed') this._feedPony(id, action.animal);
    else if (action.kind === 'pickup') this._carryAnimal(id, action.animal);
    else if (action.kind === 'fill') this.vitals.fillJug(id, this.inventories[id]);
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

  /** Take the lasso off a pet: it stays where it is (near its new home) and you get the lasso back. A caught wild pony bolts instead. */
  _untie(id, animal) {
    const inventory = this.inventories[id];
    if (!inventory.canAdd('leash', 1)) { this._notice(id, 'Inventory full'); return; }
    const wasCaught = animal.captor === id;
    if (wasCaught) this.animals.releaseWild(animal.id); else this.animals.unleash(animal.id);
    inventory.add('leash', 1); this.inventoryRev[id]++;
    this.pendingEvents.push({ type: wasCaught ? 'letGo' : 'untied', to: id, x: animal.x, y: animal.y });
  }

  /** Feed an apple to a pony you have caught. It only eats in a stable or a closed pen; enough apples and it settles in as your pet. */
  _feedPony(id, animal) {
    const p = this.players[id], inventory = this.inventories[id], def = AnimalDefs[animal.type];
    if (p.held !== 'apple' || !inventory.has('apple', 1)) { this._notice(id, 'Hold an apple to feed it'); return; }
    if (!Shelter.find(this.map, animal.x, animal.y)) { this._notice(id, 'It will not eat out here: lead it to a stable or a closed pen first'); return; }
    inventory.remove('apple', 1); this.inventoryRev[id]++;
    const result = this.animals.feed(animal.id, id);
    this.progress.award(id, 'horsemanship', 12);
    this.pendingEvents.push({ type: 'fed', to: id, x: animal.x, y: animal.y, have: result.have, need: result.need });
    if (!result.done) return;                                                  // (the client shows "Apple 1/2")
    this._remember(id, animal);
    if (inventory.canAdd('leash', 1)) { inventory.add('leash', 1); this.inventoryRev[id]++; }              // the lasso comes back
    this.progress.award(id, 'horsemanship', 80);
    this.pendingEvents.push({ type: 'tamed', to: id, x: animal.x, y: animal.y, animal: animal.type, id: animal.id });
  }

  /** A small animal (a rabbit) is simply picked up. */
  _carryAnimal(id, animal) {
    const type = animal.type, item = Object.keys(ItemDefs).find(k => ItemDefs[k].creature === type), inventory = this.inventories[id];
    if (!item || !inventory.canAdd(item, 1)) { this._notice(id, 'Inventory full'); return; }
    this.animals.pickup(animal.id);
    inventory.add(item, 1); this.inventoryRev[id]++;
    this.pendingEvents.push({ type: 'carried', to: id, x: animal.x, y: animal.y, animal: type });
  }

  /** Holding a carried animal and pressing Use sets it down next to you as your pet. */
  _useCarriedAnimal(id, p, inventory, input, dt) {
    const def = ItemDB.get(p.held);
    if (!input.action || !def || !def.creature || p.eatT > 0) return;
    const x = p.x + Math.cos(p.facing) * 0.7, y = p.y + Math.sin(p.facing) * 0.7;
    inventory.remove(p.held, 1); this.inventoryRev[id]++;
    const pet = this.animals.release(def.creature, x, y, id);
    p.eatT = 0.8;
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
    return PonyVariants.map((v, i) => ({ index: i, id: v.id, name: v.name, biome: v.biome, seen: !!kept[i], owned: now[i] || 0 }));
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
    const wanted = this.forage.rollYield(found.prop) + (this.rng() < Skills.bonusYieldChance(p.lv, skill) ? 1 : 0);
    const gained = wanted - inventory.add(item, wanted);
    if (gained === 0) { this._notice(id, 'Inventory full'); return; }
    this.forage.pick(found.tx, found.ty, found.prop);
    this.inventoryRev[id]++;
    this.progress.award(id, skill, 9 * gained);
    this.pendingEvents.push({ type: 'pick', prop: kind, key: tileKey(found.tx, found.ty), x: found.prop.x, y: found.prop.y, by: id });
    this.pendingEvents.push({ type: 'gain', to: id, item, count: gained });
  }

  /* ---- riding ---- */
  _mount(id, p, animal) {
    const need = AnimalLevels.rideLevel(animal.type, animal.level), have = Skills._s(p.lv, 'horsemanship');
    if (have < need) { this._notice(id, `A level ${animal.level} ${AnimalDefs[animal.type].name} needs Horsemanship ${need} to ride (you have ${have})`); return; }
    p.mountLevel = animal.level;
    animal.rider = id; animal.leashed = false; animal.state = 'idle'; animal.vx = animal.vy = 0;
    p.mount = animal.id; p.x = animal.x; p.y = animal.y; p.vx = p.vy = 0; p.swingT = 0; p.swingHit = false; p.drawn = false;
    this.progress.award(id, 'horsemanship', 15);
    this.pendingEvents.push({ type: 'mounted', to: id, x: animal.x, y: animal.y });
  }

  /** Get off: the pony stays here as your free pet and you step down beside it. */
  _dismount(id, p) {
    const a = p && this.animals.animals[p.mount];
    if (p && p.mount) p.mount = '';
    if (!a) return;
    a.rider = ''; a.home = { x: a.x, y: a.y }; a.state = 'idle'; a.vx = a.vy = 0;
    const side = p.facing + Math.PI / 2, spot = { x: a.x + Math.cos(side) * 0.9, y: a.y + Math.sin(side) * 0.9 };
    if (!circleBlocked(this.map, spot.x, spot.y, CONFIG.sim.playerRadius)) { p.x = spot.x; p.y = spot.y; }
    p.vx = p.vy = 0;
  }

  /** On a pony: you steer it (stepPlayer uses the ride speeds), it follows your position, and riding trains Horsemanship. */
  _ride(id, p, inventory, input) {
    const a = this.animals.animals[p.mount];
    if (!a) { p.mount = ''; return; }
    stepPlayer(p, input, TICK_DT, this.map);
    a.x = p.x; a.y = p.y; a.vx = p.vx; a.vy = p.vy; a.facing = p.facing; a.state = Math.hypot(p.vx, p.vy) > 0.2 ? 'ride' : 'idle';
    p.held = this._heldFor(id, p, inventory, input);
    p.swingT = 0; p.swingHit = false;
    this.vitals.consumeHeld(id, p, inventory, input, TICK_DT);
    if (a.state === 'ride') {                                      // a little Horsemanship XP for every few seconds in the saddle
      this.rideAcc[id] = (this.rideAcc[id] || 0) + TICK_DT * (input.run ? 2 : 1);
      if (this.rideAcc[id] >= 4) { this.rideAcc[id] = 0; this.progress.award(id, 'horsemanship', 6); }
    }
  }

  /* ---- treasure ---- */
  /** Using a message in a bottle opens it; using a treasure map reads it and adds it to your journal. */
  _useItem(id, p, inventory, input) {
    const use = ItemDB.getUse(p.held);
    if (!input.action || !use || p.eatT > 0) return;
    p.eatT = 0.8;
    if (use.opens) {
      if (!inventory.canAdd(use.opens, 1) && inventory.count(p.held) !== 1) { this._notice(id, 'Inventory full'); return; }
      inventory.remove(p.held, 1); inventory.add(use.opens, 1); this.inventoryRev[id]++;
      this.progress.award(id, 'digging', 15);
      this.pendingEvents.push({ type: 'opened', to: id }); this.pendingEvents.push({ type: 'gain', to: id, item: use.opens, count: 1 });
    } else if (use.reveals) this._revealMap(id, p, inventory);
  }

  _revealMap(id, p, inventory) {
    const maps = this.treasureMaps[id];
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
    const snapshot = { tick: this.tick, players, boats: this.boatStates(), trees: collectTreeStates(this.map), forage: collectForageStates(this.map), animals: this.animals.states(this._humans()), events: this.pendingEvents };
    this.pendingEvents = [];
    return snapshot;
  }
  /** Boats near a human player (the rest are not worth sending). */
  boatStates() {
    const out = {}, humans = Object.keys(this.inputQueues).map(id => this.players[id]);
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
  /** Shared: all built structures, only when something was built / demolished since last sent (else null). */
  builtUpdateFor(id) {
    if (this.builtSentRev[id] === this.builtRev) return null;
    this.builtSentRev[id] = this.builtRev;
    return JSON.parse(JSON.stringify(this.map.built));
  }
}
