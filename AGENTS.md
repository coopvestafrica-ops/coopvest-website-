# Working in the Coopvest Africa website

## What this is

A static marketing site with a Python generator. There is no framework and no
runtime build step for the pages: `src/pages/<slug>.html` holds each page body
plus a small metadata comment, and `build.py` wraps it in a shared head/footer
shell and writes plain HTML into the repo root and per-page directories. The
generated HTML is committed, so a static host can serve the repo as-is.

## Commands

```bash
python3 build.py            # regenerate all HTML + sitemap.xml  (npm run build)
python3 tools/check_links.py <base-url>   # needs a running server
npm test                    # contact-form serverless function tests
```

`check_links.py` defaults to `http://localhost:8080`, so start one first:

```bash
python3 -m http.server 8080 &
python3 tools/check_links.py
```

Run `npm install` before `npm test` — `nodemailer` is required by the test
harness and is not vendored.

## Editing pages

Edit `src/pages/*.html`, never the generated `index.html` / `<slug>/index.html`
files directly — the next build overwrites them. Generated output is committed,
so a content change needs a rebuild *and* the rebuilt files staged together.

A page partial begins with an HTML comment of `key: value` lines
(`title`, `description`, `robots`, optional `jsonld`). Values may contain
colons, so only the first colon separates.

## The APK download

The download page's button points at `/api/download`, not at a GitHub release
URL. That indirection is deliberate: the release asset name is not stable. The
build workflow's release step uploads it as `Coopvest-Africa.apk` (it renames on
upload), but the tag-push step and manually published releases carry the raw
`app-release.apk`. Linking a literal filename broke the button once already.

`api/download.js` resolves the newest `.apk` asset on the release at request
time and redirects, so the button works whichever name a given release used.
It caches the resolved URL in-process for a few minutes to stay well inside the
GitHub API rate limit, and falls back to the releases page rather than
dead-ending the visitor if the API is unreachable.

Because the asset URL GitHub returns is signed and time-limited, the handler
sends a 302 with `no-store` — the browser must re-resolve through the handler
rather than caching the signed target.

## Photography

Originals are uploaded to `download/`. They arrive large and mislabelled — every
`coopvest-*.jpg` is actually PNG data under a `.jpg` extension, which is the wrong
format for a photograph and about five times the necessary size. Never serve
them directly.

`tools/make_photo_assets.py` re-encodes each one to the size its slot needs and
writes both a JPEG fallback and a WebP into `assets/img/`. Roughly 4–8 MB per
source becomes 24–150 KB. Run it after adding or replacing a photo:

```bash
python3 tools/make_photo_assets.py
```

Each entry in `PHOTOS` carries a vertical `bias` for the crop. Photographs of
people crop badly from the centre — a centre crop of a standing subject cuts off
heads — so the bias keeps the crop window towards the upper part of the frame
where the faces are. Most of the supplied photos already match their target
aspect and are only scaled; two are cropped horizontally, evenly from each side.

Place a photo in a page with the `photo` class and a `photo-frame` wrapper:

```html
<div class="photo-frame photo-frame--4x3">
  <img class="photo" src="/assets/img/community-team.jpg" alt="…" width="1200" height="900" />
</div>
```

`build.py` wraps any such `<img>` in a `<picture>` with a WebP `<source>` when a
`.webp` sibling exists, so authors write a plain `<img>` and browsers that support
WebP get the smaller file. Add `photo-frame--dark` for artwork that is a dark
scene rather than a photo of people (the device mockup), so it does not read as a
black rectangle on a light border.

Photographs are the one place the design breaks its flat bordered-card rule — a
real face carries more trust than another bordered box. Keep them out of the
hero unless the overlay is dark enough; white text over an undimmed photo will
fail contrast.

## Structured data

`build.py` generates the JSON-LD for every page rather than each partial
carrying its own, so the brand details cannot drift apart:

