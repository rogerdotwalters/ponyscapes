'use strict';
/* CLIENT game state: prediction, reconciliation, interpolation, inventory mirror, building cursor, event relay.
 * It never draws and never touches the DOM. */
const CLIENT_STREAM_RADIUS = 2, CLIENT_KEEP_RADIUS = 4, CHUNKS_PER_FRAME = 2;     // chunks around the player (CLIENT_KEEP_RADIUS: never dropped)
// Land you have seen stays built until the cap is passed (then the least recently seen goes): ~12 KB a chunk, so about 15 MB, or 6 on a small phone.
const CLIENT_MAX_CHUNKS = (typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4) ? 500 : 1200;

class ClientGame {
  constructor(net) {
    this.net = net;
    this.events = new EventBus();                      // 'inventoryChanged', 'selectedSlotChanged', 'builtChanged', 'chop', 'fell', 'gain', 'built', 'notice', ...
    this.map = null; this.myId = null;                   // map: the grid we stand on (the overworld, or a room / cave instance)
    this.worldMap = null; this.grids = null; this.grid = '';   // worldMap: the overworld, always kept (its buildings, trees and stockpiles keep updating)
    this.local = null; this.prevLocal = null;          // predicted local player (current / previous tick)
    this.localBoat = null;                             // predicted copy of the boat we are rowing
    this.correction = { x: 0, y: 0 };                  // visual error offset that decays after a correction
    this.pending = [];                                 // inputs sent but not yet acknowledged
    this.seq = 0; this.snapshots = []; this.remoteTick = 0; this.serverTick = 0;
    this.lastAck = 0; this.lastError = 0; this.hasSnapshot = false; this.welcomeBoats = {}; this.welcomeAnimals = {};
    this.npcs = {}; this.npcView = {}; this.friends = {}; this.beingTypes = {};                    // the villagers (and where they are drawn), and your hearts: { beingId: [level, points] }
    this.weather = null;                               // the sky the server sent: { t: type, rain, wind, lightning, snow, dir } (weather.js)
    this.clockTick = 0;                                // smooth tick counter for the time of day
    this.inventory = new Inventory(); this.selectedSlot = 0;
    this.questLog = QuestLog.empty();                  // the host world's quests (questSystem.js)
    this.chest = null;                                 // the chest you have open (homeCrafts.js)
    this.pack = null;                                  // the pack of the pony you ride or stand next to: { id, name, bags, riding, inventory } (packSystem.js)
    this.localSwingT = 0;                              // cosmetic swing so our own tool feels instant
    this.pets = []; this.book = []; this.varieties = []; this.questMarks = [];   // questMarks: lost young you have tracked (map)
                       // the Pony Book: your tamed animals and which pony kinds you have kept
    this.buildTarget = null;                           // { tx, ty, side, structure, valid, reason } while holding a placeable item
    this.buildCursor = null;                           // { tx, ty } while a finger / mouse aims; null = tile in front of the player
    this.buildRotation = 0;                            // R: next candidate side (connecting sides come first)
    this.lastBuildTile = '';                           // rotation resets when the aimed tile changes
    this.isHost = false;
    this.progress = { s: {}, a: {} };                  // skill / attribute XP (private; the levels are on the player)
    this.treasureMaps = []; this.mapIndex = 0;         // [{ key, tx, ty }]: where your treasure maps lead
    this.trade = null;                                 // the server's view of our trade window (null = no trade)
    this.gearKey = '';
    this.actionWasDown = false; this.interactQueued = false; this.powerQueued = 0;
    this.streamFrames = 0;
  }

