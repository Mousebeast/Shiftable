#!/usr/bin/env python3
"""
Icon generator for Shiftable PWA icons.
Requires: sudo apt-get install python3-pil

Usage: python3 scripts/generate-icons.py
Outputs: client/public/icons/icon-192.png and icon-512.png

Tweak the DESIGN section below to iterate.
"""

from PIL import Image, ImageDraw, ImageFont
import os

# ── DESIGN ────────────────────────────────────────────────────────────────────
# Gradient: diagonal top-left → bottom-right
GRAD_START  = (14, 165, 233)   # #0ea5e9 — sky blue
GRAD_END    = (109, 40, 217)   # #6d28d9 — deep violet

# Letter
LETTER       = 'S'
LETTER_SIZE  = 0.70
LETTER_COLOR = (255, 255, 255, 255)
SHADOW_COLOR = (0, 0, 0, 80)

# White outline stroke around the S
S_STROKE_W   = 0.016   # fraction of icon size
S_STROKE_COLOR = (255, 255, 255, 90)

# Linework: fine diagonal parallel lines across the background
DIAG_LINE_COLOR   = (255, 255, 255, 22)   # very subtle
DIAG_LINE_SPACING = 0.13                   # fraction of icon size
DIAG_LINE_ANGLE   = 45                     # degrees

# Rounded corners
CORNER_RADIUS = 0.22
# ──────────────────────────────────────────────────────────────────────────────

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    # ── Diagonal gradient background (top-left → bottom-right) ──────────────
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    total = (size - 1) * 2
    for i in range(total + 1):
        t = i / total
        r = int(GRAD_START[0] + (GRAD_END[0] - GRAD_START[0]) * t)
        g = int(GRAD_START[1] + (GRAD_END[1] - GRAD_START[1]) * t)
        b = int(GRAD_START[2] + (GRAD_END[2] - GRAD_START[2]) * t)
        # Each diagonal band: all pixels where x + y == i
        x0 = max(0, i - (size - 1))
        x1 = min(i, size - 1)
        y0 = i - x0
        y1 = i - x1
        bg_draw.line([(x0, y0), (x1, y1)], fill=(r, g, b, 255))

    # Rounded rect mask
    radius = int(size * CORNER_RADIUS)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    bg.putalpha(mask)
    img.paste(bg, (0, 0), bg)

    draw = ImageDraw.Draw(img)

    # ── Diagonal linework texture ────────────────────────────────────────────
    spacing = max(2, int(size * DIAG_LINE_SPACING))
    line_w = max(1, size // 128)
    for offset in range(-size, size * 2, spacing):
        draw.line([(offset, 0), (offset + size, size)], fill=DIAG_LINE_COLOR, width=line_w)

    # ── Letter ───────────────────────────────────────────────────────────────
    font_size = int(size * LETTER_SIZE)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_size)
    except Exception:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), LETTER, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]

    shadow_off = max(1, size // 48)
    stroke_px = max(2, int(size * S_STROKE_W))

    # Drop shadow
    draw.text((x + shadow_off, y + shadow_off), LETTER, font=font, fill=SHADOW_COLOR)

    # White stroke outline (Pillow 8.0+ built-in)
    draw.text((x, y), LETTER, font=font, fill=S_STROKE_COLOR,
              stroke_width=stroke_px, stroke_fill=S_STROKE_COLOR)

    # Main letter
    draw.text((x, y), LETTER, font=font, fill=LETTER_COLOR)

    return img


if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'client', 'public', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    make_icon(192).save(os.path.join(out_dir, 'icon-192.png'))
    make_icon(512).save(os.path.join(out_dir, 'icon-512.png'))
    print('Icons written to client/public/icons/')
