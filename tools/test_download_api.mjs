// Local smoke test for the APK download handler. Not part of the deployment.
// Copies api/download.js to .mjs so it can be imported without a package.json
// rewrite, then drives it with stub req/res objects. The GitHub API is stubbed
// so the test does not depend on network state or the current release contents.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TMP = new URL("./.download_under_test.mjs", import.meta.url);
writeFileSync(TMP, readFileSync(new URL("../api/download.js", import.meta.url), "utf8"));

// The handler caches the resolved URL in module state, which is what we want in
// production. To exercise the cold-start and failure paths here we import a
// fresh instance of the same file per case by varying the URL query.
let loadCount = 0;
async function freshHandler() {
  const url = pathToFileURL(TMP.pathname).href + `?case=${++loadCount}`;
  return (await import(url)).default;
}

const handler = await freshHandler();

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

async function call({ method = "GET" } = {}, fn = handler) {
  const res = makeRes();
  await fn({ method, headers: {} }, res);
  return res;
}

// Capture the real fetch so we can stub and restore it.
const realFetch = globalThis.fetch;
function stubGitHub(releases) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => releases,
  });
}

const APK_URL =
  "https://github.com/teejayfpi/Coopvest-Africa/releases/download/latest-apk/app-release.apk";

// 1. Releases are the workflow's own asset name (Coopvest-Africa.apk)
stubGitHub([
  { draft: false, assets: [{ name: "Coopvest-Africa.apk", browser_download_url: APK_URL }] },
]);
let r = await call();
check("resolves the workflow asset name", r.statusCode === 302 && r.headers.Location === APK_URL, {
  code: r.statusCode, loc: r.headers.Location,
});

// 2. The asset name from a tag-push release must also resolve, because that is
//    the mismatch that broke the button originally.
stubGitHub([
  { draft: false, assets: [{ name: "app-release.apk", browser_download_url: APK_URL }] },
]);
r = await call();
check("resolves the tag-push asset name too", r.statusCode === 302 && r.headers.Location === APK_URL, {
  code: r.statusCode, loc: r.headers.Location,
});

// 3. Drafts are skipped
stubGitHub([
  { draft: true, assets: [{ name: "app-release.apk", browser_download_url: "https://wrong" }] },
  { draft: false, assets: [{ name: "app-release.apk", browser_download_url: APK_URL }] },
]);
r = await call();
check("skips draft releases", r.statusCode === 302 && r.headers.Location === APK_URL, r.headers.Location);

// 4. A release with no APK falls back to the releases page rather than 500
stubGitHub([{ draft: false, assets: [{ name: "notes.txt", browser_download_url: "https://x" }] }]);
r = await call({}, await freshHandler());
check("no APK -> redirect to releases page",
  r.statusCode === 302 && r.headers.Location.endsWith("/releases"), r.headers.Location);

// 5. API failure also falls back cleanly
globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
r = await call({}, await freshHandler());
check("GitHub API error -> redirect to releases page",
  r.statusCode === 302 && r.headers.Location.endsWith("/releases"), r.headers.Location);

// 5b. A thrown fetch (DNS/network failure) must not 500 either
globalThis.fetch = async () => { throw new Error("ENOTFOUND api.github.com"); };
r = await call({}, await freshHandler());
check("network failure -> redirect to releases page",
  r.statusCode === 302 && r.headers.Location.endsWith("/releases"), r.headers.Location);

// 6. Non-GET/HEAD is rejected
globalThis.fetch = realFetch;
r = await call({ method: "POST" });
check("POST -> 405", r.statusCode === 405, { code: r.statusCode });

// 7. The redirect must not be cached, because GitHub's asset URL is signed and
//    time limited.
stubGitHub([
  { draft: false, assets: [{ name: "app-release.apk", browser_download_url: APK_URL }] },
]);
r = await call({}, await freshHandler());
check("response is not cached", /no-store/.test(r.headers["Cache-Control"] || ""), r.headers["Cache-Control"]);
check("only the Location header is needed to download",
  !r.body && typeof r.headers.Location === "string" && r.headers.Location.startsWith("https://"),
  r.headers.Location);

// 8. A second call within the cache window must not hit GitHub again
let calls = 0;
globalThis.fetch = async () => { calls += 1; return { ok: true, status: 200, json: async () => [
  { draft: false, assets: [{ name: "app-release.apk", browser_download_url: APK_URL }] },
] }; };
const cached = await freshHandler();
await call({}, cached);
await call({}, cached);
check("repeat call reuses the cached URL", calls === 1, { githubCalls: calls });

globalThis.fetch = realFetch;
rmSync(TMP, { force: true });
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
