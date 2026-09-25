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

import hashlib
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
PAGES_DIR = ROOT / "src" / "pages"
SITE = "https://coopvest.africa"

# The brand node every page carries. Kept here rather than duplicated into each
# partial so the contact details cannot drift between pages.
ORGANIZATION = {
    "@type": "Organization",
    "@id": f"{SITE}/#organization",
    "name": "Coopvest Africa",
    "url": f"{SITE}/",
    "logo": f"{SITE}/assets/img/icon-512.png",
    "description": (
        "A digital cooperative platform helping salaried workers save consistently "
        "and access affordable financing."
    ),
    "email": "coopvestafrica@gmail.com",
    "areaServed": {"@type": "Country", "name": "Nigeria"},
}

SHELL_HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <meta name="description" content="{desc}" />
  <link rel="canonical" href="{site}{path}" />
  <meta name="theme-color" content="#1B5E20" />
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
  <div class="scroll-progress" data-scroll-progress aria-hidden="true"></div>
  <a class="skip-link" href="#main">Skip to main content</a>

  <header class="site-header">
    <div class="wrap site-header__bar">
      <a class="brand" href="/">
        <img class="brand__logo" src="/assets/img/logo.png" srcset="/assets/img/logo.png 1x, /assets/img/logo@2x.png 2x" width="139" height="96" alt="Coopvest Africa" />
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
        <a href="/loan-products/">Loan Rates</a>
        <a href="/employers/">For Employers</a>
        <a href="/faqs/">FAQs</a>
      </nav>

      <div class="header__actions">
        <a class="btn btn--ghost" href="/download/">Get the App</a>
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
            <img class="footer__logo" src="/assets/img/logo-white.png" srcset="/assets/img/logo-white.png 1x, /assets/img/logo-white@2x.png 2x" width="139" height="96" alt="Coopvest Africa" />
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
            <li><a href="/loan-products/">Loan Products &amp; Rates</a></li>
          </ul>
        </div>
        <div>
          <h2>Get involved</h2>
          <ul class="footer__links">
            <li><a href="/employers/">For Employers</a></li>
            <li><a href="/download/">Download the App</a></li>
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

  <button class="to-top" data-to-top type="button" aria-label="Back to top" tabindex="-1" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
  </button>

  <div class="mobile-cta" role="group" aria-label="Quick actions">
    <a class="btn btn--ghost" href="/download/">Get the App</a>
    <a class="btn btn--primary" href="/contact/">Get Started</a>
  </div>

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


def asset_version(path: pathlib.Path) -> str:
    """Short content hash used to bust the immutable /assets cache.

    vercel.json serves everything under /assets/ as `immutable` for a year, but
    the filenames are not hashed, so a browser that has already fetched
    /assets/img/logo.png keeps the old copy for a year and never revalidates — a
    logo or palette change silently does not reach returning visitors. Rewriting
    each /assets/ URL to carry the hash makes a changed file a changed URL.
    """
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def version_assets(document: str) -> str:
    """Append a content hash to every /assets/ URL in a built page.

    Done as a pass over the finished document rather than per-reference so a new
    asset in a page partial is covered automatically, with no second place to
    remember to update.
    """
    cache: dict[str, str] = {}

    def replace(match: re.Match[str]) -> str:
        url = match.group(0)
        path = ROOT / url.lstrip("/").split("?")[0]
        if not path.is_file():
            return url
        if url not in cache:
            cache[url] = asset_version(path)
        return f"{url}?v={cache[url]}"

    return re.sub(r"/assets/[A-Za-z0-9_./@-]+", replace, document)


# A photo `<img>` whose file has a WebP sibling gets wrapped in a `<picture>`, so
# browsers that support WebP take the smaller file and the rest fall back to the
# JPEG. Doing it here keeps the page partials readable — an author writes a
# normal `<img>` and does not have to remember the alternate format.
PHOTO_IMG = re.compile(r'(?P<indent>[ \t]*)<img(?P<attrs>[^>]*?class="photo"[^>]*?)>', re.DOTALL)
PHOTO_SRC = re.compile(r'src="(?P<src>/assets/img/[^"]+?)\.(?:jpg|jpeg|png)"')


def add_webp_sources(document: str) -> str:
    def wrap(match: re.Match[str]) -> str:
        attrs = match.group("attrs")
        src = PHOTO_SRC.search(attrs)
        if not src:
            return match.group(0)
        webp = ROOT / (src.group("src").lstrip("/") + ".webp")
        if not webp.is_file():
            return match.group(0)
        indent = match.group("indent")
        return (
            f'{indent}<picture>\n'
            f'{indent}  <source srcset="{src.group("src")}.webp" type="image/webp" />\n'
            f'{indent}  <img{attrs} />\n'
            f'{indent}</picture>'
        )

    return PHOTO_IMG.sub(wrap, document)


FAQ_ITEM = re.compile(
    r"<summary>(?P<q>.*?)</summary>\s*<div class=\"faq__body\">(?P<a>.*?)</div>",
    re.DOTALL,
)


def faq_schema(body: str) -> dict[str, object] | None:
    """Derive FAQPage structured data from the page's own <details> markup.

    Reading the questions back out of the rendered body rather than asking the
    author to restate them means the schema cannot fall out of step with the
    visible copy — which is both a maintenance win and what the guidelines
    require, since the markup must match what the reader sees.
    """
    items = []
    for match in FAQ_ITEM.finditer(body):
        question = html.unescape(re.sub(r"<[^>]+>", "", match.group("q"))).strip()
        answer = html.unescape(re.sub(r"<[^>]+>", " ", match.group("a")))
        answer = re.sub(r"\s+", " ", answer).strip()
        if question and answer:
            items.append(
                {
                    "@type": "Question",
                    "name": question,
                    "acceptedAnswer": {"@type": "Answer", "text": answer},
                }
            )
    if not items:
        return None
    return {"@type": "FAQPage", "mainEntity": items}


def structured_data(slug: str, url_path: str, meta: dict[str, str], body: str) -> str:
    """Build the JSON-LD block for a page.

    Every page gets the Organization node, because it is what search engines and
    answer boxes use to resolve the brand, and a BreadcrumbList on interior pages
    so the page's place in the hierarchy shows in results rather than a bare URL.
    A page may still declare its own `jsonld` in the partial; that is emitted
    alongside rather than instead, so nothing already written is lost.
    """
    graph: list[dict[str, object]] = [ORGANIZATION]

    if slug not in {"home", "404"}:
        title = html.unescape(meta.get("title", slug.title()))
        # Page titles are written as "About Us — Coopvest Africa"; the crumb
        # should read "About Us", so drop the brand suffix.
        label = title.split(" — ")[0].strip()
        graph.append(
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": label, "item": f"{SITE}{url_path}"},
                ],
            }
        )

    blocks = [json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)]

    faq = faq_schema(body)
    if faq:
        blocks.append(json.dumps({"@context": "https://schema.org", **faq}, ensure_ascii=False))

    if "jsonld" in meta:
        blocks.append(meta["jsonld"])

    return "".join(
        f'  <script type="application/ld+json">\n  {block}\n  </script>\n' for block in blocks
    )


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

        jsonld = structured_data(slug, url_path, meta, body)

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
        document = add_webp_sources(document)
        document = version_assets(document)

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
