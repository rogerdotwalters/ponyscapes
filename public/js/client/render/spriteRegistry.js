'use strict';
/* CLIENT - your own artwork (paths set in editor.html, stored in js/content/customContent.js) in place of the procedural drawings.
 *
 * Every creature and character has EIGHT DIRECTIONS on screen: up (walking away from the camera), down (towards it), left, right and the
 * four diagonals between them (up_left, up_right, down_left, down_right). In the isometric view a step along a world axis is a screen
 * DIAGONAL and a step along a world diagonal is a straight screen direction, so all eight are walked.
 * A direction you have not drawn falls back to another one (the other side mirrored, then the nearest of the old four views:
 * up_right -> up_left mirrored -> right -> left -> up), and anything with no images at all is drawn by the game's own code, so you can
 * replace the art one picture at a time.
 *
 * Image conventions (see public/assets/README.md):
 *   creature / character  feet at the BOTTOM CENTRE of the picture. A walk cycle is a horizontal strip of `frames` equal frames.
 *   item icon             any square picture (shown at 48 x 48 in the inventory).
 *   held item             the grip at the bottom centre, the business end pointing UP (it is turned to point where you face).
 *   worn item             a full-body overlay the same size as the character picture, per direction (feet at the bottom centre).
 * Images load in the background; until one has loaded the procedural drawing is used. */
const SpriteRegistry = (() => {
  const DIRS = ['up', 'up_right', 'right', 'down_right', 'down', 'down_left', 'left', 'up_left'];     // clockwise on screen, starting at the top
  const FALLBACK = {
    up: ['up', 'right', 'left'], down: ['down', 'left', 'right'], left: ['left', 'right'], right: ['right', 'left'],
    up_left: ['up_left', 'up_right', 'left', 'right', 'up'], up_right: ['up_right', 'up_left', 'right', 'left', 'up'],
    down_left: ['down_left', 'down_right', 'left', 'right', 'down'], down_right: ['down_right', 'down_left', 'right', 'left', 'down'],
  };
  const MIRRORS = { left: 'right', right: 'left', up_left: 'up_right', up_right: 'up_left', down_left: 'down_right', down_right: 'down_left' };
  /** The old four-view family of a direction (what art and code written before the diagonals understand): a diagonal counts as the side it leans to. */
  const VIEW4 = { up: 'up', down: 'down', left: 'left', right: 'right', up_left: 'left', up_right: 'right', down_left: 'left', down_right: 'right' };
  const view4 = dir => VIEW4[dir] || 'down';
  /** Which way a direction leans on screen: -1 left, +1 right, 0 straight up / down. */
  const lean = dir => (dir.endsWith('left') ? -1 : dir.endsWith('right') ? 1 : 0);
  const isDiagonal = dir => dir.includes('_');
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

  /** Which way something faces ON SCREEN (one of the eight DIRS), from its world facing angle. */
  function dirOf(facing) {
    const [sx, sy] = IsoProjection.worldDeltaToScreen(Math.cos(facing), Math.sin(facing));
    const h = sx / TILE_HALF_W, v = sy / TILE_HALF_H;                  // in tile units: a world axis is |h| == |v|, a world diagonal is straight on screen
    const sector = ((Math.round(Math.atan2(v, h) / (Math.PI / 4)) % 8) + 8) % 8;     // 0 right, 1 down_right, 2 down ... (screen y points down)
    return ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'][sector];
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

  return { DIRS, FALLBACK, MIRRORS, VIEW4, view4, lean, isDiagonal, image, dirOf, pick, drawSheet, creatureSet, drawCreature, drawCharacter, itemIconSrc, itemImage, wornImage };
})();

/* CLIENT - the diagonal views of the pixel-art bodies. Characters and ponies are painted from the front, the back and the side; the four
 * diagonals between them (a 3/4 view) are made from the front or back picture by turning it: the head swings toward the way the body
 * leans, and the body below is squeezed (a person, seen at an angle, is narrower) or lengthened (a pony is longer). It works on the
 * pixels of a finished picture before its outline, so every body, outfit, coat and walk frame gets its diagonals for free. */
const TurnView = (() => {
  /** `src`: a canvas (not yet outlined). `o.sign`: -1 when the body leans left, +1 right. `o.split`: the first row of the body (rows above are the head).
   *  `o.head`: pixels the head moves toward the lean. `o.body`: pixels the body moves. `o.scale`: horizontal scale of the body, taken from the
   *  edge of the body on the leading side (`o.anchor` columns from the centre) so a longer body grows backwards. `o.cx`: centre column. */
  function quarter(src, o) {
    const w = src.width, h = src.height, out = document.createElement('canvas');
    out.width = w; out.height = h;
    const sctx = src.getContext('2d'), a = sctx.getImageData(0, 0, w, h), b = sctx.createImageData(w, h);
    const A = new Uint32Array(a.data.buffer), B = new Uint32Array(b.data.buffer), cx = o.cx, ax = cx + o.sign * (o.anchor || 0);
    for (let y = 0; y < h; y++) {
      const head = y < o.split, shift = o.sign * (head ? o.head : o.body), scale = head ? (o.headScale || 1) : o.scale;
      for (let x = 0; x < w; x++) {
        const sx = Math.floor(ax + (x - shift - ax) / scale);                         // where this column of the picture comes from
        if (sx >= 0 && sx < w) B[y * w + x] = A[y * w + sx];
      }
    }
    out.getContext('2d').putImageData(b, 0, 0);
    return out;
  }
  return { quarter };
})();
