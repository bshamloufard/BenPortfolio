// Compare rendered frames at identical virtual times, including loop boundaries.
// Usage: node scripts/visual-equivalence.mjs path/to/baseline/public [dist]
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const baseline = process.argv[2];
if (!baseline) throw new Error('Provide a baseline public directory.');
const candidate = process.argv[3] || 'dist';
const output = 'qa/visual-equivalence';
await mkdir(output, { recursive: true });
const servers = [];
let browser;
const results = [];
try {
  for (const [directory, port] of [[baseline, '4187'], [candidate, '4188']]) {
    const server = spawn(process.execPath, ['scripts/serve.mjs', directory], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'inherit'] });
    servers.push(server);
    await new Promise((ok, fail) => { server.stdout.once('data', ok); server.once('error', fail); });
  }
  browser = await chromium.launch();
  for (const colorScheme of ['light', 'dark']) {
    for (const [label, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844]]) {
      const pages = [];
      for (const port of ['4187', '4188']) {
        const page = await browser.newPage({ viewport: { width, height }, colorScheme });
        await page.addInitScript(() => {
          const pending = new Map(); let id = 0;
          window.requestAnimationFrame = callback => { pending.set(++id, callback); return id; };
          window.cancelAnimationFrame = id => pending.delete(id);
          window.advance = time => { const callbacks = [...pending.values()]; pending.clear(); for (const callback of callbacks) callback(time); };
        });
        await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => document.querySelectorAll('.ambient-panel[data-motion="playing"]').length === 2);
        await page.addStyleTag({ content: '.page { visibility: hidden; }' });
        pages.push(page);
      }
      let frame = 0;
      for (const time of [1500, 6500, 14500, 22000]) {
        const from = frame;
        frame = Math.round(time / (1000 / 60));
        for (const page of pages) await page.evaluate(({ from, frame }) => { for (let n = from; n < frame; n++) window.advance(100 + n * 1000 / 60); }, { from, frame });
        const name = `${label}-${colorScheme}-${time}`;
        const states = [];
        for (const page of pages) states.push(await page.evaluate(() => ({
          tracks: [...document.querySelectorAll('.signal-track')].map(track => {
            const opacity = track.style.opacity;
            const transforms = track.querySelector('.signal-packet').transform.baseVal;
            const matrix = transforms.numberOfItems ? transforms.getItem(0).matrix : null;
            return { opacity, ...(Number(opacity) ? { x: matrix?.e, y: matrix?.f, offset: track.querySelector('.trace-line').style.strokeDashoffset } : {}) };
          }),
          lamps: [...document.querySelectorAll('.node-lamp')].map(node => node.style.opacity),
        })));
        const identicalMotion = JSON.stringify(states[0]) === JSON.stringify(states[1]);
        const before = await pages[0].screenshot({ path: `${output}/${name}-before.png`, fullPage: true });
        const after = await pages[1].screenshot({ path: `${output}/${name}-after.png`, fullPage: true });
        const pixels = await pages[1].evaluate(async ({ before, after }) => {
          async function decode(data) {
            const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0);
            return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
          }
          const a = await decode(before), b = await decode(after);
          if (a.length !== b.length) return { maxChannelDifference: 255, differentPixelRatio: 1 };
          let max = 0, count = 0;
          for (let i = 0; i < a.length; i += 4) {
            let changed = false;
            for (let c = 0; c < 4; c++) { const difference = Math.abs(a[i + c] - b[i + c]); max = Math.max(max, difference); changed ||= difference > 0; }
            if (changed) count++;
          }
          return { maxChannelDifference: max, differentPixelRatio: count / (a.length / 4) };
        }, { before: before.toString('base64'), after: after.toString('base64') });
        // Separate compositor surfaces can round a few edge pixels differently.
        // Allow up to 8/255 on fewer than 0.2% of background pixels, while
        // requiring exact packet coordinates, trail offsets and light opacity.
        const equivalent = identicalMotion && pixels.maxChannelDifference <= 8 && pixels.differentPixelRatio < .002;
        results.push({ name, equivalent, identicalMotion, ...pixels });
        console.log(`${name}: ${equivalent ? 'equivalent' : 'DIFFERS'} ${JSON.stringify(pixels)}`);
      }
      for (const page of pages) await page.close();
    }
  }
  if (results.some(result => !result.equivalent)) process.exitCode = 1;
} finally {
  await browser?.close(); for (const server of servers) server.kill();
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
}