  onWelcome(welcome) {
    this.myId = welcome.id;
    if (welcome.admin) GameSettings.applyWire(welcome.admin, true);     // the host's speed, clock and trees: before the land is built, so it matches the server's
    this.worldMap = new World(welcome.mapSeed);              // same seed as the server -> identical terrain, never sent
    this.grids = new GridSet(welcome.mapSeed, this.worldMap);
    this.grid = gridOf(welcome.player); this.map = this.grids.get(this.grid);     // (we may join standing inside a room)
    this._applyRings(welcome.rings);                          // which rings are open decides where the barriers are
    this.local = clonePlayer(welcome.player); this.prevLocal = clonePlayer(welcome.player);
    this.serverTick = welcome.tick; this.clockTick = welcome.tick; this.welcomeBoats = welcome.boats || {}; this.welcomeDrops = welcome.drops || {}; this.welcomeAnimals = welcome.animals || {}; this.npcs = welcome.npcs || {}; this.npcView = {}; this.friends = welcome.friends || {};
    if (welcome.inventory) this.inventory = Inventory.fromJSON(welcome.inventory, this.local.carryStacks);
    this.inventory.setCoins(welcome.coins);                                                            // (an array of counts, copper first: coins.js)
    this._applyQuestLog(welcome.questLog);
    if (welcome.pack !== undefined && welcome.pack !== null) this._applyPack(welcome.pack);
    this.isHost = !!welcome.host;
    this.settings = welcome.settings || { hostilesOff: false, testPony: false, difficulty: CONFIG.sim.difficulty.default };            // the host's testing aids (Settings); only the host is ever told
    if (welcome.progress) this.progress = welcome.progress;
    if (welcome.treasure) this.treasureMaps = welcome.treasure;
    if (welcome.built) BuildSystem.replaceAll(this.worldMap, welcome.built);
    if (welcome.floors) BuildSystem.replaceFloors(this.worldMap, welcome.floors);
    if (welcome.farm) { this.worldMap.farm = welcome.farm; }
    if (welcome.weather) this.weather = welcome.weather;
    if (welcome.stockpiles) Stockpiles.replaceAll(this.worldMap, welcome.stockpiles);
    applyTreeStates(this.worldMap, welcome.trees || {});
    applyForageStates(this.worldMap, welcome.forage || {});
    this.map.ensureAround(this.local.x, this.local.y, CLIENT_STREAM_RADIUS);
    this._refreshBuildTarget();
  }

  nextSeq() { return ++this.seq; }

  /** Load chunks ahead of the player (a couple per frame, so nothing hitches) and forget the ones left far behind. */
  streamWorld() {
    this.map.ensureAround(this.local.x, this.local.y, CLIENT_STREAM_RADIUS, CHUNKS_PER_FRAME);
    if (++this.streamFrames % 120 === 0) this.map.trim([this.local], CLIENT_KEEP_RADIUS, CLIENT_MAX_CHUNKS);
  }
  get riding() { return !!(this.local && (this.local.boat || this.local.mount)); }      // in a boat or on a pony: no tools, no building

  /* ---- toolbar / inventory / crafting (called by the UI) ---- */
  /** What the character is holding: whatever is in the selected hotbar slot (swords are ordinary hotbar items now). */
  heldItemId() { return this.inventory.itemIdAt(this.selectedSlot); }
  get gear() { return (this.local && this.local.gear) || createWardrobe(); }
  selectSlot(index) {
    if (index === this.selectedSlot || !(index >= 0 && index < CONFIG.sim.inventory.hotbarSlots)) return;
    this.selectedSlot = index;
    this.events.emit('selectedSlotChanged', index);
    this._refreshBuildTarget();
  }
  cycleSlot(direction) {
    const n = CONFIG.sim.inventory.hotbarSlots;
    this.selectSlot((this.selectedSlot + direction + n) % n);
  }
  moveSlot(from, to) { this.net.sendCommand({ type: 'moveSlot', from, to }); }   // server decides; we wait for the update
  /** Drop `count` from a pack slot onto the ground in front of you (anyone can pick it up), or destroy it for good. */
  /** X / the Drop button: one of what is in your hand (all: the whole stack) goes on the ground in front of you. */
  dropHeld(all = false) {
    const s = this.inventory.getSlot(this.selectedSlot);
    if (!s) { this.events.emit('notice', { to: this.myId, text: 'Nothing in your hand to drop' }); return; }
    this.dropItem(this.selectedSlot, all ? s.count : 1);
  }
  dropItem(slot, count, pack = false, chest = false) { this.net.sendCommand({ type: 'drop', slot, count, pack: !!pack, chest: !!chest }); }
  destroyItem(slot, count, pack = false, chest = false) { this.net.sendCommand({ type: 'destroy', slot, count, pack: !!pack, chest: !!chest }); }
  /** Move a stack between your bag and your pony's pack: { pack: bool, i } each end (to.i -1: wherever it fits). */
  packMove(from, to) { this.net.sendCommand({ type: 'packMove', from: { pack: !!from.pack, chest: !!from.chest, i: from.i }, to: { pack: !!to.pack, chest: !!to.chest, i: to.i } }); }
  /** Take the bag in this bag slot off the pony (into your bag). */
  ponyBagOff(index) { this.net.sendCommand({ type: 'ponyBagOff', index }); }
  /** At a shop counter: buy one of this item. */
  /** The world's quest log, as the server wrote it ({ done: { id: tick }, active: { id: [step, progress] } }). */
  _applyQuestLog(wire) {
    const log = QuestLog.empty();
    if (wire) { Object.assign(log.done, wire.done || {}); for (const id in wire.active || {}) log.active[id] = { step: wire.active[id][0], progress: wire.active[id][1] }; }
    this.questLog = log; this.events.emit('questsChanged');
  }
  questAccept(quest) { this.net.sendCommand({ type: 'questAccept', quest }); }
  questDeliver(quest) { this.net.sendCommand({ type: 'questDeliver', quest }); }
  puzzleSolve(node, moves) { this.net.sendCommand({ type: 'puzzleSolve', node, moves }); }
  /** Put coins of one kind on the ground (item: 'silver_coin' ...), in front of you or (the coin bag) at the world spot x, y. */
  dropCoins(item, count, x, y) { this.net.sendCommand(Number.isFinite(x) && Number.isFinite(y) ? { type: 'dropCoins', item, count, x, y } : { type: 'dropCoins', item, count }); }
  /** The coin bag's exchange: break a coin into the kind below, or merge everything up. */
  coinChange(mode, item) { this.net.sendCommand({ type: 'coinChange', mode, item }); }
  /** Buy at the shop counter. `pay`: the coins you put on the counter, a count of each kind (coins.js); the shop gives change. */
  /** One job on one plot of a field (the garden window): op = till | dig | water | plant | cover | clear | harvest. The server checks it all (farming.js). */
  fieldOp(op, tx, ty, i, item) { this.net.sendCommand({ type: 'field', op, tx, ty, i, item }); }
  fieldAt(tx, ty) { return Farming.fieldAt(this.map, tx, ty); }
  buy(item, pay) { this.net.sendCommand({ type: 'buy', item, pay }); }
  _applyPack(wire) {
    this.pack = wire ? { id: wire.id, name: wire.name, bags: wire.bags, riding: !!wire.riding, main: !!wire.main, inventory: Inventory.fromJSON(wire.slots || [], null) } : null;
    this.events.emit('packChanged');
  }
  /** The chest you have open (homeCrafts.js): { key, name, inventory } or null. */
  _applyChest(wire) {
    this.chest = wire ? { key: wire.key, name: wire.name, inventory: Inventory.fromJSON(wire.slots || [], null) } : null;
    this.events.emit('chestChanged');
  }
  /** L: throw the lasso in the lasso slot (whatever is in your hand). */
  throwLasso() {
    const lasso = this.local && this.local.gear && this.local.gear.lasso;
    if (!lasso) { this.events.emit('notice', { to: this.myId, text: 'Your lasso slot is empty: put a lasso in it (Gear)' }); return; }
    this.lassoQueued = true;
  }
  /** A tap / click on an animal: feed it what you hold (act 'feed') or pet it. The server checks the reach. */
  animalAct(animalId, act) { this.net.sendCommand({ type: 'animalAct', animal: animalId, act }); }
  /** A tap / click on a villager: say hello (act 'talk') or give them what you hold (act 'gift'). */
  talkTo(npcId, act = 'talk') { this.net.sendCommand({ type: 'talkTo', npc: npcId, act }); }
  craft(recipeId) { this.net.sendCommand({ type: 'craft', recipe: recipeId }); }

