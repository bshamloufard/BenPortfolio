// Render the site's own typography and SVG drawings into a static sharing card.
// Run deliberately when updating the card; normal builds need no browser.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const ambient = source.slice(source.indexOf('  <div class="ambient-stage"'), source.indexOf('  <main'));
const output = fileURLToPath(new URL('../public/ben-preview-v1.png', import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.setContent(`<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><style>${styles}
    body { width: 1200px; height: 630px; display: grid; place-items: center; overflow: hidden; }
    h1 { position: relative; z-index: 1; font-size: 160px; transform: translateY(-8px); }
    .network-panel { width: 440px; left: -145px; top: 12%; }
    .surface-panel { width: 490px; right: -125px; top: 37%; }
    .ambient-grid { inset: 0; mask-image: linear-gradient(transparent, #000 75%); }
    .signal-layer, figcaption { display: none; }
  </style></head><body>${ambient}<h1>Ben</h1></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: output, type: 'png' });
  console.log(`Saved ${output} (1200 × 630).`);
} finally { await browser.close(); }
