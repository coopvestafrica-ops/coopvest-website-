# Coopvest Africa — corporate website

The public information and acquisition site for Coopvest Africa: who we are, how
the platform works, and how to join or partner with us.

This site is **not** the member app and **not** the admin dashboard. That
separation is deliberate and is explained on the How It Works page.

| Surface | Purpose |
| --- | --- |
| **This website** | Information, trust, acquisition, partnerships |
| **Member mobile app** | Account, contributions, loans, statements, transactions |
| **Admin dashboard** | Operations, KYC, payments, loans, ledger, management |

## Stack

Static HTML, CSS and a small amount of vanilla JavaScript. No framework, no
runtime dependencies, no build step required to deploy. The output is plain
files, so it loads fast, ranks well, and can be hosted anywhere.

## Layout

```
index.html              generated — do not edit
about/index.html        generated — do not edit
…
src/pages/*.html        source of truth: one partial per page (body + metadata)
assets/css/site.css     design system (tokens, layout, components)
assets/js/site.js       navigation, scroll reveal, form validation
assets/img/             logo and icon assets (generated — see tools/)
build.py                wraps each partial in the shared shell
tools/make_logo_assets.py  derives web logos/icons from the official artwork
```

Generated pages are committed, so a host can serve the repository directly.

## Editing content

1. Edit the relevant file in `src/pages/`. Each starts with a metadata comment
   (`title`, `description`, `robots`) followed by the page body. The header,
   navigation and footer are added automatically.
2. Rebuild:

   ```bash
   python3 build.py
   ```

3. Preview locally:

   ```bash
   python3 -m http.server 8080
   # then open http://localhost:8080
   ```

Path-dependent links matter here: this site is served with `trailingSlash`, so
pages live at `/about/` rather than `/about`. Keep that convention when linking.

## Logo assets

`tools/make_logo_assets.py` derives every logo asset from the official lockup
(`coopvest_logo.jpg` in the app repository) — converting it to a transparent
PNG, producing a white silhouette for dark surfaces, and composing the favicon
and social card. It requires Pillow and NumPy:

```bash
pip install pillow numpy
python3 tools/make_logo_assets.py
```

## Deploying

Any static host works. `vercel.json` is included and adds security headers,
long-lived caching for `/assets/*`, and clean URLs.

## Before launch

The following content is intentionally marked as pending in the pages, and
should be completed before the site goes live:

- [ ] **Contact details** — phone number, street address, visiting hours, social links (`src/pages/contact.html`).
- [ ] **Leadership profiles** — founder and executive team (`src/pages/about.html`).
- [ ] **Regulatory and licensing disclosures** — must be reviewed before publication (`src/pages/disclosures.html`).
- [ ] **Legal review** — Privacy Policy, Terms of Service, Cookie Policy and the risk disclosures are drafts and need review by qualified Nigerian counsel.
- [ ] **Contact form handler** — the form validates and confirms client-side but does not transmit; connect a handler (or an email service) at `data-enquiry-form` in `src/pages/contact.html`.
- [ ] **Canonical domain** — `https://coopvest.africa` is assumed throughout (`build.py`, `robots.txt`, `sitemap.xml`). Change it in one place (`SITE` in `build.py`) if the domain differs.

## Accessibility and quality

- Every page works without JavaScript.
- Semantic landmarks, a skip link, visible focus styles, and `prefers-reduced-motion` support.
- Tables use proper `<th scope>` headers; the accordion uses native `<details>`.
- Skip to content is keyboard-reachable; the mobile menu is operable by keyboard and closes on Escape.
