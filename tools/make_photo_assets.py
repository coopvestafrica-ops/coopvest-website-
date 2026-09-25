#!/usr/bin/env python3
"""Derive web-ready photography from the supplied originals.

Sources live in download/ (as uploaded). They are large — several megabytes each
— and several are PNG data under a .jpg extension, which is both the wrong
format for a photograph and roughly five times the size it needs to be. This
script re-encodes each one to the size and format its slot on the page actually
needs, and emits WebP alongside JPEG so modern browsers get the smaller file.

    python3 tools/make_photo_assets.py

Outputs into assets/img. The originals are left untouched in download/.

Each photo is also given a focal point. Photographs of people crop badly from
the centre — a centre crop of a standing subject cuts off heads — so the crop
is biased vertically towards the upper third where the faces are.
"""
from __future__ import annotations

import pathlib

from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "download"
OUT = ROOT / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

# name, source file, target width, aspect (w/h), vertical bias for the crop.
# `bias` is where the crop window sits: 0.0 keeps the top of the frame, 0.5 is a
# centre crop, 1.0 keeps the bottom. Faces sit in the upper part of a standing
# portrait, so those take a low value.
PHOTOS = [
    ("hero-members", "coopvest-hero-african-professionals.jpg", 1800, 16 / 9, 0.35),
    ("community-team", "coopvest-community-team.jpg", 1200, 4 / 3, 0.30),
    ("employer-meeting", "coopvest-employer-meeting.jpg", 1200, 4 / 3, 0.30),
    ("planning-couple", "coopvest-financial-planning-couple.jpg", 1200, 4 / 3, 0.30),
    ("savings-phone", "coopvest-savings-woman-phone.jpg", 900, 4 / 5, 0.22),
    ("app-mockup", "coopvest-app-phone-mockup-professional.png", 760, 4 / 5, 0.5),
]


def crop_to(image: Image.Image, ratio: float, bias: float) -> Image.Image:
    """Crop to an aspect ratio, choosing the window from `bias` rather than centre."""
    width, height = image.size
    target_h = round(width / ratio)
    if target_h <= height:
        slack = height - target_h
        top = round(slack * bias)
        return image.crop((0, top, width, top + target_h))

    target_w = round(height * ratio)
    slack = width - target_w
    left = round(slack * 0.5)
    return image.crop((left, 0, left + target_w, height))


def save_variants(image: Image.Image, stem: str) -> list[tuple[str, int]]:
    """Write the JPEG fallback and the WebP, returning what was written."""
    written: list[tuple[str, int]] = []

    jpg = OUT / f"{stem}.jpg"
    image.convert("RGB").save(jpg, "JPEG", quality=82, optimize=True, progressive=True)
    written.append((jpg.name, jpg.stat().st_size))

    webp = OUT / f"{stem}.webp"
    image.convert("RGB").save(webp, "WEBP", quality=80, method=6)
    written.append((webp.name, webp.stat().st_size))

    return written


def main() -> None:
    print(f"{'output':34}{'size':>12}  saving vs source")
    total = 0
    for stem, filename, width, ratio, bias in PHOTOS:
        source = SRC / filename
        if not source.exists():
            raise SystemExit(f"missing source: {source}")

        original = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
        cropped = crop_to(original, ratio, bias)
        if cropped.width > width:
            cropped = cropped.resize(
                (width, round(cropped.height * width / cropped.width)), Image.LANCZOS
            )

        written = save_variants(cropped, stem)
        for name, size in written:
            total += size
            print(f"  {name:32}{size / 1024:9.0f} KB  {cropped.width}x{cropped.height}")

        before = source.stat().st_size
        after = min(size for _, size in written)
        print(f"  {'':32}{'':>9}  {before / 1024:.0f} KB source -> {after / 1024:.0f} KB smallest")

    print(f"\ntotal web payload for all photos: {total / 1024 / 1024:.2f} MB (both formats)")


if __name__ == "__main__":
    main()
