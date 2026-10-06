"""Axe sprites from the user's picture, and the spear, stone hammer, knife, shovel and fishing rod drawn in the same style
(dark-brown outlined handle with a soft lighter core, soft pale-steel heads).

    python3 tools/make_tool_sprites.py <axe picture> public/assets/items
"""
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

# ---- the other tools: each drawn upright (grip at the bottom), as masks shaded like the axe ----
SHADOW, STONE, STONE_EDGE, LINE = (95, 79, 68, 255), (214, 214, 210, 255), (188, 188, 182, 255), (250, 250, 250, 230)

def shaded(size, draw, edge, core, inset, blur):
    """`draw(ImageDraw)` paints a white mask; the part is `edge` coloured with a soft `core` set `inset` px in from the outline."""
    mask = Image.new('L', size); draw(ImageDraw.Draw(mask))
    inner = mask.filter(ImageFilter.GaussianBlur(inset)).point(lambda v: 255 if v > 245 else 0)       # the mask shrunk by about `inset`
    inner = inner.filter(ImageFilter.GaussianBlur(blur))
    part = Image.new('RGBA', size, edge); part.putalpha(mask)
    glow = Image.new('RGBA', size, core); glow.putalpha(Image.composite(inner, Image.new('L', size), mask))
    part.alpha_composite(glow)
    return part

def handle(size, x, top, bot, w_top, w_bot, flare=22):
    """A wooden handle like the axe's: outlined, tapering, its butt swelling a little."""
    def draw(d):
        f = bot - 260
        d.polygon([(x - w_top / 2, top), (x + w_top / 2, top), (x + w_bot / 2, f), (x + w_bot / 2 + flare, bot - 40), (x + w_bot / 2, bot),
                   (x - w_bot / 2, bot), (x - w_bot / 2 - flare, bot - 40), (x - w_bot / 2, f)], fill=255)
        d.ellipse([x - w_bot / 2 - flare, bot - 60, x + w_bot / 2 + flare, bot + 10], fill=255)
    return shaded(size, draw, OUTLINE, WOOD, 26, 18)

def binding(img, x, y0, y1, half):
    d = ImageDraw.Draw(img)
    for i, y in enumerate(range(y0, y1, 34)): d.rounded_rectangle([x - half, y, x + half, y + 26], radius=12, fill=OUTLINE if i % 2 == 0 else SHADOW)

def steel(size, draw, edge=STEEL_EDGE, core=STEEL, inset=40, blur=40):
    return shaded(size, draw, edge, core, inset, blur)

def save(name, img, tilt=TILT, icon_margin=0.08):
    """`tilt`: how far the icon leans (a long, thin tool lies more diagonally so it fills its slot)."""
    img = trim(img, pad=4)
    held(img).save(f'{out}/{name}_held.png')
    icon(img.rotate(-tilt, resample=Image.BICUBIC, expand=True), margin=icon_margin).save(f'{out}/{name}_icon.png')
    return img

tools = {'spear': sp}

# stone hammer: the axe's handle, a squared stone head across the top, lashed on
W, H = 1400, 2200; x = W / 2; im = Image.new('RGBA', (W, H))
im.alpha_composite(handle((W, H), x, 300, H - 40, 170, 190))
im.alpha_composite(steel((W, H), lambda d: d.rounded_rectangle([x - 560, 60, x + 560, 520], radius=70, fill=255), STONE_EDGE, STONE, 50, 45))
binding(im, x, 560, 700, 112)
tools['stone_hammer'] = save('stone_hammer', im)

# knife: a short handle, a dark guard, a pale single-edged blade
W, H = 700, 2200; x = W / 2; im = Image.new('RGBA', (W, H))
im.alpha_composite(steel((W, H), lambda d: d.polygon([(x - 95, 1180), (x - 105, 600), (x - 60, 200), (x + 30, 30), (x + 140, 520), (x + 120, 1000), (x + 95, 1180)], fill=255)))
im.alpha_composite(handle((W, H), x, 1260, H - 40, 170, 190, flare=18))
ImageDraw.Draw(im).rounded_rectangle([x - 185, 1170, x + 185, 1270], radius=40, fill=OUTLINE)
tools['knife'] = save('knife', im)

# shovel: a long handle, a collar, a rounded pale blade at the top
W, H = 1100, 3400; x = W / 2; im = Image.new('RGBA', (W, H))
im.alpha_composite(handle((W, H), x, 1000, H - 40, 140, 165))
def blade(d):
    d.polygon([(x - 330, 520), (x - 330, 1000), (x + 330, 1000), (x + 330, 520)], fill=255)
    d.ellipse([x - 330, 30, x + 330, 1010], fill=255)
im.alpha_composite(steel((W, H), lambda d: (blade(d), d.rectangle([x, 0, x + 1, 1], fill=0)), inset=55, blur=55))
im.alpha_composite(shaded((W, H), lambda d: d.rounded_rectangle([x - 110, 900, x + 110, 1180], radius=40, fill=255), OUTLINE, SHADOW, 14, 10))
tools['shovel'] = save('shovel', im)

# fishing rod: a long thin tapering rod, a dark grip, a pale reel, the line hanging from the tip
W, H = 1100, 3600; x = W / 2; im = Image.new('RGBA', (W, H))
im.alpha_composite(handle((W, H), x, 40, H - 40, 96, 190, flare=14))
im.alpha_composite(shaded((W, H), lambda d: d.rounded_rectangle([x - 122, H - 900, x + 122, H - 300], radius=50, fill=255), OUTLINE, SHADOW, 20, 14))
im.alpha_composite(steel((W, H), lambda d: d.ellipse([x + 40, H - 1290, x + 340, H - 990], fill=255), inset=40, blur=30))
im.alpha_composite(shaded((W, H), lambda d: d.ellipse([x + 110, H - 1150, x + 190, H - 1070], fill=255), OUTLINE, SHADOW, 6, 6))
d = ImageDraw.Draw(im)
pts = [(x + 10 + 380 * t * t, 60 + 1400 * t) for t in [i / 40 for i in range(41)]]
d.line(pts, fill=LINE, width=22)
d.ellipse([pts[-1][0] - 70, pts[-1][1] - 10, pts[-1][0] + 70, pts[-1][1] + 170], fill=(224, 92, 70, 255))      # a little float
d.ellipse([pts[-1][0] - 70, pts[-1][1] - 10, pts[-1][0] + 70, pts[-1][1] + 75], fill=STEEL)
tools['fishing_rod'] = save('fishing_rod', im, tilt=38, icon_margin=0.02)

if len(sys.argv) > 3:                                     # a sheet of the drawn tools beside the axe picture, to compare styles
    sheet_h = 900; parts = [axe] + [t.rotate(-TILT, resample=Image.BICUBIC, expand=True) for t in tools.values()]
    parts = [trim(t) for t in parts]; parts = [t.resize((max(1, round(t.width * sheet_h / t.height)), sheet_h)) for t in parts]
    sheet = Image.new('RGBA', (sum(t.width for t in parts) + 60 * (len(parts) + 1), sheet_h + 120), (46, 74, 52, 255)); x0 = 60
    for t in parts: sheet.alpha_composite(t, (x0, 60)); x0 += t.width + 60
    sheet.save(sys.argv[3])
