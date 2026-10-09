'use strict';
/* CLIENT composition root: creates the objects and wires them together. No game rules live here. */
const $ = id => document.getElementById(id);

function applyUrlOverrides() {                       // ?lag=120&jitter=30&debug=1
  const q = new URLSearchParams(location.search);
  if (q.has('lag')) CONFIG.net.fakeLatencyMs = Number(q.get('lag')) || 0;
  if (q.has('jitter')) CONFIG.net.fakeJitterMs = Number(q.get('jitter')) || 0;
  if (q.get('kit') === '0') CONFIG.sim.testKit = false;                 // ?kit=0: start with just an axe, no home, no pony
  if (q.has('hour')) CONFIG.sim.time.startHour = clamp(Number(q.get('hour')) || 0, 0, 24);
  return q;
}

function preventBrowserGestures() {                  // no scroll / zoom / selection / pull-to-refresh
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scrollable, #lobby')) e.preventDefault(); }, { passive: false });      // (the lobby's character screen is taller than a phone: it must be scrollable with a finger)
  ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
}

function setupFullscreenButton(button) {
  if (!document.fullscreenEnabled) { button.style.display = 'none'; return; }
  button.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      await document.documentElement.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) { /* not allowed */ }
  });
}

function collectLayoutDom(game) {
  const dom = { coinPanel: $('coinPanel'), controlsPanel: $('controlsPanel'), controlsBody: $('controlsBody'), dialoguePanel: $('dialoguePanel'), puzzlePanel: $('puzzlePanel'), isHost: () => game.isHost, gear: () => game.gear, health: $('healthBar'), btnEmote: $('btnEmote'), btnFly: $('btnFly'), gearPanel: $('gearPanel'), gearBody: $('gearBody'), ponyPanel: $('ponyPanel'), journalPanel: $('journalPanel'), journalBody: $('journalBody'), sessionPanel: $('sessionPanel'), sessionBody: $('sessionBody'), confirmPanel: $('confirmPanel'), menuPanel: $('menuPanel'), menuBody: $('menuBody'), mapPanel: $('mapPanel'), mapBody: $('mapBody'), ponyBody: $('ponyBody'), tradePanel: $('tradePanel'), tradeBody: $('tradeBody'), townPanel: $('townPanel'), townBody: $('townBody'), shopPanel: $('shopPanel'), shopBody: $('shopBody'), abilityBar: $('abilityBar'), settingsPanel: $('settingsPanel'), settingsList: $('settingsList'), touchRoot: $('touchUI'), toolbar: $('toolbar'), inventoryPanel: $('inventoryPanel'), invBody: $('invBody'), craftPanel: $('craftPanel'), craftList: $('craftList'), debug: $('dbg'), hint: $('hint'), hunger: $('hungerBar'), thirst: $('thirstBar'), clock: $('clock'), season: $('seasonBar') };
  ['btnMenu', 'btnCoins', 'btnMap', 'btnFs', 'btnDbg', 'btnAct', 'btnBag', 'btnBoard', 'btnRelease', 'btnRot', 'btnAbility', 'btnLasso', 'btnDrop'].forEach(id => { dom[id] = $(id); });
  return dom;
}

/** Title screen first (Play solo / Host / Join); ?solo=1 skips it and starts the single-player game straight away. */
/** The round touch button is small: "Talk to Bramble" / "Give Lingonberry" / "Pet Goat" become Talk / Give / Pet (the full text stays as its tooltip). */
const shortVerb = label => label.replace(/^Talk to .*/, 'Talk').replace(/^Give .*/, 'Give').replace(/^Pet .*/, 'Pet');

function start() {
  const query = applyUrlOverrides();
  preventBrowserGestures();
  if (query.get('solo') === '1') { launch({ adapter: new LocalAdapter() }, query); return; }
  Loader.hide();                                                       // (the page's own loading screen: the scripts are all here)
  new LobbyUI({ root: $('lobby'), query }).show().then(choice => launch(choice, query));
}

