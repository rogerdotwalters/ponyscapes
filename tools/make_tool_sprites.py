"""Axe sprites from the user's picture, and a spear drawn in the same style (dark-brown outlined handle, soft pale-steel head)."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
OUTLINE, WOOD, STEEL, STEEL_EDGE = (75, 62, 57, 255), (111, 93, 76, 255), (233, 233, 233, 255), (205, 205, 205, 255)
TILT = 16.5        # the axe's handle leans this many degrees right of vertical

def trim(im, pad=0):
    box = im.split()[3].point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(box)
    if pad:
        c = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad)); c.paste(im, (pad, pad)); im = c
    return im

def icon(im, size=128, margin=0.08):
    im = trim(im); s = size * (1 - 2 * margin) / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (size, size)); c.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im); return c

def held(im, height=160):
    """Grip at the bottom centre, pointing up (what the game expects for 'in the hand')."""
    im = trim(im); A = np.array(im.split()[3]) > 128
    ys = np.where(A.any(axis=1))[0]; bottom = ys.max()
    rows = A[bottom - max(3, im.height // 40): bottom + 1]
    xs = np.where(rows.any(axis=0))[0]; grip = (xs.min() + xs.max()) / 2
    half = int(max(grip, im.width - grip)) + 1
    c = Image.new('RGBA', (2 * half, im.height)); c.paste(im, (int(half - grip), 0), im)
    s = height / c.height
    return c.resize((max(1, round(c.width * s)), height), Image.LANCZOS)

def soft_fill(size, outer, inner, outer_col, inner_col, blur):
    """A shape in outer_col with a blurred lighter (or darker) core, the shading the axe picture uses."""
    base = Image.new('RGBA', size); d = ImageDraw.Draw(base)
    d.polygon(outer, fill=outer_col)
    core = Image.new('RGBA', size); ImageDraw.Draw(core).polygon(inner, fill=inner_col)
    core = core.filter(ImageFilter.GaussianBlur(blur))
    mask = Image.new('L', size); ImageDraw.Draw(mask).polygon(outer, fill=255)
    core.putalpha(Image.composite(core.split()[3], Image.new('L', size), mask))        # (the soft core never spills past the outline)
    base.alpha_composite(core)
    return base

# ---- the axe: the user's picture as is ----
axe = Image.open(src).convert('RGBA')
icon(axe).save(f'{out}/axe_icon.png')
held(axe.rotate(TILT, resample=Image.BICUBIC, expand=True)).save(f'{out}/axe_held.png')

# ---- the spear: drawn upright at the axe picture's scale (handle ~180 px thick there; the spear is slimmer and longer) ----
W, H = 700, 3000
cx = W / 2
sp = Image.new('RGBA', (W, H))
# shaft: a long, slightly tapering handle with a rounded butt, outlined like the axe handle
top, bot = 900, H - 30
def shaft(w_top, w_bot, inset):
    flare = bot - 260                                                    # the butt swells a little, like the axe handle's
    return [(cx - w_top / 2 + inset, top), (cx + w_top / 2 - inset, top), (cx + w_bot / 2 - inset, flare), (cx + w_bot / 2 + 22 - inset, bot - 40),
            (cx + w_bot / 2 - inset, bot - inset), (cx - w_bot / 2 + inset, bot - inset), (cx - w_bot / 2 - 22 + inset, bot - 40), (cx - w_bot / 2 + inset, flare)]
sp.alpha_composite(soft_fill((W, H), shaft(150, 175, 0), shaft(150, 175, 42), OUTLINE, WOOD, 18))
# binding where the head meets the shaft (the axe's dark outline colour)
d = ImageDraw.Draw(sp)
for i, y in enumerate(range(840, 1010, 34)):
    d.rounded_rectangle([cx - 98, y, cx + 98, y + 26], radius=12, fill=OUTLINE if i % 2 == 0 else (95, 79, 68, 255))
# head: a leaf blade, the axe head's pale steel with a soft lighter centre and a slightly darker rim
blade = [(cx, 30), (cx + 150, 300), (cx + 185, 540), (cx + 120, 760), (cx + 70, 850), (cx - 70, 850), (cx - 120, 760), (cx - 185, 540), (cx - 150, 300)]
core = [(cx, 150), (cx + 120, 340), (cx + 145, 540), (cx + 90, 740), (cx - 90, 740), (cx - 145, 540), (cx - 120, 340)]
sp.alpha_composite(soft_fill((W, H), blade, core, STEEL_EDGE, STEEL, 45))
sp = trim(sp, pad=4)
held(sp).save(f'{out}/spear_held.png')
icon(sp.rotate(-TILT, resample=Image.BICUBIC, expand=True)).save(f'{out}/spear_icon.png')     # tilted like the axe picture
sp.rotate(-TILT, resample=Image.BICUBIC, expand=True).save(f'{out}/spear_full.png')
