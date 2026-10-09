'use strict';
/* CLIENT - what a tap (phone) or a click (mouse) DOES.
 *   Holding a finger down HIGHLIGHTS what is under it (a villager, an animal, or the spot); lifting the finger acts on it. A mouse click acts at once.
 *   a villager       Talk: the dialogue window offers their shop or quests, or they just say hello
 *   an animal        food: feed it; brush: groom it; anything else: pet it. A tap or click NEVER attacks or ropes anything: weapons swing with the
 *                    Attack button (or E / Space), the lasso is thrown with the Lasso button / L / right click (PC)
 *   the ground, etc. bare ground far away: walk; close by: use the tool in your hand (water, plant, hoe, chop, build...); a weapon or lasso in hand: just walk
 *   right click      throw the lasso in the lasso slot at what is under the pointer (PC)
 * Out of reach: nothing happens - unless Controls.walkToAct is on, then you walk there first and the action follows.
 * The client only says WHAT was pointed at (an aim point, an id); the server checks reach and decides. */
const MARKER_LINGER_MS = 300;
const PICK_LIFT_PX = { npc: 22, animal: 10 };                   // sprites stand above their feet: also test a point this far (logical px) below the tap
const PICK_SLACK = { npc: 0.55, animal: 0.5 };                  // tiles beyond the body that still count as "on" it
const WEAPON_KINDS = ['knife', 'spear', 'sword', 'bow'];
const BUTTON_ONLY_KINDS = WEAPON_KINDS.concat('leash');         // attacking and roping are never done by a tap or click: the Attack / Lasso buttons and keys (and right click on PC) do them
const NOT_OBJECTS = ['drink', 'fill', 'dismount'];             // (water only counts when you press the key beside it: a tap near the shore must not send you drinking)
const WALK_GIVE_UP_MS = 10000;                                  // walking to an action: give up after this long

class TapActions {
  constructor({ bus, game, camera, input }) {
    this.game = game; this.camera = camera; this.input = input; this.bus = bus; this.marker = null;
    this.highlight = null;                                      // { x, y, r }: what a held finger is on
    this.pending = null;                                        // { desc, until }: walking to something, then acting
    bus.on('tap', ({ x, y }) => this.handle(x, y, 'use'));                  // (a floating stick's quick tap)
  }

  /* ---- a finger held down: show what it is on ---- */
  hold(cssX, cssY) {
    const desc = this._describe(cssX, cssY);
    this.highlight = { x: desc.x, y: desc.y, r: desc.type === 'ground' || desc.type === 'field' ? 0.6 : desc.type === 'object' ? 0.9 : Math.max(0.8, (desc.radius || 0.3) * 3) };
  }
  clearHold() { this.highlight = null; }

  /** @returns {boolean} true when the press should keep repeating Use while the mouse button stays down (a tool aimed at the ground). */
  handle(cssX, cssY, kind, mouse = false) {
    const game = this.game, map = game.map;
    this.highlight = null; this.pending = null;
    if (!map || !game.local || game.local.boat || game.local.asleep) return false;
    const world = this.camera.screenToWorld(cssX, cssY);
    if (kind === 'lasso') { this._lasso(world); return false; }
    if (game.holdingPlaceable()) {                                          // a quick tap with a wall selected builds there
      game.setBuildCursor(Math.floor(world.x), Math.floor(world.y));
      game.commitBuild();
      return false;
    }
    return this._perform(this._describe(cssX, cssY), mouse);
  }

  /* ---- what was pointed at ---- */
  _describe(cssX, cssY) {
    const hit = this._pick(cssX, cssY);
    if (hit && hit.type === 'npc') return { type: 'npc', id: hit.npc.id, x: hit.npc.x, y: hit.npc.y };
    if (hit && hit.type === 'animal') return { type: 'animal', id: hit.animal.id, x: hit.animal.x, y: hit.animal.y, radius: AnimalDefs[hit.animal.type].radius };
    const w = this.camera.screenToWorld(cssX, cssY), tx = Math.floor(w.x), ty = Math.floor(w.y);
    if (this._gardening() && this.game.fieldAt(tx, ty)) return { type: 'field', tx, ty, x: tx + 0.5, y: ty + 0.5 };      // a hoe, shovel, can or seeds in hand: tap a field to garden it
    const obj = this._objectAt(w);
    return obj ? { type: 'object', kind: obj.kind, x: w.x, y: w.y } : { type: 'ground', x: w.x, y: w.y };
  }

