'use strict';
/* SHARED (pure) - waypoints: the places worth walking to, in three groups the player can switch on or off (client/ui/waypointOverlay.js draws a line to each one
 * on screen; the Map shows the same places):
 *   quest      where the step of every quest under way points (the villager to hand things to, a place to visit, a puzzle node, the Cave Bear's cave and cubs)
 *   interest   things of interest: the X of a treasure map, a cave mouth a scroll marked, your stables, the village square when you are far from it
 *   home       your home
 * collect(game) reads a ClientGame (questLog, npcs, worldMap, treasureMaps, questMarks) and gives [{ id, group, x, y, label, sub, color, glyph }]. */
const Waypoints = {
  GROUPS: Object.freeze(['quest', 'interest', 'home']),
  COLORS: Object.freeze({ quest: '#ffd24a', interest: '#ff7a6a', home: '#7fd1ff' }),
  TOWN: Object.freeze({ x: 20.5, y: 20.5, name: 'Town' }),           // the village square: the map always points the way back
  /** How close counts as "arrived" (tiles): the line and the label go away. */
  ARRIVED: 2.5,

  /** Where a villager of this kind is (their dot in the snapshot), else their favourite spot. */
  npcSpot(game, type) {
    for (const id in game.npcs || {}) if (game.npcs[id].type === type) return { x: game.npcs[id].x, y: game.npcs[id].y };
    const def = Npcs.get(type);
    return def ? { x: def.home.x, y: def.home.y } : null;
  },
  homeSpot() { const H = Village.home; return { x: (H.x0 + H.x1 + 1) / 2, y: (H.y0 + H.y1 + 1) / 2 }; },

  /** Where this step of this quest points, as { x, y, near } (near: how close is "there"), or null. */
  questSpot(game, q, step) {
    const map = game.worldMap;
    switch (step.type) {
      case 'deliver': return Waypoints.npcSpot(game, q.giver);
      case 'talk': return Waypoints.npcSpot(game, step.npc);
      case 'minigame': return { x: Village.roundup.gate.x, y: Village.roundup.gate.y, near: 3 };                // (the Round-Up: the gate of the old fence)
      case 'puzzle': { const n = PuzzleNodes.get(step.node); return n ? { x: n.x, y: n.y } : null; }
      case 'visit': { const spot = QuestWhere.ofStep(map, step); return spot && Object.assign({ near: step.radius || 3 }, spot); }
      case 'event': {
        const ring = step.ring | 0;
        if (step.event === 'cubs') {                                                  // the nearest lost cub you have tracked, else the cave the trail starts at
          const me = game.local || { x: 0, y: 0 };
          let best = null;
          for (const m of game.questMarks || []) if (m.ring === ring) { const d = Math.hypot(m.x - me.x, m.y - me.y); if (!best || d < best.d) best = { d, x: m.x + 0.5, y: m.y + 0.5 }; }
          if (best) return { x: best.x, y: best.y };
        }
        return QuestWhere.resolve(map, 'cave:' + ring);
      }
    }
    return null;
  },

  /** Every waypoint there is right now (all three groups; the caller filters by what is switched on). */
  collect(game) {
    const out = [], C = Waypoints.COLORS, me = game.local;
    if (!me || !game.worldMap) return out;
    for (const q of QuestDefs.all()) {
      const cur = QuestLog.current(game.questLog, q);
      if (!cur) continue;
      const spot = Waypoints.questSpot(game, q, cur.step);
      if (spot) out.push({ id: 'q:' + q.id, group: 'quest', x: spot.x, y: spot.y, near: spot.near, label: q.title, sub: cur.step.text + QuestLog.countText(cur.step, cur.progress), color: C.quest, glyph: cur.step.type === 'talk' || cur.step.type === 'deliver' ? '?' : '!' });
    }
    for (const m of game.treasureMaps || []) out.push({ id: 'x:' + m.key, group: 'interest', x: m.tx + 0.5, y: m.ty + 0.5, label: m.kind === 'dungeon' ? 'Marked cave' : 'Treasure', sub: '', color: C.interest, glyph: m.kind === 'dungeon' ? '◓' : '✖' });
    const stables = [];
    for (const key in game.worldMap.built || {}) {
      const tile = game.worldMap.built[key];
      if (tile && (tile.c === 'stable' || tile.c === 'barn')) { const x = keyTileX(key) + 0.5, y = keyTileY(key) + 0.5; stables.push({ x, y, d: Math.hypot(x - me.x, y - me.y) }); }
    }
    stables.sort((a, b) => a.d - b.d);
    for (const s of stables.slice(0, 2)) out.push({ id: `s:${s.x},${s.y}`, group: 'interest', x: s.x, y: s.y, label: 'Stable', sub: '', color: '#e0a868', glyph: '■' });
    const T = Waypoints.TOWN;
    if (Math.hypot(T.x - me.x, T.y - me.y) > 14) out.push({ id: 'town', group: 'interest', x: T.x, y: T.y, label: T.name, sub: 'the village square', color: '#e3a92b', glyph: '➤' });
    const home = Waypoints.homeSpot();
    out.push({ id: 'home', group: 'home', x: home.x, y: home.y, label: 'Home', sub: '', color: C.home, glyph: '⌂' });
    return out;
  }
};
