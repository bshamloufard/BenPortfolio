# Ben Shamloufard

A small, fast portfolio for software and machine learning work. Semantic HTML, CSS, and a little JavaScript. No runtime dependencies, remote fonts, analytics, or client framework.

Primary domain: [b3n.ai](https://b3n.ai/). Render origin: [ben-shamloufard.onrender.com](https://ben-shamloufard.onrender.com/).

## Develop

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Edit `public/index.html` for content, `public/styles.css` for appearance, and `public/main.js` for interactions. `public/sculpture.js` contains the custom WebGL filament sculpture. The original résumé is published at `public/resume.pdf`; replace it to update the download. Images are self-hosted in `public/assets`.

## Build

```sh
npm run build
```

The build validates local asset references and copies the public site into `dist/`. Only `dist/` is deployed. Original source images and local QA captures are excluded from Git.

## Screenshot and browser review

```sh
npx playwright install chromium firefox webkit
npm run build
npm run qa
```

QA starts its own server, captures full pages at desktop, phone, and small-phone sizes in both color schemes, and tests Chromium, Firefox, and WebKit. It checks expanded content, image loading, layout overflow, console and network errors, automatic system theme changes, manual theme persistence, reduced motion, actual animation frame changes, frozen frames when paused, GPU loss and recovery, offscreen rendering suspension, keyboard navigation, résumé downloads, 200% text enlargement, and reading without JavaScript. Axe checks run in Chromium on the expanded page.

Screenshots and a JSON report are saved under `qa/latest/`. Review the images, adjust the CSS, then rerun. For a live site:

```sh
npm run qa -- https://YOUR-SITE.onrender.com
```

The GitHub Actions workflow repeats Chromium and Firefox checks on Windows, and Chromium, Firefox, and WebKit checks on Linux. It uploads screenshots for every run. These engine and viewport checks do not replace testing on physical phones.

## Deploy on Render

Create a **Static Site** connected to this GitHub repository with:

- Branch: `main`
- Build command: `npm run build`
- Publish directory: `dist`
- Auto-deploy: enabled

The production build uses only built-in Node.js modules. No secrets or environment variables are required. Render serves the static output through its CDN.

## Design and content

The default theme follows `prefers-color-scheme` directly in CSS, including live OS theme changes. The footer allows a saved manual override or returning to System. The signature animation is an analytic trefoil woven from 56 closed filaments (36 on smaller screens). A custom WebGL shader projects its geometry, renders antialiased ribbons, and moves light across the strands in a seamless 96-second cycle. A gently damped pointer response changes the viewing angle. It uses one draw call, no textures or graphics libraries, and a capped pixel ratio. Initialization follows the first page paint. It freezes for reduced motion or the pause control and stops drawing while hidden or offscreen. A static SVG preserves the artwork without JavaScript, without WebGL, or during GPU context loss; the renderer recovers when the GPU returns. On desktop it sits beside the content, and on narrower screens it appears below the header. All content and expandable rows work without JavaScript.

Content is adapted from Ben's supplied résumé. The supplied Amazon, BAIR, Valkai, Ramp, and Roblox images are included; Berkeley uses a typographic identifier. BAIR imagery is supplied project/reference material. No employer endorsement is implied.

Visual inspiration: [Sofia Bodnar's portfolio](https://sofiabodnar.com/). Built as an original implementation.