  /** Is something in hand that works a field: a hoe, a shovel, a watering can, or seeds? */
  _gardening() {
    const held = this.game.heldItemId(), tool = ItemDB.getTool(held), def = held && ItemDefs[held];
    return !!(tool && ['hoe', 'shovel', 'water'].includes(tool.kind)) || !!(def && def.seed);
  }

  /** A door, stockpile, chest, crop, pick-up, shop counter, boat... right where the pointer is: asks the interaction rules as if we stood on that spot. */
  _objectAt(w) {
    const g = this.game, me = g.local;
    const found = this._interactionFrom(Object.assign({}, me, { x: w.x, y: w.y, mount: '', flying: false, facing: 0 }));
    return found && !NOT_OBJECTS.includes(found.kind) ? found : null;
  }
  /** What the interact key would do from this player-like spot, counting objects only (not people and animals: they are handled on their own). */
  _interactionFrom(p) {
    const g = this.game;
    try { return Interactions.find(g.map, g.latestBoats(), p, g.heldItemId(), {}, g.myId, {}, g.latestDrops()); } catch (e) { return null; }
  }

  _pick(cssX, cssY) {
    const game = this.game, view = game.getRenderState(1), zoom = this.camera.zoom;
    let best = null;
    const consider = (type, thing, def) => {
      for (const lift of [0, PICK_LIFT_PX[type]]) {
        const w = this.camera.screenToWorld(cssX, cssY + lift * zoom), gap = Math.hypot(thing.x - w.x, thing.y - w.y) - (def ? def.radius : 0.25);
        if (gap <= PICK_SLACK[type] && (!best || gap < best.gap)) best = { type, gap, [type]: thing };
      }
    };
    for (const id in view.npcs) { const n = view.npcs[id]; if (sameGrid(n, game.local)) consider('npc', Object.assign({ id }, n)); }
    for (const id in view.animals) {
      const a = view.animals[id], def = AnimalDefs[a.type];
      if (def && sameGrid(a, game.local) && a.rider !== game.myId) consider('animal', a, def);
    }
    return best;
  }

  /** The live thing a description points at (it may have moved), or null if it is gone. */
  _live(desc) {
    if (desc.type === 'ground' || desc.type === 'object' || desc.type === 'field') return desc;
    const view = this.game.getRenderState(1), src = desc.type === 'npc' ? view.npcs[desc.id] : view.animals[desc.id];
    return src ? Object.assign({}, desc, { x: src.x, y: src.y, animal: desc.type === 'animal' ? src : null, npc: desc.type === 'npc' ? Object.assign({ id: desc.id }, src) : null }) : null;
  }

  /* ---- doing it: range first ---- */
  /** Decide what the pointer does to `desc`: act now if in reach, else walk there first (if allowed) or do nothing. */
  _perform(desc, mouse, arrived = false) {
    const game = this.game, thing = this._live(desc);
    if (!thing) return false;
    const plan = this._plan(thing, mouse);
    if (plan.action === 'none') return false;
    if (plan.action === 'move') { if (!game.local.boat) this.walkTo(thing); return false; }
    if (!plan.ready && !arrived) {
      if (Controls.walkToAct && !game.local.boat) { this._walkThen(desc); return false; }
      game.events.emit('notice', { to: game.myId, text: thing.type === 'npc' ? `Walk closer to talk to ${thing.npc.name}` : 'Too far away: walk closer' });
      return false;
    }
    this.input.setPath(null);
    switch (plan.action) {
      case 'talk': this.bus.emit('talkTo', thing.npc); return false;
      case 'garden': this.bus.emit('openGarden', { tx: thing.tx, ty: thing.ty }); return false;
      case 'aim': this._aimedUse(plan.point || thing); return !!plan.repeat && mouse;
      case 'act': game.animalAct(thing.id, plan.act); return false;
      case 'interact': this.input.aimAt(thing, { action: false, ms: 300 }); game.requestInteract(); return false;
    }
    return false;
  }

