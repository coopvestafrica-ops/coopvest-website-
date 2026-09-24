#!/usr/bin/env python3
"""Set GitHub Actions secrets for the website repository.

GitHub requires each secret value to be sealed with the repository's public key
using libsodium's sealed-box construction (X25519 + XSalsa20-Poly1305) before it
is sent to the API. PyNaCl implements that box directly.

Usage:
    TARGET_REPO=owner/repo GITHUB_TOKEN=... \
        python3 tools/set_actions_secrets.py NAME=VALUE [NAME=VALUE ...]

Run once locally against the target repository, then delete the values from your
shell history.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request

from nacl.public import PublicKey, SealedBox

REPO = os.environ.get("TARGET_REPO", "coopvestafrica-ops/coopvest-website-")
API = "https://api.github.com"


def api(path: str, token: str, method: str = "GET", payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "openhands",
            **({"Content-Type": "application/json"} if data else {}),
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"{method} {path} -> HTTP {exc.code}: {detail}")


def seal(plaintext: str, public_key_b64: str) -> str:
    box = SealedBox(PublicKey(base64.b64decode(public_key_b64)))
    return base64.b64encode(box.encrypt(plaintext.encode())).decode()


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("GITHUB_TOKEN is not set", file=sys.stderr)
        return 1

    pairs: list[tuple[str, str]] = []
    for arg in sys.argv[1:]:
        if "=" not in arg:
            print(f"ignoring malformed argument: {arg}", file=sys.stderr)
            continue
        name, _, value = arg.partition("=")
        pairs.append((name.strip(), value))

    if not pairs:
        print("no NAME=VALUE arguments supplied", file=sys.stderr)
        return 1

    key_info = api(f"/repos/{REPO}/actions/secrets/public-key", token)
    key_id = key_info["key_id"]
    public_key = key_info["key"]

    for name, value in pairs:
        api(
            f"/repos/{REPO}/actions/secrets/{name}",
            token,
            method="PUT",
            payload={"encrypted_value": seal(value, public_key), "key_id": key_id},
        )
        print(f"  set {name}")

    listed = api(f"/repos/{REPO}/actions/secrets", token)
    names = ", ".join(s["name"] for s in listed.get("secrets", [])) or "none"
    print("secrets now defined:", names)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

