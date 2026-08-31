#!/usr/bin/env python3
"""
Regenerates the Plated app-icon and splash PNGs from one spec.

These used to be hand-made binaries with SVG sources that only rendered
correctly on a machine with Fraunces installed system-wide — so nobody could
reliably reproduce them. This renders straight from the Fraunces TTF that
already ships in node_modules (@expo-google-fonts/fraunces), which is the same
font the app itself loads, so the mark on the home screen and the mark inside
the app are guaranteed to match.

    python3 scripts/generate-brand-assets.py

Outputs (assets/images/): icon.png, icon-dark.png, splash-icon.png,
splash-icon-dark.png.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "node_modules/@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"
OUT = ROOT / "assets/images"

WORDMARK = "Plated"

# The light tile's amber gradient — the brand's primary surface.
AMBER = ("#F4B12A", "#D9830B")
CREAM = "#F8EFD8"

# Dark tile: the same top-to-bottom gradient iOS itself paints behind a
# transparent-background dark icon (#313131 → #141414) — matching that
# system default exactly is what actually sits flush with the other
# first-party icons, more so than a flat black tile did. The amber wordmark
# still carries all of the brand's warmth.
CHARCOAL = ("#313131", "#141414")
GOLD = "#D9A441"

# Type metrics, expressed as fractions of the *tile* (not the canvas), taken
# from the existing splash tile — font-size 74 on a 400px tile, letter-spacing
# -2. Keeping these as ratios is what lets the icon and the splash render the
# same mark at different sizes.
FONT_RATIO = 74 / 400
TRACKING_RATIO = -2 / 74


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def diagonal_gradient(size: int, start: str, end: str) -> Image.Image:
    """A 45° linear gradient, matching the SVG sources' x1,y1=0 → x2,y2=1."""
    a = np.array(hex_rgb(start), dtype=float)
    b = np.array(hex_rgb(end), dtype=float)
    axis = np.linspace(0.0, 1.0, size)
    # t runs 0→1 along the top-left→bottom-right diagonal.
    t = (axis[None, :] + axis[:, None]) / 2.0
    pixels = a[None, None, :] + (b - a)[None, None, :] * t[:, :, None]
    return Image.fromarray(pixels.round().astype(np.uint8))


def vertical_gradient(size: int, start: str, end: str) -> Image.Image:
    """Straight top→bottom, matching iOS's own dark-icon background exactly
    (it's a vertical gradient, not a diagonal one)."""
    a = np.array(hex_rgb(start), dtype=float)
    b = np.array(hex_rgb(end), dtype=float)
    t = np.linspace(0.0, 1.0, size)
    pixels = a[None, None, :] + (b - a)[None, None, :] * t[:, None, None]
    pixels = np.broadcast_to(pixels, (size, size, 3))
    return Image.fromarray(pixels.round().astype(np.uint8))


def draw_tracked_text(img: Image.Image, text: str, font: ImageFont.FreeTypeFont, tracking: float, cx: float, baseline: float, fill: str) -> None:
    """PIL has no letter-spacing, so glyphs are placed one at a time."""
    draw = ImageDraw.Draw(img)
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, baseline), ch, font=font, fill=fill, anchor="ls")
        x += w + tracking


def centred_baseline(font: ImageFont.FreeTypeFont, text: str, top: float, height: float) -> float:
    """The baseline that puts the wordmark's *ink* in the middle of the tile.

    Centring on the font's line box instead would sit visibly high: "Plated"
    has no descenders, so its line box carries empty space underneath that the
    eye doesn't account for.
    """
    # anchor="ls" makes the box baseline-relative (ink_top is negative, since
    # the glyphs rise above the baseline); the default is ascender-relative.
    _, ink_top, _, ink_bottom = font.getbbox(text, anchor="ls")
    return top + (height - (ink_bottom - ink_top)) / 2 - ink_top


def rounded_mask(size: int, inset: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [inset, inset, size - inset - 1, size - inset - 1], radius=radius, fill=255
    )
    return mask


def render(
    size: int,
    gradient: tuple[str, str],
    text_fill: str,
    *,
    inset: int = 0,
    radius: int = 0,
    background: str | None = None,
    direction: str = "diagonal",
) -> Image.Image:
    """One tile. `inset`/`radius` produce the splash's floating rounded tile;
    the app icons are full-bleed, since iOS applies its own mask."""
    tile = size - inset * 2
    font = ImageFont.truetype(str(FONT), int(round(tile * FONT_RATIO)))

    art = vertical_gradient(size, *gradient) if direction == "vertical" else diagonal_gradient(size, *gradient)
    draw_tracked_text(
        art,
        WORDMARK,
        font,
        tracking=tile * FONT_RATIO * TRACKING_RATIO,
        cx=size / 2,
        baseline=centred_baseline(font, WORDMARK, inset, tile),
        fill=text_fill,
    )

    if inset == 0 and radius == 0:
        return art.convert("RGB")

    canvas = Image.new("RGBA", (size, size), (*hex_rgb(background), 255) if background else (0, 0, 0, 0))
    canvas.paste(art, (0, 0), rounded_mask(size, inset, radius))
    return canvas


def main() -> None:
    if not FONT.exists():
        raise SystemExit(f"Fraunces not found at {FONT} — run `npm install` first.")
    OUT.mkdir(parents=True, exist_ok=True)

    # App icons — full-bleed 1024². iOS rounds the corners itself, so drawing
    # our own rounded tile inside would double the corner radius.
    render(1024, AMBER, CREAM).save(OUT / "icon.png")
    render(1024, CHARCOAL, GOLD, direction="vertical").save(OUT / "icon-dark.png")

    # Splash — a floating tile on the launch background, so it keeps its own
    # rounded corners and transparent surround.
    render(512, AMBER, CREAM, inset=56, radius=96).save(OUT / "splash-icon.png")
    render(512, CHARCOAL, GOLD, inset=56, radius=96, direction="vertical").save(OUT / "splash-icon-dark.png")

    for name in ("icon.png", "icon-dark.png", "splash-icon.png", "splash-icon-dark.png"):
        print(f"  wrote assets/images/{name}")


if __name__ == "__main__":
    main()
