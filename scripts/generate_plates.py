#!/usr/bin/env python3
"""Generate the fake "IoT camera" photos used by the project.

Each image is a 640x400 picture of a vintage bumper with a license plate on it.
Run from the repository root:

    pip install pillow
    python scripts/generate_plates.py

Output:
  web/html/cars/<PLATE>.png       one photo per car; the dashboard shows /cars/<PLATE>.png
                                  and scripts/camera.* picks a plate from this folder
"""
import os
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 640, 400

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FONT_SMALL = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# (plate text, plate background, text color, caption on top of the plate)
SEED = [
    ("BELAIR-55", (245, 200, 66), (30, 30, 30), "CLASSIC STATE"),
    ("T-BIRD-58", (240, 240, 232), (20, 60, 120), "VINTAGE"),
    ("WOODY-48", (30, 80, 60), (245, 240, 220), "ANTIQUE"),
    ("MODEL-T-1", (20, 20, 20), (240, 200, 70), "FIRST EDITION"),
]
SAMPLES = [
    ("MUSTANG-65", (200, 40, 40), (250, 245, 235), "CLASSIC STATE"),
    ("GTO-1969", (30, 60, 130), (245, 240, 220), "MUSCLE"),
    ("BEETLE-63", (235, 225, 150), (40, 40, 40), "VINTAGE"),
    ("COBRA-427", (20, 20, 20), (235, 235, 235), "SHELBY CLUB"),
    ("CAMARO-69", (240, 130, 30), (20, 20, 20), "CLASSIC STATE"),
    ("CADI-59", (240, 150, 170), (60, 20, 40), "TAIL FINS"),
    ("CORVET-62", (200, 200, 205), (180, 20, 30), "STINGRAY"),
    ("MINI-1964", (20, 90, 60), (240, 240, 230), "BRITISH"),
    ("ROUTE-66", (245, 245, 240), (170, 30, 30), "MOTHER ROAD"),
    ("DUESEY-35", (40, 40, 60), (230, 200, 120), "ROYAL"),
    ("FAST-GRAN", (150, 80, 160), (250, 240, 250), "HOT ROD"),
    ("VROOM-57", (70, 150, 190), (255, 250, 240), "CLASSIC STATE"),
]


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def background(rng):
    """Dark garage wall with a soft light from the top."""
    img = Image.new("RGB", (W, H), (38, 40, 46))
    px = img.load()
    for y in range(H):
        for x in range(W):
            d = abs(x - W // 2) / W
            v = int(60 - 40 * (y / H) - 25 * d)
            px[x, y] = (v + 8, v + 10, v + 18)
    return img


def bumper(draw):
    """A chrome bumper across the lower half."""
    for i in range(46):
        shade = 235 - abs(i - 14) * 5
        draw.line([(0, 250 + i), (W, 250 + i)], fill=(shade, shade, min(255, shade + 8)))
    draw.rounded_rectangle([20, 246, W - 20, 300], radius=24, outline=(120, 120, 130), width=3)
    draw.ellipse([60, 262, 76, 278], fill=(90, 90, 98))
    draw.ellipse([W - 76, 262, W - 60, 278], fill=(90, 90, 98))
    # shadow under the bumper
    draw.rectangle([0, 304, W, H], fill=(24, 25, 30))


def plate(img, text, bg, fg, caption):
    pw, ph = 360, 180
    x0, y0 = (W - pw) // 2, 100
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0 - 5, y0 - 5, x0 + pw + 5, y0 + ph + 5], radius=20, fill=(70, 70, 78))
    d.rounded_rectangle([x0, y0, x0 + pw, y0 + ph], radius=16, fill=bg)
    d.rounded_rectangle([x0 + 8, y0 + 8, x0 + pw - 8, y0 + ph - 8], radius=12, outline=fg, width=3)
    for cx, cy in [(x0 + 22, y0 + 22), (x0 + pw - 22, y0 + 22), (x0 + 22, y0 + ph - 22), (x0 + pw - 22, y0 + ph - 22)]:
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(110, 110, 118))
    cf = font(FONT_SMALL, 18)
    cw = d.textlength(caption, font=cf)
    d.text((x0 + (pw - cw) / 2, y0 + 20), caption, font=cf, fill=fg)
    size = 64
    tf = font(FONT_BOLD, size)
    while d.textlength(text, font=tf) > pw - 50 and size > 20:
        size -= 2
        tf = font(FONT_BOLD, size)
    tw = d.textlength(text, font=tf)
    d.text((x0 + (pw - tw) / 2, y0 + 62), text, font=tf, fill=fg)
    yf = font(FONT_SMALL, 16)
    label = "SMART PARKING  *  EST. 1955"
    lw = d.textlength(label, font=yf)
    d.text((x0 + (pw - lw) / 2, y0 + ph - 38), label, font=yf, fill=fg)


def make(text, bg, fg, caption, out_dir):
    rng = random.Random(text)
    img = background(rng)
    d = ImageDraw.Draw(img)
    bumper(d)
    plate(img, text, bg, fg, caption)
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    # camera timestamp-style overlay without a date (the file name carries the time)
    d = ImageDraw.Draw(img)
    d.text((14, 12), "CAM-01  GATE A", font=font(FONT_SMALL, 14), fill=(120, 230, 140))
    d.ellipse([W - 30, 14, W - 18, 26], fill=(220, 40, 40))
    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, f"{text}.png"), optimize=True)


if __name__ == "__main__":
    for item in SEED:
        make(*item, os.path.join(ROOT, "web", "html", "cars"))
    for item in SAMPLES:
        make(*item, os.path.join(ROOT, "web", "html", "cars"))
    print(f"Generated {len(SEED) + len(SAMPLES)} car photos in web/html/cars/.")
