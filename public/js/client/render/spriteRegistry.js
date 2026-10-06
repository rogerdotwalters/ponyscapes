'use strict';
/* CLIENT - your own artwork (paths set in editor.html, stored in js/content/customContent.js) in place of the procedural drawings.
 *
 * Every creature and character has four DIRECTIONS on screen: up (walking away from the camera), down (towards it), left and right.
 * A direction you have not drawn falls back to another one (up -> right -> left, down -> left -> right, left <-> right mirrored),
 * and anything with no images at all is drawn by the game's own code, so you can replace the art one picture at a time.
 *
 * Image conventions (see public/assets/README.md):
 *   creature / character  feet at the BOTTOM CENTRE of the picture. A walk cycle is a horizontal strip of `frames` equal frames.
 *   item icon             any square picture (shown at 48 x 48 in the inventory).
 *   held item             the grip at the bottom centre, the business end pointing UP (it is turned to point where you face).
 *   worn item             a full-body overlay the same size as the character picture, per direction (feet at the bottom centre).
 * Images load in the background; until one has loaded the procedural drawing is used. */
const SpriteRegistry = (() => {
  const DIRS = ['up', 'down', 'left', 'right'];
  const FALLBACK = { up: ['up', 'right', 'left'], down: ['down', 'left', 'right'], left: ['left', 'right'], right: ['right', 'left'] };
  const MIRRORS = { left: 'right', right: 'left' };
  const images = new Map();                                  // src -> { img, ok }

  /** The loaded image for a path / data URL, or null (it starts loading on first ask). */
  function image(src) {
    if (typeof src !== 'string' || !src) return null;
    let entry = images.get(src);
    if (!entry) {
      entry = { img: new Image(), ok: false };
      entry.img.onload = () => { entry.ok = entry.img.naturalWidth > 0; };
      entry.img.onerror = () => { entry.ok = false; console.warn('sprite not found:', src); };
      entry.img.src = src;
      images.set(src, entry);
    }
    return entry.ok ? entry.img : null;
  }

  /** Which way something faces ON SCREEN, from its world facing angle. Diagonals count as left / right (the profile view). */
  function dirOf(facing) {
    const [sx, sy] = IsoProjection.worldDeltaToScreen(Math.cos(facing), Math.sin(facing));
    const h = sx / TILE_HALF_W, v = sy / TILE_HALF_H;                  // in tile units: a world diagonal is |h| == |v|
    return Math.abs(v) > Math.abs(h) + 0.2 ? (v < 0 ? 'up' : 'down') : (h < 0 ? 'left' : 'right');
  }

  /** The best picture for a direction: { img, mirror } or null. */
  function pick(set, dir) {
    if (!set) return null;
    for (const d of FALLBACK[dir]) {
      const img = image(set[d]);
      if (img) return { img, mirror: d !== dir && MIRRORS[d] === dir };
    }
    return null;
  }

  /** Draw a (possibly animated) sheet with its feet at (x, y). `set` holds frames / fps / scale / anchorY. */
  function drawSheet(ctx, picked, set, x, y, moving, now) {
    const { img, mirror } = picked, frames = Math.max(1, set.frames | 0 || 1), fps = +set.fps || 8, scale = +set.scale || 1, anchorY = +set.anchorY || 0;
    const fw = img.naturalWidth / frames, fh = img.naturalHeight, frame = moving && frames > 1 ? Math.floor(now / 1000 * fps) % frames : 0;
    ctx.save(); ctx.translate(x, y); if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(img, frame * fw, 0, fw, fh, -fw * scale / 2, -fh * scale + anchorY * scale, fw * scale, fh * scale);
    ctx.restore();
    return { w: fw * scale, h: fh * scale };
  }

  /** A creature's image set: a biome variety's own set first (ponies), then the species'. */
  function creatureSet(type, look) {
    const def = AnimalDefs[type], set = def && ContentPack.isPlain(def.sprites) ? def.sprites : null;
    if (!set) return null;
    const variant = look && typeof PonyVariants !== 'undefined' && PonyVariants[look[4] | 0];
    const own = variant && set.variants && set.variants[variant.id];
    return own && DIRS.some(d => own[d]) ? Object.assign({}, set, own) : set;
  }

  /** Draws a creature from its images. Returns the drawn size, or null when it has none (draw it procedurally then). */
  function drawCreature(ctx, type, look, dir, x, y, moving, now) {
    const set = creatureSet(type, look), picked = pick(set, dir);
    return picked ? drawSheet(ctx, picked, set, x, y, moving, now) : null;
  }

  /** Draws a player's body ('prince' | 'princess') from images, or returns null. */
  function drawCharacter(ctx, body, dir, x, y, moving, now) {
    const set = ContentPack.character(body), picked = pick(set, dir);
    return picked ? drawSheet(ctx, picked, set, x, y, moving, now) : null;
  }

  const itemSprites = id => { const def = ItemDefs[id]; return def && ContentPack.isPlain(def.sprites) ? def.sprites : null; };
  /** The icon path for an item, if you gave it one. */
  const itemIconSrc = id => { const s = itemSprites(id); return s && typeof s.icon === 'string' && s.icon ? s.icon : null; };
  /** An item picture ('ground' | 'held' | 'placed'), loaded, or null. */
  const itemImage = (id, kind) => { const s = itemSprites(id); return s ? image(s[kind]) : null; };
  /** A worn item's overlay for a direction: { img, mirror } or null. */
  const wornImage = (id, dir) => { const s = itemSprites(id); return s && ContentPack.isPlain(s.worn) ? pick(s.worn, dir) : null; };

  return { DIRS, image, dirOf, pick, drawSheet, creatureSet, drawCreature, drawCharacter, itemIconSrc, itemImage, wornImage };
})();
