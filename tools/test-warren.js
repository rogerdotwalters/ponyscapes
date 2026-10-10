'use strict';
/* TOOLS - checks Act 1's second dungeon in Node (no browser):  node tools/test-warren.js
 * the Slime Warren's rooms, the rubble that waits for the Cave Bear, the slime waves and the way on, the Slime King's jump and slam, and the two Act 1 test settings. */
const assert = require('assert');
const { run } = require('./headless')();
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e).split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1; } };
/** A server with the host (A) standing at the Warren's mouth. */
const setup = () => run(`(() => {
  globalThis.S = new GameServer(4242); globalThis.A = S.addPlayer(); globalThis.PA = S.players[A];
  globalThis.MOUTH = S.map.terrain.caveSites.caves().find(c => c.index === 1);
  if (MOUTH) { PA.x = MOUTH.x; PA.y = MOUTH.y + 1.6; S.map.ensureAround(PA.x, PA.y, 2); }
  return !!MOUTH;
})()`);
const ticks = n => run(`for (let i = 0; i < ${n}; i++) S.step()`);
const press = () => run('S.tick += 40; S._interact(A, PA); S.tick += 40');
const alive = () => run(`Object.values(S.animals.animals).filter(a => a.wave && a.grid === PA.grid).length`);
/** Kill every wave slime in the room (the way a player's sword would). */
const killAll = () => run(`(() => { for (const id of Object.keys(S.animals.animals)) { const a = S.animals.animals[id]; if (a.wave && a.grid === PA.grid) S.animals.damage(id, 99999); } })()`);

test('the Warren: a second cave mouth, and six generated rooms of about 50 x 50 with a way in, a way on and a chest', () => {
  assert(setup(), 'the second cave mouth is placed');
  assert.strictEqual(run('Dungeons.all()[1].id'), 'slime_warren');
  const sizes = [1, 2, 3, 4, 5].map(i => run(`CaveRooms.get('slime_${i}').w`));
  assert(Math.abs(sizes.reduce((a, b) => a + b, 0) / 5 - 50) <= 2, 'about 50 on average: ' + sizes);
  for (const id of ['slime_1', 'slime_2', 'slime_3', 'slime_4', 'slime_5', 'slime_king']) {
    const r = run(`(r => ({ p: r.problems(), e: r.entrances.length, x: r.exits.length, c: r.chests.length }))(CaveRooms.get('${id}'))`);
    assert.deepStrictEqual([r.p.length, r.e, r.x, r.c], [0, 1, 1, 1], id);
  }
  assert.strictEqual(run(`SlimeRooms.level(2).codes.join() === SlimeRooms.level(2).codes.join()`), true);
  assert.strictEqual(run(`SlimeRooms.level(1).codes.join() === CaveRooms.get('slime_2').codes.join()`), true, 'a room is the same every time it is made');
});

test('rubble: the cave stays shut until the Cave Bear is beaten (the Act 1 checkbox does that)', () => {
  setup();
  press(); assert.strictEqual(run('PA.grid'), '', 'still outside');
  run(`S.receiveCommand(A, { type: 'setting', key: 'bearDefeated', value: true })`);
  assert.strictEqual(run('S.settings.bearDefeated'), true); assert.strictEqual(run('S.worldProgress.isDefeated(0)'), true);
  press(); assert.strictEqual(run('PA.grid'), 'dungeon:1:0');
  run(`S.receiveCommand(A, { type: 'setting', key: 'bearDefeated', value: false })`);
  assert.strictEqual(run('S.worldProgress.isDefeated(0)'), false);
  setup(); run(`S.worldProgress.defeatBoss(0)`); press(); assert.strictEqual(run('PA.grid'), 'dungeon:1:0', 'a real win opens it as well');
});

test('the host can only flip the settings; the bear checkbox follows a real kill', () => {
  setup(); const b = run('S.addPlayer()');
  run(`S.receiveCommand('${b}', { type: 'setting', key: 'bearDefeated', value: true })`); assert.strictEqual(run('S.settings.bearDefeated'), false);
  run('S.dungeons.conquer(0, "Cave Bear", false)'); assert.strictEqual(run('S.settings.bearDefeated'), true);
});