  /* ---- wardrobe, emotes, trading (all decided by the server) ---- */
  equip(inventoryIndex) { this.net.sendCommand({ type: 'equip', from: inventoryIndex }); }
  unequip(slot) { this.net.sendCommand({ type: 'unequip', slot }); }
  emote(id) { this.net.sendCommand({ type: 'emote', id }); }
  /** Id of the nearest other player within trading range, or null. */
  nearestTrader() {
    const latest = this.snapshots[this.snapshots.length - 1], me = this.local;
    let best = null, bd = CONFIG.sim.tradeRange;
    if (latest) for (const id in latest.players) {
      if (id === this.myId) continue;
      const d = Math.hypot(latest.players[id].x - me.x, latest.players[id].y - me.y);
      if (d <= bd) { bd = d; best = id; }
    }
    return best;
  }
  requestTrade(target) { this.net.sendCommand({ type: 'tradeRequest', target }); }
  acceptTrade() { this.net.sendCommand({ type: 'tradeAccept' }); }
  cancelTrade() { this.net.sendCommand({ type: 'tradeCancel' }); }
  offerTrade(item, count) { this.net.sendCommand({ type: 'tradeOffer', item, count }); }
  confirmTrade(value) { this.net.sendCommand({ type: 'tradeConfirm', value }); }
  nearbyStations() { return this.local ? BuildSystem.stationsNear(this.map, this.local) : new Set(); }
  /** The stockpiles the stations you stand at can pull from (a StockSupply). */
  nearbySupply() { return this.local ? Stockpiles.supplyFor(this.map, this.local) : new StockSupply(this.map, []); }

  /* ---- the town: stockpiles and upgrades (decided by the server) ---- */
  takeFromStockpile(tx, ty, item, count) { this.net.sendCommand({ type: 'stockTake', tx, ty, item, count }); }
  upgradeBuilding(tx, ty) { this.net.sendCommand({ type: 'upgrade', tx, ty }); }

