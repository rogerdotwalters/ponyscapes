'use strict';
/* CLIENT composition root: creates the objects and wires them together. No game rules live here. */
const $ = id => document.getElementById(id);

function applyUrlOverrides() {                       // ?lag=120&jitter=30&bots=3&debug=1
  const q = new URLSearchParams(location.search);
  if (q.has('lag')) CONFIG.net.fakeLatencyMs = Number(q.get('lag')) || 0;
  if (q.has('jitter')) CONFIG.net.fakeJitterMs = Number(q.get('jitter')) || 0;
  if (q.has('bots')) CONFIG.net.bots = clamp(Number(q.get('bots')) || 0, 0, 3);
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
  const dom = { isHost: () => game.isHost, gear: () => game.gear, health: $('healthBar'), btnEmote: $('btnEmote'), btnFly: $('btnFly'), gearPanel: $('gearPanel'), gearBody: $('gearBody'), ponyPanel: $('ponyPanel'), journalPanel: $('journalPanel'), journalBody: $('journalBody'), sessionPanel: $('sessionPanel'), sessionBody: $('sessionBody'), confirmPanel: $('confirmPanel'), menuPanel: $('menuPanel'), menuBody: $('menuBody'), mapPanel: $('mapPanel'), mapBody: $('mapBody'), ponyBody: $('ponyBody'), tradePanel: $('tradePanel'), tradeBody: $('tradeBody'), townPanel: $('townPanel'), townBody: $('townBody'), shopPanel: $('shopPanel'), shopBody: $('shopBody'), abilityBar: $('abilityBar'), settingsPanel: $('settingsPanel'), settingsList: $('settingsList'), touchRoot: $('touchUI'), toolbar: $('toolbar'), inventoryPanel: $('inventoryPanel'), invBody: $('invBody'), craftPanel: $('craftPanel'), craftList: $('craftList'), debug: $('dbg'), hint: $('hint'), hunger: $('hungerBar'), thirst: $('thirstBar'), clock: $('clock') };
  ['btnMenu', 'btnMap', 'btnFs', 'btnDbg', 'btnAct', 'btnRun', 'btnBoard', 'btnRelease', 'btnRot', 'btnSneak', 'btnAbility', 'btnLasso', 'btnDrop'].forEach(id => { dom[id] = $(id); });
  return dom;
}

/** Title screen first (Play solo / Host / Join); ?solo=1 skips it and starts the single-player game straight away. */
/** The round touch button is small: "Talk to Bramble" / "Give Lingonberry" / "Pet Goat" become Talk / Give / Pet (the full text stays as its tooltip). */
const shortVerb = label => label.replace(/^Talk to .*/, 'Talk').replace(/^Give .*/, 'Give').replace(/^Pet .*/, 'Pet');

function start() {
  const query = applyUrlOverrides();
  preventBrowserGestures();
  if (query.get('solo') === '1') { launch({ adapter: new LocalAdapter() }, query); return; }
  new LobbyUI({ root: $('lobby'), query }).show().then(choice => launch(choice, query));
}

