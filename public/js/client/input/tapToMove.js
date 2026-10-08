'use strict';
/* CLIENT - what a tap (phone) or a click (mouse) DOES. It no longer walks anywhere unless Controls.tapToMove is on.
 *   a villager       Talk: the dialogue window offers their shop or quests, or they just say hello
 *   an animal        holding a lasso: rope it; a weapon: attack; food: feed it; a brush: groom it; anything else: pet it
 *   the ground, etc. use what is in your hand where you pointed (water, plant, hoe, chop, swing, shoot, build...)
 *   right click      throw the lasso in the lasso slot at what is under the pointer (PC)
 * The client only says WHAT was pointed at (an aim point, an id); the server checks reach and decides. */
const MARKER_LINGER_MS = 300;
const PICK_LIFT_PX = { npc: 22, animal: 10 };                   // sprites stand above their feet: also test a point this far (logical px) below the tap
const PICK_SLACK = { npc: 0.55, animal: 0.5 };                  // tiles beyond the body that still count as "on" it
const NEAR_TILES = 2;                                           // with tap-to-walk on: farther than this from you walks instead of acting

class TapActions {
  constructor({ bus, game, camera, input }) {
    this.game = game; this.camera = camera; this.input = input; this.bus = bus; this.marker = null;
    bus.on('tap', ({ x, y }) => this.handle(x, y, 'use'));                  // a finger / pen
  }

  /** @returns {boolean} true when the press should keep repeating Use while the mouse button stays down (a tool aimed at the ground). */
  handle(cssX, cssY, kind, mouse = false) {
    const game = this.game, map = game.map;
    if (!map || !game.local || game.local.boat || game.local.asleep) return false;
    const world = this.camera.screenToWorld(cssX, cssY);
    if (kind === 'lasso') { this._lasso(world); return false; }
    if (game.holdingPlaceable()) {                                          // a quick tap with a wall selected builds there
      game.setBuildCursor(Math.floor(world.x), Math.floor(world.y));
      game.commitBuild();
      return false;
    }
    const target = this._pick(cssX, cssY);
    if (target && target.type === 'npc') { this._person(target.npc); return false; }
    if (target && target.type === 'animal') return this._animal(target.animal, world, mouse);
    return this._ground(world, mouse);
  }

  /* ---- what was pointed at ---- */
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

  /* ---- people ---- */
  _person(npc) {
    const game = this.game, me = game.local;
    if (Math.hypot(npc.x - me.x, npc.y - me.y) > CONFIG.sim.friendship.reach + 0.4) { game.events.emit('notice', { to: game.myId, text: `Walk closer to talk to ${npc.name}` }); return; }
    this.bus.emit('talkTo', npc);
  }

  /* ---- animals ---- */
  _animal(animal, world, mouse) {
    const game = this.game, me = game.local, held = game.heldItemId(), tool = ItemDB.getTool(held), def = AnimalDefs[animal.type];
    const reach = tool ? tool.reach + def.radius + 0.4 : CONFIG.sim.friendship.petReach + def.radius + 0.3;
    const point = { x: animal.x, y: animal.y };
    if (tool && tool.kind === 'leash') { this._aimedUse(point); return false; }                      // a lasso in hand: rope it
    if (tool && ['knife', 'spear', 'sword', 'bow'].includes(tool.kind) && !animal.owner && !def.protected) { this._aimedUse(point); return false; }   // a weapon: attack it
    if (tool && tool.kind === 'brush') { this._aimedUse(point); return false; }
    if (Math.hypot(animal.x - me.x, animal.y - me.y) > reach) { game.events.emit('notice', { to: game.myId, text: `Walk closer to the ${def.name.toLowerCase()}` }); return false; }
    const food = held && game.inventory.has(held, 1) && ItemDefs[held] && ItemDefs[held].food;
    game.animalAct(animal.id, food || ItemDB.isApple(held) || Wants.accepts(animal, held) ? 'feed' : 'pet');
    return false;
  }

  _lasso(world) {
    const game = this.game;
    this.input.aimAt(world, { action: false });
    game.throwLasso();
  }

  /** Use what is in your hand at a world point: aim, swing / shoot / water / till / chop. */
  _aimedUse(point, ms) { this.input.aimAt(point, { action: true, ms: ms || 220 }); }

  /* ---- the ground, trees, crops, doors ---- */
  _ground(world, mouse) {
    const game = this.game, me = game.local, held = game.heldItemId(), tool = ItemDB.getTool(held);
    const far = Math.hypot(world.x - me.x, world.y - me.y) > NEAR_TILES;
    if (Controls.tapToMove && far && !game.riding) { this.walkTo(world); return false; }              // (opt-in) tap-to-walk
    this.input.setPath(null);
    if (tool) { this._aimedUse(world); return mouse; }                                                // water, hoe, axe, sword...: use it there
    this.input.aimAt(world, { action: false, ms: 300 });                                              // seeds, saplings, berries, doors...: interact toward it
    game.requestInteract();
    return false;
  }

  /* ---- walking (only when the player switched tap-to-walk on) ---- */
  walkTo(world) {
    const map = this.game.map, target = this._resolveTarget(map, world);
    if (!target) return;
    const path = findPath(map, this.game.local.x, this.game.local.y, target.x, target.y);
    if (!path) return;
    this.input.setPath(path);
    this.marker = { x: target.x, y: target.y, since: performance.now() };
  }

  /** Where we can actually go: the clicked point, or the nearest free tile if it is blocked. */
  _resolveTarget(map, world) {
    const tx = Math.floor(world.x), ty = Math.floor(world.y);
    if (navBlocked(map, tx, ty)) return nearestFreeTile(map, tx, ty, 3);
    if (circleBlocked(map, world.x, world.y, CONFIG.sim.playerRadius)) return { x: tx + 0.5, y: ty + 0.5 };
    return world;
  }

  currentMarker(now) {
    if (this.marker && !this.input.hasPath() && now - this.marker.since > MARKER_LINGER_MS) this.marker = null;
    return this.marker;
  }
}
