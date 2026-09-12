// Rebuild only when SVG signal routes change. Use Chromium's own geometry so
// production uses exactly the same points without sampling curves on a phone.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const paths = [...html.matchAll(/class="trace-line" d="([^"]+)"/g)].map(match => match[1]);
  await page.setContent(`<svg>${paths.map(d => `<path d="${d}"/>`).join('')}</svg>`);
  const samples = await page.locator('path').evaluateAll(paths => Object.fromEntries(paths.map(path => {
    const length = path.getTotalLength();
    return [path.getAttribute('d'), Array.from({ length: 129 }, (_, i) => {
      const point = path.getPointAtLength(length * i / 128);
      return [point.x, point.y];
    })];
  })));
  await writeFile(new URL('./ambient-geometry.json', import.meta.url), `${JSON.stringify(samples)}\n`);
  console.log(`Saved exact browser geometry for ${paths.length} signal routes.`);
} finally { await browser.close(); }
