'use strict';
/* DATA - minigame: the Round-Up. Walk up to the old fence east of the village (where Marnie the shepherd waits) and press Use: every connected player is asked yes or no and those who say yes are taken to a meadow
 * arena. Two sides start at opposite ends, each defending a POLE. After the countdown the sheep scatter: LASSO one (its rope must be kept short and the sheep calmed for a
 * moment), LEAD it back and TIE it to your own pole. A rival who crosses your rope cuts it; a lasso thrown at a sheep that somebody else has roped (or is leading) steals it;
 * and you can untie a sheep from the other side's pole (slower while its defenders stand near). When the time is up, the side with more sheep on its pole wins.
 * A lone player is matched with a computer Rival Rancher. Sizes are in tiles (the world's 64px-authored tiles are NOT scaled here: these are already final distances).
 *   arena        w x h tiles inside the fence, `margin` of meadow and trees all round, pole `inset` from each end, `slots` places on a pole
 *   seconds      how long the others have to answer the invitation, countdown before GO, the round itself, how long the result is shown before everyone is taken back
 *   sheep        how many run loose: base for one or two players, +each for every person beyond two
 *   speed        sheep: wander, flee (always less than a player's run, 3.2 tiles a second), led; the rival's run
 *   rope         calm: stay this close for it to calm; max: farther than this and the rope snaps; tame: seconds of calm to settle a sheep; lead: a person leads at most this many
 *                cut: how near to a rope a rival must pass to cut it; stolenStart: how settled a stolen sheep already is
 *   lasso        chance of a catch at point blank and at full reach; the thrower is `stun` seconds slow to throw again after their rope is cut;
 *                the Rival Rancher throws every `rivalEvery` seconds or so, lands `rivalLuck` of what a player would, and pauses `rivalPause` seconds after each sheep it ties
 *   steal        seconds to untie a sheep from a pole, +more for every defender within `guard` tiles; you must stay within `reach` of the pole
 *   reward       wool for each sheep your side has tied up at the end; winners also get more wool and coins */
Minigames.register({
  id: 'roundup', name: 'Round-Up', blurb: 'Lasso the runaway sheep and tie them to your pole before the other side does.',
  arena: { w: 34, h: 22, margin: 6, inset: 4.5, slots: 10 },
  seconds: { countdown: 4, play: 150, over: 8, invite: 15 },
  sheep: { base: 8, extra: 2 },
  speed: { wander: 1.0, flee: 2.5, led: 3.0, rival: 2.1 },
  rope: { calm: 4.2, max: 6.4, tame: 2.4, lead: 3, cut: 0.42, stolenStart: 0.5 },
  lasso: { near: 0.92, far: 0.62, stun: 0.9, rivalEvery: 2.4, rivalLuck: 0.8, rivalPause: 5 },
  steal: { base: 1.3, perGuard: 1.0, guard: 4.5, reach: 3.0 },
  reward: { woolPerSheep: 1, winWool: 3, winCoins: 8, xp: ['animal_friendship', 25] }
});
