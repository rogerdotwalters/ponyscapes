'use strict';
/* CLIENT - what a tap (phone) or a click (mouse) DOES.
 *   Holding a finger down HIGHLIGHTS what is under it (a villager, an animal, or the spot); lifting the finger acts on it. A mouse click acts at once.
 *   a villager       Talk: the dialogue window offers their shop or quests, or they just say hello
 *   an animal        lasso in hand: rope it; food: feed it; brush: groom it; anything else: pet it. A weapon only attacks a HOSTILE monster:
 *                    a weapon never attacks a friendly animal by itself (use the Attack button / E for that)
 *   the ground, etc. use what is in your hand where you pointed (water, plant, hoe, chop, build...). A weapon does nothing on a touch screen (Attack button).
 *   right click      throw the lasso in the lasso slot at what is under the pointer (PC)
 * Out of reach: nothing happens - unless Controls.walkToAct is on, then you walk there first and the action follows.
 * The client only says WHAT was pointed at (an aim point, an id); the server checks reach and decides. */
const MARKER_LINGER_MS = 300;
const PICK_LIFT_PX = { npc: 22, animal: 10 };                   // sprites stand above their feet: also test a point this far (logical px) below the tap
const PICK_SLACK = { npc: 0.55, animal: 0.5 };                  // tiles beyond the body that still count as "on" it
const WEAPON_KINDS = ['knife', 'spear', 'sword', 'bow'];
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
    this.highlight = { x: desc.x, y: desc.y, r: desc.type === 'ground' ? 0.6 : Math.max(0.8, (desc.radius || 0.3) * 3) };
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
    const w = this.camera.screenToWorld(cssX, cssY);
    return { type: 'ground', x: w.x, y: w.y };
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
    if (desc.type === 'ground') return desc;
    const view = this.game.getRenderState(1), src = desc.type === 'npc' ? view.npcs[desc.id] : view.animals[desc.id];
    return src ? Object.assign({}, desc, { x: src.x, y: src.y, animal: desc.type === 'animal' ? src : null, npc: desc.type === 'npc' ? Object.assign({ id: desc.id }, src) : null }) : null;
  }

  /* ---- doing it: range first ---- */
  /** Decide what the pointer does to `desc`: act now if in reach, else walk there first (if allowed) or do nothing. */
  _perform(desc, mouse, arrived = false) {
    const game = this.game, me = game.local, thing = this._live(desc);
    if (!thing) return false;
    const plan = this._plan(thing, mouse), dist = Math.hypot(thing.x - me.x, thing.y - me.y);
    if (plan.action === 'none') return false;
    if (dist > plan.reach && !arrived) {
      if (Controls.walkToAct && !game.riding) { this._walkThen(desc, plan.reach); return false; }
      if (thing.type === 'ground' && Controls.tapToMove && !game.riding) { this.walkTo(thing); return false; }      // (opt-in) plain tap-to-walk on bare ground
      game.events.emit('notice', { to: game.myId, text: thing.type === 'npc' ? `Walk closer to talk to ${thing.npc.name}` : thing.type === 'animal' ? 'Too far away: walk closer' : 'Too far away' });
      return false;
    }
    this.input.setPath(null);
    switch (plan.action) {
      case 'talk': this.bus.emit('talkTo', thing.npc); return false;
      case 'aim': this._aimedUse(plan.point || thing); return !!plan.repeat && mouse;
      case 'act': game.animalAct(thing.id, plan.act); return false;
      case 'interact': this.input.aimAt(thing, { action: false, ms: 300 }); game.requestInteract(); return false;
    }
    return false;
  }

  /** What would happen, and how close you must be: { action: 'talk'|'aim'|'act'|'interact'|'none', reach, act?, repeat? }. */
  _plan(thing, mouse) {
    const game = this.game, held = game.heldItemId(), tool = ItemDB.getTool(held), weapon = !!tool && WEAPON_KINDS.includes(tool.kind);
    if (thing.type === 'npc') return { action: 'talk', reach: CONFIG.sim.friendship.reach + 0.4 };
    if (thing.type === 'animal') {
      const a = thing.animal, def = AnimalDefs[a.type], near = CONFIG.sim.friendship.petReach + def.radius + 0.3;
      if (tool && tool.kind === 'leash') return { action: 'aim', reach: tool.reach + def.radius };         // a lasso in hand: rope it
      if (tool && tool.kind === 'brush') return { action: 'aim', reach: tool.reach + def.radius };
      if (weapon && def.hostile) return { action: 'aim', reach: tool.reach + def.radius + 0.4 };          // a weapon: only monsters get attacked by a tap
      const food = held && game.inventory.has(held, 1) && ItemDefs[held] && ItemDefs[held].food;
      return { action: 'act', reach: near, act: food || ItemDB.isApple(held) || Wants.accepts(a, held) ? 'feed' : 'pet' };
    }
    if (weapon) return mouse ? { action: 'aim', reach: Infinity, repeat: true } : { action: 'none', reach: 0 };   // (a click on PC swings; a touch does nothing: use Attack)
    if (tool) return { action: 'aim', reach: tool.reach + 0.8, repeat: true };                            // water, hoe, axe...: use it there
    return { action: 'interact', reach: 2.0 };                                                            // seeds, saplings, berries, doors...
  }

  _lasso(world) {
    this.input.aimAt(world, { action: false });
    this.game.throwLasso();
  }

  /** Use what is in your hand at a world point: aim, swing / shoot / water / till / chop. */
  _aimedUse(point, ms) { this.input.aimAt(point, { action: true, ms: ms || 220 }); }

  /* ---- walking: to an action (Controls.walkToAct) or, opt-in, anywhere ---- */
  _walkThen(desc, reach) {
    const thing = this._live(desc);
    if (!this.walkTo(thing)) { this.game.events.emit('notice', { to: this.game.myId, text: 'No way to get there' }); return; }
    this.pending = { desc, reach, until: performance.now() + WALK_GIVE_UP_MS };
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
    const now = performance.now();
    const thing = this._live(p.desc), me = this.game.local;
    if (!thing || now > p.until || !this.game.local) { this.pending = null; return; }
    const close = Math.hypot(thing.x - me.x, thing.y - me.y) <= p.reach;
    if (close || !this.input.hasPath()) {                                    // arrived (or the path ran out / a key took over)
      this.pending = null;
      if (close) this._perform(p.desc, false, true);
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
