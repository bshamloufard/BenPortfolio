# Ben Shamloufard

A small, fast portfolio for software and machine learning work. Semantic HTML, CSS, and a little JavaScript. No runtime dependencies, remote fonts, analytics, or client framework.

Primary domain: [b3n.ai](https://b3n.ai/). Render origin: [ben-shamloufard.onrender.com](https://ben-shamloufard.onrender.com/).

## Develop

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Edit `public/index.html` for content, `public/styles.css` for appearance, and `public/main.js` for interactions. `public/ambient.js` animates signals along the network and surface drawings. The original résumé is published at `public/resume.pdf`; replace it to update the download. Images are self-hosted in `public/assets`.

## Build

```sh
npm run build
```

The build validates local asset references, minifies CSS and JavaScript with esbuild, combines the two deferred scripts, and inlines the tiny theme preference script to avoid a blocking request. It emits content-hashed files in `dist/static/`. Only `dist/` is deployed. esbuild is a build-time dependency; no library is downloaded or run by visitors.

Animation geometry is sampled ahead of time and stored in `scripts/ambient-geometry.json`. The build packs the exact float32 coordinates into the script so visitors do not need to measure hundreds of SVG curve points at startup. If you edit a signal route in the HTML, run `npm run geometry` with Chromium installed, then commit the updated JSON. The build rejects routes without matching geometry. `npm run dev` can still sample changed SVG paths directly.

## Screenshot and browser review

```sh
npx playwright install chromium firefox webkit
npm run build
npm run qa
```

QA starts its own server, captures full pages at desktop, phone, and small-phone sizes in both color schemes, and tests Chromium, Firefox, and WebKit. It checks expanded content, image loading, layout overflow, console and network errors, automatic system theme changes, manual theme persistence, reduced motion, actual animation frame changes, frozen frames when paused, high contrast, keyboard navigation, résumé downloads, 200% text enlargement, and reading without JavaScript. Axe checks run in Chromium on the expanded page.

Screenshots and a JSON report are saved under `qa/latest/`. Review the images, adjust the CSS, then rerun. For a live site:

```sh
npm run qa -- https://YOUR-SITE.onrender.com
```

The GitHub Actions workflow repeats Chromium and Firefox checks on Windows, and Chromium, Firefox, and WebKit checks on Linux. It uploads screenshots for every run. These engine and viewport checks do not replace testing on physical phones.

## Deploy on Render

Create a **Static Site** connected to this GitHub repository with:

- Branch: `main`
- Build command: `npm ci --include=dev && npm run build`
- Publish directory: `dist`
- Auto-deploy: enabled

No secrets or environment variables are required. Render serves the static output through its CDN. The production Headers configuration is `/static/*` → `Cache-Control: public, max-age=31536000, immutable`. Only content-hashed files use this long cache lifetime; HTML and the stable résumé URL retain Render's normal revalidation behavior. A changed file receives a new URL automatically.

Render's GitHub installation currently lacks access to this repository, so pushes have not triggered deploys automatically despite that setting being enabled. Until its repository access is updated, check for a new deploy after pushing and trigger one manually if absent.

## Design and content

Link previews use the dedicated `public/ben-preview-v1.png` card: “Ben” in the site's serif type, with its charcoal background and faint corner diagrams. Open Graph and Twitter card metadata point to the absolute HTTPS image URL, with dimensions and alternative text, so sharing apps can discover it without JavaScript. Regenerate deliberately with `npm run social-preview` (requires Chromium); normal builds copy the committed PNG and validate its metadata references. If the artwork changes, version its filename and update both metadata URLs because sharing apps may cache previews.

The SVG favicon follows the system theme. A 96-pixel PNG fallback covers raster favicon consumers, and an opaque 180-pixel Apple touch icon covers saved iPhone/iPad shortcuts. The web manifest supplies 192/512-pixel icons and the short name “Ben”, with `display: browser` to retain normal browser navigation. Regenerate these committed PNGs from the SVG with `npm run site-icons` (requires Chromium); no browser is needed during deployment. The build validates manifest icon references. The inline Berkeley “B” is a custom typographic badge with the same square proportions and corner radius as neighboring logos, not an official university mark.

The default theme follows `prefers-color-scheme` directly in CSS, including live OS theme changes. The footer allows a saved manual override or returning to System.

Two SVG diagrams frame the content on desktop: a network labeled “inputs → representations” and a curved surface labeled “a little room to explore.” A faint grid fades into the background, and a horizontal gradient keeps the reading column clear. Both diagrams sit partly beyond the page edges. On phones they remain small, cropped corner details with lower opacity; their captions are hidden. Small signals follow the existing lines, leaving short illuminated trails; network nodes brighten as a signal passes.

`public/ambient.js` interpolates packet positions and trace lengths from precomputed geometry in production. Static drawings and animated signals use separate SVG surfaces, so repainting the signals does not repaint the static geometry. It reuses light state, avoids unchanged opacity writes, and skips geometry updates while a signal is fully transparent. Each drawing pauses when offscreen, the browser tab is hidden, reduced motion is enabled, or the user pauses it. The SVG diagrams and captions remain available without JavaScript. All content and expandable rows also work without JavaScript.

Motion follows every `requestAnimationFrame` callback with elapsed-time positioning, without a 60-fps cap. Native SVG transforms are updated in place instead of parsing new transform strings per frame. This preserves the same speed when the display changes refresh rate. Scrolling stays browser-native, with smooth anchor navigation, touch/pinch gestures, and no blocking wheel/touch handlers. Reduced-motion preferences disable smooth anchor scrolling as well as decorative motion.

There is no production website switch that guarantees ProMotion. Safari and the OS determine the available cadence, including power and thermal limits; see [WebKit's animation frame-rate explanation](https://webkit.github.io/explainers/animation-frame-rate/). The site uses the cadence the browser provides instead of relying on experimental settings.

## Performance checks

`npm run performance` profiles the built site on a desktop viewport and a phone viewport with 4× CPU throttling. It reports main-thread time, script/style/layout/paint work, frame intervals, initial requests, long tasks, and DOM writes in `qa/performance/report.json`. It measures both playing and paused states. Results are lab comparisons, not physical-device battery measurements.

Use `PERF_HEADED=1` to measure with an actual visible browser on a high-refresh-rate display. `PERF_SCROLL=1` profiles browser-driven smooth scrolling through expanded content while the background keeps moving. `PERF_SECONDS`, `PERF_REPEATS`, and `PERF_NAME` control duration, repetitions, and the report directory. A sample macOS/Linux command is `PERF_HEADED=1 PERF_SCROLL=1 PERF_SECONDS=6 npm run performance`. Headless cadence does not prove hardware refresh-rate support.

`npm run qa:refresh` supplies deterministic 60/120/144/240-Hz and changing-rate clocks in Chromium, Firefox, and WebKit. It verifies equal positions/lighting at equal elapsed times, updates between 60-Hz boundaries, one pending animation loop, pause/resume continuity, and native scrolling settings. This runs in CI alongside screenshot QA and writes `qa/refresh-rate/report.json`; it tests timing correctness, not physical display output.

For an animation regression comparison, save an older `public/` directory and run `node scripts/visual-equivalence.mjs path/to/old/public dist`. This advances both versions through the same 16 sampled frames across desktop/phone and light/dark modes. Signal coordinates, trail offsets, and light opacity must match exactly. Background screenshots allow only small compositor edge-rounding differences. Normal QA separately checks all visible page content and interactions.

See [PERFORMANCE.md](PERFORMANCE.md) for the measured optimization results and tradeoffs.

Content is adapted from Ben's supplied résumé. The supplied Amazon, BAIR, Valkai, Ramp, and Roblox images are included; Berkeley uses a typographic identifier. BAIR imagery is supplied project/reference material. No employer endorsement is implied.

Visual inspiration: [Sofia Bodnar's portfolio](https://sofiabodnar.com/). Built as an original implementation.
