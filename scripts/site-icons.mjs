// Export PNG fallbacks from the existing SVG monogram. No runtime dependency.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ colorScheme: 'light', deviceScaleFactor: 1 });
  for (const [filename, size, fullBleed] of [
    ['favicon-96.png', 96, false],
    ['apple-touch-icon.png', 180, true],
    ['icon-192.png', 192, true],
    ['icon-512.png', 512, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<!doctype html><style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${source}`);
    // The OS supplies its own home-screen corner mask.
    if (fullBleed) await page.locator('rect').evaluate(rect => rect.setAttribute('rx', '0'));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL(`../public/${filename}`, import.meta.url)), omitBackground: true });
    console.log(`Saved ${filename} (${size} × ${size}).`);
  }
} finally { await browser.close(); }
