#!/usr/bin/env python3
"""Responsive audit: find horizontal overflow and clipped content.

Loads every built page at the widths that matter and reports any element wider
than the viewport, plus the document scrollWidth, which is the definitive test
for a sideways-scrolling page.

    python3 tools/audit_responsive.py [base-url]
"""
from __future__ import annotations

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"

PAGES = [
    "/", "/about/", "/how-it-works/", "/products/", "/loans/", "/loan-products/",
    "/employers/", "/faqs/", "/download/", "/contact/", "/privacy/", "/terms/",
    "/cookies/", "/disclosures/", "/404.html",
]

# The widths that actually matter: the narrowest phone still in use, the common
# Android width, a large phone, a small tablet, and desktop.
WIDTHS = [320, 360, 390, 414, 480, 620, 768, 1024, 1280]

OVERFLOW_JS = """() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const style = getComputedStyle(el);
    if (style.position === 'fixed') return;
    // 1px tolerance for sub-pixel rounding.
    if (r.right > vw + 1 || r.left < -1) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
      });
    }
  });
  return {
    docScrollWidth: document.documentElement.scrollWidth,
    viewport: vw,
    offenders: out.slice(0, 6),
  };
}"""


def main() -> int:
    problems: list[str] = []
    checked = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width in WIDTHS:
            page = browser.new_page(viewport={"width": width, "height": 900})
            for path in PAGES:
                page.goto(BASE + path, wait_until="load")
                page.wait_for_timeout(120)
                result = page.evaluate(OVERFLOW_JS)
                checked += 1
                if result["docScrollWidth"] > result["viewport"] + 1:
                    problems.append(
                        f"{width}px {path}: page scrolls sideways "
                        f"({result['docScrollWidth']} > {result['viewport']})"
                    )
                    for o in result["offenders"]:
                        problems.append(
                            f"      {o['tag']}.{o['cls']} "
                            f"left={o['left']} right={o['right']} w={o['w']}"
                        )
            page.close()
        browser.close()

    print(f"checked {checked} page/width combinations")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print("  " + p)
        return 1
    print("no horizontal overflow at any tested width")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