test('waves: slimes come up to the room\'s limit, at its level, until the total is spent; the way on stays sealed until all are dead', () => {
  setup(); run('S.worldProgress.defeatBoss(0)'); press();
  const W = run('Dungeons.all()[1].waves[0]');
  ticks(30 * 60);                                                      // a minute of play
  const seen = run(`Object.values(S.animals.animals).filter(a => a.wave && a.grid === PA.grid).map(a => a.level)`);
  assert(seen.length > 0 && seen.length <= W.max, 'alive ' + seen.length); assert(seen.every(l => l === W.level), 'every slime is level ' + W.level);
  assert(run('S.dungeons.waves["dungeon:1:0"].spawned') <= W.total);
  const plan = run('S.mapOf(PA).plan'), spot = run('(p => p._landing(p.room.exits))(S.mapOf(PA).plan)');
  run(`PA.x = ${spot.x}; PA.y = ${spot.y}`); press();
  assert.strictEqual(run('PA.grid'), 'dungeon:1:0', 'sealed while slimes remain');
  assert(run('S.pendingEvents.some(e => e.type === "notice" && /sealed/.test(e.text))'));
  for (let i = 0; i < 40 && !run('S.dungeons.cleared.has("dungeon:1:0")'); i++) { killAll(); ticks(30 * 5); }
  assert(run('S.dungeons.cleared.has("dungeon:1:0")'), 'cleared'); assert.strictEqual(run('S.dungeons.waves["dungeon:1:0"].spawned'), W.total);
  assert(run('S.pendingEvents.some(e => e.type === "roomCleared")'));
  press(); assert.strictEqual(run('PA.grid'), 'dungeon:1:1', 'the way on opened');
});

test('waves get harder with the level: more at once, faster, tougher, more in all', () => {
  const w = run('Dungeons.all()[1].waves');
  for (const k of ['max', 'level', 'total']) for (let i = 1; i < w.length; i++) assert(w[i][k] > w[i - 1][k], k);
  for (let i = 1; i < w.length; i++) assert(w[i].rate < w[i - 1].rate, 'rate');
});

test('the Slime King: waits in the arena; jumps, slams for ring damage, then rests', () => {
  setup(); run('S.worldProgress.defeatBoss(0)');
  run(`S.debugTeleport ? 0 : 0; S.dungeons.debugTeleport(A, PA, 'warren:5')`);
  assert.strictEqual(run('PA.grid'), 'dungeon:1:5');
  const king = run(`(() => { const k = Object.values(S.animals.animals).find(a => a.type === 'slime_king'); return k ? { level: k.level, hp: k.hp, x: k.x, y: k.y } : null; })()`);
  assert(king && king.level === 10);
  run(`PA.x = ${king.x + 7}; PA.y = ${king.y}; PA.hp = PA.maxHp = 500`);
  const phases = new Set(); let lift = 0, hurt = false;
  for (let i = 0; i < 30 * 12; i++) {
    run(`(() => { PA.x = ${king.x + 7}; PA.y = ${king.y}; S.step(); })()`);                                   // (the player stands still)
    const k = run(`(k => ({ state: k.state, lift: k.jumpLift || 0 }))(Object.values(S.animals.animals).find(a => a.type === 'slime_king'))`);
    phases.add(k.state); lift = Math.max(lift, k.lift);
  }
  for (const s of ['windup', 'jump', 'slam']) assert(phases.has(s), 'saw ' + s + ' in ' + [...phases]);
  assert(lift > 0.9, 'arc ' + lift);
  assert(run('PA.hp') < 500, 'the slam hurt');
  const states = run(`Object.values(S.animals.states([PA]))[0].lift`); assert(states === undefined || states >= 0);
});

