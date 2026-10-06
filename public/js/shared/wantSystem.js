'use strict';
/* SHARED - what creatures WANT. A creature whose data has `wants` shows a bubble over its head with the thing it is after (a dog: a bone or some
 * meat; a cat: a fish). Hold one and press the interact key next to it ("Give ...") and it is happier with you, and stops asking for a while.
 *
 * Some wants do more (all from the creature's data, js/data/creatures/):
 *   unlocks: 'pickup'   it lets you pick it up once it has had one (the Cave Bear's lost cubs: they only come to you for fish)
 *   need + appease      a boss that wants several things: give it them all and it is APPEASED instead of fought: it calms down for good and its
 *                       ring opens just as if it had been beaten (the Cave Bear wants her three cubs back; carrying one, she will not attack you)
 *   quest               the boss's lost young: the server keeps that many wandering its ring until they are all home
 *
 * The server decides each animal's current want (a.want, a.wantN: "1/3") and sends it with the animal, so the client draws the bubble and offers
 * the same "Give" the server will accept. */
const Wants = {
  of(type) { const d = AnimalDefs[type]; return (d && d.wants) || null; },
  /** Would this animal take this item right now? (pure: uses the animal's current want, on the client and the server alike) */
  accepts(a, itemId) { const w = Wants.of(a.type); return !!(w && a.want && itemId && w.items.includes(itemId)); },
  /** A carried creature that is somebody's quest (a lost cub) rather than a pet. */
  isQuestCreature(type) { return Object.values(AnimalDefs).some(d => d.wants && d.wants.quest && d.wants.quest.creature === type); }
};
const WANT_REACH = 1.8;

InteractionHandlers.give = (server, id, p, action) => server.wants.give(id, p, server.animals.animals[action.animal.id]);

class WantSystem {
  constructor(server) { this.s = server; this.progress = {}; this.appeased = {}; }

  /** What an animal wants right now (a.want: an item id or '', a.wantN: "have/need" for a boss), from its data and its state. */
  refresh(a) {
    const w = Wants.of(a.type);
    if (!w) return;
    const def = AnimalDefs[a.type], tick = this.s.tick, ring = def.bossRing;
    const done = a.appeased || a.delivered || (w.unlocks === 'pickup' && a.fed) || (a.wantUntil || 0) > tick || (w.need && this.appeased[ring]);
    a.want = done ? '' : w.items[0];
    a.wantN = !done && w.need ? `${this.progress[ring] || 0}/${w.need}` : '';
  }
  update(tick) {
    if (tick % 10 === 0) for (const a of Object.values(this.s.animals.animals)) if (AnimalDefs[a.type].wants) this.refresh(a);
    if (tick % 300 === 1) this._keepQuestsGoing();
  }

  /** Hand over what you are holding. */
  give(id, p, a) {
    const s = this.s, inventory = s.inventories[id], item = p.held, w = a && Wants.of(a.type);
    if (!a || !w || !sameGrid(a, p) || !Wants.accepts(a, item) || !inventory.has(item, 1)) return;
    const def = AnimalDefs[a.type];
    inventory.remove(item, 1); s.inventoryRev[id]++;
    if (w.every) a.wantUntil = s.tick + secondsToTicks(w.every);
    if (a.befriendable) s.friendship.reward(id, a, CONFIG.sim.friendship.gains.giftLoved);
    s.pendingEvents.push({ type: 'gave', to: id, x: a.x, y: a.y, item, name: def.name });
    if (w.unlocks === 'pickup') {
      a.fed = true; a.state = 'idle'; a.vx = a.vy = 0;
      s._notice(id, `The ${def.name.toLowerCase()} gobbles it up and trusts you now: pick it up (F) and take it home`);
    }
    if (w.need) this._delivered(id, a, def, item);
    this.refresh(a);
  }

