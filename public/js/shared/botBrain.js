'use strict';
/* SERVER-SIDE bot AI. Produces the same input object a human client would send. */
const BotMode = Object.freeze({ IDLE: 'idle', WALK: 'walk', CHOP: 'chop' });
const BOT_CHOP_TRIP_CHANCE = 0.65, BOT_CHOP_SECONDS = 7, BOT_SEARCH_RADIUS = 11;

const createBotBrain = () => ({ mode: BotMode.IDLE, wait: 0.5, nav: null, run: false, chopTimer: 0, chopWhenArrived: false });
const noInput = () => ({ moveX: 0, moveY: 0, run: false, sneak: false, action: false, slot: 0, seq: 0 });

function botInput(bot, p, map, rng, dt, focus) {
  switch (bot.mode) {
    case BotMode.WALK: return botWalk(bot, p, dt);
    case BotMode.CHOP: return botChop(bot, p, map, dt);
    default:           return botIdle(bot, p, map, rng, dt, focus);
  }
}

function botIdle(bot, p, map, rng, dt, focus) {
  if ((bot.wait -= dt) > 0) return noInput();
  const started = (rng() < BOT_CHOP_TRIP_CHANCE && startChopTrip(bot, p, map, rng)) || startWander(bot, p, map, rng, focus);
  if (!started) bot.wait = 0.5;
  return noInput();
}

function botWalk(bot, p, dt) {
  if (!bot.nav) { bot.mode = BotMode.IDLE; bot.wait = 0.5; return noInput(); }          // lost its path: just stop and think again
  const step = steerAlongPath(bot.nav, p.x, p.y, dt);
  if (!step.done) return Object.assign(noInput(), { moveX: step.moveX, moveY: step.moveY, run: bot.run });
  bot.nav = null;
  if (bot.chopWhenArrived) { bot.mode = BotMode.CHOP; bot.chopTimer = BOT_CHOP_SECONDS; }
  else { bot.mode = BotMode.IDLE; bot.wait = 1.5; }
  return noInput();
}

function botChop(bot, p, map, dt) {
  const reach = ItemDefs.axe.tool.reach;
  if ((bot.chopTimer -= dt) <= 0 || findTreeInReach(map, p, reach) < 0) { bot.mode = BotMode.IDLE; bot.wait = 1; return noInput(); }
  return Object.assign(noInput(), { action: true });
}

function startChopTrip(bot, p, map, rng) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tx = Math.floor(p.x + (rng() - 0.5) * 2 * BOT_SEARCH_RADIUS), ty = Math.floor(p.y + (rng() - 0.5) * 2 * BOT_SEARCH_RADIUS);
    const tree = treeAt(map, tx, ty);
    if (!tree || !tree.alive || Math.hypot(tree.x - p.x, tree.y - p.y) > BOT_SEARCH_RADIUS) continue;
    const spot = standingSpotNextTo(map, tree, p);
    const path = spot && findPath(map, p.x, p.y, spot.x, spot.y);
    if (path && path.length) return beginWalk(bot, path, true, rng() < 0.25);
  }
  return false;
}

function standingSpotNextTo(map, tree, from) {
  const tx = Math.floor(tree.x), ty = Math.floor(tree.y);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: tx + dx + 0.5, y: ty + dy + 0.5 }))
    .filter(s => !navBlocked(map, Math.floor(s.x), Math.floor(s.y)))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0] || null;
}

function startWander(bot, p, map, rng, focus) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const around = focus && rng() < 0.4 ? focus : p;                 // loiter near the human so depth sorting is visible
    const tx = Math.floor(around.x + (rng() - 0.5) * 14), ty = Math.floor(around.y + (rng() - 0.5) * 14);
    if (navBlocked(map, tx, ty)) continue;
    const path = findPath(map, p.x, p.y, tx + 0.5, ty + 0.5);
    if (path && path.length) return beginWalk(bot, path, false, rng() < 0.25);
  }
  return false;
}

function beginWalk(bot, path, chopWhenArrived, run) {
  bot.mode = BotMode.WALK; bot.nav = makeNav(path); bot.chopWhenArrived = chopWhenArrived; bot.run = run;
  return true;
}
