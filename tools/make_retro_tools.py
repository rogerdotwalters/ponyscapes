"""Retro pixel-art tools: every tool drawn as chunky, ink-outlined pixel art in the game's medieval palette.

    python3 tools/make_retro_tools.py public/assets/items

Each tool is painted once, upright (grip at the bottom, business end up) on a small grid, with no outline. The in-hand picture is that art with an ink
outline, scaled up with hard edges; the inventory icon is the same art turned 45 degrees (pixel rotation), outlined and scaled the same way.
Writes <id>_icon.png (128 x 128) and, for tools that are swung or held up, <id>_held.png (grip at the bottom centre, pointing up).
"""
import sys, math
from PIL import Image

INK = (36, 23, 15, 255)
C = dict(
    wood=(138, 90, 44, 255), woodL=(185, 128, 80, 255), woodD=(94, 58, 28, 255),
    steel=(201, 210, 220, 255), steelL=(240, 244, 248, 255), steelD=(127, 138, 153, 255), iron=(74, 82, 94, 255),
    leather=(107, 61, 42, 255), leatherL=(150, 94, 62, 255), rope=(214, 190, 140, 255), ropeD=(160, 134, 90, 255),
    stone=(150, 150, 158, 255), stoneL=(196, 196, 204, 255), stoneD=(104, 104, 112, 255),
    gold=(224, 168, 44, 255), goldL=(255, 224, 120, 255), blue=(78, 134, 176, 255), blueL=(130, 186, 224, 255), blueD=(48, 88, 126, 255),
    red=(200, 60, 50, 255), white=(250, 246, 235, 255), brass=(196, 150, 60, 255),
)
W, H = 20, 44                                                         # the upright grid; grip at the bottom centre (x 9-10)


class Art:
    def __init__(self):
        self.im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); self.px = self.im.load()

    def set(self, x, y, c):
        if 0 <= x < W and 0 <= y < H: self.px[x, y] = C[c] if isinstance(c, str) else c

    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w): self.set(x + i, y + j, c)

    def rows(self, y0, spans, c, light=None, dark=None):             # spans: [(x0, x1), ...] one per row from y0
        for k, (a, b) in enumerate(spans):
            for x in range(a, b + 1): self.set(x, y0 + k, c)
            if light: self.set(a, y0 + k, light)
            if dark: self.set(b, y0 + k, dark)

    def line(self, x0, y0, x1, y1, c):
        dx, dy = abs(x1 - x0), -abs(y1 - y0); sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1); err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1: break
            e2 = 2 * err
            if e2 >= dy: err += dy; x0 += sx
            if e2 <= dx: err += dx; y0 += sy

    def shaft(self, x, y0, y1, w=2, hi='woodL', mid='wood', lo='woodD'):
        for y in range(y0, y1 + 1):
            for i in range(w): self.set(x + i, y, mid)
            self.set(x, y, hi); self.set(x + w - 1, y, lo)

    def wrap(self, x, y0, y1, w=2, c='leather', c2='leatherL'):      # a grip wrapped in leather
        for y in range(y0, y1 + 1):
            for i in range(w): self.set(x + i, y, c2 if (y - y0) % 2 else c)

    def tied(self, x, y, w, c='rope', d='ropeD'):                   # a rope binding
        for i in range(w): self.set(x + i, y, c); self.set(x + i, y + 1, d)


def axe(a):
    a.shaft(9, 6, 43); a.wrap(9, 34, 43)
    a.rows(3, [(11, 13), (11, 14), (11, 15), (11, 16), (11, 16), (11, 17), (11, 17), (11, 17), (11, 16), (11, 16), (11, 15), (11, 14), (11, 13)], 'steel', 'steelL', 'steelD')
    for y in range(4, 14): a.set(17 if 6 <= y <= 9 else 16, y, 'steelL') if 5 <= y <= 11 else None
    a.rect(6, 5, 5, 6, 'iron'); a.rect(6, 5, 5, 1, 'steelD'); a.rect(8, 5, 1, 6, 'steelD')       # the poll
    a.tied(9, 5, 2, 'brass', 'brass'); a.rect(9, 5, 2, 8, 'steelD'); a.rect(9, 5, 1, 8, 'iron')
