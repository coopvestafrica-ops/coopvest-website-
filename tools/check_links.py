#!/usr/bin/env python3
"""Check every built page for broken internal links and missing assets.

Run with the site served locally (python3 -m http.server 8080) or point BASE at
any deployed URL.
"""
from __future__ import annotations

import pathlib
import re
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ROOT = pathlib.Path("/workspace/project")

PAGES = ["/", "/about/", "/how-it-works/", "/products/", "/loans/", "/employers/",
         "/faqs/", "/contact/", "/privacy/", "/terms/", "/cookies/", "/disclosures/"]

LINK_RE = re.compile(r'(?:href|src)="([^"]+)"')


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "link-check"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, ""
    except Exception as exc:  # noqa: BLE001
        return 0, str(exc)


def main() -> int:
    failures: list[str] = []
    checked: set[str] = set()

    for page in PAGES:
        status, html = fetch(BASE + page)
        if status != 200:
            failures.append(f"PAGE {page} -> {status}")
            continue

        for target in set(LINK_RE.findall(html)):
            if target.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:")):
                continue
            url = BASE + target
            if url in checked:
                continue
            checked.add(url)
            code, _ = fetch(url)
            if code != 200:
                failures.append(f"{page} -> {target} [{code}]")

    print(f"checked {len(checked)} unique internal links across {len(PAGES)} pages")
    if failures:
        print("\nBROKEN:")
        for item in failures:
            print("  ", item)
        return 1

    print("all internal links and assets resolve")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