  /* ---- a pony's rarity abilities: H / K, or the power button (fires the first one that is ready). Flight is useAbility (B). ---- */
  requestPonyPower(index) {
    const L = this.local;
    if (!L || !L.mount) { this.events.emit('notice', { to: this.myId, text: 'Ride a pony to use its abilities' }); return; }
    if (index === 0) { const ready = (L.abilities || []).findIndex((a, i) => !(L.abilityCd[i] > 0)); index = ready >= 0 ? ready : 0; }
    else index -= 1;
    this.powerQueued = index + 1;
  }
  /** What the ridden pony can do: [{ ability, cooldown }] (empty when not riding). */
  abilityState() { const L = this.local; return L && L.mount ? (L.abilities || []).map((id, i) => ({ ability: AbilityDefs[id], cooldown: L.abilityCd[i] || 0 })).filter(a => a.ability) : []; }

  /** Host only: change how hunger / thirst work for one player slot ('p2'...). Either mode may be omitted. */
  /** Host only: easy / medium / hard (what happens when health runs out in a dungeon). */
  setDifficulty(mode) { this.net.sendCommand({ type: 'setDifficulty', mode }); }
  setVitalModes(target, hungerMode, thirstMode) { this.net.sendCommand({ type: 'setVitals', target, hunger: hungerMode, thirst: thirstMode }); }
  latestAnimals() { const last = this.snapshots[this.snapshots.length - 1]; return (last && last.animals) || this.welcomeAnimals || {}; }
  latestPlayers() { const last = this.snapshots[this.snapshots.length - 1]; return last ? last.players : {}; }

  /* ---- boats ---- */
  requestInteract() { this.interactQueued = true; }
  latestDrops() { const last = this.snapshots[this.snapshots.length - 1]; return (last && last.drops) || this.welcomeDrops || {}; }
  latestBoats() { const last = this.snapshots[this.snapshots.length - 1]; return (last && last.boats) || this.welcomeBoats; }
  /** What the interact button would do right now: 'Exit' | 'Pick' | 'Board' | 'Drink' | 'Fill' | null (nearest wins). */
  interactHint() {
    if (!this.local) return null;
    if (this.local.boat) return 'Exit';
    if (Downed.isDown(this.local)) return null;                                       // on your knees: only snacks
    const ally = Downed.findAlly(this.latestPlayers(), this.local, this.myId);          // a teammate down beside you
    if (ally) return ally.label;
    const action = Interactions.find(this.map, this.latestBoats(), this.local, this.heldItemId(), this.latestAnimals(), this.myId, this.npcs, this.latestDrops());
    return action ? action.label : null;
  }

  /* ---- letting go: its OWN button, never the action button. A caught wild pony asks first. ---- */
  /** The animal the Let go / Untie button would act on right now (or null). */
  releaseTarget() { return this.local ? findRelease(this.local, this.latestAnimals(), this.myId) : null; }
  /** The second thumb button: Let go / Untie, or - on a pony with something else to do nearby - Dismount (Z). */
  releaseHint() { const t = this.releaseTarget(); if (t) return t.label; return this.local && this.local.mount && this.interactHint() !== 'Dismount' ? 'Dismount' : null; }
  /** Your bond with an animal or villager: { level, into } or null if you have not made friends. */
  friendOf(id) { const e = this.friends[id]; return e ? { level: e[0], into: e[1] } : null; }