def stone_hammer(a):
    a.shaft(9, 8, 43); a.wrap(9, 34, 43)
    a.rect(3, 3, 14, 8, 'stone'); a.rect(3, 3, 14, 2, 'stoneL'); a.rect(3, 9, 14, 2, 'stoneD'); a.rect(15, 3, 2, 8, 'stoneD'); a.rect(3, 3, 2, 8, 'stoneL')
    a.set(7, 6, 'stoneD'); a.set(11, 5, 'stoneL'); a.set(12, 8, 'stoneD')                      # chips in the stone
    a.tied(8, 3, 4); a.rect(8, 5, 4, 1, 'ropeD'); a.rect(8, 7, 4, 1, 'rope'); a.rect(8, 9, 4, 1, 'ropeD')   # bound on with rope
def knife(a):
    a.wrap(9, 31, 43, 3, 'leather', 'leatherL'); a.rect(7, 29, 7, 2, 'gold'); a.set(7, 29, 'goldL'); a.rect(9, 43, 3, 1, 'gold')       # grip, guard, pommel
    a.rows(8, [(10, 10), (10, 11), (9, 11), (9, 11), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12), (9, 12)], 'steel', 'steelL', 'steelD')
    a.rect(10, 12, 1, 16, 'steelL')
def shovel(a):
    a.shaft(9, 14, 43); a.rect(7, 12, 6, 2, 'wood'); a.rect(7, 12, 6, 1, 'woodL')           # the T-handle at the bottom? no: the blade is the business end (top)
    a.rows(0, [(8, 11), (7, 12), (6, 13), (6, 13), (6, 13), (6, 13), (6, 13), (6, 13), (7, 12), (7, 12), (8, 11)], 'steel', 'steelL', 'steelD')
    a.rect(9, 1, 2, 10, 'steelL'); a.rect(8, 10, 4, 3, 'iron'); a.rect(9, 10, 2, 3, 'steelD')
def spear(a):
    a.shaft(9, 12, 43); a.tied(9, 12, 2, 'red', 'red'); a.tied(9, 15, 2, 'rope')
    a.rows(0, [(10, 10), (9, 11), (9, 11), (8, 12), (8, 12), (8, 12), (8, 12), (9, 11), (9, 11), (9, 11), (9, 11), (9, 11)], 'steel', 'steelL', 'steelD')
    a.rect(9, 3, 1, 8, 'steelL'); a.rect(8, 10, 4, 2, 'iron')
def fishing_rod(a):
    for y in range(0, 44): a.set(9 + (1 if y < 5 else 0), y, 'wood' if y % 5 else 'woodD'); a.set(8 + (1 if y < 5 else 0), y, 'woodL') if y > 4 and y % 4 else None
    a.wrap(9, 36, 43, 3, 'leather', 'leatherL'); a.rect(12, 30, 4, 4, 'iron'); a.rect(13, 31, 2, 2, 'brass'); a.set(12, 30, 'steelL')   # the reel
    a.line(10, 0, 4, 8, 'white'); a.line(4, 8, 4, 17, 'white'); a.set(4, 18, 'steelD'); a.set(3, 19, 'steelD'); a.rect(3, 14, 2, 2, 'red')   # line, float and hook
def hoe(a):
    a.shaft(9, 6, 43); a.wrap(9, 34, 43)
    a.rows(2, [(10, 17), (10, 18), (10, 18), (10, 17), (11, 16), (12, 15)], 'steel', 'steelL', 'steelD')                 # the blade, turned out sideways
    a.rect(8, 1, 3, 6, 'iron'); a.rect(9, 1, 1, 6, 'steelD'); a.rect(11, 2, 7, 1, 'steelL')
