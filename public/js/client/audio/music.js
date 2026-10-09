'use strict';
/* CLIENT - the soundtrack: seven tunes, all in one bright, cartoon-pony storybook style (an original take on that feel, no borrowed melodies): bells and
 * a celesta's twinkle, harp glissandos, pizzicato strings, a flute, a synth lead and a string pad, bouncy rhythms and hummable, singable tunes. Each is
 * made live from oscillators and filtered noise (no files), in a stone hall's reverb, and each has a FIXED tune (a hook you can hum), not a random one.
 *   CALM    "Meadowlight Reverie" (92 bpm, D): the everyday theme. A sweet flute-and-bell lullaby over a harp, soft pizzicato and a cello; it thins at night.
 *   STORM   "Thunder Over Hollowmere" (66 bpm, C minor): a slow, spooky music-box melody over tremolo strings, a cello drone, tolling harp and a distant
 *           drum, with a cold twinkle now and then. Plays under a heavy downpour or a gale.
 *   TEMPEST "Duel at Stormcrown": for thunderstorms, a long piece in E minor (about three minutes, then it loops): a suspenseful build-up whose last note
 *           drops away, a very fast chorus where two violins duel (one in each ear, each with its own racing figure), an interlude that slows to a lone
 *           cello and builds again, and the duel once more, two rounds. Magic twinkles and harp glissandos mark the big moments.
 *   BATTLE  "Ironhoof Gallop" (D minor, fast): a galloping hero's theme: war drums, a galloping cello, racing harp, tremolo strings and a flute-and-synth
 *           tune that turns bright and heroic in its second half. Plays when something hostile is near (or just was), when you are hurt, and in any cave.
 * The next three never play by themselves; pick them in the Soundtrack player:
 *   PARADE  "Glitterhoof Parade": a mild-tempo (104 bpm) pop song: intro, verse, chorus (the hook), verse, chorus, a soft bridge, a last chorus lifted a step.
 *   DANCE   "Rainbow Hoofdance": a cheery dance track at 124 bpm: four-on-the-floor kick, offbeat hats and bass, a pumping mix, a drop, a breakdown,
 *           a riser and a second drop a whole step up.
 *   HARMONY "Harmony Hooves": a bright, bouncy friendship anthem at 120 bpm: pizzicato verses, a rising pre-chorus and a soaring chorus.
 * AMBIENT: every tune also has an ambient version made from the same key and chords: slow strings and a drone, and a sparse scatter of bells, harp,
 * flute and twinkles (storm, tempest and battle add wind, a heartbeat or far-off drums), with no tune and no beat. In Auto the ambient version is what
 * plays; the real tune comes in only rarely (about one chance in eight at the end of each minute-long ambient loop), plays once through, and the ambient
 * returns. In the Soundtrack player a picked track plays in full unless you switch the Ambient button on.
 * Changing mood crossfades: the old tune fades out while the new one begins on its first bar. In a room the music is muffled.
 * Volume: Menu > Controls > Mouse & touch (0 switches it off). */
