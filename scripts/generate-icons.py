#!/usr/bin/env python3
"""Generates the CoachOrg app icons from code so they can be regenerated.

Everything is drawn at 4x and downsampled with Lanczos, which gives clean
antialiased edges without needing an SVG rasterizer on the machine.

Run:  python3 scripts/generate-icons.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"

RED = (200, 16, 46, 255)      # --color-accent, Aggies red
CREAM = (242, 240, 234, 255)  # --color-ink
SS = 4                        # supersampling factor
BASE = 512                    # design canvas


def draw_whistle(canvas_px: int, scale: float, fg, bg):
    """Draws the whistle centered on a square canvas.

    scale shrinks the mark toward the middle; maskable icons need the artwork
    inside the inner 80% because launchers crop the corners off.
    """
    img = Image.new("RGBA", (canvas_px * SS, canvas_px * SS), bg)
    d = ImageDraw.Draw(img)
    unit = canvas_px * SS / BASE  # design units -> device pixels

    # The mark's own bounding box is not centered in the design canvas, so it
    # gets nudged before scaling rather than after.
    def pt(x, y):
        return ((x + 6 - 256) * scale + 256) * unit, ((y - 9 - 256) * scale + 256) * unit

    def box(x0, y0, x1, y1):
        return [pt(x0, y0), pt(x1, y1)]

    def circle(cx, cy, r):
        return box(cx - r, cy - r, cx + r, cy + r)

    # Lanyard ring, drawn first so the body can grow over its lower arc and the
    # two read as one connected object rather than a floating dot.
    d.ellipse(circle(356, 196, 35), outline=fg, width=round(20 * scale * unit))
    # Mouthpiece.
    d.rounded_rectangle(box(96, 254, 250, 322), radius=34 * scale * unit, fill=fg)
    # Body.
    d.ellipse(circle(296, 290, 92), fill=fg)
    # Sound hole, punched back out in the background colour.
    d.ellipse(circle(296, 290, 36), fill=bg)

    return img.resize((canvas_px, canvas_px), Image.LANCZOS)


def save(img, name):
    path = PUBLIC / name
    img.save(path, "PNG")
    print(f"  {name}  {img.size[0]}x{img.size[1]}  {path.stat().st_size:,} bytes")


print("Writing icons to public/")
# Standard icons: full-bleed red, mark at full size.
save(draw_whistle(192, 1.0, CREAM, RED), "icon-192.png")
save(draw_whistle(512, 1.0, CREAM, RED), "icon-512.png")
# Maskable: same art pulled in so nothing important survives a corner crop.
save(draw_whistle(512, 0.72, CREAM, RED), "icon-maskable-512.png")
# iOS applies its own rounded corners, so this one stays square and full-bleed.
save(draw_whistle(180, 1.0, CREAM, RED), "apple-touch-icon.png")
# Android notification badge: white silhouette on transparent, no red.
save(draw_whistle(96, 0.86, (255, 255, 255, 255), (0, 0, 0, 0)), "badge-96.png")
