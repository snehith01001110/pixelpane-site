# Pixel Pane — site

Marketing site for [Pixel Pane](https://github.com/snehith01001110/pixelpane-site), a
local-first, notch-native AI assistant for macOS.

Static HTML/CSS with a small vanilla-JS layer that draws the SVG line art on
scroll. No build step, no dependencies.

## Structure

```
index.html      markup + inline SVG line art
styles.css      design system (palette, type, layout, draw animation)
main.js         IntersectionObserver that reveals the line drawings
assets/         favicon
.nojekyll       serve files as-is on GitHub Pages
```

## Run locally

Any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy (GitHub Pages)

Push to `main`, then in the repo settings enable **Pages → Deploy from a branch →
`main` / root**.

## Design notes

- Palette: near-black background, warm off-white text, a single beige accent.
- Type: Instrument Serif (display), system sans (body, native on macOS),
  JetBrains Mono (micro-labels).
- Motion respects `prefers-reduced-motion`.
