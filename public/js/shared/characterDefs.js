'use strict';
/* SHARED - how a player looks. A character is a prince or a princess with a hair style and five colours, stored as six small integers
 * (indices into the palettes below), so it costs almost nothing to save, send to friends, or keep in the host's database.
 *   appearance = [ body, hairStyle, hairColor, skin, outfit, trim ] */
const CharacterPalette = Object.freeze({
  bodies:     Object.freeze(['Prince', 'Princess']),
  // Each body has its OWN six hair styles. The look stores just the index (0-5); the body decides which style that is.
  hairKinds:      Object.freeze({ prince: Object.freeze(['short', 'swept', 'spiky', 'medium', 'tied', 'curly']), princess: Object.freeze(['bob', 'long', 'ponytail', 'braid', 'curly', 'bun']) }),
  hairStyleNames: Object.freeze({ prince: Object.freeze(['Short', 'Swept back', 'Spiky', 'Shoulder-length', 'Tied back', 'Curly']), princess: Object.freeze(['Bob', 'Long', 'Ponytail', 'Braid', 'Curly', 'Bun']) }),
  hairStyles: Object.freeze(['Bob', 'Long', 'Ponytail', 'Braid', 'Curly', 'Bun']),      // (the princess list, kept for older callers)
  hairColors: Object.freeze(['#2b2321', '#5a3a22', '#8a4b24', '#a23d1f', '#e3c068', '#efe6c8', '#c0392b', '#b9bcc4', '#3b6fd1', '#e86aa6']),
  skins:      Object.freeze(['#f6d9bf', '#f0c9a0', '#e2a97e', '#c98b5b', '#a56b3f', '#7a4a2a']),
  outfits:    Object.freeze(['#2f5fc0', '#c0392b', '#2e9b5a', '#7b4fc4', '#d9a82b', '#1f9aa5', '#e0709a', '#e8e8ee', '#e0762e', '#2a3260']),
  trims:      Object.freeze(['#f2c14e', '#d4d8e0', '#ffffff', '#c0392b', '#3b6fd1', '#3fb872', '#9b6be0', '#2a2a33']),
  hairColorNames: Object.freeze(['Black', 'Brown', 'Chestnut', 'Auburn', 'Blond', 'Platinum', 'Red', 'Silver', 'Blue', 'Pink']),
  skinNames:      Object.freeze(['Fair', 'Light', 'Tan', 'Brown', 'Deep', 'Ebony']),
  outfitNames:    Object.freeze(['Royal blue', 'Crimson', 'Emerald', 'Violet', 'Gold', 'Teal', 'Rose', 'White', 'Orange', 'Midnight']),
  trimNames:      Object.freeze(['Gold', 'Silver', 'White', 'Crimson', 'Royal blue', 'Emerald', 'Violet', 'Black'])
});

const CharacterLook = {
  PRINCE: 0, PRINCESS: 1,
  /** How many choices each of the six slots has. */
  SIZES: Object.freeze([2, 6, 10, 6, 10, 8]),
  /** A different-looking default for each seat (bots and ?solo=1 use these). */
  defaultFor(slot) { return [[0, 0, 1, 1, 0, 0], [1, 1, 4, 0, 3, 1], [0, 2, 2, 3, 2, 0], [1, 5, 6, 2, 1, 2]][((slot | 0) % 4 + 4) % 4].slice(); },
  random(rng = Math.random) { return CharacterLook.SIZES.map(n => Math.floor(rng() * n)); },
  /** A clean copy of an untrusted appearance, or null if it is not one. */
  sanitize(a) {
    if (!Array.isArray(a) || a.length < 6) return null;
    const out = [];
    for (let i = 0; i < 6; i++) { const v = a[i]; if (!Number.isInteger(v) || v < 0 || v >= CharacterLook.SIZES[i]) return null; out.push(v); }
    return out;
  },
  describe(a) {
    const P = CharacterPalette, l = CharacterLook.sanitize(a) || CharacterLook.defaultFor(0);
    return { princess: l[0] === 1, body: P.bodies[l[0]], hairStyle: l[1], hairKind: P.hairKinds[l[0] === 1 ? 'princess' : 'prince'][l[1]], hairName: P.hairStyleNames[l[0] === 1 ? 'princess' : 'prince'][l[1]], hair: P.hairColors[l[2]], skin: P.skins[l[3]], outfit: P.outfits[l[4]], trim: P.trims[l[5]] };
  }
};
