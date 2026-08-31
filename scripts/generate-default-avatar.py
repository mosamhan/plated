#!/usr/bin/env python3
"""
Generates the default placeholder avatar — shown for any real profile with no
avatar_url (new OAuth signups before they pick a photo, or anyone who skips
the onboarding photo step). A plain gray circle + head/shoulders silhouette,
matching the standard "no profile photo" convention.

    python3 scripts/generate-default-avatar.py

Output: assets/images/default-avatar.png
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/images/default-avatar.png"

SIZE = 512
BACKGROUND = "#D8D8D8"
SILHOUETTE = "#B0B0B0"


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Outer circle — the avatar's background.
    draw.ellipse([0, 0, SIZE, SIZE], fill=BACKGROUND)

    # Head.
    head_r = SIZE * 0.135
    head_cx, head_cy = SIZE / 2, SIZE * 0.385
    draw.ellipse(
        [head_cx - head_r, head_cy - head_r, head_cx + head_r, head_cy + head_r],
        fill=SILHOUETTE,
    )

    # Shoulders — a wide circle sat low enough that the outer circle crops it
    # into a shoulder-like arc, same trick every "default avatar" icon uses.
    shoulder_r = SIZE * 0.34
    shoulder_cx, shoulder_cy = SIZE / 2, SIZE * 0.98
    draw.ellipse(
        [shoulder_cx - shoulder_r, shoulder_cy - shoulder_r, shoulder_cx + shoulder_r, shoulder_cy + shoulder_r],
        fill=SILHOUETTE,
    )

    # Clip everything to the outer circle so the shoulders can't poke past it.
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, SIZE, SIZE], fill=255)
    img.putalpha(mask)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"  wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
