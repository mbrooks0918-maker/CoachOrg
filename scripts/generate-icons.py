#!/usr/bin/env python3
"""Generates the TeamOps app icons from code so they can be regenerated.

Everything is drawn at 4x and downsampled with Lanczos, which gives clean
antialiased edges without needing an SVG rasterizer on the machine.

The mark is a player and the route they run: a filled dot, a stroke leading
away from it, and an arrow head. It replaced a whistle, which said "coach" --
one role, in one of the several things the app now does -- and it is drawn
from the same geometry as the inline Logo component in src/components/brand.tsx
so the two cannot drift apart.

Run:  python3 scripts/generate-icons.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"

AMBER = (245, 165, 36, 255)   # --color-accent, scoreboard amber
GRAPHITE = (11, 13, 16, 255)  # --color-bg
SS = 4                        # supersampling factor
BASE = 24                     # the Logo component's design canvas


def draw_mark(canvas_px: int, scale: float, fg, bg):
    """Draws the route mark centered on a square canvas.

    scale shrinks the mark toward the middle; maskable icons need the artwork
    inside the inner 80% because launchers crop the corners off.
    """
    img = Image.new("RGBA", (canvas_px * SS, canvas_px * SS), bg)
    d = ImageDraw.Draw(img)
    px = canvas_px * SS

    # The glyph occupies roughly x 3..20, y 4..21 of a 24 unit box, so it is
    # nudged to sit on the true centre before being scaled.
    def pt(x, y):
        u = px / BASE
        return ((x - 11.5) * scale + 12) * u, ((y - 12.5) * scale + 12) * u

    width = round(2.8 * scale * px / BASE)

    def line(x0, y0, x1, y1):
        d.line([pt(x0, y0), pt(x1, y1)], fill=fg, width=width, joint="curve")

    def dot(cx, cy, r):
        (x0, y0), (x1, y1) = pt(cx - r, cy - r), pt(cx + r, cy + r)
        d.ellipse([x0, y0, x1, y1], fill=fg)

    # Round caps: PIL has none, so each stroke end gets a circle of its own.
    cap = 1.4 * scale

    dot(6, 18, 2.6)                 # the player
    line(7.7, 16.3, 17, 7)          # the route
    dot(17, 7, cap)
    line(11.4, 7, 17, 7)            # arrow head, upper stroke
    dot(11.4, 7, cap)
    line(17, 7, 17, 12.6)           # arrow head, lower stroke
    dot(17, 12.6, cap)

    return img.resize((canvas_px, canvas_px), Image.LANCZOS)


def save(img, name):
    path = PUBLIC / name
    img.save(path, "PNG")
    print(f"  {name}  {img.size[0]}x{img.size[1]}  {path.stat().st_size:,} bytes")


print("Writing icons to public/")
# Standard icons: full-bleed amber, dark mark at full size.
save(draw_mark(192, 1.0, GRAPHITE, AMBER), "icon-192.png")
save(draw_mark(512, 1.0, GRAPHITE, AMBER), "icon-512.png")
# Maskable: same art pulled in so nothing important survives a corner crop.
save(draw_mark(512, 0.72, GRAPHITE, AMBER), "icon-maskable-512.png")
# iOS applies its own rounded corners, so this one stays square and full-bleed.
save(draw_mark(180, 1.0, GRAPHITE, AMBER), "apple-touch-icon.png")
# Android notification badge: white silhouette on transparent, no fill colour.
save(draw_mark(96, 0.86, (255, 255, 255, 255), (0, 0, 0, 0)), "badge-96.png")
