#!/usr/bin/env python3
"""Check that the charges page quotes no amount of its own.

Every figure on the Schedule of Charges has to come from
`src/data/fee-schedule.json`, which is fetched from the backend. The page partial
is authored by hand, so a well-meaning edit could type a naira amount into the
prose - and that figure would then sit on the page unchanged while the backend
moved on. That is precisely the failure the schedule exists to prevent: a
published price that is not the charged price.

So the partial may not contain a literal naira figure. Amounts are written by
`build.py` from the data file. Run as part of the build.

    python3 tools/check_charges.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = ROOT / "src" / "pages" / "charges.html"
DATA = ROOT / "src" / "data" / "fee-schedule.json"

# A naira sign followed by a digit, e.g. "₦5,000". Percentages are allowed: the
# interest table is also generated, but a rate in prose ("simple interest, not
# compounded") is not a charge and carries no naira figure.
NAIRA = re.compile(r"₦\s?\d")


def main() -> int:
    if not PAGE.is_file():
        print(f"{PAGE.relative_to(ROOT)} does not exist")
        return 1

    text = PAGE.read_text(encoding="utf-8")
    problems: list[str] = []

    for lineno, line in enumerate(text.splitlines(), 1):
        if NAIRA.search(line):
            problems.append(
                f"{PAGE.relative_to(ROOT)}:{lineno} writes a naira figure directly: "
                f"{line.strip()[:70]}"
            )

    # The page must actually consume the generated values, or the amounts it
    # shows come from nowhere.
    for token in ("{{FEE_TABLE}}", "{{INTEREST_TABLE}}", "{{NOT_CHARGED}}", "{{FEE_VERSION}}"):
        if token not in text:
            problems.append(f"{PAGE.relative_to(ROOT)} is missing the {token} placeholder")

    if not DATA.is_file():
        problems.append(
            f"{DATA.relative_to(ROOT)} is missing; run 'python3 tools/sync_fee_schedule.py'"
        )

    if problems:
        print("the charges page must not state amounts of its own:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("charges page quotes only generated amounts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