/** Builds the game around an adapter: LocalAdapter (solo), HostAdapter (you host) or RemoteAdapter (you joined a friend). */
function launch(choice, query) {
  const bus = new EventBus();                         // input + UI events
  const adapter = choice.adapter;
  const game = new ClientGame(adapter);
  game.session = typeof adapter.getSessionInfo === 'function' ? adapter : null;      // only hosted / joined games have a session

  (choice.welcome ? Promise.resolve(choice.welcome) : adapter.connect()).then(welcome => {
    game.onWelcome(welcome);
    adapter.onSnapshot(snapshot => game.onSnapshot(snapshot));          // (registered after the welcome: anything that arrived earlier is replayed in order)

    /* input */
    const keyboard = new KeyboardInput(bus);
    const touch = new TouchControls(bus, {
      root: $('touchUI'), zone: $('joyZone'), base: $('joyBase'), knob: $('joyKnob'),
      btnRun: $('btnRun'), btnSneak: $('btnSneak'), btnAct: $('btnAct'), btnRot: $('btnRot'), btnBoard: $('btnBoard'), btnRelease: $('btnRelease'), btnAbility: $('btnAbility'), btnLasso: $('btnLasso'), btnDrop: $('btnDrop')
    });
    const input = new InputController({ bus, keyboard, touch });
    const layout = new UiLayout({ dom: collectLayoutDom(game), touchControls: touch });
    bus.on('touchUiShown', () => layout.update());

    /* view */
    const effects = new Effects(bus, game);
    let tapToMove = null;
    const renderer = new Renderer({ canvas: $('game'), game, effects, getTapMarker: now => tapToMove.currentMarker(now) });
    tapToMove = new TapToMove({ bus, game, camera: renderer.camera, input });
    renderer.rebuildBuilt(); renderer.resize();
    window.addEventListener('resize', () => renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => renderer.resize(), 150));

    /* ui */
    new ToolbarUI({ root: $('toolbar'), game });
    const healthBar = new VitalBar({ root: $('healthBar'), fill: $('healthFill'), label: $('healthLabel'), config: { max: CONFIG.sim.health.max, lowThreshold: 30 }, words: { ok: 'Healthy', low: 'Hurt', empty: 'Down' } });
    const hungerBar = new VitalBar({ root: $('hungerBar'), fill: $('hungerFill'), label: $('hungerLabel'), config: CONFIG.sim.hunger, words: { ok: 'Fed', low: 'Hungry', empty: 'Starving!' } });
    const thirstBar = new VitalBar({ root: $('thirstBar'), fill: $('thirstFill'), label: $('thirstLabel'), config: CONFIG.sim.thirst, words: { ok: 'Hydrated', low: 'Thirsty', empty: 'Dehydrated!' } });
    const clockUI = new ClockUI({ root: $('clock') });
    const inventoryUI = new InventoryUI({ panel: $('inventoryPanel'), body: $('invBody'), closeButton: $('invClose'), game, actions: { label: $('invPicked'), use: $('invUse'), drop1: $('invDrop1'), dropAll: $('invDropAll'), destroy: $('invDestroy') } });
    const craftingUI = new CraftingUI({ panel: $('craftPanel'), list: $('craftList'), closeButton: $('craftClose'), game });
    const settingsUI = new SettingsUI({ panel: $('settingsPanel'), list: $('settingsList'), closeButton: $('settingsClose'), game });
    const panels = new PanelGroup();
    const gearUI = new WardrobeUI({ panel: $('gearPanel'), body: $('gearBody'), closeButton: $('gearClose'), game });
    const journalUI = new JournalUI({ panel: $('journalPanel'), tabs: $('journalTabs'), body: $('journalBody'), closeButton: $('journalClose'), game });
    const mapUI = new MapUI({ panel: $('mapPanel'), body: $('mapBody'), closeButton: $('mapClose'), game, onTreasure: () => { panels.closeAll(); journalUI.openTab('map'); } });
    const confirmUI = new ConfirmUI({ panel: $('confirmPanel'), title: $('confirmTitle'), text: $('confirmText'), keepButton: $('confirmKeep'), goButton: $('confirmGo'), game, requestOpen: () => panels.open('confirm') });
    const menuUI = new MenuUI({ panel: $('menuPanel'), body: $('menuBody'), closeButton: $('menuClose'), game, onPick: section => openSection(section) });
    const ponyUI = new PonyBookUI({ panel: $('ponyPanel'), body: $('ponyBody'), closeButton: $('ponyClose'), game });
    const townUI = new TownUI({ panel: $('townPanel'), body: $('townBody'), closeButton: $('townClose'), game });
    const shopUI = new ShopUI({ panel: $('shopPanel'), body: $('shopBody'), closeButton: $('shopClose'), game, requestOpen: () => panels.open('shop') });
    const tradeUI = new TradeUI({ panel: $('tradePanel'), body: $('tradeBody'), closeButton: $('tradeClose'), game, requestOpen: () => panels.open('trade') });
    const toasts = new Toasts($('toasts'));
    if (ContentPack.source === 'draft') toasts.show('Playing your content editor draft (this browser only)', 'info', 6000);
    game.events.on('bossDefeated', e => toasts.show(e.appeased ? `The ${e.name} is at peace with her cubs home! ${e.final ? 'The realm is free.' : e.nextRing + ' is open.'}` : e.final ? `The ${e.name} is defeated! The realm is free.` : `The ${e.name} has fallen! ${e.nextRing} is open.`, 'ok', 8000));
    game.events.on('enteredCave', () => toasts.show('You descend into the cave...', 'info', 3000));
    let sessionUI = null;
    if (game.session) sessionUI = new SessionUI({ panel: $('sessionPanel'), body: $('sessionBody'), closeButton: $('sessionClose'), badge: $('sessionBadge'), endOverlay: $('endOverlay'), adapter, toasts, confirm: confirmUI });
    const emoteUI = new EmoteWheelUI({ root: $('emoteWheel'), button: $('btnEmote'), game, onTrade: () => { const t = game.nearestTrader(); if (t) game.requestTrade(t); else game.events.emit('notice', { to: game.myId, text: 'Nobody within reach to trade with' }); panels.open('trade'); } });
    panels.register('inventory', inventoryUI); panels.register('crafting', craftingUI); panels.register('settings', settingsUI); panels.register('gear', gearUI); panels.register('ponies', ponyUI); panels.register('journal', journalUI); panels.register('menu', menuUI); if (sessionUI) panels.register('session', sessionUI); panels.register('confirm', confirmUI); panels.register('map', mapUI); panels.register('trade', tradeUI); panels.register('town', townUI); panels.register('shop', shopUI);
    /** The Menu: every section opens from here (and closes the menu). */
    function openSection(section) {
      if (section === 'skills') { panels.closeAll(); journalUI.openTab('skills'); return; }
      if (section === 'treasure') { panels.closeAll(); journalUI.openTab('map'); return; }
      const names = { inventory: 'inventory', crafting: 'crafting', gear: 'gear', map: 'map', ponies: 'ponies', town: 'town', settings: 'settings', session: 'session' };
      if (names[section]) panels.open(names[section]);
    }
    const backdrop = $('panelBackdrop');                       // tap anywhere outside a window to close it
    backdrop.addEventListener('pointerdown', e => { e.preventDefault(); panels.closeAll(); emoteUI.close(); });
    const debug = new DebugOverlay({ element: $('dbg'), button: $('btnDbg'), game, input, camera: renderer.camera });
    if (query.has('debug')) debug.toggle();

    /* events: devices -> intent */
    bus.on('selectSlot', i => game.selectSlot(i));
    bus.on('toggleInventory', () => panels.toggle('inventory'));
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
    $('btnDbg').addEventListener('click', () => debug.toggle());
    setupFullscreenButton($('btnFs'));

    /* pointer: aim / place walls, tap-to-move, wheel cycles the toolbar */
    new CanvasPointer({ canvas: $('game'), bus, game, camera: renderer.camera });
    $('game').addEventListener('wheel', e => { e.preventDefault(); game.cycleSlot(Math.sign(e.deltaY)); }, { passive: false });
    setTimeout(() => { $('hint').style.opacity = '0'; }, 10000);

    const enterParam = new URLSearchParams(location.search).get('enter');
    if (enterParam && adapter.server) {                     // ?enter=<building id>: start inside that building (testing rooms from level-editor.html)
      const site = BuildingSites.list.find(s => s.id === enterParam || s.def.interior === enterParam);
      if (site) setTimeout(() => { const s = adapter.server, p = s.players[game.myId]; if (p) s.interiors.enter(game.myId, p, site.index); }, 400);
    }
    window.realm = { game, adapter, sessionUI, toasts, input, renderer, bus, panels, journalUI, menuUI, mapUI, confirmUI, gearUI, tradeUI, townUI, shopUI, emoteUI, layout };      // handy for console debugging

    let mainShown = null, rotateShown = null, interactShown = null, releaseShown = null, abilityShown = null, powerShown = null;
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

    /* loop */
    new GameLoop({
      tickMs: TICK_MS,
      onTick: () => game.predict(input.sample(game.nextSeq(), game.local, TICK_DT)),
      onRender: (alpha, frameMs, now) => {
        game.advanceRemoteClock(frameMs);
        game.streamWorld();
        renderer.render(game.getRenderState(alpha), frameMs, now);
        debug.update(frameMs);
        healthBar.config.max = game.local.maxHp; journalUI.tick(frameMs); mapUI.tick(frameMs); gearUI.tick(frameMs); if (sessionUI) sessionUI.tick(frameMs);
        const anyPanel = panels.anyOpen(); if (anyPanel === backdrop.hidden) backdrop.hidden = !anyPanel;                      // Constitution raises maximum health
        healthBar.update(game.local.hp); hungerBar.update(game.local.hunger, game.local.hungerMode); thirstBar.update(game.local.thirst, game.local.thirstMode); clockUI.update(game.hour());
        craftingUI.tick(frameMs); townUI.tick(frameMs); shopUI.tick(frameMs); showAbilities();
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
    }).start();
  });
}

start();
