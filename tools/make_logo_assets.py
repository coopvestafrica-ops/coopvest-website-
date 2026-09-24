#!/usr/bin/env python3
"""Derive web-ready logo assets from the official Coopvest artwork.

Sources (committed alongside this script, so the build never reaches outside the
repository):
  assets/brand/coopvest-mark.png  the official square mark — used for the icon
                                 set. This is the artwork supplied for the site
                                 and is byte-identical to the app's splash logo.
  assets/brand/coopvest-lockup.jpg  the full lockup (mark + wordmark) on white,
                                 used for the header and social card.

Outputs into assets/img:
  logo.png / logo@2x.png          full lockup, transparent, for the header
  logo-white.png                  full lockup as a light silhouette, for dark surfaces
  logo-mark.png                   square emblem only, transparent
  favicon.ico, favicon-32.png     browser icon
  apple-touch-icon.png            iOS home-screen icon
  og.png / og.jpg                 social share card on the brand gradient
"""
from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
BRAND = ROOT / "assets" / "brand"
SRC = BRAND / "coopvest-lockup.jpg"
MARK = BRAND / "coopvest-mark.png"
OUT = ROOT / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)

INK_900 = (15, 19, 17)          # app darkBackground
GRADIENT_END = (15, 61, 20)     # app primaryDark — gradient terminates in brand green


def white_to_alpha(image: Image.Image, threshold: int = 12) -> Image.Image:
    """Convert a logo photographed on white into a transparent PNG.

    Alpha is derived from how far each pixel sits from white, then the colour is
    un-premultiplied so saturated brand colour is not washed out.
    """
    rgb = np.asarray(image.convert("RGB")).astype(np.float32)
    alpha = 255.0 - rgb.min(axis=2)          # 255 where the pixel is pure white
    alpha[alpha < threshold] = 0

    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    colour = np.clip((rgb - (255.0 - safe)) * 255.0 / safe, 0, 255)

    result = Image.fromarray(
        np.dstack([colour, np.clip(alpha, 0, 255)]).astype(np.uint8), "RGBA"
    )
    return result.crop(result.getchannel("A").getbbox())


