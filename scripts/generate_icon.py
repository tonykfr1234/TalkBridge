"""Generate the TalkBridge app icons with Pillow (no external image assets).

Two speech bubbles overlap like a bridge: teal for "me", violet for "them".
Run: python scripts/generate_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
TEAL = (11, 116, 128, 255)
VIOLET = (122, 75, 154, 255)
PAPER = (238, 242, 244, 255)
WHITE = (255, 255, 255, 255)


def bubble(d, box, tail, fill, r):
    d.rounded_rectangle(box, radius=r, fill=fill)
    d.polygon(tail, fill=fill)


def draw(size, maskable=False):
    s = 1024
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle((0, 0, s, s), fill=PAPER)
        k, o = 0.72, s * 0.14
    else:
        d.rounded_rectangle((0, 0, s, s), radius=230, fill=PAPER)
        k, o = 0.86, s * 0.07

    def p(x, y):
        return (o + x * k, o + y * k)

    def box(x0, y0, x1, y1):
        return (*p(x0, y0), *p(x1, y1))

    bubble(d, box(110, 170, 640, 590), [p(220, 560), p(200, 720), p(360, 580)], TEAL, int(120 * k))
    bubble(d, box(390, 420, 920, 840), [p(800, 810), p(830, 950), p(660, 830)], VIOLET, int(120 * k))
    # "文" strokes on the teal bubble, "A" on the violet one, drawn as lines.
    w = int(46 * k)
    d.line([p(285, 232), p(285, 268)], fill=WHITE, width=w)
    d.line([p(195, 290), p(375, 290)], fill=WHITE, width=w)
    d.line([p(222, 330), p(365, 465)], fill=WHITE, width=w)
    d.line([p(348, 330), p(205, 465)], fill=WHITE, width=w)
    d.line([p(570, 740), p(655, 520), p(740, 740)], fill=WHITE, width=w, joint="curve")
    d.line([p(605, 660), p(705, 660)], fill=WHITE, width=w)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    draw(192).save(OUT / "icon-192.png")
    draw(512).save(OUT / "icon-512.png")
    draw(512, maskable=True).save(OUT / "icon-maskable-512.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
