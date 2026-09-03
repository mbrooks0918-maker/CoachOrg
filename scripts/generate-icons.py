#!/usr/bin/env python3
"""Rasterises the TeamOps app icons from the "Huddle" brand geometry.

The brand package ships SVG only and tells you to rasterise from it rather
than redraw, so this reproduces mark-ink.svg exactly -- a rounded ink tile with
four turf dots at the cardinal points -- at the sizes a PWA and iOS need.

Coordinates are the package's own, on its 512 design canvas: tile corner
radius 116, dots of radius 56 centred at 133 and 379 either side of 256.
Everything is drawn at 4x and downsampled with Lanczos, which gives clean
antialiased edges without needing an SVG rasterizer on the machine.

Run:  python3 scripts/generate-icons.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"

INK = (12, 20, 12, 255)     # --to-ink   #0c140c
TURF = (101, 200, 107, 255) # --to-turf  #65c86b
CLEAR = (0, 0, 0, 0)
SS = 4                      # supersampling factor
BASE = 512                  # the package's design canvas
RADIUS = 116                # tile corner radius, design units
DOT = 56                    # dot radius, design units
NEAR, MID, FAR = 133, 256, 379


def draw_mark(canvas_px: int, tile, dot, rounded: bool = True):
    """Draws the mark full-bleed on a square canvas.

    rounded=False leaves the tile square: iOS masks the apple-touch icon
    itself, and Android maskable icons are cropped to whatever shape the
    launcher wants, so a corner radius baked in would show through as a
    double-rounded edge. The dots sit at 26% from the edge, comfortably
    inside the 80% safe zone a maskable crop leaves alone.
    """
    px = canvas_px * SS
    img = Image.new("RGBA", (px, px), CLEAR)
    d = ImageDraw.Draw(img)
    u = px / BASE  # design units -> device pixels

    if rounded:
        d.rounded_rectangle([0, 0, px - 1, px - 1], radius=RADIUS * u, fill=tile)
    else:
        d.rectangle([0, 0, px - 1, px - 1], fill=tile)

    for cx, cy in ((MID, NEAR), (FAR, MID), (MID, FAR), (NEAR, MID)):
        d.ellipse(
            [(cx - DOT) * u, (cy - DOT) * u, (cx + DOT) * u, (cy + DOT) * u],
            fill=dot,
        )

    return img.resize((canvas_px, canvas_px), Image.LANCZOS)


def save(img, name):
    path = PUBLIC / name
    img.save(path, "PNG")
    print(f"  {name}  {img.size[0]}x{img.size[1]}  {path.stat().st_size:,} bytes")


print("Writing icons to public/")
# Standard icons: the mark as drawn, ink tile and turf dots.
save(draw_mark(192, INK, TURF), "icon-192.png")
save(draw_mark(512, INK, TURF), "icon-512.png")
# Maskable: square, because the launcher supplies the shape.
save(draw_mark(512, INK, TURF, rounded=False), "icon-maskable-512.png")
# iOS masks its own corners; the package ships this one square for that reason.
save(draw_mark(180, INK, TURF, rounded=False), "apple-touch-icon.png")
# Android notification badge: a white silhouette, dots punched clear -- the
# knockout variant, which is the package's single-colour mark.
save(draw_mark(96, (255, 255, 255, 255), CLEAR), "badge-96.png")