def silhouette(image: Image.Image, shade: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """Recolour a transparent logo to a single shade, keeping its alpha."""
    rgba = np.asarray(image).astype(np.uint8).copy()
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = shade
    return Image.fromarray(rgba, "RGBA")


def fit_height(image: Image.Image, height: int) -> Image.Image:
    width = max(1, round(image.width * height / image.height))
    return image.resize((width, height), Image.LANCZOS)


def gradient(size: tuple[int, int]) -> Image.Image:
    """Diagonal brand gradient, matching the site's headers."""
    w, h = size
    base = Image.new("RGB", size, INK_900)
    draw = ImageDraw.Draw(base)
    for i in range(w + h):
        t = i / (w + h)
        draw.line(
            [(i, 0), (0, i)],
            fill=(
                round(INK_900[0] + t * (GRADIENT_END[0] - INK_900[0])),
                round(INK_900[1] + t * (GRADIENT_END[1] - INK_900[1])),
                round(INK_900[2] + t * (GRADIENT_END[2] - INK_900[2])),
            ),
            width=1,
        )
    return base


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    stem = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    for path in (
        f"/usr/share/fonts/truetype/dejavu/{stem}",
        f"/usr/share/fonts/truetype/liberation/LiberationSans-{'Bold' if bold else 'Regular'}.ttf",
    ):
        if pathlib.Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def quantise(image: Image.Image, colours: int = 256) -> Image.Image:
    """Palette-reduce an RGBA image without losing its alpha channel.

    The source artwork is a JPEG, so a true-colour PNG of it runs to hundreds of
    kilobytes. The logo is flat enough that a 256-colour palette is visually
    identical at display size and roughly a tenth of the weight.
    """
    alpha = image.getchannel("A")
    rgb = image.convert("RGB").quantize(colors=colours, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    rgb = rgb.convert("RGBA")
    rgb.putalpha(alpha)
    return rgb


def posterise_alpha(image: Image.Image, levels: int = 32) -> Image.Image:
    """Reduce the number of distinct alpha values.

    Anti-aliasing produces a near-continuous alpha ramp, which bloats PNG. The
    logo is displayed small enough that 32 alpha levels are indistinguishable
    from the original, and the file gets dramatically smaller.
    """
    rgba = np.asarray(image).astype(np.uint8).copy()
    step = 255 / (levels - 1)
    rgba[..., 3] = (np.round(rgba[..., 3] / step) * step).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def save_optimised(image: Image.Image, path: pathlib.Path, colours: int = 256) -> None:
    posterise_alpha(quantise(image, colours)).save(path, optimize=True)


def main() -> None:
    source = Image.open(SRC).convert("RGB")

    # Regions measured from the artwork: full lockup and the emblem alone.
    full = white_to_alpha(source.crop((110, 140, 905, 845)))
    emblem = white_to_alpha(source.crop((315, 145, 465, 515)))

    # The header renders the lockup about 34px tall, so 96px already exceeds the
    # 2x need. Shipping the 705px scan would cost ~700 KB for no visible gain.
    save_optimised(fit_height(full, 96), OUT / "logo.png")
    save_optimised(fit_height(full, 192), OUT / "logo@2x.png")
    save_optimised(fit_height(silhouette(full), 96), OUT / "logo-white.png")
    save_optimised(fit_height(silhouette(full), 192), OUT / "logo-white@2x.png")
    save_optimised(fit_height(emblem, 160), OUT / "logo-mark.png")
    save_optimised(fit_height(silhouette(emblem), 160), OUT / "logo-mark-white.png")

    # Icons come from the official mark. At 16px the mark's blue-and-green detail
    # muddies against a dark browser chrome, so it sits on a white rounded tile —
    # the same treatment as the app's own launcher icon, which keeps the favicon
    # consistent with the app on the member's home screen.
    mark = Image.open(MARK).convert("RGBA").crop(
        Image.open(MARK).convert("RGBA").getchannel("A").getbbox()
    )

    def icon(size: int) -> Image.Image:
        canvas = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
        ImageDraw.Draw(canvas).rounded_rectangle(
            [0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * 0.22), fill=(255, 255, 255, 255)
        )
        inner = fit_height(mark, round(size * 4 * 0.82))
        canvas.alpha_composite(inner, ((canvas.width - inner.width) // 2,
                                       (canvas.height - inner.height) // 2))
        return canvas.resize((size, size), Image.LANCZOS)

    for size, name in [(32, "favicon-32.png"), (48, "favicon-48.png"),
                       (180, "apple-touch-icon.png"), (192, "icon-192.png"),
                       (512, "icon-512.png")]:
        save_optimised(icon(size), OUT / name, colours=256)

    Image.open(OUT / "favicon-48.png").save(
        OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    # Browsers request /favicon.ico by default, so keep a copy at the site root
    # as well as under /assets/img (where the <link> tags point).
    Image.open(OUT / "favicon-48.png").save(
        OUT.parent.parent / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )

    # Social share card: brand gradient, the real lockup on a white panel, copy.
    og = gradient((1200, 630)).convert("RGBA")
    logo_og = fit_height(full, 150)
    panel = Image.new("RGBA", (logo_og.width + 80, logo_og.height + 60), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle(
        [0, 0, panel.width - 1, panel.height - 1], radius=24, fill=(255, 255, 255, 255)
    )
    panel.alpha_composite(logo_og, (40, 30))
    og.alpha_composite(panel, (80, 96))

    draw = ImageDraw.Draw(og)
    draw.text((80, 330), "Building Wealth Together.", font=load_font(66, True), fill=(255, 255, 255))
    draw.text((80, 420), "A smarter financial platform for salaried workers.",
              font=load_font(34), fill=(205, 229, 219))
    draw.text((80, 500), "Save consistently  ·  Access affordable financing  ·  Transparent records",
              font=load_font(25), fill=(169, 181, 175))
    og.convert("RGB").save(OUT / "og.png", optimize=True)

    # A JPEG version of the share card is what most crawlers prefer, and it is
    # far smaller than PNG for a photographic gradient.
    og.convert("RGB").save(OUT / "og.jpg", quality=86, optimize=True)

    for path in sorted(OUT.iterdir()):
        if path.suffix in {".png", ".ico", ".jpg"}:
            print(f"  {path.name:24} {path.stat().st_size / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
