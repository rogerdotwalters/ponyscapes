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

  /** The loaded image for a path / data URL, or null (it starts loading on first ask). `onload` is called once it has loaded,
   *  for a picture drawn once (a portrait in a panel) rather than every frame. */
  function image(src, onload) {
    if (typeof src !== 'string' || !src) return null;
    let entry = images.get(src);
    if (!entry) {
      entry = { img: new Image(), ok: false, waiting: [] };
      entry.img.onload = () => { entry.ok = entry.img.naturalWidth > 0; const w = entry.waiting; entry.waiting = []; if (entry.ok) w.forEach(fn => fn(entry.img)); };
      entry.img.onerror = () => { entry.ok = false; entry.waiting = []; console.warn('sprite not found:', src); };
      entry.img.src = src;
      images.set(src, entry);
    }
    if (!entry.ok && onload && entry.img.complete === false) entry.waiting.push(onload);
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

  /** A creature's portrait path (its close-up painting for panels), if it has one. */
  function portraitSrc(type) {
    const def = AnimalDefs[type], set = def && ContentPack.isPlain(def.sprites) ? def.sprites : null;
    return set && typeof set.portrait === 'string' && set.portrait ? set.portrait : null;
  }

  /** Paints a creature's portrait to fill a canvas (cropped to its shape, keeping the top: the face). Returns false when it has
   *  none, or it has not loaded yet (`onload` then repaints once it has). */
  function drawPortrait(canvas, type, onload) {
    const img = image(portraitSrc(type), onload);
    if (!img) return false;
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = W / k, sh = H / k, sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) * 0.3;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return true;
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

  return { DIRS, image, dirOf, pick, drawSheet, creatureSet, drawCreature, portraitSrc, drawPortrait, drawCharacter, itemIconSrc, itemImage, wornImage };
})();
