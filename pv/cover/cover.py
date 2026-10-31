"""The PV's cover, set from a still of cover.js and its matte (matte.js), both rendered at the
cover's own size: the frame as the game has it, darker toward its edges, manga focus lines rushing
in on the muzzle behind Clawd and the gun (the matte keeps them off it; nothing is cut out),
the line (和你的 Agent / 一起玩游戏！) in the game's pixel type above, and a
pixel 😱 for you below.

    node scripts/director/render.mjs pv/cover/cover.js --lang zh-CN --size 1920x1080 --duration 5500 --every 30 --no-sound --no-mp4 --out renders/cover-wide
    node scripts/director/render.mjs pv/cover/matte.js --lang zh-CN --size 1920x1080 --duration 5500 --every 30 --no-sound --no-mp4 --out renders/cover-wide-matte
    (the same at 1080x1440 to renders/cover-tall, renders/cover-tall-matte)
    python pv/cover/cover.py renders/cover-wide/frames/00005.png renders/cover-wide-matte/frames/00005.png pv/cover/moyu-cover-16x9.png
"""
import io
import sys
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
CREAM, INK, ORANGE, SLATE = (246, 234, 210), (26, 18, 12), (217, 119, 87), (91, 107, 140)
# the line: two parallel lines, the second set off to the right and down from the first; in
# each, the small word slate and the big one hot
HEADLINE = {
    'zh-CN': ([('和你的', 7, SLATE), ('Agent', 12, ORANGE)], [('一起', 7, SLATE), ('玩游戏！', 16, ORANGE)]),
    'en': ([('Play', 9, SLATE), ('games', 14, ORANGE)], [('with your', 6, SLATE), ('Agent!', 14, ORANGE)]),
}


def pixel_font():
    # the game's own FusionPixel, out of its woff2 (PIL reads only the plain font)
    f = TTFont(ROOT / 'web/play/fonts/fusion-pixel-12px-zh_hans.woff2')
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    return ImageFont.truetype(io.BytesIO(buf.getvalue()), 12)


def ring(mask, cells=1):
    # a mask grown by whole cells, corners included
    return ndimage.binary_dilation(mask, np.ones((3, 3), bool), iterations=cells)


def paint(mask, color):
    a = np.zeros((*mask.shape, 4), np.uint8)
    a[mask] = (*color, 255)
    return Image.fromarray(a)


def big(im, s):
    return im.resize((im.width * s, im.height * s), Image.NEAREST)


def shout(text, font, s, drop=ORANGE, baseline=False):
    """Text in pixel type, s frame pixels a glyph pixel: cream, a drop one glyph pixel under it,
    the lot ringed in ink one glyph pixel wide (so it holds over the focus lines). With
    baseline, its full height is kept and where its baseline falls is returned with it."""
    w, h = font.getbbox(text)[2] + 4, 18
    im = Image.new('L', (w, h))
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((2, 1), text, font=font, fill=255)
    glyph = np.array(im) > 127
    under = np.roll(glyph, 1, 0)
    out = Image.new('RGBA', (w, h))
    for m, c in ((ring(glyph | under), INK), (under, drop), (glyph, CREAM)):
        out.alpha_composite(paint(m, c))
    if not baseline:
        return big(out.crop(out.getbbox()), s)
    x0, _, x1, _ = out.getbbox()
    return big(out.crop((x0, 0, x1, h)), s), (1 + font.getmetrics()[0]) * s


def headline(pieces, font, gap):
    """One line of pieces in different sizes on a common baseline: (text, glyph pixel size,
    drop colour) each, gap frame pixels between them."""
    set_ = [shout(t, font, s, drop, baseline=True) for t, s, drop in pieces]
    top = max(b for _, b in set_)
    h = max(top - b + im.height for im, b in set_)
    line = Image.new('RGBA', (sum(im.width for im, _ in set_) + gap * (len(set_) - 1), h))
    x = 0
    for im, b in set_:
        line.alpha_composite(im, (x, top - b))
        x += im.width + gap
    return line.crop(line.getbbox())


def pixel_emoji(emoji, n, s):
    """The system emoji brought down to an n by n grid (n - 2 of it the emoji, a one-cell ink
    ring round it), s frame pixels a cell: as the film's hook does it (cubicle.js)."""
    em = ImageFont.truetype(r'C:\Windows\Fonts\seguiemj.ttf', 200)
    im = Image.new('RGBA', (256, 256))
    ImageDraw.Draw(im).text((128, 128), emoji, font=em, embedded_color=True, anchor='mm')
    im = im.crop(im.getbbox())
    side = max(im.size)
    sq = Image.new('RGBA', (side, side))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    small = np.array(sq.resize((n - 2, n - 2), Image.BOX))
    cells = np.zeros((n, n, 4), np.uint8)
    cells[1:-1, 1:-1] = small
    solid = cells[..., 3] >= 110
    cells[..., 3] = np.where(solid, 255, 0)
    edge = ring(solid) & ~solid
    cells[edge] = (*INK, 255)
    return big(Image.fromarray(cells), s)