  /** The pony we are riding, as last seen (its kind decides what it can do). */
  mountedPony() {
    const id = this.local && this.local.mount; if (!id) return null;
    const last = this.snapshots[this.snapshots.length - 1];
    return (last && last.animals && last.animals[id]) || this.welcomeAnimals[id] || null;
  }
  /** The ability button: null when there is nothing to press, else { label, ready, flying }. */
  abilityHint() {
    const L = this.local, pony = this.mountedPony();
    if (!L || L.boat || !pony || !PonyAbilityRules.has(pony.type, 'fly')) return null;
    if (L.flying) return { label: `Land ${Math.ceil(L.flyT)}s`, ready: true, flying: true };
    if (L.flyCd > 0) return { label: `Fly ${Math.ceil(L.flyCd)}s`, ready: false, flying: false };
    return { label: 'Fly', ready: true, flying: false };
  }
  /** Riding one of your own ponies that is not your main pony: offer to make it the one that follows you everywhere. */
  mainPonyHint() {
    const L = this.local, pony = this.mountedPony();
    return !!(L && !L.boat && pony && pony.owner === this.myId && !pony.main && AnimalDefs[pony.type] && AnimalDefs[pony.type].pony);
  }
  makeMainPony() { if (this.mainPonyHint()) this.net.sendCommand({ type: 'mainPony' }); }
  useAbility(id = 'fly') { if (this.abilityHint()) this.net.sendCommand({ type: 'ability', id }); }
  /** Host only: a testing aid (a flying test pony, hostile mobs off). */
  /** Host: the Admin page's live values (globalSpeed, dayShare, gameHoursPerRealHour). */
  setAdmin(values) { this.net.sendCommand({ type: 'admin', values }); }
  /** Host testing aid: jump the clock to an hour (0-24) of the current day, for everyone. */
  /** Host only: set the weather now (a type id from Weather.TYPES), or 'auto' to let the season's table choose again. */
  debugTeleport(to) { this.net.sendCommand({ type: 'debugTeleport', to }); }
  setWeather(id) { this.net.sendCommand({ type: 'weather', id }); }
  setTimeOfDay(hour) { this.net.sendCommand({ type: 'admin', values: {}, hour }); }
  setSetting(key, value) { this.net.sendCommand({ type: 'setting', key, value: !!value }); }
  requestDismount() { this.net.sendCommand({ type: 'dismount' }); }
  _animalName(animal) { return animal.look ? PonyLook.describe(animal.look).name : AnimalDefs[animal.type].name; }
  /** Pressed the Let go button / U. Untying an animal you already own is safe; letting go of a catch opens the confirmation. */
  requestRelease() {
    const target = this.releaseTarget();
    if (!target) { if (this.local && this.local.mount) this.requestDismount(); return; }
    if (target.losesCatch) this.events.emit('confirmRelease', { id: target.animal.id, name: this._animalName(target.animal), need: AnimalDefs[target.animal.type].tameApples });
    else this.net.sendCommand({ type: 'release', animal: target.animal.id });
  }
  /** The Pony Book's per-animal button: the same rules, from anywhere. */
  requestReleasePet(petId) {
    const pet = this.pets.find(p => p.id === petId);
    if (!pet) return;
    if (pet.gentling) this.events.emit('confirmRelease', { id: pet.id, name: this._animalName(pet), need: pet.gentling.need });
    else this.net.sendCommand({ type: 'release', animal: pet.id });
  }
  /** The player said yes in the dialog. */
  confirmRelease(animalId) { this.net.sendCommand({ type: 'release', animal: animalId, confirm: true }); }
  /** Is this still a catch of mine (so the dialog should stay open)? */
  isMyCatch(animalId) { const a = this.latestAnimals()[animalId]; return !!a && a.captor === this.myId; }

  /** What a player is called: their chosen name, else "P2". */
  playerName(id) { const last = this.snapshots[this.snapshots.length - 1], p = last && last.players && last.players[id]; return (p && p.name) || 'P' + (id.slice(1) | 0); }

  /** Hour of day (0..24) for the lighting and the clock. */
  hour() { return DayCycle.hourAt(this.clockTick); }

  /* ---- building: ghost preview, aiming, committing ---- */
  holdingPlaceable() { return !this.riding && !!ItemDB.getPlaceable(this.heldItemId()); }
  setBuildCursor(tx, ty) { this.buildCursor = { tx, ty }; this._refreshBuildTarget(); }
  rotateBuild() { this.buildRotation = (this.buildRotation + 1) % 4; this._refreshBuildTarget(); }

  /** Place at the current target (if valid), then drop the cursor. Invalid targets explain themselves. */
  commitBuild() {
    const target = this.buildTarget;
    this.buildCursor = null;
    if (target && target.valid) this.net.sendCommand({ type: 'place', tx: target.tx, ty: target.ty, side: target.side, slot: this.selectedSlot });
    else if (target) this.events.emit('notice', { to: this.myId, text: target.reason });
    this._refreshBuildTarget();
  }
  cancelBuild() { this.buildCursor = null; this._refreshBuildTarget(); }

  _refreshBuildTarget() {
    const placeable = this.local && !this.grid && this.holdingPlaceable() ? ItemDB.getPlaceable(this.heldItemId()) : null;     // (only the overworld is built on)
    if (!placeable || (!CONFIG.sim.construction && StructureDefs[placeable.structure].layer !== 'station')) { this.buildTarget = null; return; }   // (walls and floors are switched off)
    let tx, ty, dx, dy;
    if (this.buildCursor) {                                     // aimed with a finger / mouse: face the builder
      ({ tx, ty } = this.buildCursor); dx = tx + 0.5 - this.local.x; dy = ty + 0.5 - this.local.y;
    } else {                                                    // keyboard / Use button: the tile in front
      ({ tx, ty } = BuildSystem.targetTile(this.local));
      const a = snapAngle8(this.local.facing); dx = Math.cos(a); dy = Math.sin(a);
    }
    const tileId = tx + ',' + ty;
    if (tileId !== this.lastBuildTile) { this.lastBuildTile = tileId; this.buildRotation = 0; }   // a new tile starts from the best (connecting) side

    const layer = StructureDefs[placeable.structure].layer;
    let slot = layer === 'floor' ? 'f' : 'c';
    if (layer === 'wall') {                                     // walls snap to existing walls; windows / doors go into one
      const insertHost = StructureDefs[placeable.structure].insert;
      const options = insertHost ? BuildSystem.insertOptions(this.map, tx, ty, dx, dy, insertHost) : BuildSystem.sideOptions(this.map, tx, ty, dx, dy);
      slot = options[this.buildRotation % options.length];
    }
    const check = BuildSystem.canPlace(this.map, tx, ty, slot, this._playerPositions(), this.local, placeable.structure);
    this.buildTarget = { tx, ty, side: slot, slot, layer, structure: placeable.structure, valid: check.ok, reason: check.reason };
  }

