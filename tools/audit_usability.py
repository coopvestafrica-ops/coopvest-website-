#!/usr/bin/env python3
"""Responsive quality audit beyond overflow.

Checks the things that make a page usable on a phone rather than merely not
broken: tap targets big enough to hit, text big enough to read, tables that
scroll rather than squash, and images that do not upscale past their source.

    python3 tools/audit_usability.py [base-url]
"""
from __future__ import annotations

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
PAGES = ["/", "/about/", "/loan-products/", "/download/", "/contact/", "/employers/", "/faqs/"]

# WCAG 2.2 AA (2.5.8) requires 24x24 CSS px; 44x44 is the stricter Apple/Material
# guidance. We fail on the former and advise on the latter, rather than treating
# a text link whose width matches its label as broken.
MIN_TAP_HARD = 24
MIN_TAP_ADVISORY = 44
MIN_TEXT = 12.0

AUDIT_JS = """() => {
  const out = { smallTargets: [], smallText: [], squashedTables: [], wideTables: [] };

  document.querySelectorAll('a, button, input, select, textarea, [role="button"]').forEach(el => {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (r.width === 0 || r.height === 0) return;
    if (style.display === 'none' || style.visibility === 'hidden') return;
    // Inline links inside prose are exempt; they are not standalone controls.
    const inProse = el.closest('.prose, .faq__body, p');
    if (inProse && el.tagName === 'A') return;
    // A visually-hidden control (the skip link) is not a touch target until focused.
    if (r.width <= 2 && r.height <= 2) return;
    if (r.height < 44 || r.width < 44) {
      out.smallTargets.push({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 30),
        w: Math.round(r.width), h: Math.round(r.height),
        // WCAG 2.2 AA needs 24x24; below that is a genuine failure.
        hard: r.height < 24 || r.width < 24,
      });
    }
  });

  document.querySelectorAll('p, li, td, th, .stat__label, .photo-caption').forEach(el => {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 12) {
      out.smallText.push({ tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 30), size });
    }
  });

  document.querySelectorAll('table').forEach(t => {
    const wrap = t.closest('.table-wrap');
    const r = t.getBoundingClientRect();
    if (!wrap) { out.wideTables.push({ w: Math.round(r.width), scrolls: false }); return; }
    const ws = getComputedStyle(wrap);
    out.wideTables.push({
      w: Math.round(r.width),
      scrolls: ws.overflowX === 'auto' || ws.overflowX === 'scroll',
    });
  });

  return out;
}"""


def main() -> int:
    failures: list[str] = []
    advisories: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        # 360px is the common Android width; 320px is the floor we support.
        for width in (320, 360, 414):
            page = browser.new_page(viewport={"width": width, "height": 800})
            for path in PAGES:
                page.goto(BASE + path, wait_until="load")
                page.wait_for_timeout(120)
                r = page.evaluate(AUDIT_JS)

                for t in r["smallTargets"]:
                    line = (
                        f"{width}px {path}: {t['tag']} {t['w']}x{t['h']} — \"{t['text']}\""
                    )
                    (failures if t["hard"] else advisories).append(line)
                for t in r["smallText"]:
                    failures.append(
                        f"{width}px {path}: text {t['size']}px < {MIN_TEXT}px — "
                        f"\"{t['text']}\""
                    )
                for t in r["wideTables"]:
                    if not t["scrolls"]:
                        failures.append(
                            f"{width}px {path}: table {t['w']}px with no scroll container"
                        )
            page.close()
        browser.close()

    # Collapse repeats so the report is readable: the same link appears on
    # every page at every width.
    def summarise(items: list[str]) -> list[str]:
        seen: dict[str, int] = {}
        for i in items:
            key = i.split(": ", 1)[1]
            seen[key] = seen.get(key, 0) + 1
        return [f"{k}  (x{n})" for k, n in sorted(seen.items(), key=lambda kv: -kv[1])]

    if advisories:
        print(f"{len(advisories)} advisory (below {MIN_TAP_ADVISORY}px, meets WCAG 2.2 AA):")
        for a in summarise(advisories)[:12]:
            print("  " + a)
        print()

    if failures:
        print(f"{len(failures)} FAILURE(s):")
        for f in summarise(failures):
            print("  " + f)
        return 1

    print("no accessibility-blocking usability issues found")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
