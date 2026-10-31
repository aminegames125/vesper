"""Draws the Android TV launcher banners. Run: python brand/tv/generate.py (needs Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

INK, CORAL, PAPER = (13, 13, 15), (255, 92, 122), (244, 241, 234)
OUT = Path(__file__).parent
FONT = "C:/Windows/Fonts/segoeuib.ttf"


def mark(d, x, y, s):
    """The Vesper mark: four bars that step in, scaled so the 64-unit grid becomes s pixels."""
    u = s / 64
    for bx, by, bw, color in [(8, 10, 48, CORAL), (14, 21, 36, PAPER), (20, 32, 24, PAPER), (26, 43, 12, PAPER)]:
        d.rounded_rectangle([x + bx * u, y + by * u, x + (bx + bw) * u, y + (by + 7) * u], radius=3.5 * u, fill=color)


def banner(w, h, name):
    k = 4  # draw big, then shrink for clean edges
    img = Image.new("RGB", (w * k, h * k), INK)
    d = ImageDraw.Draw(img)
    # layout: the mark and the name sit together, centred
    size = h * k * 0.46
    font = ImageFont.truetype(FONT, int(h * k * 0.24))
    text_w = d.textlength("Vesper", font=font)
    gap = w * k * 0.035
    x0 = (w * k - (size + gap + text_w)) / 2
    mark(d, x0, (h * k - size) / 2, size)
    d.text((x0 + size + gap, h * k * 0.5), "Vesper", font=font, fill=PAPER, anchor="lm")
    img.resize((w, h), Image.LANCZOS).save(OUT / name)


banner(320, 180, "banner-xhdpi.png")
banner(640, 360, "banner-xxxhdpi.png")
banner(1920, 1080, "banner-1080p.png")
print("done")