  _playerPositions() {
    const positions = [this.local], latest = this.snapshots[this.snapshots.length - 1];
    if (latest) for (const id in latest.players) if (id !== this.myId) positions.push(latest.players[id]);
    return positions;
  }

  /* ---- fixed tick: predict locally, then send the same input to the server ---- */
  predict(rawInput) {
    const input = sanitizeInput(Object.assign({}, rawInput, { slot: this.selectedSlot, interact: this.interactQueued, power: this.powerQueued, lasso: this.lassoQueued || !!rawInput.lasso }));
    this.interactQueued = false; this.powerQueued = 0; this.lassoQueued = false;
    this.prevLocal = clonePlayer(this.local);
    this._stepLocal(this.local, this.localBoat, input);
    this._tickCosmeticSwing(input);
    this._handleUseButton(input);
    this.pending.push(input);
    if (this.pending.length > 180) this.pending.shift();
    this.correction.x *= 0.85; this.correction.y *= 0.85;
    this.net.sendInput(input);
  }

  _stepLocal(player, boat, input) {
    if (player.boat && boat) stepRider(player, boat, input, TICK_DT, this.map);
    else stepPlayer(player, input, TICK_DT, this.map);
  }

  /** The Use button / E key places the wall in front of the player on its rising edge (finger aiming goes through commitBuild). */
  _handleUseButton(input) {
    const pressed = input.action && !this.actionWasDown;
    this.actionWasDown = input.action;
    this._refreshBuildTarget();
    if (pressed && this.buildTarget && !this.buildCursor) this.commitBuild();
  }

  _tickCosmeticSwing(input) {                          // mirrors ToolSystem's timing; the server decides real hits
    const lasso = input.lasso && this.local && !this.local.boat && this.local.gear && this.local.gear.lasso;
    if (this.lassoTicks > 0) this.lassoTicks--;
    if (lasso && this.localSwingT <= 0) { this.lassoTicks = Math.ceil(ItemDB.getTool(lasso).swingTime / TICK_DT) + 1; this.lassoHeld = lasso; }
    const tool = this.local && this.local.boat ? null : ItemDB.getTool(this._swingItem());       // (a boat has no tools; a pony does)
    this.localSwingT = tool ? Math.max(0, this.localSwingT - TICK_DT) : 0;
    if (tool && (input.action || lasso) && this.localSwingT <= 0) this.localSwingT = tool.swingTime;
  }
  /** What our hand shows: the thrown lasso for the length of the throw, else the selected item. */
  _swingItem() { return this.lassoTicks > 0 ? this.lassoHeld : this.heldItemId();
  }

  /* ---- snapshots ---- */
  /** A guardian fell (or we just arrived): open the rings the server says are open. */
  _applyRings(rings) {
    if (!rings) return;
    this.worldMap.layers.rings.setUnlocked(rings.unlocked);
    this.defeated = rings.defeated || [];
    this.events.emit('ringsChanged', rings);
  }

