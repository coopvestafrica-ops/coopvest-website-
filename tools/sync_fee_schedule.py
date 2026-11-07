#!/usr/bin/env python3
"""Refresh the Schedule of Charges figures from the backend's fee endpoint.

The charges page (`src/pages/charges.html`) is built from
`src/data/fee-schedule.json`, which this script writes. The figures are not
authored here: they come from `GET /api/v1/fees`, which the backend derives from
`config/feeDisclosure.js` — the same module the routes that levy a charge import.
That keeps one source of truth across the two repositories, so a price list on
the website cannot quote a figure the app does not charge.

Why a separate script rather than a fetch inside `build.py`:

`build.py` has to stay hermetic. The Verify job in the deploy workflow runs it
with no network and fails if the committed pages differ from a rebuild, which is
what stops a partial being edited without rebuilding. A network call in the
build would make that job depend on the backend being up, and would let the
committed output change without a commit. This is the same shape as
`tools/sync_release_fallback.py`, which solves the identical problem for the
download page.

    python3 tools/sync_fee_schedule.py           # fetch and rewrite the data file
    python3 tools/sync_fee_schedule.py --check   # exit 1 if the live data differs

The deploy workflow runs this before `vercel build`, so the published page always
carries the current figures, and a failed or malformed response stops the deploy
rather than shipping a stale price list. `build.py` refuses to build the page at
all if the data file is missing, so a charge can never be published without a
figure behind it.

Environment:
    FEE_SCHEDULE_URL   override the endpoint (defaults to the production API)
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "src" / "data" / "fee-schedule.json"
DEFAULT_URL = "https://coopvest-api.onrender.com/api/v1/fees"

# Required top-level keys. A response missing any of these is treated as
# malformed and never overwrites a good file: a half-populated schedule would
# silently publish a page with charges missing from it.
REQUIRED_KEYS = ("version", "charges", "loan_interest_rates", "not_charged")
REQUIRED_CHARGE_KEYS = ("id", "label", "amount")


def fetch(url: str) -> dict:
    req = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": "coopvest-website"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def validate(data: dict) -> list[str]:
    """Return the problems with a response, if any."""
    problems: list[str] = []
    for key in REQUIRED_KEYS:
        if key not in data:
            problems.append(f"missing top-level key: {key}")

    charges = data.get("charges")
    if isinstance(charges, list):
        if not charges:
            problems.append("charges is empty")
        for charge in charges:
            for key in REQUIRED_CHARGE_KEYS:
                if key not in charge:
                    problems.append(f"charge {charge.get('id', '?')} missing {key}")
            if not isinstance(charge.get("amount"), (int, float)):
                problems.append(f"charge {charge.get('id', '?')} has a non-numeric amount")
    elif charges is not None:
        problems.append("charges is not a list")

    return problems


def normalise(data: dict) -> dict:
    """Drop transport-only fields so the committed file is stable."""
    out = {k: v for k, v in data.items() if k != "success"}
    return out


def render(data: dict) -> str:
    return json.dumps(normalise(data), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    check_only = "--check" in sys.argv
    url = os.environ.get("FEE_SCHEDULE_URL", DEFAULT_URL)

    try:
        data = fetch(url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
        print(f"could not fetch the fee schedule from {url}: {exc}")
        return 1

    problems = validate(data)
    if problems:
        print("the fee schedule response is malformed:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    rendered = render(data)
    current = DATA.read_text(encoding="utf-8") if DATA.is_file() else None

    if check_only:
        if current is None:
            print(f"{DATA.relative_to(ROOT)} does not exist; run without --check to create it")
            return 1
        if current != rendered:
            print("the committed fee schedule is out of date with the backend:")
            print(f"  run: python3 tools/sync_fee_schedule.py")
            return 1
        print("the committed fee schedule matches the backend")
        return 0

    if current == rendered:
        print(f"{DATA.relative_to(ROOT)} is already current (version {data.get('version')})")
        return 0

    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(rendered, encoding="utf-8")
    print(f"wrote {DATA.relative_to(ROOT)} (version {data.get('version')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
