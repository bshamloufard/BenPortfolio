# Performance review — September 12, 2026

The animation paths, timing, opacity, gradient masks and placement are preserved. This update moves SVG curve sampling to build time, avoids redundant per-frame work, separates moving signals from the static drawings, and caches versioned assets in the browser.

## Measured comparison

Baseline: commit `27f238f`. Same local Chromium installation, viewport and theme, four-second recordings, two runs per condition. Phone simulation uses a 390 × 844 viewport, 2× pixel density and 4× CPU throttling. Desktop uses 1440 × 1000 with no CPU throttling. Values below are means of the two runs.

| Measure | Before | After |
| --- | ---: | ---: |
| Desktop main-thread work while playing | 43.1 ms/second | 36.5 ms/second |
| Throttled-phone main-thread work while playing | 151.2 ms/second | 129.9 ms/second |
| Throttled-phone longest startup task | 149.5 ms | 64.5 ms |
| Initial requests in the local profile | 10 | 8 |
| Paused animation DOM writes | 0 | 0 |
| Layout shift score | 0 | 0 |

The sampled frame intervals remained near 16.7 ms in both versions, with no intervals over 34 ms during the recordings. The improvement is additional processing headroom, not a claim that an already-smooth animation suddenly doubled its frame rate. Measurement probes and tracing add overhead; this is not total device CPU usage or a battery-life estimate. Physical iPhones, Android phones and Windows hardware have not been profiled here.

## Loading tradeoff

Precomputed geometry removes hundreds of synchronous curve measurements from startup. Packing exact float32 samples adds approximately 5.4 KB to the combined gzip size of CSS/JavaScript versus the baseline, after minification. It is a deliberate CPU-versus-download tradeoff. The first-visit local uncompressed payload grows from 78.9 KB to 83.6 KB, while two script requests are removed, including the blocking theme request. Logos and photographs are unchanged.

Only build tools run esbuild. Visitors receive plain HTML, CSS and JavaScript with no runtime package. Content-hashed `/static/` assets receive a one-year immutable cache policy, so repeat visits can reuse them until their contents change. HTML is still revalidated to discover updates.

## Validation and reproduction

- `npm run build` checks asset references and geometry coverage.
- `npm run qa` exercises Chromium, Firefox and WebKit at desktop, phone and small-phone sizes in light/dark mode, including zero runtime path sampling, accessibility, pause/reduced-motion behavior, keyboard controls and JavaScript-disabled reading.
- `npm run performance` writes reusable lab measurements into `qa/performance/`.
- `node scripts/visual-equivalence.mjs path/to/baseline/public dist` compares 16 matching animation frames. Visible signal transforms, trail offsets and node opacity must match exactly; pixel comparison permits up to 8/255 channel difference on fewer than 0.2% of pixels for compositor edge rounding. The observed maximum was 6/255 on about 0.1% of pixels.

The raw local before/after profiles are in `qa/performance-baseline/report.json` and `qa/performance-layers/report.json`. Screenshot artifacts are in `qa/visual-equivalence/` and `qa/optimized/`. These generated directories are intentionally excluded from Git.
