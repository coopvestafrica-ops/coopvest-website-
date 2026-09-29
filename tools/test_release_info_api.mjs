// Local smoke test for the release-info handler. Not part of the deployment.
// Mirrors tools/test_download_api.mjs: the GitHub API is stubbed so the test
// does not depend on network state or the current release contents.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TMP = new URL("./.release_info_under_test.mjs", import.meta.url);
writeFileSync(TMP, readFileSync(new URL("../api/release-info.js", import.meta.url), "utf8"));

let loadCount = 0;
async function freshHandler() {
  const url = pathToFileURL(TMP.pathname).href + `?case=${++loadCount}`;
  return (await import(url)).default;
}

let failures = 0;
function check(label, condition, detail) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${condition ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!condition) failures += 1;
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { this.ended = true; return this; },
  };
}

async function call({ method = "GET" } = {}, fn) {
  const res = makeRes();
  await fn({ method, headers: {} }, res);
  return res;
}

const realFetch = globalThis.fetch;
function stubGitHub(releases) {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => releases });
}

const RELEASE_BODY = [
  "Direct download for Android.",
  "",
  "- **Version**: 1.0.0 (build 291)",
  "- **Built from**: `275d2f21` on `main`",
  "- **Size**: 86M",
  "- **Requires**: Android 7.0 (API 24) or newer",
  "- **SHA-256**: `cc2822f706fbe34787fa5e0055fdbda36207a907b5320bd7b4ba4cdcc3a758e0`",
].join("\n");

const SHA = "cc2822f706fbe34787fa5e0055fdbda36207a907b5320bd7b4ba4cdcc3a758e0";

// 1. Parses the fields the page renders, from the workflow's own asset name.
stubGitHub([
  {
    draft: false,
    tag_name: "latest-apk",
    body: RELEASE_BODY,
    html_url: "https://github.com/teejayfpi/Coopvest-Africa/releases/tag/latest-apk",
    published_at: "2026-09-29T18:14:25Z",
    assets: [{ name: "Coopvest-Africa.apk", size: 89790419, browser_download_url: "https://apk" }],
  },
]);
let r = await call({}, await freshHandler());
check("200 with parsed metadata", r.statusCode === 200, r.statusCode);
check("sha256 parsed", r.body.sha256 === SHA, r.body.sha256);
check("version parsed", /1\.0\.0/.test(r.body.version || ""), r.body.version);
check("size parsed", /86/.test(r.body.size || ""), r.body.size);
check("apk byte count exposed", r.body.bytes === 89790419, r.body.bytes);
check("release url exposed", /\/releases\/tag\/latest-apk$/.test(r.body.releaseUrl || ""), r.body.releaseUrl);

// 2. Tag-push asset name resolves too (same mismatch the download button guards).
stubGitHub([
  { draft: false, body: RELEASE_BODY, assets: [{ name: "app-release.apk", size: 1, browser_download_url: "https://apk" }] },
]);
r = await call({}, await freshHandler());
check("resolves app-release.apk too", r.statusCode === 200 && r.body.sha256 === SHA, r.statusCode);

// 3. Drafts skipped.
stubGitHub([
  { draft: true, body: "nope", assets: [{ name: "app-release.apk", size: 1, browser_download_url: "https://wrong" }] },
  { draft: false, body: RELEASE_BODY, assets: [{ name: "app-release.apk", size: 1, browser_download_url: "https://apk" }] },
]);
r = await call({}, await freshHandler());
check("skips drafts", r.statusCode === 200 && r.body.sha256 === SHA, r.body.sha256);

// 4. A release with no SHA-256 line yields null rather than a bogus value.
stubGitHub([
  { draft: false, body: "No digest here.", assets: [{ name: "app-release.apk", size: 1, browser_download_url: "https://apk" }] },
]);
r = await call({}, await freshHandler());
check("missing digest -> null", r.statusCode === 200 && r.body.sha256 === null, r.body.sha256);

// 5. No APK asset at all -> 502, so the page keeps its static fallback.
stubGitHub([{ draft: false, body: "x", assets: [{ name: "notes.txt", size: 1, browser_download_url: "https://x" }] }]);
r = await call({}, await freshHandler());
check("no APK -> 502", r.statusCode === 502 && r.body.error === "release_info_unavailable", r.statusCode);

// 6. API failure and network failure both 502 cleanly rather than 500.
globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
r = await call({}, await freshHandler());
check("GitHub API error -> 502", r.statusCode === 502, r.statusCode);

globalThis.fetch = async () => { throw new Error("ENOTFOUND api.github.com"); };
r = await call({}, await freshHandler());
check("network failure -> 502", r.statusCode === 502, r.statusCode);

// 7. Non-GET/HEAD rejected.
globalThis.fetch = realFetch;
r = await call({ method: "POST" }, await freshHandler());
check("POST -> 405", r.statusCode === 405, r.statusCode);

// 8. Repeat call within the cache window does not hit GitHub again.
let calls = 0;
globalThis.fetch = async () => {
  calls += 1;
  return { ok: true, status: 200, json: async () => [
    { draft: false, body: RELEASE_BODY, assets: [{ name: "app-release.apk", size: 1, browser_download_url: "https://apk" }] },
  ] };
};
const cached = await freshHandler();
await call({}, cached);
await call({}, cached);
check("repeat call reuses cached metadata", calls === 1, { githubCalls: calls });

globalThis.fetch = realFetch;
rmSync(TMP, { force: true });
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
