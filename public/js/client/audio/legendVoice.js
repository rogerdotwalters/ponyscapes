'use strict';
/* CLIENT - the legendary ponies TALK (data/ponies/legends.js), in "babble": every letter of the line is a tiny sung syllable, like a pony chattering in a storybook. No recordings and no speech
 * synthesis: the notes are built from oscillators (audioCore.js), so it sounds the same everywhere and works offline. Each legend has its own pitch, tempo, wave, vibrato and lilt, so the six
 * are easy to tell apart. The line also shows as a toast so it can be read. They speak when they arrive, when you stroke or feed them and when you ride them. Follows the sound-effects volume
 * (0 = silent) and never talks over itself. */
const LegendVoice = (() => {
  const VOICES = {
    twilight_sparkle: { f0: 330, ms: 62, wave: 'triangle', vib: 5, lilt: 1.0, vol: 0.9, hello: ['Hello! I have read so much about you.', 'Friendship is the greatest magic of all.'], pet: ['That is lovely, thank you.', 'Oh! Right on schedule.'], feed: ['Delicious, and scientifically speaking, healthy too.'], ride: ['Let us go on an adventure!'] },
    rainbow_dash: { f0: 290, ms: 48, wave: 'sawtooth', vib: 0, lilt: 1.4, vol: 0.55, hello: ['Hey! Twenty percent cooler, right on time.', 'Did somebody say awesome?'], pet: ['Hey, watch the mane!', 'Okay, okay, that was kind of awesome.'], feed: ['Yes! Fuel for the fastest flyer around.'], ride: ['Faster! Faster! Hold on tight!'] },
    rarity: { f0: 400, ms: 76, wave: 'triangle', vib: 7, lilt: 1.7, vol: 0.9, hello: ['Darling, how marvellous to see you.', 'Everything is better with a little sparkle.'], pet: ['Careful with the mane, darling!', 'Oh, you are too kind.'], feed: ['How thoughtful. Simply divine.'], ride: ['Do mind the saddle, darling.'] },
    pinkie_pie: { f0: 470, ms: 42, wave: 'square', vib: 9, lilt: 2.4, vol: 0.4, hello: ['Hi hi hi! Is it a party? It is now!', 'Smile, smile, smile!'], pet: ['Hee hee! That tickles!', 'Best. Day. Ever!'], feed: ['Yum yum yum! Cupcakes are better, but this is great!'], ride: ['Wheee! Faster! Party time!'] },
    fluttershy: { f0: 520, ms: 92, wave: 'sine', vib: 6, lilt: 0.6, vol: 0.8, hello: ['Oh... hello. Um, please do not mind me.', 'Yay.'], pet: ['Oh my... that is very nice.', 'Thank you... that is very kind.'], feed: ['Oh, thank you. That is so thoughtful.'], ride: ['Um... please be gentle.'] },
    applejack: { f0: 215, ms: 66, wave: 'sawtooth', vib: 3, lilt: 1.1, vol: 0.5, hello: ['Howdy there, sugarcube!', 'Ah never go back on a promise.'], pet: ['Well, aren\'t you sweet.', 'Yeehaw! That is mighty kind.'], feed: ['Mmm! Ain\'t nothing better than a fresh apple.'], ride: ['Giddy up! Hold your horses, now.'] }
  };
  let last = 0, until = 0;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  /** Which vowel a letter sounds like decides its formant (the mouth shape): [first, second] filter frequencies. */
  const FORMANTS = { a: [800, 1200], e: [500, 1900], i: [320, 2500], o: [500, 900], u: [340, 800] };
  const vowelOf = ch => 'aeiou'.includes(ch) ? ch : 'aeiou'[ch.charCodeAt(0) % 5];
  /** Schedule the babble of `text` on the sound-effects bus; returns how long it lasts, in ms. */
  function babble(ctx, V, text) {
    const bus = GameAudio.buses && GameAudio.buses.sfx, out = bus || ctx.destination, t0 = ctx.currentTime + 0.05, beat = V.ms / 1000;
    let t = t0, n = 0;
    const words = text.split(/\s+/);
    for (let w = 0; w < words.length; w++) {
      const word = words[w], last = /[?!]$/.test(word) ? word.slice(-1) : '';
      const letters = word.replace(/[^a-z]/gi, '').toLowerCase();
      for (let i = 0; i < letters.length; i++) {
        const ch = letters[i], k = ch.charCodeAt(0) - 97, v = vowelOf(ch), isV = 'aeiou'.includes(ch), len = beat * (isV ? 1.25 : 0.8);
        // a lilting contour: the line rises and falls over the word, a question rises at its end, a cheer jumps up
        const arc = Math.sin((i + 0.5) / Math.max(1, letters.length) * Math.PI) * V.lilt * 1.6;
        const step = (k % 7) * 0.9 - 2.5 + arc + (last === '?' && i === letters.length - 1 ? 3.5 : 0) + (last === '!' && i === letters.length - 1 ? 2.2 : 0);
        const f = V.f0 * Math.pow(2, step / 12);
        const o = ctx.createOscillator(), g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
        o.type = V.wave; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (isV ? 1.04 : 0.97), t + len);
        if (V.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = f * V.vib / 600; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + len + 0.02); }
        f1.type = 'bandpass'; f1.frequency.value = FORMANTS[v][0]; f1.Q.value = 2.2;
        f2.type = 'bandpass'; f2.frequency.value = FORMANTS[v][1]; f2.Q.value = 3.0;
        const peak = (isV ? 0.5 : 0.28) * V.vol;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
        o.start(t); o.stop(t + len + 0.03);
        t += len * 0.78; n++;
      }
      t += beat * (/[.,]$/.test(word) ? 2.4 : 1.1);                                                    // (a breath between words, a longer one after a comma or full stop)
    }
    return Math.round((t - t0) * 1000);
  }
  return {
    VOICES, babble,
    /** Say a line of `kind` ('hello' | 'pet' | 'feed' | 'ride') in the voice of a legend (variety id). Returns the line said, or ''. */
    say(id, kind = 'hello', game = null) {
      const V = VOICES[id], now = performance.now(), ctx = GameAudio.ctx;
      if (!V || !ctx || now < until || now - last < 2500 || GameAudio.volume('sfx') <= 0) return '';
      const line = pick(V[kind] || V.hello);
      until = now + babble(ctx, V, line) + 300; last = now;
      if (game && game.events) game.events.emit('notice', { to: game.myId, text: '\u201C' + line + '\u201D' });
      return line;
    },
    /** A reaction to an animal of yours (the 'animalReact' event: mood 'feed', 'pet', 'refuse'): if it is a legend, it answers in words. */
    react(game, e) {
      const a = game.latestAnimals && game.latestAnimals()[e.id], id = a && a.look ? (PonyVariants[a.look[4] | 0] || {}) : null;
      if (id && id.legend && e.mood !== 'refuse') LegendVoice.say(id.id, e.mood === 'feed' ? 'feed' : 'pet', game);
    }
  };
})();
