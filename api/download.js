/**
 * APK download handler — GET /api/download
 *
 * Sends the visitor to the current Android build. The site links to this path
 * rather than to a release URL directly, because the asset name is not stable:
 * the build workflow uploads it as "Coopvest-Africa.apk", but a release created
 * from a tag push carries the raw "app-release.apk". Linking the literal name
 * meant the button silently 404'd when the two disagreed.
 *
 * Resolving the newest .apk asset at request time means the button keeps working
 * whichever name the workflow produces, and the release can be republished
 * without touching the site.
 *
 * Environment variables:
 *   APK_REPO   owner/repo holding the release (default teejayfpi/Coopvest-Africa)
 *   GITHUB_TOKEN  optional; raises the GitHub API rate limit from 60 to 5000/hr
 */
const REPO = process.env.APK_REPO || "teejayfpi/Coopvest-Africa";
const RELEASES_PAGE = `https://github.com/${REPO}/releases`;

// GitHub's API is rate limited per IP and serverless egress is shared, so the
// resolved URL is cached briefly. The URL is stable across builds anyway.
const CACHE_MS = 5 * 60 * 1000;
let cache = { url: null, at: 0 };

async function resolveApkUrl() {
  if (cache.url && Date.now() - cache.at < CACHE_MS) return cache.url;

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
    if (apk) {
      cache = { url: apk.browser_download_url, at: Date.now() };
      return apk.browser_download_url;
    }
  }
  throw new Error("no APK asset found in any release");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const url = await resolveApkUrl();
    // 302 rather than 307: the asset URL is a signed, time-limited link, so the
    // browser must re-resolve through this handler rather than cache the target.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", url);
    return res.status(302).end();
  } catch (error) {
    console.error("apk resolve failed:", error.message);
    // Fall back to the releases page rather than dead-ending the visitor.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", RELEASES_PAGE);
    return res.status(302).end();
  }
}