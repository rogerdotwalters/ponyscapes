'use strict';
/* SHARED - quests and puzzle nodes. THE QUEST LOG BELONGS TO THE HOST'S WORLD: one log for everybody playing, saved with the world.
 *
 *   - Anyone can accept a quest, and what any player hands in or solves counts toward the same quest.
 *   - When a quest is finished, EVERY player in the game at that moment gets its reward (coins, items, hearts, xp).
 *   - A quest the world finished before you joined is done: it is closed to you. You can still join the ones that are open or come later.
 *
 * The log is { done: { questId: tick }, active: { questId: { step, progress } } }. `QuestLog` below is the pure side (client + server: what is
 * available, what the current step is); `QuestSystem` is the server's. The definitions are js/data/quests/, the puzzle nodes js/data/puzzles/.
 * Puzzle nodes are things you interact with in the overworld; the puzzle itself is played on the client's puzzle screen and REPLAYED here
 * (js/shared/puzzles.js). */
const QUEST_REACH = CONFIG.sim.friendship.reach + 0.6, PUZZLE_REACH = 1.6, VISIT_EVERY_TICKS = 15;

const QuestLog = {
  empty: () => ({ done: {}, active: {} }),
  /** 'done' | 'active' | 'available' | 'locked' */
  status(log, q) {
    if (log.done[q.id] !== undefined) return 'done';
    if (log.active[q.id]) return 'active';
    return (q.requires || []).every(r => log.done[r] !== undefined) ? 'available' : 'locked';
  },
  /** The step this active quest is on: { step, index, progress } or null. */
  current(log, q) {
    const a = log.active[q.id];
    return a && q.steps[a.step] ? { step: q.steps[a.step], index: a.step, progress: a.progress | 0 } : null;
  },
  /** Quests this villager gives (an Npcs id). */
  forGiver: type => QuestDefs.where(q => q.giver === type),
  /** The open quest whose current step wants this puzzle node, or null. */
  needing(log, nodeId) {
    for (const q of QuestDefs.all()) { const cur = QuestLog.current(log, q); if (cur && cur.step.type === 'puzzle' && cur.step.node === nodeId) return q; }
    return null;
  },
  /** Quests that are on offer or under way, for the Journal: [{ quest, status, current }]. */
  open(log) {
    return QuestDefs.all().map(q => ({ quest: q, status: QuestLog.status(log, q), current: QuestLog.current(log, q) })).filter(e => e.status === 'active' || e.status === 'available');
  },
  /** The mark over a villager's head: '!' (has a quest to give), '?' (a quest is waiting on you here: hand something over, or report to them), or ''. */
  markerFor(log, type) {
    let mark = '';
    for (const q of QuestDefs.all()) {
      const status = QuestLog.status(log, q);
      if (status === 'available' && q.giver === type) { if (!mark) mark = '!'; }
      else if (status === 'active') {
        const cur = QuestLog.current(log, q);
        if (cur && ((cur.step.type === 'deliver' && q.giver === type) || (cur.step.type === 'talk' && cur.step.npc === type))) mark = '?';
      }
    }
    return mark;
  },
  line: (text, name) => String(text).replace(/\{friend\}/g, name || 'friend')
};

/** Pure (client + server): a puzzle node within reach? { kind:'puzzle', label, dist, node } or null. Overworld only. */
function findPuzzleNodeInteraction(map, p) {
  if (map.kind !== 'world' || p.grid) return null;
  let best = null;
  for (const n of PuzzleNodes.all()) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= PUZZLE_REACH && (!best || d < best.dist)) best = { kind: 'puzzle', label: `Study the ${n.name}`, dist: d, node: n.id };
  }
  return best;
}
Interactions.extra.push(findPuzzleNodeInteraction);
InteractionHandlers.puzzle = (server, id, p, action) => server.quests.openNode(id, action.node);

class QuestSystem {
  constructor(server) { this.s = server; this.log = QuestLog.empty(); this.rev = 1; this.sentRev = {}; this.visitAt = 0; }

