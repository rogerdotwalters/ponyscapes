'use strict';
/* SHARED + SERVER-SIDE - going down in a dungeon. When health reaches 0 inside a dungeon room or a guardian's lair you do not wake up in the village: you drop to your
 * knees (p.down = seconds until you get up) and your view darkens. Outside dungeons nothing changes (GameServer._knockOut).
 *
 *   alone / waiting   the timer runs; at 0 you get up with CONFIG.sim.difficulty rules' reviveFraction of your health (or more, if snacks added to it)
 *   snacks            Use with food in hand eats it: its hunger value shaves seconds off the wait and stores health for when you rise
 *   a teammate        Interact beside you lifts you at once, whatever mode either of you plays in
 *
 * While down p.hp stays 0 (so monsters, lightning and fire leave you alone: they all skip hp <= 0); the health snacks add waits in p.downHp. After getting up nothing
 * can hurt you for `graceSeconds` (p.graceT), so a monster standing over you cannot knock you straight down again.
 * Every mode uses the easy rules for now (CONFIG.sim.difficulty.modes). The pure half (rules, who can be lifted) also runs on the client, to label the button and darken the view. */
const Downed = {
  modes: () => CONFIG.sim.difficulty.modes,
  /** A mode id that exists (else the default). */
  mode: id => (CONFIG.sim.difficulty.modes[id] ? id : CONFIG.sim.difficulty.default),
  /** The downed rules of a mode: a mode with `like` borrows another's until it has its own. */
  rules(mode) {
    let m = CONFIG.sim.difficulty.modes[Downed.mode(mode)], guard = 0;
    while (m.like && guard++ < 4) m = CONFIG.sim.difficulty.modes[m.like];
    return m.downed;
  },
  /** Is this grid a dungeon room or a guardian's lair? */
  inDungeon(grid) { const g = Grids.parse(grid); return !!g && (g.kind === 'dungeon' || g.kind === 'cave'); },
  isDown: p => !!p && p.down > 0,
  /** What a snack is worth to someone who is down: { seconds, hp } or null if it is not food. */
  snack(itemId, rules) {
    const food = ItemDB.getFood(itemId);
    if (!food || !(food.hunger > 0)) return null;
    return { seconds: food.hunger * rules.snackSeconds, hp: food.hunger * rules.snackHp };
  },
  /** The nearest downed player on your grid within reach, for the Interact key: { kind: 'revive', label, dist, who } or null. `players` is any { id: player } table. */
  findAlly(players, p, selfId = p.id, rules = Downed.rules()) {
    if (Downed.isDown(p)) return null;
    let best = null;
    for (const id in players) {
      const o = players[id];
      if (id === selfId || !Downed.isDown(o) || !sameGrid(o, p)) continue;
      const dist = Math.hypot(o.x - p.x, o.y - p.y);
      if (dist <= rules.reach && (!best || dist < best.dist)) best = { kind: 'revive', label: 'Pick up', dist, who: id };
    }
    return best;
  }
};

class DownedSystem {
  constructor(server) { this.server = server; this.mode = CONFIG.sim.difficulty.default; }

  /** The host picks the mode (easy / medium / hard). */
  setMode(mode) { this.mode = Downed.mode(mode); this.server.settings.difficulty = this.mode; this.server.settingsRev++; }
  rules() { return Downed.rules(this.mode); }

  /** Health hit 0 inside a dungeon: down on your knees. Returns false if this is not a dungeon (the caller sends you home instead). */
  goDown(id) {
    const s = this.server, p = s.players[id];
    if (!p || !Downed.inDungeon(gridOf(p))) return false;
    const boat = s.boats[p.boat];
    if (boat) { boat.occupant = ''; p.boat = ''; }
    s._dismount(id, p);
    p.flying = false; p.flyT = 0; p.flyCd = 0;
    p.down = p.downMax = this.rules().seconds; p.downHp = 0; p.hp = 0; p.vx = p.vy = 0; p.state = 'idle'; p.eatT = 0;
    s.pendingEvents.push({ type: 'downed', to: id, seconds: p.down, x: p.x, y: p.y });
    return true;
  }

  /** Everything a downed player's input can do: pick which snack is in hand, and eat it with Use. (No moving, tools, or interacting.) */
  input(id, p, inventory, input) {
    const s = this.server, R = this.rules();
    if (p.eatT > 0) p.eatT = Math.max(0, p.eatT - TICK_DT);
    p.sel = input.slot; p.held = inventory.itemIdAt(p.sel);
    if (!input.action || p.eatT > 0) return;
    const snack = Downed.snack(p.held, R);
    if (!snack) return;
    const item = p.held;
    inventory.remove(item, 1); s.inventoryRev[id]++;
    p.eatT = CONFIG.sim.hunger.eatSeconds;
    p.down = Math.max(0, p.down - snack.seconds);
    p.downHp = Math.min(p.maxHp, p.downHp + snack.hp);
    s.pendingEvents.push({ type: 'snack', to: id, item, seconds: Math.round(snack.seconds * 10) / 10, hp: Math.round(snack.hp), x: p.x, y: p.y });
    if (p.down <= 0) this.getUp(id);
  }

  /** The timer, once a tick. */
  tick(id, p) {
    if (p.graceT > 0) p.graceT = Math.max(0, p.graceT - TICK_DT);
    if (!(p.down > 0)) return;
    p.down = Math.max(0, p.down - TICK_DT);
    if (p.down <= 0) this.getUp(id);
  }

  /** On your feet again with at least the revive share of your health. `by` = the teammate who lifted you. */
  getUp(id, by = '') {
    const s = this.server, p = s.players[id];
    if (!p) return;
    p.hp = Math.max(1, Math.min(p.maxHp, Math.max(p.maxHp * this.rules().reviveFraction, p.downHp)));
    p.down = 0; p.downHp = 0; p.downMax = 0; p.graceT = this.rules().graceSeconds;
    s.pendingEvents.push({ type: 'revived', to: id, by, hp: Math.round(p.hp), x: p.x, y: p.y });
    if (by) s.pendingEvents.push({ type: 'lifted', to: by, who: id, x: p.x, y: p.y });
  }

  /** Interact beside a downed teammate. True if it did something (so Interact does not also do whatever else is near). */
  lift(id, p) {
    const found = Downed.findAlly(this.server.players, p, id, this.rules());
    if (!found) return false;
    this.getUp(found.who, id);
    return true;
  }
}
