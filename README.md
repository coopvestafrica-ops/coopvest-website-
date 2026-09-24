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
assets/js/site.js       navigation, scroll reveal, form submission
assets/img/             logo and icon assets (generated — see tools/)
api/contact.js          serverless handler that emails contact-form enquiries
build.py                wraps each partial in the shared shell
tools/make_logo_assets.py  derives web logos/icons from the official artwork
tools/check_links.py    verifies every internal link and asset resolves
tools/test_contact_api.mjs  smoke tests for the contact handler
.github/workflows/deploy.yml  verify on every push, deploy via Vercel
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

## The contact form

The form on `/contact/` posts JSON to `/api/contact`, a serverless function
(`api/contact.js`) that emails the enquiry via the Resend HTTP API. It has no
dependencies — Node's built-in `fetch` does the work.

Set these environment variables in the Vercel project (Settings → Environment
Variables):

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Enables delivery. Without it the endpoint returns **503** rather than telling a visitor their message was sent when it was not. |
| `CONTACT_TO` | no | Where enquiries are delivered (default `hello@coopvest.africa`). |
| `CONTACT_FROM` | no | Verified sender, e.g. `Coopvest Website <noreply@coopvest.africa>`. The domain must be verified in Resend. |
| `CONTACT_REPLY_TO` | no | Overrides Reply-To (default is the enquirer's own address). |
| `ALLOWED_ORIGINS` | no | Extra origins permitted to post, comma-separated. |

The handler validates and length-caps every field, rejects a disallowed
`Origin`, rate-limits to 5 submissions per IP per 10 minutes, discards a
honeypot field, strips control characters so nothing can be smuggled into mail
headers, and never returns provider detail to the caller.

Run the smoke tests:

```bash
node tools/test_contact_api.mjs
```

They cover method rejection, validation, the unconfigured path, the honeypot,
origin checks, rate limiting, header-injection handling, and both success and
upstream-failure paths (with the network stubbed).

## Deploying

**Vercel is the intended host.** The project is `coopvest-website`
(`prj_Q9vlQ7lklqJzQMokkwDBht3LMpKZ`) in the `coopvest-africas-projects` team.

Pick one of two ways to connect the repository:

1. **Git integration (recommended).** Install the Vercel GitHub App for
   `coopvestafrica-ops/coopvest-website-`. Vercel then deploys on every push to
   `main`, and `vercel.json` supplies the security headers and asset caching.
2. **GitHub Actions.** Add these repository secrets and the workflow in
   `.github/workflows/deploy.yml` drives Vercel instead:
   - `VERCEL_TOKEN` — a Vercel access token
   - `VERCEL_ORG_ID` — `team_NvQ5Ivi4LjtPiZk3PWorsFyK`
   - `VERCEL_PROJECT_ID` — `prj_Q9vlQ7lklqJzQMokkwDBht3LMpKZ`

Either way, the workflow's **Verify** job runs on every push and pull request: it
rebuilds the site, fails if the committed pages are stale, and checks that every
internal link resolves. That job needs no secrets.

Any other static host works too — the output is plain files.

## Before launch

The following content is intentionally marked as pending in the pages, and
should be completed before the site goes live:

- [ ] **Contact details** — phone number, street address, visiting hours, social links (`src/pages/contact.html`).
- [ ] **Leadership profiles** — founder and executive team (`src/pages/about.html`).
- [ ] **Regulatory and licensing disclosures** — must be reviewed before publication (`src/pages/disclosures.html`).
- [ ] **Legal review** — Privacy Policy, Terms of Service, Cookie Policy and the risk disclosures are drafts and need review by qualified Nigerian counsel.
- [ ] **Contact form handler** — code is complete; set `RESEND_API_KEY` in Vercel (and verify the sending domain in Resend) for delivery to work.
- [ ] **Canonical domain** — `https://coopvest.africa` is assumed throughout (`build.py`, `robots.txt`, `sitemap.xml`). Change it in one place (`SITE` in `build.py`) if the domain differs.

## Accessibility and quality

- Every page works without JavaScript.
- Semantic landmarks, a skip link, visible focus styles, and `prefers-reduced-motion` support.
- Tables use proper `<th scope>` headers; the accordion uses native `<details>`.
- Skip to content is keyboard-reachable; the mobile menu is operable by keyboard and closes on Escape.
