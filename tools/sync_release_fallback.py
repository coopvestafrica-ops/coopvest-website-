#!/usr/bin/env python3
"""Refresh the download page's static release fallback from the live release.

The download page (`src/pages/download.html`) shows the current build's version,
size and SHA-256 digest so a visitor can verify the APK. `site.js` refreshes
those three fields from `/api/release-info` on load, and the page ships static
values so it is still correct with JavaScript disabled or if that handler is
unreachable.

Those static values do not update themselves, so without this script they drift
from the real release. That drift is not cosmetic: a visitor who reads the
fallback is told to verify the download against a digest that matches nothing
they can get, which is exactly the situation in which a careful person concludes
the file has been tampered with. (Verified: the page shipped build 291 /
cc2822f7… while the live release was build 323 / f36f7f8d….)

    python3 tools/sync_release_fallback.py           # rewrite the fallback
    python3 tools/sync_release_fallback.py --check   # exit 1 if out of date

Run automatically in the deploy workflow before `vercel build`, so the deployed
page always carries the real release's values. `--check` exists for anyone who
wants to gate on it.

Environment:
    GITHUB_TOKEN   optional; raises the GitHub API rate limit (60 -> 5000/hr)
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "src" / "pages" / "download.html"
REPO = os.environ.get("APK_REPO", "teejayfpi/Coopvest-Africa")


def parse_release_notes(body: str) -> dict:
    """Mirror api/release-info.js so the fallback matches what the API returns."""
    text = body or ""
    sha = re.search(r"SHA-256\**\s*:?\s*`?([a-f0-9]{64})`?", text, re.I)
    version = re.search(r"Version\**\s*:?\s*\**\s*([^\n*]+)", text, re.I)
    return {
        "sha256": sha.group(1).lower() if sha else None,
        "version": version.group(1).strip() if version else None,
    }


def fetch_release_info() -> dict:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "coopvest-website"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/releases?per_page=10", headers=headers
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        releases = json.load(resp)

    for release in releases:
        if release.get("draft"):
            continue
        apk = next(
            (a for a in release.get("assets", []) if a["name"].lower().endswith(".apk")), None
        )
        if not apk:
            continue
        info = parse_release_notes(release.get("body", ""))
        info["bytes"] = apk["size"]
        info["tag"] = release.get("tag_name")
        return info
    raise SystemExit("no APK asset found in any release")


def human_size(n: int) -> str:
    mb = n / (1024 * 1024)
    return f"about {round(mb)} MB"


def set_field(document: str, field: str, value: str) -> str:
    """Replace the text of the element carrying data-release-field="<field>".

    The closer is matched by backreference rather than assumed to be `</span>`:
    the version/size fields sit in `<span>`s but the digest sits in a `<code>`,
    and hard-coding the tag silently ate the `</code>` when first written.
    """
    pattern = re.compile(
        r'(<(?P<tag>[a-z]+)\b[^>]*data-release-field="' + re.escape(field) + r'"[^>]*>)'
        r"(?P<body>.*?)"
        r"(</(?P=tag)>)",
        re.S,
    )
    if not pattern.search(document):
        raise SystemExit(f'download.html has no data-release-field="{field}" element')
    return pattern.sub(lambda m: m.group(1) + value + m.group(4), document, count=1)


def main() -> int:
    check_only = "--check" in sys.argv
    info = fetch_release_info()

    if not info["sha256"] or not info["version"]:
        raise SystemExit(
            "release body is missing a SHA-256 or Version line; "
            "add them to the release notes so the page can show verifiable values"
        )

    doc = PAGE.read_text(encoding="utf-8")
    updated = set_field(doc, "version", info["version"])
    updated = set_field(updated, "size", human_size(info["bytes"]))
    updated = set_field(updated, "sha256", info["sha256"])

    if updated == doc:
        print(f"download fallback already current ({info['version']}, {info['tag']})")
        return 0

    if check_only:
        print(
            f"::error::download fallback is stale; expected {info['version']} "
            f"{info['sha256']}. Run tools/sync_release_fallback.py.",
            file=sys.stderr,
        )
        return 1

    PAGE.write_text(updated, encoding="utf-8")
    print(f"download fallback updated to {info['version']} ({info['tag']})")
    print(f"  size   {human_size(info['bytes'])}")
    print(f"  sha256 {info['sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