- an `Organization` node on every page, defined once as `ORGANIZATION`
- a `BreadcrumbList` on interior pages, labelled from the page's own title
- a `FAQPage` on any page containing `<details>`/`faq__body` markup

The FAQ schema is *derived* from the rendered questions and answers, so the
markup always matches what the reader sees — which is what the search guidelines
require, and it means editing the visible copy updates the schema automatically.
A partial may still declare its own `jsonld:` line; that is emitted alongside the
generated blocks, not instead of them.

If you change the contact address or brand description, change it in
`ORGANIZATION` — not in each page.

## Navigation and scroll behaviour

`site.js` sets `data-scrolled` on the header, fills the reading-progress bar and
reveals the back-to-top control from one rAF-throttled scroll listener. The
header compaction is a layout change and still happens under
`prefers-reduced-motion`; the smooth scroll-to-top does not.

The mobile action bar (`.mobile-cta`) is display-only below 620px and the body
takes matching bottom padding so it never covers the end of a page. The
back-to-top button moves up to clear it.

## Print

There is a `@media print` block at the end of `site.css`. Policy and legal pages
get printed — to keep on file or hand to an employer — so the dark sections are
forced to black on white, the navigation and floating controls are hidden, and
external link destinations are printed after the link text.

## Colour and branding

`assets/css/site.css` is the single source of truth for colour, declared as
custom properties under `:root`. The palette is taken from the Coopvest mobile
app (emerald + gold) so the site and the app read as one product:

- `--brand-600/700/800` — `#1b5e20` / `#2e7d32` / `#0f3d14`
- `--accent-600/700` — `#f2b705` / `#dba400` (gold; dark text on gold via `--on-accent`)
- Surfaces `--bg`, `--surface`, `--border`; text `--ink`, `--ink-muted`

Keep every colour a token. Gold is an accent, reserved for one action per view —
white text on gold is only 1.82:1 and fails WCAG AA, so gold fills must use
`--on-accent`. Prefer grepping for stray hex literals after a palette change;
several one-off values (deep navy section backgrounds, badge washes) were
originally hardcoded outside the token block.

`build.py` sets `<meta name="theme-color">` and `site.webmanifest` mirrors it —
update those alongside the CSS.

## Logo and icon assets

`tools/make_logo_assets.py` derives every logo and icon the site ships from
`assets/brand/coopvest-mark.png` — there is one source image, not several. That
mark is byte-identical to the mobile app's
`assets/images/splash-logo-transparent.png` and to the copy uploaded under
`download/`, so the header, footer, favicons, app icons, About page and social
card all trace back to the same file. Do not recolour the mark — it is shared
app artwork.

The original `coopvest-lockup.jpg` scan is kept as supplied artwork but is no
longer used for any output; its 96px render was visibly soft. If you need to
re-derive anything, use the mark.

The mark stacks four bands — emblem, "COOPVEST AFRICA" wordmark, then two
tagline lines. The header/footer lockup takes the first two (y < 392), because
the baked-in tagline is unreadable at header size and the shell already renders
"Building Wealth Together" as live text. The `emblem` crop feeds `logo-mark.png`
for external/partner use.

If you change a logo's crop or dimensions, update the `width`/`height`
attributes on the `<img>` tags in `build.py` — they are hardcoded and were left
stale once already, which reserves the wrong aspect ratio before the image loads.
The current lockup is 139x96.

Both `tools/*.py` scripts originally hardcoded `/workspace/project` paths, which
wrote outside the repo when run from a checkout. They now resolve paths relative
to the script (`pathlib.Path(__file__).resolve().parent.parent`); keep it that
way.

## Motion and accessibility

Animation is decoration, never information. Every animated element must degrade
under `prefers-reduced-motion: reduce` — the CSS collapses `.reveal` and the
ticker, and `initReveal` / `initCounters` in `assets/js/site.js` check the media
query and render final values immediately. The page must also work with
JavaScript disabled; `site.js` is progressive enhancement only.

The contact form's client validation is for fast feedback only — `api/contact`
validates again server-side.
