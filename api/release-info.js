/**
 * Release info handler - GET /api/release-info
 *
 * The download page shows the current build's version, size and SHA-256 digest
 * next to the install button, so a visitor can verify the file they download
 * rather than hunting through release notes for it.
 *
 * Those values change with every build, so they are resolved from the same
 * release the download button points at, rather than hard-coded into the page.
 * The page ships a static fallback and this handler refreshes it on load; if the
 * API is unreachable the page keeps its last-known values rather than blanking.
 *
 * Environment variables:
 *   APK_REPO   owner/repo holding the release (default teejayfpi/Coopvest-Africa)
 *   GITHUB_TOKEN  optional; raises the GitHub API rate limit from 60 to 5000/hr
 */
const REPO = process.env.APK_REPO || "teejayfpi/Coopvest-Africa";
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

// Same reasoning as api/download.js: GitHub rate limits per IP and serverless
// egress is shared, so the resolved metadata is cached briefly.
const CACHE_MS = 5 * 60 * 1000;
let cache = { info: null, at: 0 };

/** Pull the fields the release body carries, each optional. */
function parseReleaseNotes(body) {
  const text = body || "";
  const sha256 = text.match(/SHA-256\**\s*:?\s*`?([a-f0-9]{64})`?/i);
  const version = text.match(/Version\**\s*:?\s*\**\s*([^\n*]+)/i);
  const size = text.match(/Size\**\s*:?\s*\**\s*([^\n*]+)/i);
  return {
    sha256: sha256 ? sha256[1].toLowerCase() : null,
    version: version ? version[1].trim() : null,
    size: size ? size[1].trim() : null,
  };
}

async function resolveReleaseInfo() {
  if (cache.info && Date.now() - cache.at < CACHE_MS) return cache.info;

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "coopvest-website",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }

  const releases = await response.json();
  for (const release of releases) {
    if (release.draft) continue;
    const apk = (release.assets || []).find((a) => a.name.toLowerCase().endsWith(".apk"));
    if (!apk) continue;

    const info = {
      ...parseReleaseNotes(release.body),
      bytes: apk.size,
      publishedAt: release.published_at,
      releaseUrl: release.html_url || RELEASES_PAGE,
      apkUrl: apk.browser_download_url,
    };
    cache = { info, at: Date.now() };
    return info;
  }
  throw new Error("no APK asset found in any release");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const info = await resolveReleaseInfo();
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.status(200).json(info);
  } catch (error) {
    console.error("release info failed:", error.message);
    // The page keeps its static fallback on a non-200, so this is not fatal.
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "release_info_unavailable" });
  }
}
