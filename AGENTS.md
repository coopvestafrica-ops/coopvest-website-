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