def focus_lines(size, centre, rng, cell, clear):
    """Manga focus lines: thin wedges from beyond the frame's edge in toward centre, stopping
    short of it at random round a clear disc, drawn on a grid of cell-pixel blocks."""
    W, H = size[0] // cell, size[1] // cell
    cx, cy = centre[0] / cell, centre[1] / cell
    far = np.hypot(W, H) * 1.2
    im = Image.new('L', (W, H))
    d = ImageDraw.Draw(im)
    a = 0.0
    while a < 2 * np.pi:
        a += rng.uniform(0.045, 0.15)
        width = rng.uniform(0.002, 0.008)
        inner = clear / cell * rng.uniform(1.0, 2.6)
        tip = (cx + np.cos(a) * inner, cy + np.sin(a) * inner)
        p1 = (cx + np.cos(a - width) * far, cy + np.sin(a - width) * far)
        p2 = (cx + np.cos(a + width) * far, cy + np.sin(a + width) * far)
        d.polygon([tip, p1, p2], fill=int(rng.uniform(150, 255)))
    return im.resize(size, Image.NEAREST)


def muzzle(frame, subject):
    # the bore: the biggest blob of near-black inside the subject (the eyes are smaller)
    dark = subject & (np.asarray(frame.convert('L')) < 14)
    labels, n = ndimage.label(ndimage.binary_opening(dark, iterations=2))
    sizes = ndimage.sum(dark, labels, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    y, x = ndimage.center_of_mass(labels == k)
    r = np.sqrt(sizes[k - 1] / np.pi)
    return (x, y), r


def cover(frame_path, matte_path, out_path, lang='zh-CN'):
    frame = Image.open(frame_path).convert('RGB')
    W, H = frame.size
    tall = H > W
    u = min(W, H) / 1080  # the frame's own unit: 1 at 1080 px across its short side
    # a 2:1 frame is GitHub's social card, which crops: the line and the face stay 80 px in
    # from its edges (at 1280 wide), the margin GitHub's template asks for
    safe = round(80 * W / 1280) if W >= 1.9 * H else 0
    rng = np.random.default_rng(7)

    # the subject: the matte's white (its scanlines and the room's dither smoothed out first)
    m = np.asarray(Image.open(matte_path).convert('L').filter(ImageFilter.MedianFilter(5))) > 110
    m = ndimage.binary_fill_holes(ndimage.binary_opening(m, iterations=2))
    (mx, my), bore = muzzle(frame, m)

    # the room as the game has it, darker toward the edges so the eye runs in
    yy, xx = np.mgrid[0:H, 0:W]
    vig = 1 - 0.6 * np.clip(np.hypot((xx - mx) / W, (yy - my) / H) * 1.5, 0, 1) ** 1.5
    base = Image.fromarray((np.asarray(frame) * vig[..., None]).astype(np.uint8)).convert('RGBA')

    # the lines in on the muzzle, cream, passing behind Clawd and the gun (the matte only
    # keeps them off it; Clawd stays in its room)
    lines = np.asarray(focus_lines((W, H), (mx, my), rng, max(1, round(2 * u)), clear=max(bore * 3.2, 260 * u)))
    lit = Image.new('RGBA', (W, H), (*CREAM, 0))
    lit.putalpha(Image.fromarray((lines * 0.55 * ~m).astype(np.uint8)))
    base.alpha_composite(lit)

    # the line, set like Clawd's shouts in the film and tilted a little, across the top in two
    # staggered parallel lines (HEADLINE); a tall frame staggers them less and sets them as big
    # as its width allows, low over Clawd's head, clear of it
    font = pixel_font()
    shift = 0.3 if tall else 0.62

    def staggered(k):
        a, b = (headline([(t, round(s * u * k), c) for t, s, c in part], font, round(24 * u * k)) for part in HEADLINE[lang])
        dx, dy = round(a.width * shift), round(a.height * 0.78)
        block = Image.new('RGBA', (max(a.width, dx + b.width), dy + b.height))
        block.alpha_composite(a, (0, 0))
        block.alpha_composite(b, (dx, dy))
        return block.rotate(4, Image.BICUBIC, expand=True)

    block = staggered(1)
    if tall:
        block = staggered(0.94 * W / block.crop(block.getbbox()).width)
    if tall or safe:
        block = block.crop(block.getbbox())
    if safe:
        block = block.resize((round(block.width * 0.9), round(block.height * 0.9)), Image.NEAREST)
    top = max(round(16 * u), safe)
    if tall:
        head = int(np.argmax(m.any(axis=1)))  # the subject's top row
        top = max(round(40 * u), head - round(50 * u) - block.height)
    base.alpha_composite(block, ((W - block.width) // 2, top))

    # you: a pixel 😱 down in the corner across from the line, under the gun's side, leaning
    # away from it
    face = pixel_emoji('😱', 24, round((12 if tall else 11) * u)).rotate(8, Image.BICUBIC, expand=True)
    if safe:
        face = face.crop(face.getbbox())
    base.alpha_composite(face, (W - face.width - max(round(40 * u), safe), H - face.height - max(round(36 * u), safe)))

    base.convert('RGB').save(out_path)
    print(out_path, (W, H), 'muzzle', (round(mx), round(my)), 'bore', round(bore))


if __name__ == '__main__':
    cover(*sys.argv[1:])