def sickle(a):
    a.shaft(9, 18, 43); a.wrap(9, 34, 43)
    for (x, y) in [(10, 18), (10, 16), (10, 14), (11, 12), (12, 10), (13, 9), (14, 8), (15, 8), (16, 9), (16, 10), (15, 11)]: pass
    pts = [(9, 18), (9, 15), (9, 12), (10, 9), (11, 6), (13, 4), (15, 3), (17, 3), (18, 4), (17, 5), (15, 6), (13, 8), (12, 11), (11, 14), (11, 17)]
    for i in range(len(pts) - 1): a.line(*pts[i], *pts[i + 1], 'steel')
    for i in range(len(pts) - 7): a.line(pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], 'steel')
    a.line(8, 12, 9, 8, 'steelL'); a.line(9, 8, 11, 5, 'steelL'); a.line(11, 5, 14, 3, 'steelL'); a.rect(8, 17, 4, 2, 'iron')
def shears(a):
    a.line(10, 20, 6, 2, 'steel'); a.line(11, 20, 7, 2, 'steelL'); a.line(9, 20, 13, 2, 'steel'); a.line(10, 20, 14, 2, 'steelD')   # two crossing blades
    a.rect(9, 19, 3, 3, 'brass'); a.set(10, 20, 'goldL')
    for x0, sx in ((10, -1), (9, 1)):                                                                                         # the two handle loops
        a.line(x0, 22, x0 + sx * 4, 29, 'red'); a.line(x0 + sx * 4, 29, x0 + sx * 3, 38, 'red'); a.line(x0, 22, x0 + sx * 1, 30, 'leather')
        a.line(x0 + sx * 3, 38, x0 + sx * 0, 40, 'red'); a.line(x0 + sx * 1, 30, x0 + sx * 0, 40, 'red')
def hedge_cutter(a):
    a.shaft(9, 14, 43, 3); a.wrap(9, 32, 43, 3)
    a.rect(5, 12, 10, 3, 'iron'); a.rect(5, 12, 10, 1, 'steelD')
    for k in range(5):                                                                                                          # long toothed blades
        a.rect(5 + k * 2, 3, 1, 9, 'steel'); a.rect(6 + k * 2, 3, 1, 9, 'steelL'); a.set(5 + k * 2, 2, 'steelD')
    a.rect(5, 3, 10, 1, 'steelL')
def watering_can(a):
    a.rect(3, 22, 12, 16, 'blue'); a.rect(3, 22, 2, 16, 'blueL'); a.rect(13, 22, 2, 16, 'blueD'); a.rect(3, 22, 12, 2, 'blueL'); a.rect(3, 36, 12, 2, 'blueD')   # the body
    a.rect(4, 28, 10, 1, 'blueD'); a.rect(4, 31, 10, 1, 'blueD')
    a.line(15, 24, 18, 14, 'blue'); a.line(14, 24, 17, 14, 'blue'); a.rect(16, 10, 4, 4, 'blueL'); a.rect(16, 10, 4, 1, 'white')   # the spout and rose
    a.line(3, 26, 0, 30, 'woodD'); a.line(0, 30, 2, 36, 'woodD'); a.line(4, 21, 12, 17, 'woodD'); a.line(12, 17, 14, 21, 'woodD')       # the handles
    a.rect(6, 33, 3, 2, 'white'); a.set(1, 4, 'blueL'); a.set(3, 2, 'blueL'); a.set(5, 5, 'blueL')                                   # a splash of water
def brush(a, soft=False):
    a.shaft(8, 18, 43, 3); a.wrap(8, 36, 43, 3)
    a.rect(4, 8, 12, 10, 'wood' if not soft else 'rope'); a.rect(4, 8, 12, 2, 'woodL' if not soft else 'white'); a.rect(4, 16, 12, 2, 'woodD' if not soft else 'ropeD')
    for x in range(4, 16, 2): a.rect(x, 1, 1, 7, 'rope' if not soft else 'white'); a.rect(x + 1, 2, 1, 6, 'ropeD' if not soft else 'rope')   # bristles
def wooden_sword(a):
    a.wrap(9, 34, 43, 3); a.rect(9, 43, 3, 1, 'gold'); a.rect(3, 31, 15, 3, 'woodD'); a.rect(3, 31, 15, 1, 'wood')
    a.rows(2, [(10, 10), (9, 11), (9, 11)] + [(8, 12)] * 27, 'wood', 'woodL', 'woodD'); a.rect(10, 5, 1, 24, 'woodL')
