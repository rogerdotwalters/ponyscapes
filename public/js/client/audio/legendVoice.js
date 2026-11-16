'use strict';
/* CLIENT - the legendary ponies TALK (data/ponies/legends.js). There are no recorded voices in the game: each legend speaks short lines through the browser's own speech
 * synthesis, with a pitch, speed and loudness of its own so the six are easy to tell apart (a cool fast one, a posh one, a bubbly one, a whisper, a drawl, a bookish one). They speak when they
 * arrive, when you stroke or feed them, and now and then when you ride them. Follows the sound-effects volume (0 = silent) and never talks over itself. */
const LegendVoice = (() => {
  const VOICES = {
    twilight_sparkle: { pitch: 1.25, rate: 1.0, volume: 0.9, hello: ['Hello! I have read so much about you.', 'Friendship is the greatest magic of all.'], pet: ['That is lovely, thank you.', 'Oh! Right on schedule.'], feed: ['Delicious, and scientifically speaking, healthy too.'], ride: ['Let us go on an adventure!'] },
    rainbow_dash: { pitch: 1.1, rate: 1.22, volume: 0.95, hello: ['Hey! Twenty percent cooler, right on time.', 'Did somebody say awesome?'], pet: ['Hey, watch the mane!', 'Okay, okay, that was kind of awesome.'], feed: ['Yes! Fuel for the fastest flyer around.'], ride: ['Faster! Faster! Hold on tight!'] },
    rarity: { pitch: 1.4, rate: 0.95, volume: 0.9, hello: ['Darling, how marvellous to see you.', 'Everything is better with a little sparkle.'], pet: ['Careful with the mane, darling!', 'Oh, you are too kind.'], feed: ['How thoughtful. Simply divine.'], ride: ['Do mind the saddle, darling.'] },
    pinkie_pie: { pitch: 1.75, rate: 1.35, volume: 0.95, hello: ['Hi hi hi! Is it a party? It is now!', 'Smile, smile, smile!'], pet: ['Hee hee! That tickles!', 'Best. Day. Ever!'], feed: ['Yum yum yum! Cupcakes are better, but this is great!'], ride: ['Wheee! Faster! Party time!'] },
    fluttershy: { pitch: 1.65, rate: 0.82, volume: 0.55, hello: ['Oh... hello. Um, please do not mind me.', 'Yay.'], pet: ['Oh my... that is very nice.', 'Thank you... that is very kind.'], feed: ['Oh, thank you. That is so thoughtful.'], ride: ['Um... please be gentle.'] },
    applejack: { pitch: 0.95, rate: 1.05, volume: 1.0, hello: ['Howdy there, sugarcube!', 'Ah never go back on a promise.'], pet: ['Well, aren\'t you sweet.', 'Yeehaw! That is mighty kind.'], feed: ['Mmm! Ain\'t nothing better than a fresh apple.'], ride: ['Giddy up! Hold your horses, now.'] }
  };
  let last = 0, busy = false, cached = null;
  const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') ? window.speechSynthesis : null;
  /** An English voice, preferring a female-sounding one; browsers load the list late, so it is looked up on use. */
  const voiceFor = () => {
    const list = synth().getVoices().filter(v => /^en/i.test(v.lang));
    return list.find(v => /female|zira|samantha|karen|moira|tessa|susan|hazel|google uk english female/i.test(v.name)) || list[0] || null;
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return {
    VOICES,
    /** Say a line of `kind` ('hello' | 'pet' | 'feed' | 'ride') in the voice of a legend (variety id). Returns the line said, or ''. */
    say(id, kind = 'hello') {
      const V = VOICES[id], S = synth(), now = performance.now();
      if (!V || !S || now - last < 3500 || S.speaking) return '';
      const vol = GameAudio.volume('sfx');
      if (vol <= 0) return '';
      const line = pick(V[kind] || V.hello), u = new SpeechSynthesisUtterance(line), voice = voiceFor();
      if (voice) u.voice = voice;
      u.pitch = V.pitch; u.rate = V.rate; u.volume = Math.min(1, V.volume * Math.max(0.4, vol));
      last = now; S.speak(u);
      return line;
    },
    /** A reaction to an animal of yours (the 'animalReact' event: mood 'feed', 'pet', 'refuse'): if it is a legend, it answers in words. */
    react(game, e) {
      const a = game.latestAnimals && game.latestAnimals()[e.id], id = a && a.look ? (PonyVariants[a.look[4] | 0] || {}) : null;
      if (id && id.legend && e.mood !== 'refuse') LegendVoice.say(id.id, e.mood === 'feed' ? 'feed' : 'pet');
    }
  };
})();
