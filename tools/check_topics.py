#!/usr/bin/env python3
"""Check that the contact form's topic options match the API allowlist.

The form's <select> is authored in src/pages/contact.html and the server-side
allowlist lives in api/contact.js. Editing one without the other means the form
silently rejects every submission, and the visitor sees "Please choose what your
message is about" no matter what they pick. Run this as part of the build.

    python3 tools/check_topics.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FORM = ROOT / "src" / "pages" / "contact.html"
API = ROOT / "api" / "contact.js"


def main() -> int:
    form_html = FORM.read_text(encoding="utf-8")
    api_js = API.read_text(encoding="utf-8")

    # Options with a real value; the placeholder has value="" and is not sent.
    options = re.findall(r"<option(?![^>]*value=\"\")[^>]*>([^<]+)</option>", form_html)
    options = [o.strip() for o in options]

    block = re.search(r"const TOPICS = new Set\(\[(.*?)\]\)", api_js, re.DOTALL)
    if not block:
        print("could not find the TOPICS allowlist in api/contact.js")
        return 1
    allowed = [m.strip() for m in re.findall(r"'([^']+)'", block.group(1))]

    problems = []
    for opt in options:
        if opt not in allowed:
            problems.append(f"form option not accepted by the API: {opt!r}")
    for entry in allowed:
        if entry not in options:
            problems.append(f"API accepts a topic the form never offers: {entry!r}")

    if problems:
        print(f"{len(problems)} topic mismatch(es) between the form and the API:")
        for p in problems:
            print("  " + p)
        print("\nThe contact form will reject submissions until these agree.")
        return 1

    print(f"contact topics agree ({len(options)} options)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