  /** A boss got one of the things it needs (a cub home): it comes to sit by her; with all of them she is appeased. */
  _delivered(id, boss, def, item) {
    const s = this.s, ring = def.bossRing, w = def.wants, have = this.progress[ring] = (this.progress[ring] || 0) + 1;
    const creature = ItemDefs[item] && ItemDefs[item].creature;
    if (creature) this._spawnHome(creature, boss);                                // the cub you carried in sits down beside her
    s.progress.award(id, 'animal_friendship', 60);
    if (have < w.need) { s._notice(id, `The ${def.name} nuzzles her cub. ${w.need - have} still lost out there`); return; }
    this.appease(ring, boss, id);
  }
  _spawnHome(type, boss) {
    const angle = this.s.rng() * Math.PI * 2, x = boss.x + Math.cos(angle) * 1.6, y = boss.y + Math.sin(angle) * 1.6;
    const cub = this.s.animals.animals[this.s.animals.spawn(type, x, y, undefined, { grid: gridOf(boss), level: 1 })];
    cub.delivered = true; cub.home = { x: boss.x, y: boss.y }; cub.want = '';
    return cub;
  }

  /** Calm a boss for good: its ring opens as if it had been beaten. */
  appease(ring, boss, by) {
    const s = this.s, def = Fauna.bossOf(ring);
    this.appeased[ring] = true;
    if (boss) { boss.appeased = true; boss.state = 'idle'; boss.hurt = false; boss.want = ''; }
    if (by) s.progress.award(by, 'animal_friendship', 200);
    s.dungeons.conquer(ring, def ? def.name : 'guardian', true);
  }

  /** Every lost young of an unfinished quest is somewhere: wandering its ring, carried, on the ground, or home. Any that went missing come back. */
  _keepQuestsGoing() {
    const s = this.s;
    for (const def of Object.values(AnimalDefs)) {
      const q = def.wants && def.wants.quest;
      if (!q || !def.boss || this.appeased[def.bossRing] || s.worldProgress.isDefeated(def.bossRing)) continue;
      const item = Object.keys(ItemDefs).find(k => ItemDefs[k].creature === q.creature);
      let found = this.progress[def.bossRing] || 0;
      for (const a of Object.values(s.animals.animals)) if (a.type === q.creature && !a.delivered) found++;
      for (const inv of Object.values(s.inventories)) if (item) found += inv.count(item);
      for (const d of Object.values(s.drops)) if (d.item === item) found += d.count;
      for (let n = found; n < q.count; n++) this._placeLost(q.creature, def.bossRing);
    }
  }
  /** A lost young somewhere on open grass in its ring, well away from the village. */
  _placeLost(type, ring) {
    const s = this.s, R = s.map.layers.rings, o = CONFIG.sim.levels.origin;
    const inner = ring === 0 ? 45 : ring * R.width + 20, outer = ring === 0 ? Math.min(R.width * 0.85, 160) : (ring + 1) * R.width - 20;
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = s.rng() * Math.PI * 2, r = inner + s.rng() * (outer - inner), tx = Math.floor(o.x + Math.cos(angle) * r), ty = Math.floor(o.y + Math.sin(angle) * r);
      s.map.ensureAround(tx, ty, 0);
      if (s.map.tile(tx, ty) !== TILE.GRASS || s.map.navBlocked(tx, ty) || R.at(tx + 0.5, ty + 0.5).index !== ring) continue;
      const a = s.animals.animals[s.animals.spawn(type, tx + 0.5, ty + 0.5, undefined, { level: 1 })];
      a.quest = true; this.refresh(a);
      return a;
    }
    return null;
  }

  /** The boss of a ring that was appeased waits calmly in its cave, with its young around it. */
  restoreCalmBoss(ring, boss) {
    boss.appeased = true; boss.want = '';
    const q = boss.def && boss.def.wants && boss.def.wants.quest;
    if (q) for (let n = 0; n < q.count; n++) this._spawnHome(q.creature, boss);
  }

  exportState() { return { progress: Object.assign({}, this.progress), appeased: Object.keys(this.appeased).map(Number) }; }
  restore(state) {
    if (!state || typeof state !== 'object') return;
    for (const [ring, n] of Object.entries(state.progress || {})) if (/^\d$/.test(ring) && Number.isInteger(n) && n >= 0 && n < 100) this.progress[ring] = n;
    for (const ring of Array.isArray(state.appeased) ? state.appeased : []) if (Number.isInteger(ring) && ring >= 0 && ring < 10) this.appeased[ring] = true;
  }
}