  /* ---------------------------------------- what the players are told ---------------------------------------- */
  /** The whole log as the clients read it. */
  wire() {
    const active = {};
    for (const id in this.log.active) active[id] = [this.log.active[id].step, this.log.active[id].progress];
    return { done: Object.assign({}, this.log.done), active: Object.assign({}, active) };
  }
  /** Only when it changed since this player was last sent it (else null). */
  updateFor(id) {
    if (this.sentRev[id] === this.rev) return null;
    this.sentRev[id] = this.rev;
    return this.wire();
  }
  forget(id) { delete this.sentRev[id]; }
  _tell(text) { for (const id of this.s.humanIds()) this.s._notice(id, text); }
  _changed() { this.rev++; }

  /* ---------------------------------------- the villager asks and you answer ---------------------------------------- */
  /** The giver of `q` within reach of this player (and on their grid), or null. */
  _giverNear(id, q) {
    const p = this.s.players[id];
    if (!p) return null;
    let best = null;
    for (const n of Object.values(this.s.npcs.visible())) {
      if (n.type !== q.giver || !sameGrid(n, p)) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d <= QUEST_REACH && (!best || d < best.d)) best = { npc: n, d };
    }
    return best && best.npc;
  }

  accept(id, questId) {
    const q = QuestDefs.get(questId), p = this.s.players[id];
    if (!q || !p || QuestLog.status(this.log, q) !== 'available') return;
    if (!this._giverNear(id, q)) { this.s._notice(id, 'Get closer to ask about that'); return; }
    this.log.active[q.id] = { step: 0, progress: 0 };
    this._changed();
    this._tell(`New quest: ${q.title}` + (p.name ? ` (taken up by ${p.name})` : ''));
    this._checkVisit();
  }

  /** Hand over what the current "deliver" step asks for: as much as this player's bag holds, toward the shared total. */
  deliver(id, questId) {
    const q = QuestDefs.get(questId), cur = q && QuestLog.current(this.log, q), inventory = this.s.inventories[id];
    if (!cur || cur.step.type !== 'deliver' || !inventory) return;
    const npc = this._giverNear(id, q);
    if (!npc) { this.s._notice(id, `Get closer to ${Npcs.get(q.giver).name}`); return; }
    const item = cur.step.item, need = cur.step.count - cur.progress, give = Math.min(need, inventory.count(item));
    if (give <= 0) { this.s._notice(id, `You have no ${ItemDefs[item].name.toLowerCase()} to give`); return; }
    inventory.remove(item, give); this.s.inventoryRev[id]++;
    this.log.active[q.id].progress += give;
    this._changed();
    this.s.npcs.speak(npc, give >= need ? 'That is all of it. Thank you!' : `Thank you! ${need - give} more to go.`);
    if (give >= need) this._advance(q); else this._tell(`${q.title}: ${cur.progress + give}/${cur.step.count} ${ItemDefs[item].name.toLowerCase()}`);
  }

  /** A player spoke to a villager (tapActions._talkTo): a "talk" step addressed to them is done. */
  onTalk(id, npc) {
    for (const q of QuestDefs.all()) {
      const cur = QuestLog.current(this.log, q);
      if (cur && cur.step.type === 'talk' && cur.step.npc === npc.type) { this.s.npcs.speak(npc, QuestLog.line(q.progress || '...', (this.s.players[id] || {}).name)); this._advance(q); }
    }
  }

  /* ---------------------------------------- puzzle nodes ---------------------------------------- */
  _nodeNear(id, nodeId) {
    const p = this.s.players[id], node = PuzzleNodes.get(nodeId);
    return node && p && !p.grid && Math.hypot(node.x - p.x, node.y - p.y) <= PUZZLE_REACH + 0.8 ? node : null;
  }
  /** The interact key at a node: open its puzzle screen if a quest is asking for it, else it only hums. */
  openNode(id, nodeId) {
    const node = this._nodeNear(id, nodeId);
    if (!node) return;
    if (!QuestLog.needing(this.log, node.id)) { this.s._notice(id, node.quiet || 'Nothing happens.'); return; }
    this.s.pendingEvents.push({ type: 'puzzle', to: id, node: node.id });
  }
  /** The client says it solved the puzzle: replay its moves. */
  solve(id, nodeId, moves) {
    const node = this._nodeNear(id, nodeId), q = node && QuestLog.needing(this.log, node.id);
    if (!node || !q) return;
    if (!Puzzles.verify(node.puzzle, this.s.map.seed, moves)) { this.s._notice(id, 'That was not quite right'); return; }
    this.s.pendingEvents.push({ type: 'puzzleSolved', node: node.id, x: node.x, y: node.y });
    this._advance(q);
  }

  /* ---------------------------------------- progress ---------------------------------------- */
  update(tick) {
    if (tick % VISIT_EVERY_TICKS === 0) this._checkVisit();
  }
  /** "visit" steps: anyone standing at the place completes the step. */
  _checkVisit() {
    for (const q of QuestDefs.all()) {
      const cur = QuestLog.current(this.log, q);
      if (!cur || cur.step.type !== 'visit') continue;
      const r = cur.step.radius || 3;
      if (this.s.humanIds().some(id => { const p = this.s.players[id]; return p && !p.grid && Math.hypot(p.x - cur.step.x, p.y - cur.step.y) <= r; })) this._advance(q);
    }
  }
  _advance(q) {
    const a = this.log.active[q.id];
    if (!a) return;
    const done = q.steps[a.step];
    a.step++; a.progress = 0;
    this._changed();
    if (a.step >= q.steps.length) { this._complete(q); return; }
    this._tell(`${q.title}: ${done.text} - done. Next: ${q.steps[a.step].text}`);
    this._checkVisit();
  }
  /** Finished: everyone in the game shares the reward. */
  _complete(q) {
    const S = this.s, r = q.reward || {}, giver = Object.values(S.npcs.npcs).find(n => n.type === q.giver);
    delete this.log.active[q.id]; this.log.done[q.id] = S.tick;
    this._changed();
    for (const id of S.humanIds()) {
      const p = S.players[id], inventory = S.inventories[id];
      if (!p || !inventory) continue;
      if (r.coins) inventory.add('gold_coin', r.coins);
      for (const [item, count] of r.items || []) { const left = inventory.add(item, count); if (left > 0) S._stowOverflow(id, [{ id: item, count: left }]); }      // (no room: the main pony's pack, else the ground)
      S.inventoryRev[id]++;
      if (r.friendship && giver) S.friendship.reward(id, giver, r.friendship);
      if (r.xp && r.xp[1] > 0 && SkillDefs[r.xp[0]]) S.progress.award(id, r.xp[0], r.xp[1]);
      S.pendingEvents.push({ type: 'questDone', to: id, quest: q.id, title: q.title, coins: r.coins || 0, items: r.items || [] });
      S._notice(id, `Quest complete: ${q.title}` + (r.coins ? ` (+${r.coins} coins)` : ''));
    }
    if (giver) S.npcs.speak(giver, QuestLog.line(q.done || 'Well done!', 'friend'));
  }

  /* ---------------------------------------- saving ---------------------------------------- */
  exportState() { return { done: Object.assign({}, this.log.done), active: JSON.parse(JSON.stringify(this.log.active)) }; }
  restore(data) {
    this.log = QuestSystem.sanitize(data); this._changed();
  }
  /** Whatever came back from a database: only quests that exist, steps that exist, sane numbers. */
  static sanitize(data) {
    const out = QuestLog.empty();
    if (!data || typeof data !== 'object') return out;
    const done = data.done && typeof data.done === 'object' ? data.done : {}, active = data.active && typeof data.active === 'object' ? data.active : {};
    for (const q of QuestDefs.all()) {
      if (done[q.id] !== undefined) { out.done[q.id] = Number.isFinite(done[q.id]) ? Math.max(0, Math.floor(done[q.id])) : 0; continue; }
      const a = active[q.id];
      if (!a || typeof a !== 'object') continue;
      const step = Number.isInteger(a.step) ? a.step : -1, st = q.steps[step];
      if (!st) continue;
      out.active[q.id] = { step, progress: st.type === 'deliver' && Number.isFinite(a.progress) ? Math.min(st.count, Math.max(0, Math.floor(a.progress))) : 0 };
    }
    return out;
  }
}
