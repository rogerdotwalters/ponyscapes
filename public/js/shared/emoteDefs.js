'use strict';
/* SHARED - the emote bubbles you can pick from the emote button (plus "Trade", which is a client-side shortcut). */
const EmoteDefs = Object.freeze([
  { id: 'wave', glyph: '\u{1F44B}', name: 'Wave' }, { id: 'laugh', glyph: '\u{1F602}', name: 'Laugh' },
  { id: 'heart', glyph: '\u2764\uFE0F', name: 'Love' }, { id: 'thumbs', glyph: '\u{1F44D}', name: 'Good' },
  { id: 'angry', glyph: '\u{1F620}', name: 'Angry' }, { id: 'sad', glyph: '\u{1F622}', name: 'Sad' },
  { id: 'question', glyph: '\u2753', name: 'Huh?' }, { id: 'cheer', glyph: '\u{1F389}', name: 'Cheer' }
]);
const isEmote = id => EmoteDefs.some(e => e.id === id);
