#!/usr/bin/env python3
"""Static site generator for the Coopvest Africa corporate website.

Source of truth lives in src/pages/<slug>.html (a page body plus a small
metadata header). Running this script writes plain HTML into the repository
root and per-page directories, ready to deploy to any static host.

    python3 build.py

The generated output is committed, so a static host can serve the repository
without running this script at all.
"""
from __future__ import annotations

import html
import pathlib

ROOT = pathlib.Path(__file__).parent
PAGES_DIR = ROOT / "src" / "pages"
SITE = "https://coopvest.africa"

SHELL_HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <link rel="canonical" href="{site}{path}" />
  <meta name="theme-color" content="#2563EB" />
  <meta name="robots" content="{robots}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Coopvest Africa" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:url" content="{site}{path}" />
  <meta property="og:image" content="{site}/assets/img/og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{title}" />
  <meta name="twitter:description" content="{desc}" />
  <meta name="twitter:image" content="{site}/assets/img/og.jpg" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/img/favicon-48.png" />
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/css/site.css" />
{jsonld}</head>
<body>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header class="site-header">
    <div class="wrap site-header__bar">
      <a class="brand" href="/">
        <img class="brand__logo" src="/assets/img/logo.png" srcset="/assets/img/logo.png 1x, /assets/img/logo@2x.png 2x" width="108" height="96" alt="Coopvest Africa" />
        <span class="brand__text">
          <span class="brand__tag">Building Wealth Together</span>
        </span>
      </a>

      <button class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Toggle navigation menu">
        <span class="nav-toggle__bars" aria-hidden="true"></span>
      </button>

      <nav class="nav" id="site-nav" data-nav aria-label="Primary">
        <a href="/about/">About</a>
        <a href="/how-it-works/">How It Works</a>
        <a href="/products/">Products</a>
        <a href="/loans/">Loans</a>
        <a href="/employers/">For Employers</a>
        <a href="/faqs/">FAQs</a>
      </nav>

      <div class="header__actions">
        <a class="btn btn--ghost" href="/contact/">Contact</a>
        <a class="btn btn--primary" href="/contact/">Get Started</a>
      </div>
    </div>
  </header>

  <main id="main">
"""

SHELL_FOOT = """  </main>

  <footer class="site-footer">
    <div class="wrap">
      <div class="footer__grid">
        <div>
          <div class="footer__brand">
            <img class="footer__logo" src="/assets/img/logo-white.png" srcset="/assets/img/logo-white.png 1x, /assets/img/logo-white@2x.png 2x" width="92" height="82" alt="Coopvest Africa" />
          </div>
          <p>A digital cooperative platform helping salaried workers save consistently and access affordable financing.</p>
        </div>
        <div>
          <h2>Company</h2>
          <ul class="footer__links">
            <li><a href="/about/">About Us</a></li>
            <li><a href="/how-it-works/">How It Works</a></li>
            <li><a href="/products/">Products &amp; Services</a></li>
            <li><a href="/loans/">Loans</a></li>
          </ul>
        </div>
        <div>
          <h2>Get involved</h2>
          <ul class="footer__links">
            <li><a href="/employers/">For Employers</a></li>
            <li><a href="/faqs/">FAQs</a></li>
            <li><a href="/contact/">Contact</a></li>
          </ul>
        </div>
        <div>
          <h2>Legal &amp; trust</h2>
          <ul class="footer__links">
            <li><a href="/privacy/">Privacy Policy</a></li>
            <li><a href="/terms/">Terms of Service</a></li>
            <li><a href="/cookies/">Cookie Policy</a></li>
            <li><a href="/disclosures/">Risk Disclosures</a></li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <p>&copy; <span data-year>2026</span> Coopvest Africa. All rights reserved.</p>
        <ul>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/terms/">Terms</a></li>
          <li><a href="/cookies/">Cookies</a></li>
          <li><a href="/disclosures/">Disclosures</a></li>
        </ul>
      </div>
    </div>
  </footer>

  <script src="/assets/js/site.js" defer></script>
</body>
</html>
"""

def parse_partial(text: str) -> tuple[dict[str, str], str]:
    """Split a page partial into its metadata block and its body.

    A partial starts with an HTML comment of `key: value` lines, e.g.
        <!--
        title: About Us — Coopvest Africa
        description: …
        -->
    Everything after that comment is the page body. Values may themselves
    contain colons (URLs, JSON-LD), so only the first colon separates.
    """
    meta: dict[str, str] = {}
    body = text.lstrip()

    if body.startswith("<!--"):
        end = body.find("-->")
        if end == -1:
            raise ValueError("Unterminated metadata comment")
        block = body[len("<!--"):end]
        for line in block.splitlines():
            line = line.strip()
            if not line or ":" not in line:
                continue
            key, _, value = line.partition(":")
            meta[key.strip().lower()] = value.strip()
        body = body[end + len("-->"):].lstrip()

    return meta, body


def build() -> None:
    partials = sorted(PAGES_DIR.glob("*.html"))
    if not partials:
        raise SystemExit(f"No page partials found in {PAGES_DIR}")

    written: list[str] = []
    urls: list[tuple[str, bool]] = []
    for partial in partials:
        slug = partial.stem
        meta, body = parse_partial(partial.read_text(encoding="utf-8"))

        if slug == "home":
            out_path = ROOT / "index.html"
            url_path = "/"
        elif slug == "404":
            # Static hosts want a single 404.html at the site root.
            out_path = ROOT / "404.html"
            url_path = "/404.html"
        else:
            out_path = ROOT / slug / "index.html"
            url_path = f"/{slug}/"

        jsonld = ""
        if "jsonld" in meta:
            jsonld = f'  <script type="application/ld+json">\n  {meta["jsonld"]}\n  </script>\n'

        document = (
            SHELL_HEAD.format(
                title=html.escape(meta.get("title", "Coopvest Africa")),
                desc=html.escape(meta.get("description", "")),
                path=url_path,
                robots=meta.get("robots", "index, follow"),
                site=SITE,
                jsonld=jsonld,
            )
            + body
            + "\n"
            + SHELL_FOOT
        )

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(document, encoding="utf-8")
        written.append(str(out_path.relative_to(ROOT)))
        urls.append((url_path, meta.get("robots", "index, follow").startswith("index")))

    print("Built:")
    for path in written:
        print("  ", path)

    write_sitemap(urls)


def write_sitemap(urls: list[tuple[str, bool]]) -> None:
    """Emit sitemap.xml for the indexable pages."""
    priority = {"/": "1.0", "/how-it-works/": "0.9", "/loans/": "0.9",
                "/employers/": "0.9", "/about/": "0.8", "/products/": "0.8"}
    entries = []
    for path, indexable in sorted(urls):
        if not indexable:
            continue
        entries.append(
            "  <url>\n"
            f"    <loc>{SITE}{path}</loc>\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>{priority.get(path, '0.6')}</priority>\n"
            "  </url>"
        )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    print("  sitemap.xml")


if __name__ == "__main__":
    build()