def stone_sword(a):
    a.wrap(9, 34, 43, 3); a.rect(9, 43, 3, 1, 'gold'); a.rect(3, 31, 15, 3, 'iron'); a.rect(3, 31, 15, 1, 'steelD')
    a.rows(1, [(10, 10), (9, 11), (9, 11)] + [(8, 12)] * 28, 'stone', 'stoneL', 'stoneD'); a.rect(10, 4, 1, 25, 'stoneL')
def bow(a):
    pts = [(14, 1), (16, 5), (17, 10), (17, 16), (16, 22), (16, 28), (17, 34), (17, 38), (15, 42)]
    for i in range(len(pts) - 1): a.line(*pts[i], *pts[i + 1], 'wood'); a.line(pts[i][0] - 1, pts[i][1], pts[i + 1][0] - 1, pts[i + 1][1], 'woodL')
    a.line(14, 1, 15, 42, 'white'); a.wrap(15, 19, 25, 3)


TOOLS = {  # id: (painter, has a held picture)
    'axe': (axe, True), 'stone_hammer': (stone_hammer, True), 'knife': (knife, True), 'shovel': (shovel, True), 'spear': (spear, True),
    'fishing_rod': (fishing_rod, True), 'hoe': (hoe, True), 'sickle': (sickle, True), 'hedge_cutter': (hedge_cutter, True),
    'shears': (shears, False), 'watering_can': (watering_can, False), 'brush': (brush, False), 'soft_brush': (lambda a: brush(a, True), False),
    'wooden_sword': (wooden_sword, True), 'stone_sword': (stone_sword, True), 'bow': (bow, False),
}


def trim(im):
    box = im.getbbox(); return im.crop(box) if box else im


def outline(im):
    """A 1 pixel ink line round the whole shape (padded by 1 first)."""
    out = Image.new('RGBA', (im.width + 2, im.height + 2), (0, 0, 0, 0)); out.paste(im, (1, 1)); src = out.copy(); sp, op = src.load(), out.load()
    for y in range(out.height):
        for x in range(out.width):
            if sp[x, y][3] == 0 and any(0 <= x + dx < out.width and 0 <= y + dy < out.height and sp[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): op[x, y] = INK
    return out


def rotate(im, deg):
    """Pixel-art rotation: inverse-map every output pixel to the nearest source pixel (hard edges kept)."""
    r = math.radians(deg); n = int(math.hypot(*im.size)) + 2; out = Image.new('RGBA', (n, n), (0, 0, 0, 0)); sp, op = im.load(), out.load()
    cx, cy, ox, oy = (im.width - 1) / 2, (im.height - 1) / 2, (n - 1) / 2, (n - 1) / 2
    for y in range(n):
        for x in range(n):
            dx, dy = x - ox, y - oy; sx = round(cx + dx * math.cos(r) + dy * math.sin(r)); sy = round(cy - dx * math.sin(r) + dy * math.cos(r))
            if 0 <= sx < im.width and 0 <= sy < im.height: op[x, y] = sp[sx, sy]
    return out


def fit(im, size, art_px):
    """Centre `im` on a size x size square at art_px per art pixel."""
    im = im.resize((im.width * art_px, im.height * art_px), Image.NEAREST); c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im); return c


if __name__ == '__main__':
    out = sys.argv[1]
    for tid, (paint, held) in TOOLS.items():
        a = Art(); paint(a); art = trim(a.im)
        if held:                                                                  # grip at the bottom centre, pointing up
            h = outline(art); full = Image.new('RGBA', (h.width + (h.width % 2), h.height), (0, 0, 0, 0)); full.paste(h, (0, 0))
            full.resize((full.width * 4, full.height * 4), Image.NEAREST).save(f'{out}/{tid}_held.png')
        # icon: turned 45 degrees (pointing up and to the right), outlined, as big as fits in 32 art pixels
        ic = trim(rotate(art, -45 if tid not in ('watering_can',) else 0)); ic = outline(ic)
        s = max(ic.size); k = 1 if s > 24 else 1
        fit(ic, 128, 3).save(f'{out}/{tid}_icon.png')
        print(tid, art.size, ic.size)
