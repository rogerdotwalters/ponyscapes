'use strict';
/* SHARED - how a player looks. A character is a prince or a princess with a hair style and five colours, stored as six small integers
 * (indices into the palettes below), so it costs almost nothing to save, send to friends, or keep in the host's database.
 *   appearance = [ body, hairStyle, hairColor, skin, shirt, trim, pants, eyes, shoes, shirtStyle, pantsStyle ]
 * (an older look with only the first six numbers is still valid: the rest take their defaults.) */
const CharacterPalette = Object.freeze({
  bodies:     Object.freeze(['Prince', 'Princess']),
  // Each body has its OWN six hair styles. The look stores just the index (0-5); the body decides which style that is.
  hairKinds:      Object.freeze({ prince: Object.freeze(['short', 'swept', 'spiky', 'medium', 'tied', 'curly']), princess: Object.freeze(['bob', 'long', 'ponytail', 'braid', 'curly', 'bun']) }),
  hairStyleNames: Object.freeze({ prince: Object.freeze(['Short', 'Swept back', 'Spiky', 'Shoulder-length', 'Tied back', 'Curly']), princess: Object.freeze(['Bob', 'Long', 'Ponytail', 'Braid', 'Curly', 'Bun']) }),
  hairStyles: Object.freeze(['Bob', 'Long', 'Ponytail', 'Braid', 'Curly', 'Bun']),      // (the princess list, kept for older callers)
  hairColors: Object.freeze(['#2b2321', '#5a3a22', '#8a4b24', '#a23d1f', '#e3c068', '#efe6c8', '#c0392b', '#b9bcc4', '#3b6fd1', '#e86aa6', '#e8832e', '#3fb872', '#8a5be0', '#2fb8c9', '#1b1b2a', '#c9a27a']),
  skins:      Object.freeze(['#f6d9bf', '#f0c9a0', '#e2a97e', '#c98b5b', '#a56b3f', '#7a4a2a', '#fbe8da', '#553220']),
  outfits:    Object.freeze(['#2f5fc0', '#c0392b', '#2e9b5a', '#7b4fc4', '#d9a82b', '#1f9aa5', '#e0709a', '#e8e8ee', '#e0762e', '#2a3260', '#8fd36a', '#f4d03f', '#8a5a3b', '#5aa9e6', '#a8324f', '#4a4a55', '#f2a6c4', '#2c7a5b']),
  trims:      Object.freeze(['#f2c14e', '#d4d8e0', '#ffffff', '#c0392b', '#3b6fd1', '#3fb872', '#9b6be0', '#2a2a33', '#e0762e', '#1f9aa5', '#e0709a', '#8a5a3b']),
  pants:      Object.freeze(['#2a3260', '#3b3542', '#5a3a22', '#8a6a3c', '#2e5b3a', '#6b2a2a', '#4a4a55', '#1a1a1f', '#2f5fc0', '#7b4fc4', '#d9d2bd', '#c0392b', '#e0709a', '#1f9aa5']),
  eyes:       Object.freeze(['#2a1a12', '#5a3a22', '#8a6a3c', '#3b6fd1', '#4aa3df', '#2e9b5a', '#7a8f8a', '#7b4fc4', '#c0392b', '#d9a82b']),
  shoes:      Object.freeze(['#6b4428', '#2a1a12', '#1a1a1f', '#c0392b', '#3b6fd1', '#e8e8ee', '#d9a82b', '#2e9b5a', '#e0709a', '#7b4fc4']),
  shirtStyles: Object.freeze(['Plain', 'Striped', 'Vest']),
  pantsStyles: Object.freeze({ prince: Object.freeze(['Plain', 'Side stripe', 'Cuffed']), princess: Object.freeze(['Plain', 'Hem band', 'Polka dots']) }),
  hairColorNames: Object.freeze(['Black', 'Brown', 'Chestnut', 'Auburn', 'Blond', 'Platinum', 'Red', 'Silver', 'Blue', 'Pink', 'Ginger', 'Green', 'Violet', 'Teal', 'Midnight', 'Sandy']),
  skinNames:      Object.freeze(['Fair', 'Light', 'Tan', 'Brown', 'Deep', 'Ebony', 'Porcelain', 'Espresso']),
  outfitNames:    Object.freeze(['Royal blue', 'Crimson', 'Emerald', 'Violet', 'Gold', 'Teal', 'Rose', 'White', 'Orange', 'Midnight', 'Lime', 'Yellow', 'Brown', 'Sky blue', 'Wine', 'Charcoal', 'Blush', 'Forest']),
  trimNames:      Object.freeze(['Gold', 'Silver', 'White', 'Crimson', 'Royal blue', 'Emerald', 'Violet', 'Black', 'Orange', 'Teal', 'Rose', 'Brown']),
  pantsNames:     Object.freeze(['Navy', 'Charcoal', 'Brown', 'Tan', 'Forest', 'Maroon', 'Slate', 'Black', 'Blue', 'Purple', 'Cream', 'Red', 'Pink', 'Teal']),
  eyeNames:       Object.freeze(['Dark brown', 'Brown', 'Hazel', 'Blue', 'Sky blue', 'Green', 'Grey', 'Violet', 'Red', 'Amber']),
  shoeNames:      Object.freeze(['Brown', 'Dark brown', 'Black', 'Red', 'Blue', 'White', 'Gold', 'Green', 'Pink', 'Purple'])
});

const CharacterLook = {
  PRINCE: 0, PRINCESS: 1,
  /** How many choices each of the six slots has. */
  SIZES: Object.freeze([2, 6, 16, 8, 18, 12, 14, 10, 10, 3, 3]),
  /** A different-looking default for each seat (?solo=1 uses these). */
  defaultFor(slot) { return [[0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0], [1, 1, 4, 0, 3, 1, 9, 3, 3, 0, 0], [0, 2, 2, 3, 2, 0, 4, 5, 1, 1, 1], [1, 5, 6, 2, 1, 2, 1, 1, 8, 2, 2]][((slot | 0) % 4 + 4) % 4].slice(); },
  random(rng = Math.random) { return CharacterLook.SIZES.map(n => Math.floor(rng() * n)); },
  /** A clean copy of an untrusted appearance, or null if it is not one. */
  sanitize(a) {
    if (!Array.isArray(a) || a.length < 6) return null;
    const out = [], N = CharacterLook.SIZES.length;
    for (let i = 0; i < 6; i++) { const v = a[i]; if (!Number.isInteger(v) || v < 0 || v >= CharacterLook.SIZES[i]) return null; out.push(v); }
    for (let i = 6; i < N; i++) { const v = a[i]; out.push(Number.isInteger(v) && v >= 0 && v < CharacterLook.SIZES[i] ? v : 0); }      // (an older look has no pants, eyes, shoes or styles: the first of each)
    return out;
  },
  describe(a) {
    const P = CharacterPalette, l = CharacterLook.sanitize(a) || CharacterLook.defaultFor(0);
    return { princess: l[0] === 1, body: P.bodies[l[0]], hairStyle: l[1], hairKind: P.hairKinds[l[0] === 1 ? 'princess' : 'prince'][l[1]], hairName: P.hairStyleNames[l[0] === 1 ? 'princess' : 'prince'][l[1]], hair: P.hairColors[l[2]], skin: P.skins[l[3]], outfit: P.outfits[l[4]], trim: P.trims[l[5]], pants: P.pants[l[6]], eye: P.eyes[l[7]], shoe: P.shoes[l[8]], shirtStyle: l[9], pantsStyle: l[10] };
  }
};