  /** What would happen and whether we are close enough already: { action: 'talk'|'aim'|'act'|'interact'|'move'|'none', ready, act?, repeat? }.
   *  'move' = walk there (bare ground). People, animals, doors, stockpiles, crops, shop counters... are acted on once in reach (walking first if Controls.walkToAct). */
  _plan(thing, mouse) {
    const game = this.game, me = game.local, held = game.heldItemId(), tool = ItemDB.getTool(held);
    const dist = Math.hypot(thing.x - me.x, thing.y - me.y), within = reach => ({ ready: dist <= reach });
    if (thing.type === 'npc') return Object.assign({ action: 'talk' }, within(CONFIG.sim.friendship.reach + 0.4));
    if (thing.type === 'animal') {
      const a = thing.animal, def = AnimalDefs[a.type], near = CONFIG.sim.friendship.petReach + def.radius + 0.3;
      if (tool && tool.kind === 'brush') return Object.assign({ action: 'aim' }, within(tool.reach + def.radius));
      if (def.hostile) return { action: 'none' };                                                                          // (a tap never attacks a monster either: use Attack)
      const food = held && game.inventory.has(held, 1) && ItemDefs[held] && ItemDefs[held].food;
      return Object.assign({ action: 'act', act: food || ItemDB.isApple(held) || Wants.accepts(a, held) ? 'feed' : 'pet' }, within(near));
    }
    if (thing.type === 'field') return { action: 'garden', ready: dist <= Farming.REACH };
    if (thing.type === 'object') {                                                                                         // ready = the interact key would do the same thing from where we stand
      const real = this._interactionFrom(me);
      return { action: 'interact', ready: !!real && real.kind === thing.kind };
    }
    // bare ground
    if (BUTTON_ONLY_KINDS.includes(tool && tool.kind)) return { action: Controls.tapToMove ? 'move' : 'none' };                  // a weapon or lasso in hand: a tap just walks
    if (tool) { const ok = dist <= tool.reach + 0.8; return ok ? { action: 'aim', ready: true, repeat: true } : { action: Controls.tapToMove ? 'move' : 'none' }; }   // water, hoe, axe...: use it close by, walk when far
    return Controls.tapToMove ? { action: 'move' } : { action: 'interact', ready: dist <= 2.0 };                           // seeds, saplings, doors...
  }

  _lasso(world) {
    this.input.aimAt(world, { action: false });
    this.game.throwLasso();
  }

  /** Use what is in your hand at a world point: aim, swing / shoot / water / till / chop. */
  _aimedUse(point, ms) { this.input.aimAt(point, { action: true, ms: ms || 220 }); }

  /* ---- walking: to an action (Controls.walkToAct) or, with Controls.tapToMove, anywhere ---- */
  _walkThen(desc) {
    const thing = this._live(desc);
    if (!this.walkTo(thing)) { this.game.events.emit('notice', { to: this.game.myId, text: 'No way to get there' }); return; }
    this.pending = { desc, until: performance.now() + WALK_GIVE_UP_MS };
  }

  walkTo(world) {
    const map = this.game.map, target = this._resolveTarget(map, world);
    if (!target) return false;
    const path = findPath(map, this.game.local.x, this.game.local.y, target.x, target.y);
    if (!path) return false;
    this.input.setPath(path);
    this.marker = { x: target.x, y: target.y, since: performance.now() };
    return true;
  }

  /** Called every frame: carries out an action once the walk to it has brought you into reach. */
  tick() {
    const p = this.pending; if (!p) return;
    const now = performance.now(), thing = this._live(p.desc), me = this.game.local;
    if (!thing || !me || now > p.until) { this.pending = null; return; }
    const plan = this._plan(thing, false);
    if (plan.ready) { this.pending = null; this._perform(p.desc, false, true); return; }          // in reach: do it
    if (!this.input.hasPath()) {                                                                    // the path ran out (or a key took over)
      this.pending = null;
      if (Math.hypot(thing.x - me.x, thing.y - me.y) < 2.5) this._perform(p.desc, false, true);   // (right beside it: try anyway, the server decides)
    }
  }

  /** Where we can actually go: the clicked point, or the nearest free tile if it is blocked. */
  _resolveTarget(map, world) {
    const tx = Math.floor(world.x), ty = Math.floor(world.y);
    if (navBlocked(map, tx, ty)) return nearestFreeTile(map, tx, ty, 3);
    if (circleBlocked(map, world.x, world.y, CONFIG.sim.playerRadius)) return { x: tx + 0.5, y: ty + 0.5 };
    return world;
  }

  /** What the renderer rings: the highlight of a held finger, else where we are walking to. */
  currentMarker(now) {
    if (this.highlight) return this.highlight;
    if (this.marker && !this.input.hasPath() && now - this.marker.since > MARKER_LINGER_MS) this.marker = null;
    return this.marker;
  }
}
