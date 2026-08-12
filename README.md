# Pixel Pane — site

Marketing site for [Pixel Pane](https://github.com/snehith01001110/pixelpane-site), a
local-first, notch-native AI assistant for macOS.

Static HTML/CSS with small vanilla-JS layers for the landing demo and private
support form. No build step or package dependencies.

## Structure

```
index.html      markup + inline SVG line art
styles.css      design system (palette, type, layout, draw animation)
main.js         IntersectionObserver that reveals the line drawings
support.html    explicit-submit private bug-report form
support-core.js closed context, validation, payload, and sanitizer policy
support.js      accessible form controller and Sentry Feedback submission
support-config.js public feedback-project DSN (fail-closed placeholder)
tests/          dependency-free Node fixture tests
assets/         favicon
.nojekyll       serve files as-is on GitHub Pages
```

## Run locally

Any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Run the support fixtures with:

```bash
node --test tests/support-core.test.js
```

## Private support configuration

The support page pins Sentry Browser `10.70.0`'s feedback bundle with SHA-384
Subresource Integrity. It initializes with no default integrations, errors,
breadcrumbs, sessions, tracing, replay, profiling, logs, cookies, or user
context, and its `beforeSend` accepts only the feedback schema. The app fragment
is consumed and removed by first-party code before that bundle executes.

Before deploying, create the separate `pixelpane-feedback` Sentry project and
replace the invalid placeholder in `support-config.js` with that project's
public HTTPS DSN. Configure the DSN client key with a rate limit of 60 events
per 600 seconds, enable spike protection, suppress IP storage, enable
server-side data scrubbing, and keep event retention at no more than 90 days.
The DSN is public configuration; never put a Sentry auth token in this repo.

`support.html` carries a page-only Content Security Policy allowing first-party
styles/scripts/assets, the exact SRI-pinned Sentry CDN script, and Sentry ingest
connections. The production host should send the same policy as an HTTP header
(especially `frame-ancestors 'none'`, which browsers do not enforce from a meta
tag).

## Deploy (GitHub Pages)

Deploy and verify `support.html` plus the updated privacy policy before shipping
an app build that links to them. Push to `main`, then in the repo settings enable
**Pages → Deploy from a branch → `main` / root**.

## Design notes

- Palette: near-black background, warm off-white text, a single beige accent.
- Type: Instrument Serif (display), system sans (body, native on macOS),
  JetBrains Mono (micro-labels).
- Motion respects `prefers-reduced-motion`.