/** Builds the game around an adapter: LocalAdapter (solo), HostAdapter (you host) or RemoteAdapter (you joined a friend). */
function launch(choice, query) {
  const bus = new EventBus();                         // input + UI events
  const adapter = choice.adapter;
  const game = new ClientGame(adapter);
  game.session = typeof adapter.getSessionInfo === 'function' ? adapter : null;      // only hosted / joined games have a session
  Loader.show(choice.welcome ? 'Starting...' : 'Connecting...');
  const backendName = RenderBackend.prepare(query);                    // 'canvas' (default) or 'pixi' (?renderer=pixi): fetches the Pixi scripts if asked

  Promise.all([choice.welcome ? Promise.resolve(choice.welcome) : adapter.connect(), backendName]).then(([welcome, backend]) => {
    game.onWelcome(welcome);
    adapter.onSnapshot(snapshot => game.onSnapshot(snapshot));          // (registered after the welcome: anything that arrived earlier is replayed in order)

    /* input */
    const keyboard = new KeyboardInput(bus);
    const touch = new TouchControls(bus, {
      root: $('touchUI'), zone: $('joyZone'), base: $('joyBase'), knob: $('joyKnob'),
      btnBag: $('btnBag'), btnAct: $('btnAct'), btnRot: $('btnRot'), btnBoard: $('btnBoard'), btnRelease: $('btnRelease'), btnAbility: $('btnAbility'), btnLasso: $('btnLasso'), btnDrop: $('btnDrop')
    });
    const input = new InputController({ bus, keyboard, touch });
    const layout = new UiLayout({ dom: collectLayoutDom(game), touchControls: touch });
    bus.on('touchUiShown', () => layout.update());

    /* view */
    const effects = new Effects(bus, game);
    effects.weather = new WeatherFx(game); effects.weather.audio = new WeatherAudio();                // the sky: clouds, rain, snow, lightning and their sound
    const footsteps = new Sfx.Footsteps(game, () => effects.weather.cur.rain), worldSfx = new WorldSfx(game), music = new PonyMusic();                             // your footfalls, and the soundtrack
    let tapToMove = null;
    const renderer = RenderBackend.create(backend, { canvas: $('game'), game, effects, getTapMarker: now => tapToMove.currentMarker(now) });
    tapToMove = new TapActions({ bus, game, camera: renderer.camera, input });
    input.setCamera(renderer.camera);
    renderer.rebuildBuilt(); renderer.resize();
    window.addEventListener('resize', () => renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 150));

    /* ui */
    new ToolbarUI({ root: $('toolbar'), game });
    const healthBar = new VitalBar({ root: $('healthBar'), fill: $('healthFill'), label: $('healthLabel'), config: { max: CONFIG.sim.health.max, lowThreshold: 30 }, words: { ok: 'Healthy', low: 'Hurt', empty: 'Down' } });
    const hungerBar = new VitalBar({ root: $('hungerBar'), fill: $('hungerFill'), label: $('hungerLabel'), config: CONFIG.sim.hunger, words: { ok: 'Fed', low: 'Hungry', empty: 'Starving!' } });
    const thirstBar = new VitalBar({ root: $('thirstBar'), fill: $('thirstFill'), label: $('thirstLabel'), config: CONFIG.sim.thirst, words: { ok: 'Hydrated', low: 'Thirsty', empty: 'Dehydrated!' } });
    const clockUI = new ClockUI({ root: $('seasonBar').querySelector('.sbClock') }), seasonUI = new SeasonUI({ root: $('seasonBar') });
    const inventoryUI = new InventoryUI({ panel: $('inventoryPanel'), body: $('invBody'), closeButton: $('invClose'), game, actions: { label: $('invPicked'), use: $('invUse'), drop1: $('invDrop1'), dropAll: $('invDropAll'), destroy: $('invDestroy') } });
    const coinBagUI = new CoinBagUI({ panel: $('coinPanel'), canvas: $('coinCanvas'), count: $('coinCount'), breakdown: $('coinBreakdown'), mergeButton: $('coinMerge'), game, camera: renderer.camera });
    const craftingUI = new CraftingUI({ panel: $('craftPanel'), list: $('craftList'), closeButton: $('craftClose'), game });
    const settingsUI = new SettingsUI({ panel: $('settingsPanel'), list: $('settingsList'), closeButton: $('settingsClose'), game });
    const controlsUI = new ControlsUI({ panel: $('controlsPanel'), tabs: $('controlsTabs'), body: $('controlsBody'), closeButton: $('controlsClose') });
    const panels = new PanelGroup();
    const gearUI = new WardrobeUI({ panel: $('gearPanel'), body: $('gearBody'), closeButton: $('gearClose'), game });
    const journalUI = new JournalUI({ panel: $('journalPanel'), tabs: $('journalTabs'), body: $('journalBody'), closeButton: $('journalClose'), game });
    const mapUI = new MapUI({ panel: $('mapPanel'), body: $('mapBody'), closeButton: $('mapClose'), game, onTreasure: () => { panels.closeAll(); journalUI.openTab('map'); } });
    const confirmUI = new ConfirmUI({ panel: $('confirmPanel'), title: $('confirmTitle'), text: $('confirmText'), keepButton: $('confirmKeep'), goButton: $('confirmGo'), game, requestOpen: () => panels.open('confirm') });
    const menuUI = new MenuUI({ panel: $('menuPanel'), body: $('menuBody'), closeButton: $('menuClose'), game, onPick: section => openSection(section) });
    const ponyUI = new PonyBookUI({ panel: $('ponyPanel'), body: $('ponyBody'), closeButton: $('ponyClose'), game });
    const townUI = new TownUI({ panel: $('townPanel'), body: $('townBody'), closeButton: $('townClose'), game });
    const shopUI = new ShopUI({ panel: $('shopPanel'), body: $('shopBody'), closeButton: $('shopClose'), game, coinBag: coinBagUI, requestOpen: () => panels.open('shop') });
    const tradeUI = new TradeUI({ panel: $('tradePanel'), body: $('tradeBody'), closeButton: $('tradeClose'), game, requestOpen: () => panels.open('trade') });
    const toasts = new Toasts($('toasts')), sleepUI = new SleepUI({ game }), downedUI = new DownedUI({ game });
    if (ContentPack.source === 'draft') toasts.show('Playing your content editor draft (this browser only)', 'info', 6000);
    game.events.on('bossDefeated', e => toasts.show(e.appeased ? `The ${e.name} is at peace with her cubs home! ${e.final ? 'Her cave is quiet at last.' : e.nextRing + ' is open.'}` : e.final ? `The ${e.name} is defeated! Her cave is quiet at last.` : `The ${e.name} has fallen! ${e.nextRing} is open.`, 'ok', 8000));
    /* the Slime Warren: which rooms have had their slimes beaten (the exit is drawn as plain rock until then), and the cave mouth stays rubble until the Cave Bear is down */
    game.clearedRooms = new Set();
    game.events.on('roomState', e => { if (e.cleared) game.clearedRooms.add(e.grid); });
    game.events.on('roomCleared', e => { game.clearedRooms.add(e.grid); toasts.show('The way on has opened!', 'ok', 4000); });
    game.events.on('kingDefeated', () => toasts.show('The Slime King is defeated!', 'ok', 8000));
    const exitOf = new WeakMap();
    StructureSprites.sealed = (o, tx, ty) => {
      if (o === OBJ.CAVEMOUTH) {                                                          // outside: a mouth whose dungeon wants a guardian down first
        const mouth = game.map.terrain && game.map.terrain.caveSites && game.map.terrain.caveSites.caves().find(c => Math.floor(c.x) === tx && Math.floor(c.y) === ty), def = mouth && Dungeons.all()[mouth.index];
        return !!(def && def.requires && !game.defeated.includes(def.requires.defeated));
      }
      const plan = game.map.plan;                                                         // inside: the exit of a room that still has slimes to beat
      if (!plan || !plan.dungeon || !plan.dungeon.waves || !plan.dungeon.waves[plan.index] || game.clearedRooms.has(game.grid)) return false;
      let m = exitOf.get(plan); if (!m) exitOf.set(plan, m = plan._middle(plan.room.exits));
      return m.x === tx && m.y === ty;
    };
    game.events.on('nightSkipped', () => toasts.show('The night passes...', 'info', 3000));
    game.events.on('enteredCave', () => toasts.show('You descend into the cave...', 'info', 3000));
    game.events.on('dungeonChest', e => { DungeonState.opened.add(DungeonState.key(game.grid, e.tx, e.ty)); const prop = game.map.peekPropAt(e.tx, e.ty); if (prop) prop.opened = true; });       // (a dungeon chest somebody opened)
    let sessionUI = null;
    if (game.session) sessionUI = new SessionUI({ panel: $('sessionPanel'), body: $('sessionBody'), closeButton: $('sessionClose'), badge: $('sessionBadge'), endOverlay: $('endOverlay'), adapter, toasts, confirm: confirmUI });
    const dialogueUI = new DialogueUI({ panel: $('dialoguePanel'), title: $('dialogueTitle'), body: $('dialogueBody'), closeButton: $('dialogueClose'), game, requestOpen: () => panels.open('dialogue') });
    bus.on('talkTo', npc => { dialogueUI.talk(npc); worldSfx.talk(npc); });
    const puzzleUI = new PuzzleUI({ panel: $('puzzlePanel'), title: $('puzzleTitle'), body: $('puzzleBody'), closeButton: $('puzzleClose'), game, requestOpen: () => panels.open('puzzle') });
    const emoteUI = new EmoteWheelUI({ root: $('emoteWheel'), button: $('btnEmote'), game, onTrade: () => { const t = game.nearestTrader(); if (t) game.requestTrade(t); else game.events.emit('notice', { to: game.myId, text: 'Nobody within reach to trade with' }); panels.open('trade'); } });
    game.events.on('openCoins', () => panels.open('coins'));
    game.events.on('openWardrobe', () => panels.open('gear')); game.events.on('openChest', () => panels.open('inventory'));       // (the wardrobe and the worn chest in your home)
    panels.register('coins', coinBagUI); panels.register('inventory', inventoryUI); panels.register('crafting', craftingUI); panels.register('settings', settingsUI); panels.register('gear', gearUI); panels.register('ponies', ponyUI); panels.register('journal', journalUI); panels.register('menu', menuUI); if (sessionUI) panels.register('session', sessionUI); panels.register('confirm', confirmUI); panels.register('map', mapUI); panels.register('trade', tradeUI); panels.register('town', townUI); panels.register('shop', shopUI); panels.register('controls', controlsUI); panels.register('dialogue', dialogueUI); panels.register('puzzle', puzzleUI);
    /** The Menu: every section opens from here (and closes the menu). */
    function openSection(section) {
      if (section === 'skills') { panels.closeAll(); journalUI.openTab('skills'); return; }
      if (section === 'treasure') { panels.closeAll(); journalUI.openTab('map'); return; }
      if (section === 'soundtrack') { panels.open('controls'); controlsUI.show('music'); return; }
      const names = { inventory: 'inventory', crafting: 'crafting', gear: 'gear', map: 'map', ponies: 'ponies', town: 'town', settings: 'settings', session: 'session', controls: 'controls' };
      if (names[section]) panels.open(names[section]);
    }
    const backdrop = $('panelBackdrop');                       // tap anywhere outside a window to close it
    backdrop.addEventListener('pointerdown', e => { e.preventDefault(); panels.closeAll(); emoteUI.close(); });
    const debug = new DebugOverlay({ element: $('dbg'), button: $('btnDbg'), game, input, camera: renderer.camera });
    if (query.has('debug')) debug.toggle();

    /* events: devices -> intent */
    bus.on('selectSlot', i => game.selectSlot(i));
    bus.on('toggleInventory', () => panels.toggle('inventory'));
    { const icon = $('btnBag') && $('btnBag').querySelector('.bagIcon'); if (icon) icon.style.backgroundImage = `url(${ItemIcons.url(CONFIG.sim.inventory.starterBag)})`; }   // the touch Bag button shows a backpack
    bus.on('toggleGear', () => panels.toggle('gear'));
    bus.on('togglePonies', () => panels.toggle('ponies'));
    bus.on('toggleJournal', () => panels.toggle('journal'));
    bus.on('toggleMap', () => panels.toggle('map'));
    bus.on('toggleTown', () => panels.toggle('town'));
    bus.on('throwLasso', () => game.throwLasso());
    bus.on('dropHeld', all => game.dropHeld(all));                  // X / the Drop button: what is in your hand, onto the ground                  // L / the Lasso button: the lasso in the lasso slot
    bus.on('ponyPower', n => game.requestPonyPower(n));          // a pony's rarity abilities (H / K / the power button); flight stays on B
    bus.on('dismount', () => game.requestDismount());
    bus.on('ability', () => game.useAbility('fly'));
    $('btnFly').addEventListener('pointerdown', e => { e.preventDefault(); bus.emit('ability'); });
    bus.on('mainPony', () => game.makeMainPony());                                    // N / the Main button: this pony follows you from now on
    bus.on('release', () => game.requestRelease());               // its own button and key: never shared with Ride / Feed / Pick
    game.events.on('confirmRelease', e => confirmUI.ask(e));
    bus.on('toggleEmotes', () => emoteUI.toggle());
    game.events.on('gearChanged', () => layout.update());
    bus.on('toggleCrafting', () => panels.toggle('crafting'));
    bus.on('closePanels', () => { panels.closeAll(); emoteUI.close(); });
    bus.on('rotateBuild', () => game.rotateBuild());
    bus.on('interact', () => game.requestInteract());
    bus.on('toggleDebug', () => debug.toggle());
    bus.on('touchUiShown', () => { $('hint').hidden = true; });
    $('btnMenu').addEventListener('click', () => panels.toggle('menu'));
    $('btnMap').addEventListener('click', () => panels.toggle('map'));
    $('btnCoins').addEventListener('click', () => panels.toggle('coins'));
    $('btnDbg').addEventListener('click', () => debug.toggle());
    setupFullscreenButton($('btnFs'));

    /* pointer: aim / place walls, tap-to-move, wheel cycles the toolbar */
    new CanvasPointer({ canvas: $('game'), bus, game, camera: renderer.camera, tapActions: tapToMove, input });
    $('game').addEventListener('wheel', e => { e.preventDefault(); game.cycleSlot(Math.sign(e.deltaY)); }, { passive: false });
    setTimeout(() => { $('hint').style.opacity = '0'; }, 10000);

    const enterParam = new URLSearchParams(location.search).get('enter');
    if (enterParam && adapter.server) {                     // ?enter=<building id>: start inside that building (testing rooms from level-editor.html)
      const site = BuildingSites.list.find(s => s.id === enterParam || s.def.interior === enterParam);
      if (site) setTimeout(() => { const s = adapter.server, p = s.players[game.myId]; if (p) s.interiors.enter(game.myId, p, site.index); }, 400);
    }
    const weatherParam = new URLSearchParams(location.search).get('weather');
    if (weatherParam && adapter.server && Weather.TYPES[weatherParam]) setTimeout(() => adapter.server.weather.force(weatherParam), 300);     // ?weather=thunderstorm: start under that sky (testing)
    window.ponyscapes = { coinBagUI, game, adapter, sessionUI, toasts, input, renderer, bus, panels, journalUI, menuUI, mapUI, confirmUI, gearUI, tradeUI, townUI, shopUI, emoteUI, layout, controlsUI, dialogueUI, tapActions: tapToMove };      // handy for console debugging

    let attackShown = false, mainShown = null, rotateShown = null, interactShown = null, releaseShown = null, abilityShown = null, powerShown = null;
    /** The ridden pony's rarity abilities: a strip above the vitals (desktop) and the power button (touch), with cooldowns. */
    const showAbilities = () => {
      const list = game.abilityState(), text = list.map(a => `${a.ability.glyph} ${a.ability.name}${a.cooldown > 0 ? ' ' + Math.ceil(a.cooldown) + 's' : ''}`);
      const key = text.join('|');
      if (key === powerShown) return;
      powerShown = key;
      $('abilityBar').hidden = !list.length;
      $('abilityBar').innerHTML = list.map((a, i) => `<span class="${a.cooldown > 0 ? 'cd' : 'ready'}" style="--c:${a.ability.color}"><kbd>${i ? 'K' : 'H'}</kbd>${text[i]}</span>`).join('');
      const ready = list.find(a => !(a.cooldown > 0)) || list[0];
      $('btnAbility').style.display = list.length ? '' : 'none';
      $('btnAbility').textContent = ready ? ready.ability.glyph + (ready.cooldown > 0 ? ' ' + Math.ceil(ready.cooldown) : '') : '';
      $('btnAbility').classList.toggle('cd', !!ready && ready.cooldown > 0);
    };

    /* loop: it starts once the loading screen has everything the first moments need (Loader.initial); the rest loads while you play */
    const loop = new GameLoop({
      tickMs: TICK_MS,
      onTick: () => game.predict(input.sample(game.nextSeq(), game.local, TICK_DT)),
      onRender: (alpha, frameMs, now) => {
        tapToMove.tick();
        footsteps.update(); worldSfx.update(frameMs / 1000); music.update(game, effects.weather.cur);
        game.advanceRemoteClock(frameMs);
        game.streamWorld();
        renderer.render(game.getRenderState(alpha), frameMs, now);
        debug.update(frameMs);
        healthBar.config.max = game.local.maxHp; journalUI.tick(frameMs); mapUI.tick(frameMs); gearUI.tick(frameMs); if (sessionUI) sessionUI.tick(frameMs);
        const anyPanel = panels.anyOpen(); if (anyPanel === backdrop.hidden) backdrop.hidden = !anyPanel;                      // Constitution raises maximum health
        healthBar.update(game.local.down > 0 ? game.local.downHp : game.local.hp); hungerBar.update(game.local.hunger, game.local.hungerMode); thirstBar.update(game.local.thirst, game.local.thirstMode); clockUI.update(game.hour()); seasonUI.update(Seasons.at(game.clockTick), game.weather); sleepUI.update(); downedUI.update();
        craftingUI.tick(frameMs); townUI.tick(frameMs); dialogueUI.tick(frameMs); puzzleUI.tick(frameMs); shopUI.tick(frameMs); showAbilities();
        const held = ItemDB.getTool(game.heldItemId()), armed = !!held && WEAPON_KINDS.includes(held.kind);       // a weapon in hand: the Use button becomes Attack
        if (armed !== attackShown) { attackShown = armed; $('btnAct').textContent = armed ? 'Attack' : 'Use'; $('btnAct').classList.toggle('attack', armed); }
        const showRotate = !!game.buildTarget;                       // context buttons only show when they do something
        if (showRotate !== rotateShown) { rotateShown = showRotate; $('btnRot').style.display = showRotate ? '' : 'none'; }
        const ability = game.abilityHint(), abilityKey = ability ? ability.label + (ability.ready ? '+' : '-') : '';                 // the Fly button: only on a pegasus or alicorn
        if (abilityKey !== abilityShown) { abilityShown = abilityKey; const b = $('btnFly'); b.style.display = ability ? '' : 'none'; if (ability) { b.textContent = ability.label; b.classList.toggle('on', !!ability.flying); b.classList.toggle('cooling', !ability.ready); } }
        const mainHint = game.mainPonyHint() + '|' + (game.local.mount || ''); if (mainHint !== mainShown) { mainShown = mainHint; inventoryUI.refreshPony(); }     // (the Make main pony button lives in the bag)
        const releaseHint = game.releaseHint();
        if (releaseHint !== releaseShown) { releaseShown = releaseHint; $('btnRelease').style.display = releaseHint ? '' : 'none'; $('btnRelease').textContent = releaseHint || ''; }
        if (confirmUI.isOpen && confirmUI.kind === 'release' && !game.isMyCatch(confirmUI.animalId)) confirmUI.close();      // it is gone (or already yours): nothing left to confirm
        const interactHint = game.interactHint();
        if (interactHint !== interactShown) { interactShown = interactHint; $('btnBoard').style.display = interactHint ? '' : 'none'; $('btnBoard').textContent = shortVerb(interactHint || ''); $('btnBoard').title = interactHint || ''; }
      }
    });
    Promise.resolve(renderer.ready).then(() => Loader.initial({ game, renderer })).catch(err => { console.error('loading:', err); Loader.hide(); }).then(() => { loop.start(); Loader.background(game, renderer); });
  });
}

start();
