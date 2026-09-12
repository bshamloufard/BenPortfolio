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

## High refresh rates and ProMotion

The follow-up update reuses each signal's native `SVGTransform` rather than allocating and parsing transform strings every frame. Motion uses elapsed timestamps at every browser-provided animation callback; there is no 60-fps cap. Native smooth anchor scrolling and touch manipulation preserve browser pan/pinch handling. Reduced motion disables smooth scrolling. No runtime packages or experimental browser settings were added.

Measured on a real Apple M1 Pro MacBook Pro display configured at 120 Hz, with a visible Chromium browser. Five-second traces of the animated page gave:

| Condition | Observed callback rate | Median interval | 95th percentile | Intervals over 1.5 frames |
| --- | ---: | ---: | ---: | ---: |
| Desktop | 120 Hz | 8.3 ms | 8.8 ms | 0 |
| Phone viewport, 4× CPU throttle | 120 Hz | 8.3 ms | 9.1 ms | 0 |

Both paused recordings had zero animation mutations or paint work. The page has the same visual appearance: all 16 sampled desktop/phone, light/dark background frames matched the previous version pixel for pixel, including signal positions and lighting. These are short lab recordings with instrumentation overhead, not a guarantee of zero dropped frames on every device. The phone viewport is still running on the Mac, not on a physical iPhone. Raw results: `qa/promotion-native-transform/report.json`.

Six-second recordings while repeatedly scrolling through expanded content also observed 120-Hz callbacks, with an 8.3-ms median and 9.0-ms 95th percentile in both viewports. The desktop recording had two intervals over 34 ms; the 4× CPU-throttled phone viewport had none. Scroll positions changed across 1,854 desktop pixels and 2,786 phone-viewport pixels while the background continued animating. These measurements include tracing overhead and do not isolate compositor presentation frames. Raw results: `qa/promotion-scrolling/report.json`.

The deterministic refresh-rate suite passes at 60, 120, 144 and 240 Hz, plus a changing 120→60→80→144→120-Hz sequence, in Chromium, Firefox and WebKit. It checks equal motion state at equal elapsed times, updates between 60-Hz boundaries, one scheduled loop, and pause/resume continuity. This validates timing logic, separately from the real-display measurements.

Safari and the operating system control actual refresh rates, power saving and thermal limits. There is no universally supported website opt-in that forces ProMotion. [WebKit's frame-rate explainer](https://webkit.github.io/explainers/animation-frame-rate/) describes the distinction between compositor-driven animation and page animation callbacks, along with proposed rate controls. The implementation uses supported browser behavior and follows the cadence it receives. Physical iPhone Safari has not been measured here.

## Loading tradeoff

Precomputed geometry removes hundreds of synchronous curve measurements from startup. Packing exact float32 samples adds approximately 5.4 KB to the combined gzip size of CSS/JavaScript versus the baseline, after minification. It is a deliberate CPU-versus-download tradeoff. The first-visit local uncompressed payload grows from 78.9 KB to 83.6 KB, while two script requests are removed, including the blocking theme request. Logos and photographs are unchanged.

Only build tools run esbuild. Visitors receive plain HTML, CSS and JavaScript with no runtime package. Content-hashed `/static/` assets receive a one-year immutable cache policy, so repeat visits can reuse them until their contents change. HTML is still revalidated to discover updates.

## Validation and reproduction

- `npm run build` checks asset references and geometry coverage.
- `npm run qa` exercises Chromium, Firefox and WebKit at desktop, phone and small-phone sizes in light/dark mode, including zero runtime path sampling, accessibility, pause/reduced-motion behavior, keyboard controls and JavaScript-disabled reading.
- `npm run performance` writes reusable lab measurements into `qa/performance/`.
- `PERF_HEADED=1 npm run performance` measures in a visible Chromium window; `PERF_SCROLL=1` additionally exercises native smooth scrolling through expanded content while the animation runs. The observed cadence depends on the real display and browser.
- `npm run qa:refresh` checks deterministic fixed/adaptive clocks and writes `qa/refresh-rate/report.json`. This also runs in Linux and Windows CI with the available browser engines.
- `node scripts/visual-equivalence.mjs path/to/baseline/public dist` compares 16 matching animation frames. Visible signal transforms, trail offsets and node opacity must match exactly; pixel comparison permits up to 8/255 channel difference on fewer than 0.2% of pixels for compositor edge rounding. The observed maximum was 6/255 on about 0.1% of pixels.

The raw local before/after profiles are in `qa/performance-baseline/report.json` and `qa/performance-layers/report.json`. Screenshot artifacts are in `qa/visual-equivalence/` and `qa/optimized/`. These generated directories are intentionally excluded from Git.