const PonyMusic = (() => {
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const MAJ7 = [0, 2, 4, 5, 7, 9, 11], MIN7 = [0, 2, 3, 5, 7, 8, 10];                                 // a major scale and a natural minor scale, from the key
  const THEMES = {
    calm: { title: 'Meadowlight Reverie', blurb: 'A sweet lullaby of flute, bells and harp. By day.', key: 2, bar: 8, level: 1, fadeIn: 2.2, fadeOut: 3 },
    storm: { title: 'Thunder Over Hollowmere', blurb: 'A slow, spooky music box, for heavy rain and gales.', key: 0, bar: 8, level: 1, fadeIn: 3, fadeOut: 3.5 },
    tempest: { title: 'Duel at Stormcrown', blurb: 'Build-up, a duel of violins, a cello interlude, the duel again. Thunderstorms.', key: 4, bar: 8, level: 1, fadeIn: 2, fadeOut: 2.5 },
    battle: { title: 'Ironhoof Gallop', blurb: 'A galloping hero\'s theme. Battles and caves.', key: 2, bar: 8, level: 0.9, fadeIn: 0.5, fadeOut: 1.1 },
    parade: { title: 'Glitterhoof Parade', blurb: 'A mild-tempo fantasy pony pop song: verse, chorus, bridge and a key change.', key: 0, bar: 8, level: 1, fadeIn: 1.5, fadeOut: 2.5 },
    dance: { title: 'Rainbow Hoofdance', blurb: 'Cheery and upbeat, 124 bpm: a build, two drops and a breakdown.', key: 7, bar: 8, level: 0.65, fadeIn: 1.5, fadeOut: 2.5 },
    harmony: { title: 'Harmony Hooves', blurb: 'A bright, bouncy friendship anthem: sparkles, pizzicato, a soaring chorus.', key: 5, bar: 8, level: 0.85, fadeIn: 1.5, fadeOut: 2.5 }
  };
  const whereIn = sections => bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
  /** The tempest, section by section: a hush, a rise and a surge of suspense (each faster than the last), then the duel. dur = seconds per step (8 a bar). */
  const HARMONIC = [0, 2, 3, 5, 7, 8, 11];                                                     // E harmonic minor (E F# G A B C D#), from the key
  const TEMPEST = (() => {
    const E = [0, 'm'], C = [8, 'M'], A = [5, 'm'], B = [7, 'M'];                              // Em C Am B (B major: the D# is the "leading tone" that makes it ache)
    const P1 = [E, C, A, B], P2 = [A, C, B, E];
    const sections = [
      { id: 'hush', bars: 8, dur: 0.45 }, { id: 'rise', bars: 8, dur: 0.33 }, { id: 'surge', bars: 8, dur: 0.22 },        // the build-up
      { id: 'duel', bars: 16, dur: 0.115 },                                                                              // the first duel: one round
      { id: 'slow', bars: 4, dur: 0.115, dur1: 0.5 },                                                                   // the interlude: it slows to a crawl (dur1: the last bar's step)...
      { id: 'cello', bars: 8, dur: 0.5 },                                                                               // ...a cello alone in the dark...
      { id: 'rebuild', bars: 8, dur: 0.5, dur1: 0.12 },                                                                 // ...and builds again, faster each bar
      { id: 'duel', bars: 32, dur: 0.115 }                                                                              // the duel again: two rounds
    ];
    const chords = [E, E, E, E, C, E, A, B,   E, A, E, B, E, C, A, B,   E, E, A, A, C, C, B, B,
      ...P1, ...P2, ...P1, ...P2,                                                                                       // first duel
      E, E, A, A,   E, A, E, B, C, A, B, E,   E, E, A, A, C, C, B, B,                                                   // slow, cello, rebuild
      ...P1, ...P2, ...P1, ...P2, ...P1, ...P2, ...P1, ...P2];                                                          // second duel
    /** The seconds each step lasts in bar `idx` of a section (a section can speed up or slow down bar by bar). */
    const durOf = (sec, idx) => sec.dur1 ? sec.dur * Math.pow(sec.dur1 / sec.dur, idx / (sec.bars - 1)) : sec.dur;
    const where = bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
    return { sections, chords, durOf, where, bars: chords.length, stepDur: bi => { const w = where(bi); return durOf(w.sec, w.idx); } };
  })();
  /** The parade: a pop song. chords are [degree, quality, key]; MELODY holds each section's tune as, per bar, [step, scale degree, length in steps]
   *  (degree 1 = the tonic in the octave above middle C, 0 = the note below it, 8 = the next tonic). Nothing here is random: a hook has to be the same each time. */
  const PARADE = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const chorus = k => [M(k, 0), M(k, 7), m(k, 9), M(k, 5), M(k, 0), M(k, 7), M(k, 5), M(k, 7)];                           // I V vi IV | I V IV V
    const verse = k => [m(k, 9), M(k, 5), M(k, 0), M(k, 7), m(k, 9), M(k, 5), M(k, 7), M(k, 7)];                            // vi IV I V | vi IV V V
    const sections = [
      { id: 'intro', bars: 4 }, { id: 'verse', bars: 8, round: 1 }, { id: 'chorus', bars: 8, round: 1 }, { id: 'verse', bars: 8, round: 2 },
      { id: 'chorus', bars: 8, round: 2 }, { id: 'bridge', bars: 8 }, { id: 'chorus', bars: 8, round: 3 }, { id: 'outro', bars: 4 }
    ];
    const chords = [
      M(0, 0), M(0, 7), m(0, 9), M(0, 5),
      ...verse(0), ...chorus(0), ...verse(0), ...chorus(0),
      M(0, 5), M(0, 7), m(0, 4), m(0, 9), M(0, 5), M(0, 7), m(0, 9), M(0, 9),                                               // bridge: IV V iii vi | IV V vi, and an A major that leans into D
      ...chorus(2),                                                                                                          // the last chorus, a whole step up
      M(2, 0), M(2, 7), M(2, 5), M(2, 0)
    ];
    const MELODY = {
      chorus: [[[0, 5, 2], [2, 5, 1], [3, 6, 1], [4, 5, 2], [6, 3, 2]], [[0, 2, 2], [2, 2, 1], [3, 3, 1], [4, 2, 2], [6, 0, 2]],
        [[0, 3, 2], [2, 3, 1], [3, 5, 1], [4, 6, 2], [6, 5, 2]], [[0, 4, 2], [2, 3, 1], [3, 2, 1], [4, 1, 4]],
        [[0, 5, 2], [2, 5, 1], [3, 6, 1], [4, 8, 2], [6, 6, 2]], [[0, 7, 2], [2, 7, 1], [3, 6, 1], [4, 5, 2], [6, 2, 2]],
        [[0, 6, 2], [2, 5, 1], [3, 4, 1], [4, 3, 2], [6, 4, 2]], [[0, 5, 4], [4, 2, 2], [6, 5, 2]]],
      verse: [[[0, 5, 3], [4, 3, 1], [5, 5, 1], [6, 6, 2]], [[0, 6, 3], [4, 5, 1], [5, 3, 1], [6, 4, 2]], [[0, 5, 3], [4, 3, 1], [5, 2, 1], [6, 3, 2]], [[0, 2, 3], [4, 0, 1], [5, 2, 1], [6, 3, 2]],
        [[0, 5, 3], [4, 3, 1], [5, 5, 1], [6, 6, 2]], [[0, 8, 3], [4, 6, 1], [5, 5, 1], [6, 6, 2]], [[0, 5, 3], [4, 4, 1], [5, 3, 1], [6, 2, 2]], [[0, 2, 2], [2, 3, 1], [3, 4, 1], [4, 5, 4]]],
      bridge: [[[0, 8, 4], [4, 6, 4]], [[0, 7, 4], [4, 5, 4]], [[0, 5, 4], [4, 7, 4]], [[0, 6, 8]], [[0, 6, 4], [4, 8, 4]], [[0, 9, 4], [4, 7, 4]], [[0, 8, 2], [2, 10, 2], [4, 9, 4]], [[0, 3, 6], [6, 2, 2]]],
      outro: [[[0, 5, 2], [2, 3, 2], [4, 5, 4]], [[0, 2, 2], [2, 3, 2], [4, 2, 4]], [[0, 4, 2], [2, 3, 2], [4, 2, 4]], [[0, 1, 8]]]
    };
    const where = bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
    const total = chords.length, BASE = 60 / 104 / 2;                                                                      // a mild 104 bpm; the step is an eighth note
    return { sections, chords, MELODY, where, bars: total, stepDur: bi => BASE * (bi >= total - 2 ? 1 + 0.25 * (bi - (total - 3)) : 1) };       // (the last two bars ease off)
  })();
  /** The dance track: like the parade, the tune is fixed (see PARADE). 124 bpm; the step is an eighth, so the beat is every second step. */
  const DANCE = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const loop = k => [m(k, 9), M(k, 5), M(k, 0), M(k, 7)];                                                                  // vi IV I V
    const sections = [{ id: 'intro', bars: 8 }, { id: 'drop', bars: 16, round: 1 }, { id: 'breakdown', bars: 8 }, { id: 'build', bars: 8 }, { id: 'drop', bars: 16, round: 2 }, { id: 'outro', bars: 8 }];
    const chords = [
      M(7, 0), M(7, 7), m(7, 9), M(7, 5), M(7, 0), M(7, 7), m(7, 9), M(7, 5),
      ...loop(7), ...loop(7), ...loop(7), ...loop(7),
      ...loop(7), ...loop(7),
      ...loop(7), m(7, 9), M(7, 5), M(7, 7), M(7, 7),
      ...loop(9), ...loop(9), ...loop(9), ...loop(9),                                                                        // the second drop, a whole step up
      M(9, 0), M(9, 7), m(9, 9), M(9, 5), M(9, 0), M(9, 5), M(9, 7), M(9, 0)
    ];
    const HOOK = [[[0, 5, 1], [1, 5, 1], [3, 5, 1], [4, 6, 2], [6, 5, 1], [7, 3, 1]], [[0, 3, 1], [1, 3, 1], [3, 3, 1], [4, 5, 2], [6, 4, 1], [7, 3, 1]],
      [[0, 1, 1], [1, 1, 1], [3, 1, 1], [4, 3, 2], [6, 2, 1], [7, 1, 1]], [[0, 2, 2], [2, 3, 1], [3, 5, 1], [4, 6, 2], [6, 5, 2]],
      [[0, 8, 1], [1, 8, 1], [3, 8, 1], [4, 7, 2], [6, 6, 1], [7, 5, 1]], [[0, 6, 1], [1, 6, 1], [3, 6, 1], [4, 5, 2], [6, 4, 1], [7, 5, 1]],
      [[0, 3, 1], [1, 5, 1], [3, 8, 2], [5, 7, 1], [6, 5, 2]], [[0, 5, 2], [2, 6, 1], [3, 7, 1], [4, 8, 4]]];
    const MELODY = {
      drop: HOOK, intro: [[], [], [], [], [], [], [], HOOK[3]], outro: [[[0, 5, 1], [1, 5, 1], [3, 5, 1], [4, 6, 4]], [[0, 3, 1], [1, 3, 1], [3, 3, 1], [4, 5, 4]], [[0, 1, 1], [1, 1, 1], [3, 1, 1], [4, 3, 4]], [[0, 2, 8]], [[0, 1, 8]], [], [], []],
      breakdown: [[[0, 5, 4], [4, 6, 4]], [[0, 5, 4], [4, 3, 4]], [[0, 3, 4], [4, 5, 4]], [[0, 6, 8]], [[0, 8, 4], [4, 7, 4]], [[0, 6, 4], [4, 5, 4]], [[0, 5, 4], [4, 8, 4]], [[0, 5, 8]]],
      build: [[[0, 5, 1], [2, 5, 1], [4, 6, 2]], [[0, 3, 1], [2, 3, 1], [4, 5, 2]], [[0, 1, 1], [2, 1, 1], [4, 3, 2]], [[0, 2, 2], [4, 5, 2]], [[0, 5, 1], [1, 5, 1], [2, 5, 1], [3, 5, 1], [4, 6, 1], [5, 6, 1], [6, 6, 1], [7, 6, 1]], [], [], []]
    };
    const where = bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
    const total = chords.length, BASE = 60 / 124 / 2;
    return { sections, chords, MELODY, where, bars: total, stepDur: bi => BASE * (bi >= total - 2 ? 1 + 0.2 * (bi - (total - 3)) : 1) };
  })();
  /** The harmony anthem: a song with a fixed, original tune (see PARADE for the notation). 120 bpm, so a step (an eighth) is a quarter of a second. */
  const HARMONY = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const verse = k => [M(k, 0), m(k, 9), M(k, 5), M(k, 7), M(k, 0), m(k, 9), M(k, 5), M(k, 7)];
    const pre = k => [M(k, 5), M(k, 7), m(k, 9), M(k, 7)];
    const chorus = k => [M(k, 0), M(k, 5), m(k, 9), M(k, 7), M(k, 0), M(k, 5), M(k, 7), M(k, 0)];
    const bridge = k => [m(k, 9), M(k, 5), M(k, 0), M(k, 7), m(k, 9), M(k, 5), M(k, 7), M(k, 7)];
    const sections = [
      { id: 'intro', bars: 4 }, { id: 'verse', bars: 8, round: 1 }, { id: 'pre', bars: 4, round: 1 }, { id: 'chorus', bars: 8, round: 1 }, { id: 'verse', bars: 8, round: 2 },
      { id: 'pre', bars: 4, round: 2 }, { id: 'chorus', bars: 8, round: 2 }, { id: 'bridge', bars: 8 }, { id: 'pre', bars: 4, round: 3 }, { id: 'chorus', bars: 8, round: 3 }, { id: 'outro', bars: 4 }
    ];
    const chords = [
      M(5, 0), M(5, 7), m(5, 9), M(5, 5),
      ...verse(5), ...pre(5), ...chorus(5), ...verse(5), ...pre(5), ...chorus(5), ...bridge(5),
      ...pre(7), ...chorus(7),                                                                                               // the last chorus, a whole step up
      M(7, 0), M(7, 5), M(7, 0), M(7, 0)
    ];
    const MELODY = {
      verse: [[[0, 3, 1], [2, 5, 1], [3, 3, 1], [4, 5, 1], [6, 6, 2]], [[0, 6, 1], [2, 5, 1], [3, 3, 1], [4, 1, 1], [6, 3, 2]], [[0, 4, 1], [2, 6, 1], [3, 4, 1], [4, 6, 1], [6, 8, 2]], [[0, 7, 1], [2, 6, 1], [3, 5, 1], [4, 4, 1], [6, 2, 2]],
        [[0, 3, 1], [2, 5, 1], [3, 3, 1], [4, 5, 1], [6, 8, 2]], [[0, 6, 1], [2, 8, 1], [3, 6, 1], [4, 5, 1], [6, 3, 2]], [[0, 4, 1], [2, 6, 1], [3, 8, 1], [4, 9, 1], [6, 8, 2]], [[0, 7, 2], [2, 5, 2], [4, 2, 1], [5, 4, 1], [6, 7, 2]]],
      pre: [[[0, 6, 2], [2, 6, 1], [3, 6, 1], [4, 8, 4]], [[0, 7, 2], [2, 7, 1], [3, 7, 1], [4, 9, 4]], [[0, 8, 2], [2, 8, 1], [3, 8, 1], [4, 10, 4]], [[0, 9, 1], [1, 8, 1], [2, 7, 1], [3, 6, 1], [4, 5, 4]]],
      chorus: [[[0, 8, 2], [2, 8, 1], [3, 9, 1], [4, 8, 2], [6, 5, 2]], [[0, 6, 2], [2, 6, 1], [3, 8, 1], [4, 6, 2], [6, 4, 2]], [[0, 6, 2], [2, 6, 1], [3, 8, 1], [4, 9, 2], [6, 8, 2]], [[0, 7, 6], [6, 5, 1], [7, 7, 1]],
        [[0, 8, 2], [2, 8, 1], [3, 9, 1], [4, 10, 2], [6, 9, 2]], [[0, 8, 2], [2, 6, 1], [3, 8, 1], [4, 6, 2], [6, 4, 2]], [[0, 5, 2], [2, 7, 1], [3, 8, 1], [4, 9, 2], [6, 7, 2]], [[0, 8, 6]]],
      bridge: [[[0, 5, 4], [4, 6, 4]], [[0, 6, 4], [4, 8, 4]], [[0, 8, 4], [4, 7, 4]], [[0, 6, 8]], [[0, 5, 4], [4, 6, 4]], [[0, 8, 4], [4, 9, 4]], [[0, 9, 4], [4, 8, 4]], [[0, 7, 8]]],
      outro: [[[0, 8, 2], [2, 6, 2], [4, 5, 4]], [[0, 6, 2], [2, 4, 2], [4, 6, 4]], [[0, 5, 2], [2, 3, 2], [4, 5, 4]], [[0, 8, 8]]],
      intro: [[], [], [], [[0, 8, 2], [2, 8, 1], [3, 9, 1]]]
    };
    const where = bi => { let idx = bi, first = 0; for (const sec of sections) { if (idx < sec.bars) return { sec, idx, first }; idx -= sec.bars; first += sec.bars; } return null; };
    const total = chords.length, BASE = 60 / 120 / 2;
    return { sections, chords, MELODY, where, bars: total, stepDur: bi => BASE * (bi >= total - 2 ? 1 + 0.2 * (bi - (total - 3)) : 1) };
  })();
  /** The three everyday tunes, each a 16-bar loop with a FIXED melody (see PARADE for the notation): an A part of 8 bars and a B part of 8. */
  const MEADOW = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const sections = [{ id: 'a', bars: 8 }, { id: 'b', bars: 8 }];
    const chords = [M(2, 0), M(2, 7), m(2, 9), M(2, 5), M(2, 0), M(2, 5), M(2, 7), M(2, 0),   M(2, 5), M(2, 0), M(2, 7), m(2, 9), M(2, 5), M(2, 0), M(2, 7), M(2, 0)];
    const MELODY = {
      a: [[[0, 5, 3], [4, 3, 1], [5, 5, 1], [6, 6, 2]], [[0, 5, 3], [4, 4, 1], [5, 3, 1], [6, 2, 2]], [[0, 6, 3], [4, 5, 1], [5, 3, 1], [6, 5, 2]], [[0, 4, 3], [4, 3, 1], [5, 2, 1], [6, 1, 2]],
        [[0, 3, 2], [2, 5, 2], [4, 8, 3], [7, 7, 1]], [[0, 6, 3], [4, 4, 1], [5, 6, 1], [6, 8, 2]], [[0, 7, 3], [4, 5, 1], [5, 4, 1], [6, 2, 2]], [[0, 3, 4], [4, 1, 4]]],
      b: [[[0, 8, 3], [4, 6, 1], [5, 8, 1], [6, 9, 2]], [[0, 8, 3], [4, 5, 1], [5, 6, 1], [6, 8, 2]], [[0, 7, 3], [4, 5, 1], [5, 7, 1], [6, 8, 2]], [[0, 6, 3], [4, 5, 1], [5, 3, 1], [6, 5, 2]],
        [[0, 4, 2], [2, 6, 2], [4, 8, 3], [7, 9, 1]], [[0, 8, 3], [4, 6, 1], [5, 5, 1], [6, 3, 2]], [[0, 2, 2], [2, 4, 2], [4, 5, 2], [6, 7, 2]], [[0, 8, 6]]]
    };
    const BASE = 60 / 92 / 2;
    return { sections, chords, MELODY, where: whereIn(sections), bars: chords.length, stepDur: () => BASE };
  })();
  const GLOOM = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const sections = [{ id: 'a', bars: 8 }, { id: 'b', bars: 8 }];
    const chords = [m(0, 0), M(0, 8), M(0, 3), M(0, 10), m(0, 0), m(0, 5), m(0, 7), M(0, 7),   M(0, 8), M(0, 3), M(0, 10), m(0, 5), m(0, 0), M(0, 8), M(0, 7), m(0, 0)];
    const MELODY = {
      a: [[[0, 5, 4], [4, 3, 2], [6, 2, 2]], [[0, 3, 4], [4, 5, 2], [6, 3, 2]], [[0, 5, 4], [4, 7, 2], [6, 5, 2]], [[0, 4, 4], [4, 2, 4]],
        [[0, 5, 4], [4, 8, 2], [6, 7, 2]], [[0, 6, 4], [4, 4, 2], [6, 6, 2]], [[0, 5, 2], [2, 7, 2], [4, 5, 4]], [[0, 2, 4], [4, 5, 4]]],
      b: [[[0, 8, 4], [4, 6, 2], [6, 8, 2]], [[0, 7, 4], [4, 5, 2], [6, 3, 2]], [[0, 7, 4], [4, 4, 2], [6, 2, 2]], [[0, 6, 4], [4, 4, 4]],
        [[0, 5, 4], [4, 3, 2], [6, 5, 2]], [[0, 6, 4], [4, 8, 4]], [[0, 5, 4], [4, 2, 4]], [[0, 3, 4], [4, 1, 4]]]
    };
    const BASE = 60 / 66 / 2;
    return { sections, chords, MELODY, where: whereIn(sections), bars: chords.length, stepDur: () => BASE };
  })();
  const GALLOP = (() => {
    const M = (key, deg) => [deg, 'M', key], m = (key, deg) => [deg, 'm', key];
    const sections = [{ id: 'a', bars: 8 }, { id: 'b', bars: 8 }];
    const chords = [m(2, 0), M(2, 8), M(2, 3), M(2, 10), m(2, 0), m(2, 5), M(2, 7), M(2, 7),   M(2, 8), M(2, 3), M(2, 10), m(2, 0), M(2, 8), M(2, 3), M(2, 10), M(2, 7)];
    const MELODY = {
      a: [[[0, 5, 2], [2, 5, 1], [3, 6, 1], [4, 5, 2], [6, 3, 2]], [[0, 6, 2], [2, 6, 1], [3, 8, 1], [4, 6, 2], [6, 4, 2]], [[0, 3, 2], [2, 5, 1], [3, 8, 1], [4, 5, 2], [6, 3, 2]], [[0, 7, 2], [2, 5, 1], [3, 3, 1], [4, 5, 4]],
        [[0, 5, 2], [2, 5, 1], [3, 6, 1], [4, 8, 2], [6, 5, 2]], [[0, 4, 2], [2, 6, 1], [3, 4, 1], [4, 2, 2], [6, 4, 2]], [[0, 5, 2], [2, 2, 2], [4, 8, 2], [6, 5, 2]], [[0, 5, 4], [4, 2, 2], [6, 5, 2]]],
      b: [[[0, 6, 2], [2, 8, 2], [4, 10, 4]], [[0, 10, 2], [2, 8, 2], [4, 10, 4]], [[0, 9, 2], [2, 7, 2], [4, 9, 4]], [[0, 8, 4], [4, 5, 4]],
        [[0, 6, 2], [2, 8, 2], [4, 10, 4]], [[0, 10, 2], [2, 12, 2], [4, 10, 4]], [[0, 9, 2], [2, 7, 2], [4, 5, 4]], [[0, 5, 4], [4, 2, 2], [6, 5, 2]]]
    };
    const BASE = 0.145;
    return { sections, chords, MELODY, where: whereIn(sections), bars: chords.length, stepDur: () => BASE };
  })();
  const FORMS = { calm: MEADOW, storm: GLOOM, battle: GALLOP, tempest: TEMPEST, parade: PARADE, dance: DANCE, harmony: HARMONY };
  /** A scale position (0 = E4, seven to the octave) as a MIDI note. */
  const posNote = p => 64 + 12 * Math.floor(p / 7) + HARMONIC[((p % 7) + 7) % 7];
  const FULL_CHANCE = 0.12;                                                                         // the chance, at the end of each ambient loop, that the real tune plays
  /** The ambient loop: 16 bars of 4 seconds (a chord every two bars), so a minute and four seconds. Its chords come from the tune's own. */
  const AMB_FORM = { bars: 16, stepDur: () => 0.5, where: bi => ({ sec: { id: 'amb', bars: 16 }, idx: bi, first: 0 }) };
  const AMB = {
    calm: { gain: 1.1, form: MEADOW, key: 2, minor: false, pad: { cutoff: 1000, tremolo: 3.5, depth: 0.2 }, drone: 0.5, bell: 0.16, harp: 0.2, flute: 0.05, pizz: 0.05, spark: 0.5, gliss: 0.25 },
    storm: { gain: 1, form: GLOOM, key: 0, minor: true, pad: { cutoff: 600, tremolo: 5, depth: 0.5 }, drone: 0.9, bell: 0.05, harp: 0.06, flute: 0.03, violin: 0.03, toll: true, drumRoll: 0.35, wind: 0.6, spark: 0.25 },
    tempest: { gain: 1, form: TEMPEST, key: 4, minor: true, pad: { cutoff: 800, tremolo: 6, depth: 0.5 }, drone: 0.8, bell: 0.05, harp: 0.05, violin: 0.05, heart: true, wind: 0.8, spark: 0.3 },
    battle: { gain: 1.05, form: GALLOP, key: 2, minor: true, pad: { cutoff: 900, tremolo: 8, depth: 0.5 }, drone: 0.8, bell: 0.05, harp: 0.06, violin: 0.03, pulse: true, wind: 0.4, spark: 0.2 },
    parade: { gain: 1.1, form: PARADE, key: 0, minor: false, pad: { cutoff: 1300, tremolo: 4, depth: 0.2 }, drone: 0.4, bell: 0.2, harp: 0.25, flute: 0.05, pizz: 0.06, spark: 0.5, gliss: 0.3 },
    dance: { gain: 1.6, form: DANCE, key: 7, minor: false, pad: { cutoff: 1400, tremolo: 5, depth: 0.25 }, drone: 0.4, bell: 0.2, harp: 0.2, flute: 0.04, synth: 0.12, tick: 0.12, spark: 0.5, gliss: 0.3 },
    harmony: { gain: 1.3, form: HARMONY, key: 5, minor: false, pad: { cutoff: 1300, tremolo: 4, depth: 0.2 }, drone: 0.4, bell: 0.22, harp: 0.24, flute: 0.05, pizz: 0.08, spark: 0.55, gliss: 0.3 }
  };
  const HOSTILE_RANGE = 11, HOLD_BATTLE = 7, HOLD_STORM = 5, HOLD_TEMPEST = 8;                           // tiles; seconds the mood lingers after the cause is gone

  let flute = null, harp = null, hall = null;
  const wave = (ctx, partials) => { const re = new Float32Array(partials.length + 1), im = new Float32Array(partials.length + 1); partials.forEach((a, i) => { im[i + 1] = a; }); return ctx.createPeriodicWave(re, im); };
  const fluteWave = ctx => flute || (flute = wave(ctx, [1, 0.28, 0.07, 0.03]));         // mostly the fundamental: a soft, hollow tube
  const harpWave = ctx => harp || (harp = wave(ctx, [1, 0.5, 0.26, 0.13, 0.07, 0.03]));  // a plucked string: bright first, rounder as it dies
  /** The hall: a synthetic impulse response, noise that fades over about three seconds, so everything sounds as if played in a stone chamber. */
  const hallResponse = ctx => {
    if (hall) return hall;
    const secs = 3.2, n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return (hall = buf);
  };

  class Music {
    constructor() {
      this.ctx = null; this.timer = 0; this.nextTime = 0; this.step = 0; this.bar = 0;
      Music.current = this; this.forced = ''; this.forcedAmb = false; this.fullNow = false; this._passed = -1; this._cycle = 8;       // forced: a track picked in the Soundtrack player ('' = follow the game)
      this.theme = 'calm'; this.mood = { night: 0, indoors: 0, cave: 0 }; this.hurtT = 0; this.lastHp = null; this.battleT = 0; this.stormT = 0; this.tempestT = 0; this.lines = { a: [], b: [] }; this.cpos = -3; this.marks = []; this.paused = false; this.pausePos = 0; this.last = 0;
      GameAudio.onReady(ctx => { this.ctx = ctx; this._build(); });
    }

    _build() {
      const ctx = this.ctx, g = v => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.room = ctx.createBiquadFilter(); this.room.type = 'lowpass'; this.room.frequency.value = 20000;                // muffled indoors
      this.gate = g(1); this.fade = g(0); this.room.connect(this.gate); this.gate.connect(this.fade); this.fade.connect(GameAudio.buses.music);            // (the gate is the player's pause)
      this.fade.gain.setTargetAtTime(0.45, ctx.currentTime + 1.5, 2.5);                                                   // (the music drifts in)
      const verb = ctx.createConvolver(); verb.buffer = hallResponse(ctx); const wet = g(0.55); verb.connect(wet); wet.connect(this.room);
      this.buses = {}; this.pumps = {};                                                                                   // one bus per tune, so a tune can fade while the next begins (and a pump after it, for the dance track's ducking)
      for (const name in THEMES) { const b = g(name === this.theme ? THEMES[name].level : 0), pump = g(1); b.connect(pump); pump.connect(this.room); pump.connect(verb); this.buses[name] = b; this.pumps[name] = pump; }
      this.bus = this.buses[this.theme];
      this.nextTime = ctx.currentTime + 2; this.step = 0; this.bar = 0;
      this.timer = setInterval(() => this._schedule(), 120);
    }

    /** What is the mood right now? A hostile creature near you (or one lately, or you being hurt) and any cave or dungeon is BATTLE; a storm is STORM. */
    _sense(game, weather, dt) {
      const p = game.local, kind = game.map.kind;
      if (this.forced) return this.forced;
      if (p) {
        if (this.lastHp !== null && p.hp < this.lastHp - 0.5) this.hurtT = HOLD_BATTLE;
        this.lastHp = p.hp;
        const animals = game.latestAnimals();
        for (const id in animals) {
          const a = animals[id], d = AnimalDefs[a.type];
          if (d && (d.hostile || d.boss) && !(a.hp <= 0) && Math.hypot(a.x - p.x, a.y - p.y) < HOSTILE_RANGE) { this.battleT = HOLD_BATTLE; break; }
        }
      }
      this.battleT = Math.max(0, this.battleT - dt); this.hurtT = Math.max(0, this.hurtT - dt);
      const stormy = weather.lightning > 0.25 || weather.rain > 0.85 || weather.wind > 0.8;
      this.stormT = stormy ? HOLD_STORM : Math.max(0, this.stormT - dt);
      const fierce = weather.lightning > 0.5 || (weather.rain > 0.8 && weather.wind > 0.6);                          // a thunderstorm
      this.tempestT = fierce ? HOLD_TEMPEST : Math.max(0, this.tempestT - dt);
      if (kind === 'cave' || kind === 'dungeon' || this.battleT > 0 || this.hurtT > 0) return 'battle';
      return this.tempestT > 0 ? 'tempest' : this.stormT > 0 ? 'storm' : 'calm';
    }

    /** The Soundtrack player: play one track until told otherwise (it starts from its beginning), or give the choice back to the game. */
    play(id) { if (!THEMES[id]) return; this.forced = id; if (this.paused) this.resume(); if (this.ctx && this.fade) this._switchTo(id, this.ctx.currentTime); }
    auto() { this.forced = ''; this.fullNow = false; }
    /** Is the ambient version of the tune sounding? In Auto, nearly always; for a track picked in the player, only if Ambient is on. */
    get ambient() { return this.forced ? this.forcedAmb : !this.fullNow; }
    _formOf(name) { return name === this.theme && this.ambient ? AMB_FORM : FORMS[name]; }
    /** Ambient mode for a picked track (restarts it). */
    setAmbient(on) { this.forcedAmb = !!on; if (this.forced && this.ctx && this.fade) this._switchTo(this.theme, this.ctx.currentTime); }
    /* ---- the player: skip, scrub, pause. Every tune is a cycle of bars (the calm, storm and battle tunes: 8 bars; the tempest: its whole form),
     * so a position in it is seconds into the cycle, and seeking starts the bar that second falls in. ---- */
    _table(name = this.theme) {
      const form = this._formOf(name), starts = []; let at = 0;
      for (let i = 0; i < form.bars; i++) { starts.push(at); at += 8 * form.stepDur(i); }
      return { starts, total: at, bars: form.bars };
    }
    /** Length of the playing tune's cycle, in seconds. */
    length() { return this._table().total; }
    /** Seconds into the cycle that is sounding now. */
    position() {
      if (!this.ctx) return 0; if (this.paused) return this.pausePos;
      const now = this.ctx.currentTime, tbl = this._table();
      for (let i = this.marks.length - 1; i >= 0; i--) { const m = this.marks[i]; if (m.t <= now) return Math.min(tbl.total, tbl.starts[m.bar] + now - m.t); }
      return 0;
    }
    /** Jump to a second of the cycle (it begins at the start of that bar). */
    seek(sec) {
      if (!this.ctx || !this.fade) return;
      const tbl = this._table(), name = this.theme, th = THEMES[name], B = th.bar, now = this.ctx.currentTime;
      let bi = 0; for (let i = 0; i < tbl.bars; i++) if (tbl.starts[i] <= sec) bi = i;
      this.step = bi * B; this.bar = bi; this.marks = []; this.pausePos = tbl.starts[bi];
      const level = th.level; this.bus.gain.cancelScheduledValues(now); this.bus.gain.setTargetAtTime(0, now, 0.03); this.bus.gain.setTargetAtTime(level, now + 0.22, 0.05);       // (a quick dip hides the cut)
      this.nextTime = now + 0.3;
    }
    /** Skip to the next (dir 1) or previous (dir -1) track; it starts from its beginning and stays until Auto. */
    skip(dir) {
      const ids = Music.TRACKS.map(t => t.id), i = Math.max(0, ids.indexOf(this.forced || this.theme));
      this.play(ids[(i + dir + ids.length) % ids.length]);
    }
    pause() { if (!this.ctx || this.paused) return; this.pausePos = this.position(); this.paused = true; this.gate.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04); }
    resume() { if (!this.ctx || !this.paused) return; this.paused = false; this.marks = []; this.gate.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05); this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.25); }
    /** The title of the tune playing now. */
    get title() { return THEMES[this.theme].title + (this.ambient ? ' \u2013 ambient' : ''); }

    /** Called every frame with the game and the weather layers being shown. */
    update(game, weather) {
      if (!this.ctx || !this.fade) return;
      const now = this.ctx.currentTime, dt = Math.min(0.25, now - (this.last || now)); this.last = now;
      const hour = game.hour(), kind = game.map.kind, m = this.mood;
      m.night = hour >= 21 || hour < 5.5 ? 1 : 0; m.indoors = kind === 'room' ? 1 : 0; m.cave = kind === 'cave' || kind === 'dungeon' ? 1 : 0;
      const want = this._sense(game, weather, dt);
      if (want !== this.theme) this._switchTo(want, now);
      const level = (1 - weather.rain * 0.15) * (m.night && this.theme === 'calm' ? 0.8 : 1);
      this.fade.gain.setTargetAtTime(0.45 * level, now, 1.2);
      this.room.frequency.setTargetAtTime(m.cave ? 4200 : m.indoors ? 2800 : 20000, now, 0.6);
    }

    _switchTo(name, now) {
      const from = THEMES[this.theme], to = THEMES[name];
      this.buses[this.theme].gain.setTargetAtTime(0, now, from.fadeOut / 3); this.pumps[this.theme].gain.cancelScheduledValues(now); this.pumps[this.theme].gain.setValueAtTime(1, now);
      this.buses[name].gain.setTargetAtTime(to.level, now + 0.05, to.fadeIn / 3);
      this.theme = name; this.bus = this.buses[name];
      this.step = 0; this.bar = 0; this.fullNow = false; this._passed = -1; this.marks = []; this.pausePos = 0; this.nextTime = Math.max(this.nextTime, now + 0.2);      // (the new tune starts on its first bar)
    }

    /* ---- the players ---- */
    /** A slow vibrato on a pitch (fades in after `delay`), as a player's hand or breath would add. */
    _vibrato(t, params, hz, depth, rate, delay, stop) {
      const ctx = this.ctx, lfo = ctx.createOscillator(), amt = ctx.createGain();
      lfo.frequency.value = rate; amt.gain.setValueAtTime(0, t); amt.gain.setValueAtTime(0, t + delay); amt.gain.linearRampToValueAtTime(hz * depth, t + delay + 0.5);
      lfo.connect(amt); for (const p of params) amt.connect(p); lfo.start(t); lfo.stop(stop);
    }
    /** The flute: a soft sine with a puff of breath at the start and a little vibrato on longer notes. `breath` makes it huskier. */
    _flute(t, note, len, vel, breath = 1) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), hz = midi(note), end = t + len + 0.3, short = len < 0.5;
      o.setPeriodicWave(fluteWave(ctx)); o.frequency.setValueAtTime(hz * 0.985, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.07);       // (a breath-onset scoop)
      const attack = short ? 0.03 : 0.09;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * vel, t + attack); g.gain.setTargetAtTime(0.075 * vel, t + attack + 0.01, 0.25); g.gain.setTargetAtTime(0.0001, t + len, short ? 0.04 : 0.09);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(end); if (!short) this._vibrato(t, [o.frequency], hz, 0.0045, 5.3, 0.25, end);
      const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();                                                    // the breath
      n.buffer = GameAudio.noise(); nf.type = 'bandpass'; nf.frequency.value = Math.min(hz * 2.5, 9000); nf.Q.value = 1.2;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.05 * vel * breath, t + 0.04); ng.gain.setTargetAtTime(0.008 * vel * breath, t + 0.06, 0.12); ng.gain.setTargetAtTime(0.0001, t + len, 0.08);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, len + 0.5);
    }
    /** One harp string: a bright pluck that rings and fades; lower strings ring longer. `ringScale` lengthens or shortens the ring. */
    _harp(t, note, vel, ringScale = 1) {
      const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), ring = clamp(2.8 - (note - 40) / 30, 0.8, 2.6) * ringScale;
      o.setPeriodicWave(harpWave(ctx)); o.frequency.value = midi(note);
      f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.4); f.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085 * vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.01, ring / 5);
      o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + ring + 0.2);
    }
    /** The cello: a bowed sawtooth pair through a low-pass that opens as the bow swells, with a slow vibrato. Short notes are sharp, bitten strokes. */
    _cello(t, note, len, vel) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.8, oscs = [], short = len < 0.6;
      for (const detune of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); oscs.push(o); }
      f.type = 'lowpass'; f.Q.value = 0.8;
      if (short) { f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(500, t + len); } else { f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(900, t + len * 0.5); f.frequency.linearRampToValueAtTime(420, t + len); }
      const peak = 0.055 * vel, attack = short ? 0.015 : 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, len - 0.2)); g.gain.setTargetAtTime(0.0001, t + len, short ? 0.05 : 0.25);
      f.connect(g); g.connect(this.bus); if (!short) this._vibrato(t, oscs.map(o => o.frequency), hz, 0.004, 4.6, 0.6, end);
    }
    /** Strings holding a chord: sawtooths behind a low-pass, swelling in, shivering with a tremolo (faster = more urgent). */
    _pad(t, notes, len, vel, { cutoff = 1200, tremolo = 6, depth = 0.35, attack = 0.7 } = {}) {
      const ctx = this.ctx, f = ctx.createBiquadFilter(), env = ctx.createGain(), trem = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(), end = t + len + 1;
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.6;
      for (const n of notes) for (const detune of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); }
      env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.022 * vel, t + attack); env.gain.setValueAtTime(0.022 * vel, t + Math.max(attack, len - 0.3)); env.gain.setTargetAtTime(0.0001, t + len, 0.3);
      trem.gain.value = 1 - depth / 2; lfo.frequency.value = tremolo; lg.gain.value = depth / 2; lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(end);
      f.connect(env); env.connect(trem); trem.connect(this.bus);
    }
    /** A violin: two slightly detuned sawtooths behind a low-pass, bowed (slow attack) or spiccato (short), panned to one side; `dark` is the lower, huskier one. */
    _violin(t, note, len, vel, pan = 0, dark = false, glide = false) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.4, oscs = [], short = len < 0.35;
      for (const detune of [-8, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); oscs.push(o);
        if (glide) { o.frequency.setValueAtTime(hz, t + len * 0.15); o.frequency.exponentialRampToValueAtTime(hz * 0.5, t + len); } }                    // (a note that drops away: it sags an octave as it fades)
      f.type = 'lowpass'; f.frequency.setValueAtTime(dark ? 2300 : 3600, t); f.Q.value = 0.9;
      const peak = 0.05 * vel, attack = short ? 0.012 : 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + Math.max(attack, glide ? len * 0.5 : len - 0.05)); g.gain.setTargetAtTime(0.0001, t + (glide ? len * 0.98 : len), short ? 0.03 : glide ? 0.2 : 0.12);
      f.connect(g); let tail = g;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
      tail.connect(this.bus); if (!short) this._vibrato(t, oscs.map(o => o.frequency), hz, 0.006, 6.1, 0.2, end);
    }
    /** A round bass: a triangle with a touch of the octave above, plucked. */
    _bass(t, note, len, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), hi = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = midi(note); o2.type = 'sine'; o2.frequency.value = midi(note + 12); hi.gain.value = 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.012); g.gain.setTargetAtTime(0.14 * vel, t + 0.03, 0.12); g.gain.setTargetAtTime(0.0001, t + len, 0.04);
      o.connect(g); o2.connect(hi); hi.connect(g); g.connect(this.bus); o.start(t); o2.start(t); o.stop(t + len + 0.3); o2.stop(t + len + 0.3);
    }
    /** A hi-hat: a tick of bright noise (open = a longer wash). */
    _hat(t, vel, open = false) {
      const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), len = open ? 0.22 : 0.045;
      n.buffer = GameAudio.noise(); f.type = 'highpass'; f.frequency.value = 7000;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045 * vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.006, len / 4);
      n.connect(f); f.connect(g); g.connect(this.bus); n.start(t, Math.random() * 1.5, len + 0.1);
    }
    /** A bell / music box: two sine partials, struck and left to ring. */
    _bell(t, note, vel) {
      const ctx = this.ctx, hz = midi(note), g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vel, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.01, 0.35);
      for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) { const o = ctx.createOscillator(), a = ctx.createGain(); o.frequency.value = hz * mult; a.gain.value = amp; o.connect(a); a.connect(g); o.start(t); o.stop(t + 2.2); }
      g.connect(this.bus);
    }
    /** The pop lead: two detuned sawtooths behind a low-pass, plucked at the start, with a light vibrato on longer notes. */
    _synth(t, note, len, vel) {
      const ctx = this.ctx, hz = midi(note), f = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + len + 0.3, oscs = [];
      for (const detune of [-9, 9]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = detune; o.connect(f); o.start(t); o.stop(end); oscs.push(o); }
      f.type = 'lowpass'; f.Q.value = 1; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(1700, t + 0.18);
      const peak = 0.05 * vel;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.01); g.gain.setTargetAtTime(peak * 0.6, t + 0.02, 0.14); g.gain.setTargetAtTime(0.0001, t + len, 0.07);
      f.connect(g); g.connect(this.bus); if (len > 0.5) this._vibrato(t, oscs.map(o => o.frequency), hz, 0.004, 5.4, 0.25, end);
    }
    /** A dance kick: a sine that falls fast, with a click. */
    _kick(t, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.05, 0.07);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.45);
    }
    /** A clap: three quick bursts of mid noise. */
    _clap(t, vel) {
      const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
      for (const at of [0, 0.011, 0.023]) { const n = ctx.createBufferSource(), a = ctx.createGain(); n.buffer = GameAudio.noise(); a.gain.setValueAtTime(0.0001, t + at); a.gain.linearRampToValueAtTime(0.1 * vel, t + at + 0.002); a.gain.setTargetAtTime(0.0001, t + at + 0.004, at > 0.02 ? 0.04 : 0.012); n.connect(a); a.connect(f); n.start(t + at, Math.random() * 1.5, 0.3); }
      f.connect(g); g.gain.value = 1; g.connect(this.bus);
    }
    /** A riser: a wash of noise whose brightness and loudness climb over `len` seconds. */
    _riser(t, len, vel) {
      const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = GameAudio.noise(); n.loop = true; f.type = 'highpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(9000, t + len);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * vel, t + len); g.gain.setValueAtTime(0.0001, t + len + 0.02);
      n.connect(f); f.connect(g); g.connect(this.bus); n.start(t, 0); n.stop(t + len + 0.05);
    }
    /** Duck the whole mix as a kick lands and let it swell back (the "pump" of a dance mix). */
    _pump(t, depth) { const g = this.pumps[this.theme].gain; g.cancelScheduledValues(t); g.setValueAtTime(1 - depth, t); g.linearRampToValueAtTime(1, t + 0.2); }
    /** A pizzicato string: a short, round pluck. */
    _pizz(t, note, vel) {
      const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(note); f.type = 'lowpass'; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(450, t + 0.09); f.Q.value = 0.6;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * vel, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.008, 0.05);
      o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.4);
    }
    /** A harp glissando: a run up the scale of `key` (minor if asked), two octaves, each string a hair after the last. */
    _gliss(t, key, vel, minor = false) { const sc = minor ? MIN7 : MAJ7; for (let i = 0; i < 12; i++) this._harp(t + i * 0.04, 60 + key + 12 * Math.floor(i / 7) + sc[i % 7], vel * (0.45 + i / 24), 0.6); }
    /** A twinkle: six bells, quick, climbing the chord of `key` (a cold minor one if asked). */
    _sparkle(t, key, vel, minor = false) { (minor ? [0, 3, 7, 12, 15, 19] : [0, 4, 7, 12, 16, 19]).forEach((d, i) => this._bell(t + i * 0.055, 72 + key + d, vel * (0.5 + i / 12))); }
    /** Wind: a slow swell of filtered noise that rises and falls over `len` seconds. */
    _wind(t, len, vel) {
      const ctx = this.ctx, n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = GameAudio.noise(); n.loop = true; f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(900, t + len * 0.5); f.frequency.linearRampToValueAtTime(420, t + len);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1 * vel, t + len * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + len);
      n.connect(f); f.connect(g); g.connect(this.bus); n.start(t, Math.random() * 1.5); n.stop(t + len + 0.1);
    }
    /** A cymbal crash: a long wash of bright noise. */
    _crash(t, vel) {
      const ctx = this.ctx, n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = GameAudio.noise(); nf.type = 'highpass'; nf.frequency.value = 4200;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.1 * vel, t + 0.005); ng.gain.setTargetAtTime(0.0001, t + 0.02, 0.35);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 0.5, 1.8);
    }
    /** A war drum: a pitched thump that falls, with a puff of skin. */
    _drum(t, vel, deep = 1) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      o.frequency.setValueAtTime(115 / deep, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.006); g.gain.setTargetAtTime(0.0001, t + 0.02, 0.11 * deep);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.9);
      n.buffer = GameAudio.noise(); nf.type = 'lowpass'; nf.frequency.value = 420; ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.12 * vel, t + 0.004); ng.gain.setTargetAtTime(0.0001, t + 0.01, 0.04);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, 0.3);
    }
    /** A snare-like rattle: a short burst of mid noise. */
    _snare(t, vel) {
      const ctx = this.ctx, n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = GameAudio.noise(); nf.type = 'bandpass'; nf.frequency.value = 1900; nf.Q.value = 0.7;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.1 * vel, t + 0.004); ng.gain.setTargetAtTime(0.0001, t + 0.01, 0.04);
      n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random() * 1.5, 0.3);
    }

    /** One bar (8 racing sixteenths) for a duelling violin as scale positions of E harmonic minor: a fixed figure that rises and falls over the chord
     *  (the same four figures come round with the chords, so it is a tune you can learn, not a random run). voice 'a' sings high, 'b' lower and a
     *  figure behind. `cc` is the bar of the round, `rootDeg` the chord's root (semitones above the key). */
    _duelLine(voice, rootDeg, cc, lift, ending) {
      const FIG = [[0, 2, 4, 5, 4, 2, 4, 7], [4, 2, 0, 2, 4, 7, 5, 4], [7, 5, 4, 2, 4, 5, 7, 9], [4, 5, 7, 5, 4, 2, 0, 2]];
      const rootPos = HARMONIC.indexOf(rootDeg), base = voice === 'a' ? rootPos + 4 + lift : rootPos + lift, fig = FIG[(voice === 'a' ? cc : cc + 1) % 4];
      const out = fig.map(o => Math.min(17, base + o));
      if (ending) out[7] = null;
      return out;
    }

    /** The tempest, step by step. See TEMPEST for the form. */
    _scheduleTempest() {
      const ctx = this.ctx, KEY = THEMES.tempest.key, total = TEMPEST.bars;
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx, first } = TEMPEST.where(bi);
        const dur = TEMPEST.durOf(sec, idx), chord = TEMPEST.chords[bi], root = KEY + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const pcs = [root % 12, third % 12, fifth % 12], chordTones = [root + 48, third + 48, fifth + 48];
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        const skipRest = () => { this.nextTime += dur; this.step++; };
        if (sec.id === 'hush' || sec.id === 'rise' || sec.id === 'surge') {
          const e = (bi + s / 8) / 24;                                                                                          // e: how far the build-up has climbed, 0..1
          if (sec.id === 'hush') {
            if (s === 0) {
              this._cello(t, 36 + root, dur * 8, 0.6 + 0.4 * e);                                                              // the drone
              if (idx % 2 === 0) this._pad(t, [root + 48, fifth + 48], dur * 16, 0.7, { cutoff: 650, tremolo: 4.5, depth: 0.4, attack: 2.2 });
              this._drum(t, 0.4 + 0.4 * e, 1.8); this._drum(t + 0.27, 0.28 + 0.3 * e, 2);                                      // a heartbeat
              if (idx % 2 === 1) this._harp(t, root + 48, 0.5, 1.6);
              if (idx === 0 || idx === 4) this._sparkle(t + 0.5, root, 0.35, true);                                            // a cold twinkle
              if (idx === 2 || idx === 6) this._violin(t, posNote(idx === 2 ? 11 : 12), dur * 8, 0.45, -0.3, true);            // one long, aching note, then a half-step higher
            }
          } else if (sec.id === 'rise') {
            if (s === 0) this._pad(t, chordTones, dur * 8, 0.8, { cutoff: 1100, tremolo: 7, depth: 0.5, attack: 1.4 });
            if (s % 2 === 0) this._drum(t, 0.35 + 0.35 * e, 1.4);
            this._cello(t, 36 + root, dur * 0.8, 0.45 + 0.4 * e);                                                              // a pulse in the dark
            if (s === 0 || s === 4) this._harp(t, [root + 48, fifth + 48][s / 4], 0.5, 0.9);
            this._violin(t, posNote(9 + idx), dur * 0.9, 0.2 + 0.25 * e, 0.3, true);                                           // a violin trembling higher with every bar
          } else {
            if (bi === 23 && s >= 4) { skipRest(); continue; }                                                                // a held breath before the storm breaks
            if (s === 0) this._pad(t, chordTones, bi === 23 ? dur * 4 : dur * 8, 1, { cutoff: 1500, tremolo: 8.5, depth: 0.5, attack: 0.5 });
            this._drum(t, 0.3 + 0.6 * e, 1.1);
            if (idx >= 6) this._snare(t, 0.35 + 0.45 * (s / 8)); else if (s % 4 === 2) this._snare(t, 0.4 + 0.3 * e);        // a snare roll into the drop
            this._cello(t, 36 + root + (s % 2 ? 12 : 0), dur * 0.85, 0.6 + 0.5 * e);
            this._harp(t, [root + 48, third + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72][s], 0.45 + 0.3 * e, 0.5);
            if (bi === 23 && s === 3) { this._violin(t, posNote(17), dur * 5, 0.9, -0.4, false, true); this._gliss(t, root, 0.7, true); }                         // the climb's last note does not land: it drops away
            else this._violin(t, posNote(10 + idx), dur * 0.9, 0.25 + 0.4 * e, -0.4);
            if (idx >= 4 && !(bi === 23 && s === 3)) this._violin(t, posNote(8 + idx), dur * 0.9, 0.2 + 0.3 * e, 0.4, true);   // a second joins, answering from the other side
          }
        } else if (sec.id === 'duel') {
          const cb = idx, rd = Math.floor(cb / 16), cc = cb % 16, boost = rd ? 1.1 : 1;                                       // rd: which round (the second duel has two)
          if (cc === 0 && s === 0) { this._crash(t, rd ? 0.7 : 1); this._drum(t, rd ? 1 : 1.3, 1.6); this._sparkle(t, root, 0.8, true); this._gliss(t, root, 0.6, true); }
          if (s === 0 || s === 4) this._drum(t, s === 0 ? 1 : 0.8, 1); else if (s === 6 && cc % 2) this._drum(t, 0.5, 1);
          if (s === 2 || s === 6) this._snare(t, 0.8);
          if (cc % 4 === 0 && s === 0) this._drum(t, 0.9, 2.2);                                                              // thunder under the phrase
          if (s % 2 === 0) this._cello(t, 36 + root + (s % 4 === 2 ? 12 : 0), dur * 1.7, 1);
          if (s === 0) this._pad(t, chordTones, dur * 8, 1, { cutoff: 2000, tremolo: 10, depth: 0.5, attack: 0.05 });
          this._harp(t, [root + 60, fifth + 60, root + 72, third + 72, fifth + 72, third + 72, root + 72, fifth + 60][s], 0.42, 0.35);
          if (s === 0) {                                                                                                     // who plays this bar? they trade 2 bars each, then bar by bar, then join (the roles swap in the second round)
            const x = cc < 8 ? cc % 4 < 2 : cc < 12 ? cc % 2 === 0 : true, y = cc < 8 ? cc % 4 >= 2 : cc < 12 ? cc % 2 === 1 : true;
            const a = rd ? y : x, b = rd ? x : y, lift = rd ? 1 : 0;
            this.lines.a = a ? this._duelLine('a', chord[0], cc, lift, cc === 15) : [];
            this.lines.b = b ? (cc >= 12 ? this.lines.a.map(p => p === null ? null : p - 2) : this._duelLine('b', chord[0], cc, lift, false)) : [];                      // (at the end B shadows A a third below)
          }
          const pa = this.lines.a[s], pb = this.lines.b[s];
          if (pa != null) this._violin(t, posNote(pa), dur * 0.95, 0.95 * boost, -0.5);
          if (pb != null) this._violin(t, posNote(pb), dur * 0.95, 0.85 * boost, 0.5, true);
        } else if (sec.id === 'slow') {                                                                                      // the storm spends itself: everything slows and thins
          const e1 = 1 - (idx + s / 8) / 4;
          if (s === 0) this._pad(t, chordTones, dur * 8, 0.8 * e1, { cutoff: 1200, tremolo: 6, depth: 0.4, attack: 0.1 });
          if (s === 0 || (s === 4 && idx < 2)) this._drum(t, 0.6 * e1 + 0.1, 1.2);
          this._cello(t, 36 + root, dur * 0.85, 0.25 + 0.7 * e1);
          this._harp(t, [root + 72, fifth + 60, third + 60, root + 60, fifth + 48, third + 48, root + 48, root + 36][s], 0.1 + 0.4 * e1, 0.6);          // the harp falls, one string at a time
          if (idx === 3 && s === 0) this._violin(t, posNote(14), dur * 8, 0.7, -0.4, false, true);                           // one violin's last cry, falling
        } else if (sec.id === 'cello') {                                                                                     // a cello alone, in the back of a dark hall
          const k = idx / 8;
          if (s === 0 && idx % 2 === 0) {
            this._pad(t, [root + 48, fifth + 48], dur * 16, 0.6, { cutoff: 520, tremolo: 3.5, depth: 0.3, attack: 2 });
            this._cello(t, 36 + root, dur * 16, 0.5);                                                                         // a pedal under the line
          }
          if (s === 0 || s === 4) {                                                                                           // the melody: two long notes a bar, drifting towards the chord tones
            let p = this.cpos + [-2, -1, -1, 0, 1, 1, 2][Math.random() * 7 | 0];
            if (p > 0) p = -1; if (p < -7) p = -6;
            for (const d of [0, 1, -1, 2, -2]) if (pcs.includes(posNote(p + d) % 12) && p + d >= -7 && p + d <= 0) { p += d; break; }
            this.cpos = p; this._cello(t, posNote(p), dur * 3.9, 0.7 + 0.4 * k);
          }
          if (s === 0 && idx % 2 === 1) this._harp(t, root + 48, 0.4, 2);
          if (s === 0 && idx % 2 === 0) this._bell(t, root + 72, 0.45);                                                     // a music-box note over the cello
          if (s === 0 && idx === 0) this._sparkle(t, root, 0.4, true);
          if (s === 0 && idx >= 5) { this._drum(t, 0.25, 2); this._drum(t + 0.3, 0.18, 2.2); }                               // a faint heartbeat returns
        } else {                                                                                                             // rebuild: the build-up again, from the cello's low light, faster each bar
          const e2 = (idx + s / 8) / 8;
          if (idx === 7 && s >= 4) { skipRest(); continue; }
          if (s === 0) this._pad(t, chordTones, idx === 7 ? dur * 4 : dur * 8, 0.6 + 0.4 * e2, { cutoff: 900 + 900 * e2, tremolo: 5 + 4 * e2, depth: 0.5, attack: 0.4 });
          if (s === 0 && idx % 2 === 0) this._sparkle(t, root, 0.3 + 0.4 * e2, true);
          this._cello(t, 36 + root, dur * 0.8, 0.4 + 0.7 * e2);
          if (idx >= 4 || s % 2 === 0) this._drum(t, 0.2 + 0.7 * e2, 1.3);
          if (idx >= 6) this._snare(t, 0.3 + 0.5 * (s / 8)); else if (idx >= 3 && s % 4 === 2) this._snare(t, 0.3 + 0.3 * e2);
          if (s % 2 === 0) this._harp(t, [root + 48, third + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72][s], 0.3 + 0.35 * e2, 0.6);
          if (idx === 7 && s === 3) this._violin(t, posNote(16), dur * 5, 0.9, -0.4, false, true);                         // and again the last note drops away
          else this._violin(t, posNote(6 + idx), dur * 0.9, 0.15 + 0.4 * e2, 0.3, true);
          if (idx >= 3 && !(idx === 7 && s === 3)) this._violin(t, posNote(8 + idx), dur * 0.9, 0.15 + 0.3 * e2, -0.3);
        }
        this.nextTime += dur; this.step++;
      }
    }

    /** The parade, step by step. See PARADE for the song. */
    _scheduleParade() {
      const ctx = this.ctx, total = PARADE.bars, MAJ = [0, 2, 4, 5, 7, 9, 11];
      const lead = (deg, key) => 72 + key + 12 * Math.floor((deg - 1) / 7) + MAJ[(((deg - 1) % 7) + 7) % 7];             // a scale degree as a MIDI note
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = PARADE.where(bi), dur = PARADE.stepDur(bi), id = sec.id;
        const chord = PARADE.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const chordTones = [root + 48, third + 48, fifth + 48], T = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72, fifth + 72];
        const pc = root % 12, low = 36 + pc + (pc < 5 ? 12 : 0), V = id === 'intro' ? 0.45 + 0.15 * idx / 4 : id === 'verse' ? 0.65 : id === 'chorus' ? [0.9, 1, 1.1][sec.round - 1] : id === 'bridge' ? 0.5 + 0.35 * idx / 8 : 0.85 - 0.3 * idx / 4;
        const notes = (PARADE.MELODY[id === 'intro' ? 'chorus' : id] || [])[id === 'intro' ? 3 : idx] || [], hits = id === 'intro' && idx !== 3 ? [] : notes.filter(n => n[0] === s);
        const lastBar = idx === sec.bars - 1 && id !== 'outro';
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        // the bed: pad every bar, the harp's arpeggio, the bass
        if (s === 0) this._pad(t, chordTones, dur * 8, (id === 'bridge' ? 0.7 : 0.5) * V + 0.15, { cutoff: id === 'chorus' ? 1900 : 1200, tremolo: 5, depth: 0.2, attack: 0.25 });
        if (id !== 'bridge' || s % 4 === 0) this._harp(t, T[[0, 1, 2, 3, 4, 3, 2, 1][s]], (id === 'chorus' ? 0.4 : id === 'intro' ? 0.55 : 0.35) * V + 0.1, 0.6);
        if (id === 'chorus' || id === 'verse' || id === 'outro') {
          const strong = id === 'chorus';
          if (s === 0) this._bass(t, low, dur * 2.6, (strong ? 1 : 0.8) * V); else if (s === 4) this._bass(t, low + (strong ? 12 : 7), dur * 1.6, 0.6 * V);
          if (strong && s === 3) this._bass(t, low, dur * 0.8, 0.6 * V); else if (strong && s === 6) this._bass(t, low + 7, dur * 1.6, 0.6 * V);
        } else if (id === 'intro' && idx >= 2 && s === 0) this._bass(t, low, dur * 7, 0.6 * V);
        if (id === 'intro' && idx === 0 && s === 0) this._gliss(t, key, 0.8);
        if (id === 'chorus' && s === 0 && idx % 4 === 0) this._sparkle(t, key, 0.5 * V);
        if (id === 'verse' && (s === 2 || s === 6)) chordTones.forEach((n, i) => this._pizz(t + i * 0.015, n + 12, 0.45 * V));
        // the beat
        if (id === 'chorus') {
          if (s === 0) this._drum(t, 0.9 * V, 1); else if (s === 3) this._drum(t, 0.45 * V, 1); else if (s === 4) this._drum(t, 0.8 * V, 1);
          if (s === 2 || s === 6) this._snare(t, 0.8 * V); this._hat(t, (s % 2 ? 0.3 : 0.5) * V, s === 7);
        } else if (id === 'verse') {
          if (s === 0) this._drum(t, 0.6 * V, 1.2); else if (s === 4) this._drum(t, 0.45 * V, 1.2);
          if (s === 2 || s === 6) this._snare(t, 0.3 * V); this._hat(t, (s % 2 ? 0.2 : 0.35) * V);
        } else if (id === 'bridge') {
          if (s === 0 && idx % 2 === 0) this._drum(t, 0.4 * V, 2);
          if (idx === 7) { if (s === 0) this._drum(t, 0.7, 1.4); this._snare(t, 0.3 + 0.6 * s / 8); }
        } else if (id === 'outro' && idx < 3) { if (s === 0) this._drum(t, 0.5 * V, 1.2); this._hat(t, 0.2 * V); }
        else if (id === 'outro' && idx === 3 && s === 0) this._drum(t, 0.6, 1.4);
        // the tune: flute in the verse, synth and flute and bells in the chorus, flute, strings and bells in the bridge
        for (const [, deg, len] of hits) {
          const n = lead(deg, key), L = dur * len;
          if (id === 'chorus') {
            this._synth(t, n, L * 0.92, 0.85 * V); this._flute(t, n + 12, L * 0.9, 0.3 * V); if (len >= 2) this._bell(t, n + 12, 0.6 * V);
            if (sec.round === 3) this._violin(t, n - 12, L, 0.4 * V, -0.4, true);                                                 // the last chorus: strings underneath
          } else if (id === 'bridge') {
            this._flute(t, n, L, 0.55 * V); this._bell(t, n + 12, 0.5 * V); this._violin(t, n - 12, L * 0.95, 0.3 * V, 0.3, true);
          } else this._flute(t, n, L * 0.95 + 0.05, (id === 'verse' ? 0.6 : 0.5) * V + 0.1, id === 'verse' ? 1 : 0.8);
          if (id === 'outro' && len >= 4) this._bell(t, n + 12, 0.6);
        }
        if (lastBar && s >= 4) this._harp(t, T[s - 2], 0.5, 0.8);                                                              // a harp run up into the next section
        this.nextTime += dur; this.step++;
      }
    }

    /** The dance track, step by step. See DANCE for the form. */
    _scheduleDance() {
      const ctx = this.ctx, total = DANCE.bars, MAJ = [0, 2, 4, 5, 7, 9, 11];
      const lead = (deg, key) => 60 + key + 12 * Math.floor((deg - 1) / 7) + MAJ[(((deg - 1) % 7) + 7) % 7];
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = DANCE.where(bi), dur = DANCE.stepDur(bi), id = sec.id, odd = s % 2 === 1;
        const chord = DANCE.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const chordTones = [root + 48, third + 48, fifth + 48], T = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72, fifth + 72];
        const pc = root % 12, low = 36 + pc + (pc < 5 ? 12 : 0);
        const V = id === 'intro' ? 0.5 + 0.35 * idx / 8 : id === 'drop' ? 0.95 + 0.15 * (sec.round - 1) : id === 'breakdown' ? 1.1 : id === 'build' ? 0.6 + 0.35 * idx / 8 : 0.9 - 0.5 * idx / 8;
        const hits = ((DANCE.MELODY[id] || [])[id === 'drop' ? idx % 8 : idx] || []).filter(n => n[0] === s) || [];
        const lastBar = idx === sec.bars - 1, kickOn = id === 'drop' || (id === 'intro' && idx >= 4) || (id === 'build' && idx < 6) || (id === 'outro' && idx < 5);
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        if (id === 'drop' && idx === 0 && s === 0) { this._sparkle(t, key, 0.7); this._gliss(t, key, 0.6); }
        if (id === 'breakdown' && idx === 0 && s === 0) this._sparkle(t, key, 0.6);
        // the bed
        if (s === 0) this._pad(t, chordTones, dur * 8, (id === 'breakdown' ? 0.9 : 0.55) * V + 0.15, { cutoff: id === 'drop' ? 2200 : 1300, tremolo: 5, depth: 0.2, attack: id === 'breakdown' ? 0.6 : 0.2 });
        // the beat: kick on every beat, clap on 2 and 4, an open hat on every offbeat
        if (kickOn && s % 2 === 0) { this._kick(t, (id === 'intro' ? 0.5 + 0.1 * (idx - 4) : id === 'build' ? 0.6 + 0.05 * idx : 0.95) * Math.min(V, 1) + 0.1); this._pump(t, id === 'drop' ? 0.5 : 0.3); }
        if ((id === 'drop' || id === 'outro' && idx < 4 || id === 'build' && idx >= 2 || id === 'intro' && idx >= 6) && (s === 2 || s === 6)) this._clap(t, 0.8 * V);
        if (odd && (id === 'drop' || id === 'outro' && idx < 6 || id === 'intro' && idx >= 2 || id === 'build')) this._hat(t, 0.55 * V, true);
        if (id === 'drop' || id === 'outro' && idx < 4) { if (odd) this._bass(t, low, dur * 0.8, 0.9 * V); }                      // the offbeat bass
        else if ((id === 'intro' && idx >= 4) || (id === 'build' && idx < 6)) { if (odd) this._bass(t, low, dur * 0.8, 0.7 * V); }
        // the plucky arpeggio and the harp
        if (id === 'drop' || (id === 'build' && idx >= 2) || (id === 'intro' && idx >= 6)) this._synth(t, T[[0, 1, 2, 3, 2, 1, 3, 2][s]], dur * 0.6, 0.32 * V);
        if (id === 'intro' || id === 'breakdown' || id === 'outro') this._harp(t, T[[0, 1, 2, 3, 4, 3, 2, 1][s]], (id === 'breakdown' ? 0.5 : 0.4) * V + 0.1, 0.7);
        if (id === 'breakdown' && s % 4 === 0) this._violin(t, chordTones[s / 4 % 3] + 12, dur * 4, 0.3 * V, s ? 0.3 : -0.3, true);
        // the build: a riser, a snare roll that doubles in the last two bars
        if (id === 'build') {
          if (idx === 0 && s === 0) this._riser(t, dur * 64, 1);
          if (s % 2 === 0 && idx >= 4) this._snare(t, (0.2 + 0.6 * (idx - 4) / 4) * V);
          if (idx >= 6) { this._snare(t, (0.4 + 0.6 * (idx - 6 + s / 8) / 2) * V); this._snare(t + dur / 2, (0.4 + 0.6 * (idx - 6 + s / 8) / 2) * V); }
        } else if (id === 'intro' && idx === 7) { this._snare(t, 0.3 + 0.5 * s / 8); if (s >= 4) this._snare(t + dur / 2, 0.4 + 0.5 * s / 8); }
        // the tune
        for (const [, deg, len] of hits) {
          const n = lead(deg, key), L = dur * len;
          if (id === 'drop') { this._synth(t, n, L * 0.9, 0.95 * V); this._flute(t, n + 12, L * 0.9, 0.35 * V); if (len >= 2) this._bell(t, n + 12, 0.6 * V); else this._bell(t, n + 24 <= 96 ? n + 24 : n + 12, 0.25 * V); }
          else if (id === 'breakdown') { this._flute(t, n + 12, L * 0.95, 0.6 * V); this._bell(t, n + 12, 0.5 * V); }
          else if (id === 'build') this._synth(t, n, L * 0.8, 0.5 * V);
          else this._flute(t, n + 12, L * 0.9, 0.5 * V + 0.1);
        }
        if (lastBar && s >= 4 && (id === 'drop' || id === 'breakdown') && sec.round !== 2) this._harp(t, T[s - 2], 0.5, 0.8);       // a harp run into the next part
        this.nextTime += dur; this.step++;
      }
    }

    /** The harmony anthem, step by step. See HARMONY for the song. */
    _scheduleHarmony() {
      const ctx = this.ctx, total = HARMONY.bars, MAJ = [0, 2, 4, 5, 7, 9, 11];
      const lead = (deg, key) => 60 + key + 12 * Math.floor((deg - 1) / 7) + MAJ[(((deg - 1) % 7) + 7) % 7];
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = HARMONY.where(bi), dur = HARMONY.stepDur(bi), id = sec.id;
        const chord = HARMONY.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const chordTones = [root + 48, third + 48, fifth + 48], T = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72, fifth + 72];
        const pc = root % 12, low = 36 + pc + (pc < 5 ? 12 : 0), r = sec.round || 1;
        const V = id === 'intro' ? 1 : id === 'verse' ? 1.2 : id === 'pre' ? 1.1 + 0.3 * idx / 4 : id === 'chorus' ? [1, 1.05, 1.15][r - 1] : id === 'bridge' ? 0.95 + 0.4 * idx / 8 : 1.2 - 0.6 * idx / 4;
        const hits = ((HARMONY.MELODY[id] || [])[idx] || []).filter(n => n[0] === s), lastBar = idx === sec.bars - 1;
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        // the bed: a string pad every bar, a bouncing pizzicato in the verses and bridge-less parts
        if (s === 0) this._pad(t, chordTones, dur * 8, (id === 'chorus' ? 0.7 : id === 'bridge' ? 0.8 : 0.5) * V + 0.15, { cutoff: id === 'chorus' ? 2200 : 1300, tremolo: id === 'pre' ? 6 + 2 * idx : 4.5, depth: 0.2, attack: id === 'bridge' ? 0.5 : 0.15 });
        if (id === 'verse') {
          if (s === 0) this._pizz(t, low + 12, 1.1 * V); else if (s === 4) this._pizz(t, low + 19, 0.9 * V);                                   // boom
          if (s === 2 || s === 6) chordTones.forEach((n, i) => this._pizz(t + i * 0.015, n + 12, 0.6 * V));                                  // chick
          if (s === 0) this._drum(t, 0.4 * V, 1.2); else if (s === 4) this._drum(t, 0.3 * V, 1.2);
          this._hat(t, (s % 2 ? 0.2 : 0.3) * V);
          if (s === 0) this._harp(t, T[2], 0.4 * V, 0.8);
        } else if (id === 'chorus') {
          if (s === 0) { this._drum(t, 0.9 * V, 1); if (idx % 4 === 0) { this._crash(t, idx === 0 ? 0.9 : 0.4); this._drum(t, 0.7, 1.6); this._sparkle(t, key, 0.6 * V); } } else if (s === 4) this._drum(t, 0.75 * V, 1); else if (s === 3) this._drum(t, 0.4 * V, 1);
          if (s === 2 || s === 6) this._snare(t, 0.7 * V);
          this._hat(t, (s % 2 ? 0.35 : 0.2) * V, s % 2 === 1);                                                                           // a tambourine's shimmer
          if (s === 0) this._bass(t, low, dur * 3, 0.9 * V); else if (s === 3) this._bass(t, low, dur * 0.9, 0.6 * V); else if (s === 4) this._bass(t, low + 7, dur * 2, 0.7 * V); else if (s === 6) this._bass(t, low + 12, dur * 1.6, 0.6 * V);
          this._harp(t, T[[0, 1, 2, 3, 4, 3, 2, 1][s]], 0.4 * V + 0.1, 0.6);
        } else if (id === 'pre') {
          if (s % 2 === 0) this._snare(t, (0.15 + 0.5 * (idx + s / 8) / 4) * V); if (idx >= 2) this._snare(t + dur / 2, (0.2 + 0.4 * (idx + s / 8) / 4) * V);
          if (s === 0) this._drum(t, 0.5 * V, 1.2); this._harp(t, T[s], 0.35 * V + 0.2, 0.6);
          if (s === 0 && idx === 0) this._riser(t, dur * 32, 0.7);
        } else if (id === 'bridge') {
          if (s % 2 === 0) this._harp(t, T[[0, 1, 2, 3][s / 2]], 0.45 * V + 0.1, 1);
          if (s === 0 && idx % 2 === 0) this._bell(t, root + 72, 0.5 * V);
        } else {
          this._harp(t, T[[0, 1, 2, 3, 4, 3, 2, 1][s]], (id === 'intro' ? 0.45 : 0.4) * V + 0.1, 0.8);
          if (id === 'intro' && s === 0 && idx === 0) { this._gliss(t, key, 0.9); this._sparkle(t + 0.6, key, 0.7); }
          if (id === 'intro' && idx === 3 && s === 0) this._sparkle(t, key, 0.8);
          if (id === 'outro' && s === 0 && idx === 3) { this._gliss(t, key, 0.7); this._sparkle(t + 0.4, key, 0.8); }
          if (id === 'intro' && s === 0 && idx >= 2) this._bass(t, low, dur * 7, 0.5 * V);
        }
        // the tune: flute in the verses, flute and synth in the pre-chorus, synth, flute and bells in the chorus, flute and strings in the bridge
        for (const [, deg, len] of hits) {
          const n = lead(deg, key), L = dur * len;
          if (id === 'chorus') {
            this._synth(t, n, L * 0.92, 0.9 * V); this._flute(t, n + 12, L * 0.9, 0.3 * V); this._bell(t, n + 12, (len >= 2 ? 0.6 : 0.3) * V);
            if (r === 3) this._violin(t, n - 12, L, 0.4 * V, -0.4, true);
          } else if (id === 'pre') { this._flute(t, n, L * 0.95, 0.6 * V); this._synth(t, n, L * 0.9, 0.5 * V); }
          else if (id === 'bridge') { this._flute(t, n, L * 0.97, 0.55 * V); this._violin(t, n - 12, L * 0.95, 0.35 * V, 0.3, true); this._bell(t, n + 12, 0.45 * V); }
          else if (id === 'verse') { this._flute(t, n, L * 0.8 + 0.04, 0.65 * V + 0.1, 0.8); if (len >= 2) this._bell(t, n + 12, 0.35 * V); }
          else { this._flute(t, n, L * 0.9, 0.5 * V + 0.1); this._bell(t, n + 12, 0.4 * V); }
        }
        if (lastBar && s >= 4 && id !== 'outro') this._harp(t, T[s - 2], 0.5, 0.8);                                                       // a harp run into the next part
        if (lastBar && s === 6 && (id === 'chorus' && r < 3 || id === 'bridge')) this._sparkle(t, key, 0.6);
        this.nextTime += dur; this.step++;
      }
    }

    /** The calm tune, step by step. See MEADOW. It thins at night (no pizzicato, half the harp, softer). */
    _scheduleMeadow() {
      const ctx = this.ctx, total = MEADOW.bars, night = !!this.mood.night;
      const lead = (deg, key) => 60 + key + 12 * Math.floor((deg - 1) / 7) + MAJ7[(((deg - 1) % 7) + 7) % 7];
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = MEADOW.where(bi), dur = MEADOW.stepDur(bi), id = sec.id;
        const chord = MEADOW.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const chordTones = [root + 48, third + 48, fifth + 48], T = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72, fifth + 72];
        const pc = root % 12, low = 36 + pc + (pc < 5 ? 12 : 0), V = (night ? 0.6 : 1) * (id === 'b' ? 1.1 : 1);
        const hits = ((MEADOW.MELODY[id] || [])[idx] || []).filter(n => n[0] === s);
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        if (s === 0) {
          this._pad(t, chordTones, dur * 8, 0.5 * V + 0.1, { cutoff: 1100, tremolo: 4, depth: 0.2, attack: 0.4 });
          this._cello(t, 36 + root, dur * 8, 0.55 * V);                                                                      // a bowed note under the bar
          if (bi % 4 === 0) this._sparkle(t + 0.3, key, 0.3 * V);                                                            // a little twinkle every four bars
          if (bi === 0 || bi === 8) this._gliss(t, key, (bi ? 0.35 : 0.5) * V);                                              // and a harp glissando at the turn of each half
        }
        if (!night || s % 2 === 0) this._harp(t, T[[0, 1, 2, 3, 4, 3, 2, 1][s]], 0.35 * V + 0.1, 0.7);
        if (!night) {
          if (s === 0) this._pizz(t, low + 12, 0.7 * V); else if (s === 4) this._pizz(t, low + 19, 0.55 * V);
          if (s === 2 || s === 6) chordTones.forEach((n, i) => this._pizz(t + i * 0.015, n + 12, 0.3 * V));
        }
        for (const [, deg, len] of hits) {
          const n = lead(deg, key), L = dur * len;
          this._flute(t, n, L * 0.95 + 0.05, 0.7 * V + 0.1, 0.9); this._bell(t, n + 12, (len >= 2 ? 0.45 : 0.25) * V);
          if (id === 'b') this._violin(t, n - 12, L * 0.95, 0.25 * V, 0.3, true);
        }
        this.nextTime += dur; this.step++;
      }
    }

    /** The storm tune, step by step. See GLOOM: a spooky music box over trembling strings, a drone, a tolling harp and a far-off drum. */
    _scheduleGloom() {
      const ctx = this.ctx, total = GLOOM.bars;
      const lead = (deg, key) => 60 + key + 12 * Math.floor((deg - 1) / 7) + MIN7[(((deg - 1) % 7) + 7) % 7];
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = GLOOM.where(bi), dur = GLOOM.stepDur(bi), id = sec.id, V = id === 'b' ? 1.1 : 1;
        const chord = GLOOM.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const chordTones = [root + 48, third + 48, fifth + 48], hits = ((GLOOM.MELODY[id] || [])[idx] || []).filter(n => n[0] === s);
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        if (s === 0) {
          this._pad(t, chordTones, dur * 8, 0.9 * V, { cutoff: 700, tremolo: 5, depth: 0.45, attack: 0.8 });
          this._cello(t, 36 + root, dur * 8, 0.9 * V);                                                                       // a deep drone
          this._harp(t, root + 36, 0.7 * V, 1.8);                                                                            // a low toll
          if (idx % 4 === 0) this._drum(t, 0.6 * V, 2);                                                                      // a far-off roll
          if (idx % 8 === 4) this._sparkle(t + 0.4, key, 0.35 * V, true);                                                    // a cold twinkle
          if (idx % 4 === 3) this._violin(t, root + 72, dur * 8, 0.22 * V, 0.3, true);                                       // a thin, high, trembling note
        } else if (s === 4) this._harp(t, fifth + 36, 0.5 * V, 1.6);
        if (s === 5 && idx % 8 === 7) this._drum(t, 0.4 * V, 2.2);
        for (const [, deg, len] of hits) {
          const n = lead(deg, key), L = dur * len;
          this._flute(t, n, L * 0.95, 0.6 * V, 1.8); this._bell(t, n + 12, 0.55 * V);                                       // the melody: a husky flute and a music box
        }
        this.nextTime += dur; this.step++;
      }
    }

    /** The battle tune, step by step. See GALLOP: war drums, a galloping cello, racing harp and a heroic flute-and-synth tune. */
    _scheduleGallop() {
      const ctx = this.ctx, total = GALLOP.bars;
      const lead = (deg, key) => 60 + key + 12 * Math.floor((deg - 1) / 7) + MIN7[(((deg - 1) % 7) + 7) % 7];
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % total, s = this.step % 8, t = this.nextTime, { sec, idx } = GALLOP.where(bi), dur = GALLOP.stepDur(bi), id = sec.id;
        const chord = GALLOP.chords[bi], key = chord[2], root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const chordTones = [root + 48, third + 48, fifth + 48], T = [root + 48, fifth + 48, root + 60, third + 60, fifth + 60, root + 72, third + 72, fifth + 72];
        const hits = ((GALLOP.MELODY[id] || [])[idx] || []).filter(n => n[0] === s), hero = id === 'b';
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        if (s === 0) {
          this._pad(t, chordTones, dur * 8, 1, { cutoff: hero ? 2400 : 1700, tremolo: 9, depth: 0.5, attack: 0.1 });
          this._drum(t, 1, 1);
          if (idx === 0) { this._sparkle(t, key, 0.5, !hero); this._gliss(t, key, hero ? 0.5 : 0.4, !hero); }                // the hero's call: a twinkle and a glissando at the top of each half
        } else if (s === 3) this._drum(t, 0.75, 1); else if (s === 6) this._drum(t, 0.7, 1);
        if (s === 4) this._snare(t, 0.5); else if (s === 7) this._snare(t, 0.35);
        if ([0, 1, 3, 4, 6, 7].includes(s)) this._cello(t, 36 + (s === 3 || s === 6 ? fifth : root), dur * 0.9, s === 0 || s === 3 || s === 6 ? 1.2 : 0.8);     // the gallop: long, short, long, short, long, short
        this._harp(t, T[[0, 2, 4, 3, 4, 2, 3, 1][s]] + 12 * (s % 2), 0.45, 0.4);
        for (const [, deg, len] of hits) {
          const n = lead(deg, key), L = dur * len;
          this._synth(t, n, L * 0.85, hero ? 0.9 : 0.7); this._flute(t, n + 12, L * 0.8, hero ? 0.6 : 0.5, 0.8); if (len >= 2) this._bell(t, n + 12, hero ? 0.6 : 0.4);
        }
        if (idx === 7 && s >= 4) this._harp(t, T[s - 2], 0.5, 0.6);
        this.nextTime += dur; this.step++;
      }
    }

    /** The ambient version of the playing tune, step by step (a step is half a second, eight to a bar). Same key and chords as the tune, but no tune and no
     *  beat: a slow string pad and a drone, with bells, harp, flute and twinkles scattered thinly over the top, and (storm, tempest, battle) wind, a
     *  heartbeat or far-off drums. See AMB for each tune's mix. */
    _scheduleAmbient() {
      const ctx = this.ctx, cfg = AMB[this.theme], form = cfg.form, rnd = Math.random, night = !!this.mood.night && this.theme === 'calm';
      const A = 0.55 * cfg.gain * (night ? 0.7 : 1), pent = cfg.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
      while (this._go()) {
        const bi = Math.floor(this.step / 8) % 16, s = this.step % 8, t = this.nextTime, dur = 0.5;
        const chord = form.chords[(Math.floor(bi / 2) * 2) % form.chords.length], key = chord.length > 2 ? chord[2] : cfg.key, root = key + chord[0], third = root + (chord[1] === 'm' ? 3 : 4), fifth = root + 7;
        const tones = [root, third, fifth], d = night ? 0.5 : 1;
        // a note somewhere in lo..hi, mostly a chord tone, sometimes another note of the key's pentatonic
        const pick = (lo, hi) => { const pool = []; for (let n = lo; n <= hi; n++) { const pcs = ((n % 12) + 12) % 12; if (tones.some(x => x % 12 === pcs)) { pool.push(n, n, n); } else if (pent.some(x => (key + x) % 12 === pcs)) pool.push(n); } return pool.length ? pool[rnd() * pool.length | 0] : lo; };
        if (s === 0) { this.marks.push({ t, bar: bi }); if (this.marks.length > 16) this.marks.shift(); }
        if (s === 0 && bi % 2 === 0) {                                                                                           // a new chord every two bars
          this._pad(t, [root + 48, third + 48, fifth + 48], 8.5, A * 1.2, { cutoff: cfg.pad.cutoff, tremolo: cfg.pad.tremolo, depth: cfg.pad.depth, attack: 3 });
          this._cello(t, 36 + root, 8, A * cfg.drone * 1.2);
          if (cfg.toll) this._harp(t + 0.1, root + 36, A * 0.7, 2);
          if (cfg.wind && rnd() < cfg.wind) this._wind(t + 1, 7, A * 0.9);
          if (cfg.drumRoll && rnd() < cfg.drumRoll) this._drum(t + 2.5, A * 0.55, 2.2);
          if (cfg.gliss && bi % 8 === 0 && rnd() < cfg.gliss) this._gliss(t + 0.2, key, A * 0.5, cfg.minor);
        }
        if (cfg.heart && s === 0) { this._drum(t, A * 0.5, 1.8); this._drum(t + 0.27, A * 0.35, 2); }                          // a heartbeat, every bar
        if (cfg.pulse && s === 0 && bi % 2 === 1) this._drum(t, A * 0.7, 2.2);                                                  // a slow, far-off war drum
        if (s === 2 && bi % 4 === 2 && cfg.spark && rnd() < cfg.spark) this._sparkle(t, key, A * 0.6, cfg.minor);
        if (cfg.bell && rnd() < cfg.bell * d) this._bell(t, pick(72, 90), A * (0.5 + rnd() * 0.5));
        if (cfg.harp && rnd() < cfg.harp * d) this._harp(t, pick(cfg.toll ? 40 : 55, cfg.toll ? 64 : 79), A * (0.4 + rnd() * 0.5), 1.2);
        if (cfg.flute && rnd() < cfg.flute * d) this._flute(t, pick(64, 79), 2.5 + rnd() * 2, A * 0.7, cfg.minor ? 1.8 : 0.9);
        if (cfg.violin && rnd() < cfg.violin * d) this._violin(t, pick(76, 90), 3 + rnd() * 3, A * 0.5, rnd() < 0.5 ? -0.4 : 0.4, true);
        if (cfg.pizz && !night && s % 2 === 0 && rnd() < cfg.pizz) this._pizz(t, pick(48, 64), A * 0.6);
        if (cfg.synth && rnd() < cfg.synth * d) this._synth(t, pick(60, 76), 0.6, A * 0.6);
        if (cfg.tick && s % 2 === 1 && rnd() < cfg.tick * d) this._hat(t, A * 0.35);
        this.nextTime += dur; this.step++;
      }
    }

    /** May the scheduler place another step? Not past a lookahead of 0.6 s, and not across the end of a cycle (that is handled in between, see _cycleEnd). */
    _go() { return this.nextTime < this.ctx.currentTime + 0.6 && !(this.step > 0 && this.step % this._cycle === 0 && this._passed !== this.step); }
    /** A tune (or its ambient loop) has just played through. In Auto: after a full tune the ambient returns; after an ambient loop there is a small chance
     *  the real tune comes in (once through). A picked track simply loops. */
    _cycleEnd() {
      if (this.forced) return;
      if (this.fullNow) { this.fullNow = false; this.step = 0; this.marks = []; }
      else if (Math.random() < FULL_CHANCE) { this.fullNow = true; this.step = 0; this.marks = []; }
    }

    _schedule() {
      const ctx = this.ctx; if (!ctx || ctx.state !== 'running') { if (ctx) this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.2); return; }
      if (this.paused) { this.nextTime = Math.max(this.nextTime, ctx.currentTime + 0.3); return; }
      const full = { calm: '_scheduleMeadow', storm: '_scheduleGloom', battle: '_scheduleGallop', tempest: '_scheduleTempest', parade: '_scheduleParade', dance: '_scheduleDance', harmony: '_scheduleHarmony' };
      for (let guard = 0; guard < 3; guard++) {
        this._cycle = 8 * this._formOf(this.theme).bars;
        this[this.ambient ? '_scheduleAmbient' : full[this.theme]]();
        if (this.step > 0 && this.step % this._cycle === 0 && this._passed !== this.step) { this._passed = this.step; this._cycleEnd(); continue; }
        break;
      }
    }
  }
  Music.TRACKS = ['calm', 'storm', 'tempest', 'battle', 'parade', 'dance', 'harmony'].map(id => ({ id, title: THEMES[id].title, blurb: THEMES[id].blurb }));
  Music.TITLES = Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.title]));
  return Music;
})();