  onSnapshot(snapshot) {
    this.serverTick = snapshot.tick;
    if (snapshot.npcs) this.npcs = snapshot.npcs;                                  // (a remote player is only sent them when one moves or speaks)
    if (snapshot.friends) { this.friends = snapshot.friends; this.events.emit('friendsChanged', this.friends); }
    for (const id in snapshot.animals || {}) this.beingTypes[id] = snapshot.animals[id].type;          // remember what each animal is, so the Journal can list your friends when they are far away
    if (snapshot.rings) this._applyRings(snapshot.rings);
    if (snapshot.settings) { this.settings = snapshot.settings; this.events.emit('settingsChanged', this.settings); }
    if (snapshot.admin) { GameSettings.applyWire(snapshot.admin, false); this.events.emit('adminChanged'); }
    if (snapshot.weather) { this.weather = snapshot.weather; this.events.emit('weatherChanged', this.weather); }
    if (snapshot.pets) { this.pets = snapshot.pets; this.events.emit('petsChanged'); }
    if (snapshot.quests) this.questMarks = snapshot.quests;                       // lost young you have tracked: shown on the map
    if (snapshot.book) this.book = snapshot.book;
    if (snapshot.varieties) this.varieties = snapshot.varieties;
    this._followGrid(snapshot);                                                  // through a door / into a cave: switch to that grid first
    this._bufferForInterpolation(snapshot);
    this._reconcile(snapshot);
    applyTreeStates(this.worldMap, snapshot.trees || {});                         // (the overworld's: kept up to date even while we are indoors)
    applyForageStates(this.worldMap, snapshot.forage || {});
    if (snapshot.built) { BuildSystem.replaceAll(this.worldMap, snapshot.built); this.events.emit('builtChanged'); }
    if (snapshot.floors) BuildSystem.replaceFloors(this.worldMap, snapshot.floors);
    if (snapshot.farm) { this.worldMap.farm = snapshot.farm; Groves.sync(this.worldMap); Hedges.sync(this.worldMap); }      // (a sapling that has grown stands as a tree)                          // the fields (farming.js)
    if (snapshot.stockpiles) { Stockpiles.replaceAll(this.worldMap, snapshot.stockpiles); this.events.emit('stockpilesChanged'); }
    if (snapshot.inventory) { const coins = this.inventory.coins; this.inventory = Inventory.fromJSON(snapshot.inventory, this.local.carryStacks); this.inventory.setCoins(coins); this.events.emit('inventoryChanged'); }
    if (snapshot.questLog) this._applyQuestLog(snapshot.questLog);
    if (Array.isArray(snapshot.coins)) { this.inventory.setCoins(snapshot.coins); this.events.emit('inventoryChanged'); }
    else if (this.inventory.carryStacks !== this.local.carryStacks) { this.inventory.carryStacks = this.local.carryStacks; this.events.emit('inventoryChanged'); }
    if (snapshot.pack !== undefined) this._applyPack(snapshot.pack);
    if (snapshot.chest !== undefined) this._applyChest(snapshot.chest);
    if (snapshot.progress) { this.progress = snapshot.progress; this.events.emit('progressChanged'); }
    if (snapshot.treasure) { this.treasureMaps = snapshot.treasure; this.mapIndex = Math.min(this.mapIndex, Math.max(0, this.treasureMaps.length - 1)); this.events.emit('treasureChanged'); }
    if (snapshot.trade) { this.trade = snapshot.trade.state; this.events.emit('tradeChanged'); }
    const gearKey = JSON.stringify(this.local.gear) + this.local.hp.toFixed(0);
    if (gearKey !== this.gearKey) { this.gearKey = gearKey; this.events.emit('gearChanged'); }
    this._refreshBuildTarget();
    for (const e of snapshot.events || []) this.events.emit(e.type, e);
  }

  /** The server moved us to another grid: stand on that grid's World from now on. Everything around us (people, animals, items) arrives with
   *  the snapshot, which only ever holds our own grid, so the interpolation buffer starts afresh. */
  _followGrid(snapshot) {
    const mine = snapshot.players && snapshot.players[this.myId];
    if (!mine || gridOf(mine) === this.grid) return;
    const from = this.grid;
    this.grid = gridOf(mine); this.map = this.grids.get(this.grid);
    if (from) this.grids.drop(from);                                            // (an instance we left is rebuilt from its plan if we come back)
    this.snapshots = []; this.hasSnapshot = false; this.pending = []; this.lastBuildTile = null;
    this.local = clonePlayer(mine); this.prevLocal = clonePlayer(mine); this.correction.x = this.correction.y = 0;
    this.map.ensureAround(this.local.x, this.local.y, CLIENT_STREAM_RADIUS);
    this.events.emit('gridChanged', { from, to: this.grid, kind: this.map.kind });
  }
  /** Where we are on the overworld map: our position, or (indoors) the door of the building / the mouth of the cave we are in. */
  outsidePosition() {
    if (!this.grid) return { x: this.local.x, y: this.local.y };
    const site = Grids.siteOf(this.grid), g = Grids.parse(this.grid);
    if (site) return BuildingSites.doorFront(site);
    const cave = g && g.kind === 'cave' ? this.worldMap.layers.dungeons.site(g.ring) : g && g.kind === 'dungeon' ? this.worldMap.terrain.caveSites.caves().find(c => c.index === g.dungeon) : null;
    return cave ? { x: cave.x, y: cave.y } : { x: this.local.x, y: this.local.y };
  }

  _bufferForInterpolation(snapshot) {
    this.snapshots.push(snapshot); if (this.snapshots.length > 24) this.snapshots.shift();
    const target = snapshot.tick - CONFIG.net.interpDelayTicks;
    if (!this.hasSnapshot || Math.abs(target - this.remoteTick) > 6) this.remoteTick = target;
    else this.remoteTick += (target - this.remoteTick) * 0.15;       // gently track the server clock
    this.hasSnapshot = true;
  }