/** A slime 4 tiles from a (standing) player in the first Warren room; returns what it did over `seconds`. `dodge` moves the player away the moment the slime squats. */
const slimeLeap = (seconds, dodge) => run(`(() => {
  S.dungeons.waves = {}; PA.hp = PA.maxHp;
  const world = S.mapOf(PA), R = world.plan.room; let spot = null;
  for (let y = 5; y < R.h - 5 && !spot; y++) for (let x = 5; x < R.w - 12 && !spot; x++) { let ok = true; for (let dx = 0; dx <= 8 && ok; dx++) for (let dy = -2; dy <= 2 && ok; dy++) if (R.code(x + dx, y + dy) !== 0 || world.plan.isPool(x + dx, y + dy)) ok = false; if (ok) spot = { x, y }; }
  PA.x = spot.x + 6.5; PA.y = spot.y + 0.5;
  const id = S.animals.spawn('slime', spot.x + 2.5, spot.y + 0.5, 0, { level: 4, grid: PA.grid }), a = S.animals.animals[id]; a.leapT = 0; a.wave = true;
  const seen = new Set(); let lift = 0, away = false;
  for (let i = 0; i < ${seconds} * CONFIG.sim.tickRate; i++) {
    S.step();
    seen.add(a.state); lift = Math.max(lift, a.jumpLift || 0);
    if (${dodge ? 'true' : 'false'} && a.state === 'windup' && !away) { PA.y += 4; away = true; }
  }
  return { seen: [...seen], lift, hurt: PA.hp < PA.maxHp - 1 };
})()`);

test('green slimes leap at you: squat, hop, land; they hurt only if you are still there', () => {
  setup(); run('S.worldProgress.defeatBoss(0)'); press();
  const hit = slimeLeap(3, false);
  for (const st of ['windup', 'jump', 'slam']) assert(hit.seen.includes(st), 'saw ' + st + ' in ' + hit.seen);
  assert(hit.lift > 0.3, 'a hop: ' + hit.lift); assert(hit.hurt, 'it landed on you');
  setup(); run('S.worldProgress.defeatBoss(0)'); press();
  assert.strictEqual(slimeLeap(1.4, true).hurt, false, 'step aside and it lands harmlessly');
});

test('killing the Slime King ends the Warren', () => {
  setup(); run('S.worldProgress.defeatBoss(0)'); run(`S.dungeons.debugTeleport(A, PA, 'warren:5')`);
  run(`S.animals.damage(Object.keys(S.animals.animals).find(id => S.animals.animals[id].type === 'slime_king'), 999999)`);
  assert(run('S.pendingEvents.some(e => e.type === "kingDefeated")')); assert.strictEqual(run('S.dungeons.kingDown.size'), 1);
});

test('the test bot: a seat that follows the host, fights, and picks them up', () => {
  setup(); run('S.worldProgress.defeatBoss(0)'); press();
  run(`S.receiveCommand(A, { type: 'setting', key: 'botPlayer', value: true })`);
  assert.strictEqual(run('S.settings.botPlayer'), true); const bot = run('S.bots.id'); assert(bot);
  assert.strictEqual(run(`S.players['${bot}'].grid`), 'dungeon:1:0', 'it came along');
  assert(run('S.humanIds().length') === 2);
  run('PA.x += 12'); ticks(30 * 6);                                    // the host walks off; the bot follows
  const gap = run(`Math.hypot(S.players['${bot}'].x - PA.x, S.players['${bot}'].y - PA.y)`); assert(gap < 8, 'follows: ' + gap);
  ticks(30 * 90);
  const slain = run('S.dungeons.waves["dungeon:1:0"].spawned - S.dungeons.left("dungeon:1:0")'); assert(slain > 0, 'the bot kills slimes: ' + slain);
  run('PA.hp = 1; S._damagePlayer(A, 99999)'); assert(run('PA.down') > 0);
  run(`PA.x = S.players['${bot}'].x + 1.8; PA.y = S.players['${bot}'].y`); ticks(30 * 3);
  assert.strictEqual(run('PA.down'), 0, 'the bot lifted the host');
  run(`S.receiveCommand(A, { type: 'setting', key: 'botPlayer', value: false })`);
  assert.strictEqual(run('S.humanIds().length'), 1); assert.strictEqual(run('S.settings.botPlayer'), false);
});

console.log(`${passed} passed`);