  /** Rewind to the authoritative state, replay unacknowledged inputs, hide any small error. */
  _reconcile(snapshot) {
    const mine = snapshot.players[this.myId];
    if (!mine) return;
    this.lastAck = mine.ack;
    while (this.pending.length && this.pending[0].seq <= mine.ack) this.pending.shift();

    const replayed = clonePlayer(mine);
    const boat = mine.boat && snapshot.boats && snapshot.boats[mine.boat] ? cloneBoat(snapshot.boats[mine.boat]) : null;
    if (!boat) replayed.boat = '';                      // boat unknown: treat as walking
    for (const input of this.pending) this._stepLocal(replayed, boat, input);

    const dx = replayed.x - this.local.x, dy = replayed.y - this.local.y, error = Math.hypot(dx, dy);
    this.lastError = error;
    if (error > CONFIG.net.snapDistance) { this.correction.x = this.correction.y = 0; this.prevLocal = clonePlayer(replayed); }
    else { this.prevLocal.x += dx; this.prevLocal.y += dy; this.correction.x -= dx; this.correction.y -= dy; }
    this.local = replayed; this.localBoat = boat;
  }

  advanceRemoteClock(frameMs) {
    this.clockTick += frameMs / TICK_MS;                                       // smooth between snapshots, pulled back if it drifts
    if (Math.abs(this.clockTick - this.serverTick) > 6) this.clockTick = this.serverTick;
    if (!this.snapshots.length) return;
    this.remoteTick = Math.min(this.remoteTick + frameMs / TICK_MS, this.snapshots[this.snapshots.length - 1].tick);
  }

  /** The state the renderer draws: { tick, players, boats } in the same shape the server uses. */
  getRenderState(alpha) {
    const players = {}, boats = {}, animals = {}, L = this.local, P = this.prevLocal;
    players[this.myId] = Object.assign({}, L, {
      x: lerp(P.x, L.x, alpha) + this.correction.x, y: lerp(P.y, L.y, alpha) + this.correction.y,
      facing: lerpAngle(P.facing, L.facing, alpha),
      held: this._swingItem(), swingT: this.localSwingT
    });
    this._addInterpolated(players, boats, animals);
    if (L.boat && this.localBoat) {                    // the boat we row is drawn exactly under us
      const me = players[this.myId];
      boats[L.boat] = Object.assign({}, this.localBoat, { x: me.x, y: me.y, facing: me.facing, occupant: this.myId });
    }
    if (L.mount && animals[L.mount]) {                  // the pony we ride is drawn exactly under us
      const me = players[this.myId];
      animals[L.mount] = Object.assign({}, animals[L.mount], { x: me.x, y: me.y, facing: me.facing, vx: me.vx, vy: me.vy, rider: this.myId });
    }
    for (const id in players) players[id].lift = PonyAbilityRules.lift(players[id]);          // how high a flying pair is drawn (0 on the ground .. 1)
    for (const id in animals) { const a = animals[id], rider = a.rider && players[a.rider]; if (rider && rider.lift > 0) animals[id] = Object.assign({}, a, { lift: rider.lift, flying: true }); }
    const npcs = {};                                                                  // villagers glide to where the server says they are
    for (const id in this.npcs) {
      const n = this.npcs[id], v = this.npcView[id] || (this.npcView[id] = { x: n.x, y: n.y }), k = Math.hypot(n.x - v.x, n.y - v.y) > 3 ? 1 : 0.35;
      v.x += (n.x - v.x) * k; v.y += (n.y - v.y) * k; npcs[id] = Object.assign({}, n, { x: v.x, y: v.y });
    }
    return { tick: this.serverTick, players, boats, animals, npcs, drops: this.latestDrops() };
  }

  _addInterpolated(players, boats, animals) {
    const buf = this.snapshots;
    if (!buf.length) { Object.assign(boats, this.welcomeBoats); Object.assign(animals, this.welcomeAnimals); return; }
    const rt = this.remoteTick;
    let a = buf[0], b = buf[buf.length - 1];
    for (const s of buf) if (s.tick <= rt) a = s;
    for (let i = buf.length - 1; i >= 0; i--) if (buf[i].tick >= rt) b = buf[i];
    const t = b.tick === a.tick ? 0 : clamp((rt - a.tick) / (b.tick - a.tick), 0, 1);
    const blend = (from, to) => Object.assign({}, to, { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), facing: lerpAngle(from.facing, to.facing, t) });
    for (const id in b.players) if (id !== this.myId) players[id] = blend(a.players[id] || b.players[id], b.players[id]);
    for (const id in b.boats || {}) boats[id] = blend((a.boats && a.boats[id]) || b.boats[id], b.boats[id]);
    for (const id in b.animals || {}) animals[id] = blend((a.animals && a.animals[id]) || b.animals[id], b.animals[id]);
  }
}
