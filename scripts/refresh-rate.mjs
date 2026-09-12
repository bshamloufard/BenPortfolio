// Deterministic timing tests, not a claim that CI has a high-Hz display.
import { chromium, firefox, webkit, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const engines = { chromium, firefox, webkit };
const selected = (process.env.TEST_BROWSERS || 'chromium,firefox,webkit').split(',');
const server = spawn(process.execPath, ['scripts/serve.mjs', 'dist'], { env: { ...process.env, PORT: '4186' }, stdio: ['ignore', 'pipe', 'inherit'] });
const report = [];
let browser;
try {
  await new Promise((ok, fail) => { server.stdout.once('data', ok); server.once('error', fail); });
  for (const engine of selected) {
    browser = await engines[engine].launch();
    let reference;
    for (const rate of [60, 120, 144, 240, 'adaptive']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
      await page.addInitScript(() => {
        const callbacks = new Map(); let id = 0;
        window.frameTest = { time: 0, count: 0, changedFrames: 0, maxPending: 0, blockingListeners: [] };
        window.requestAnimationFrame = callback => {
          callbacks.set(++id, callback);
          window.frameTest.maxPending = Math.max(window.frameTest.maxPending, callbacks.size);
          return id;
        };
        window.cancelAnimationFrame = id => callbacks.delete(id);
        window.frameTest.step = time => {
          const packet = document.querySelector('.signal-packet');
          const before = packet.getAttribute('transform');
          const ready = [...callbacks.values()]; callbacks.clear();
          for (const callback of ready) { callback(time); window.frameTest.count++; }
          if (packet.getAttribute('transform') !== before) window.frameTest.changedFrames++;
          window.frameTest.time = time;
        };
        const register = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          // Attribute only site listeners: Playwright installs its own input
          // listeners when locators initialize, outside the page's scripts.
          if (['wheel', 'touchstart', 'touchmove'].includes(type) && !options?.passive && new Error().stack.includes(location.origin + '/static/')) window.frameTest.blockingListeners.push(type);
          return register.call(this, type, listener, options);
        };
      });
      await page.goto('http://127.0.0.1:4186', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.querySelectorAll('.ambient-panel[data-motion="playing"]').length === 2);
      await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
      await expect(page.locator('#valkai summary')).toHaveCSS('touch-action', 'manipulation');
      await page.evaluate(() => window.frameTest.step(0));
      const states = [];
      for (const target of [1500, 6500, 14500, 22000]) {
        await page.evaluate(({ target, rate }) => {
          const run = window.frameTest;
          while (run.time < target - .000001) {
            const hz = rate === 'adaptive' ? (run.time < 4000 ? 120 : run.time < 8000 ? 60 : run.time < 11000 ? 80 : run.time < 18000 ? 144 : 120) : rate;
            run.step(Math.min(target, run.time + 1000 / hz));
          }
        }, { target, rate });
        states.push(await page.evaluate(() => ({
          tracks: [...document.querySelectorAll('.signal-track')].map(track => {
            const opacity = Number(track.style.opacity);
            const matrix = track.querySelector('.signal-packet').transform.baseVal.getItem(0).matrix;
            return { opacity, ...(opacity ? { x: matrix.e, y: matrix.f, offset: parseFloat(track.querySelector('.trace-line').style.strokeDashoffset) } : {}) };
          }),
          lamps: [...document.querySelectorAll('.node-lamp')].map(node => Number(node.style.opacity)),
        })));
        if (target === 1500) {
          const updated = await page.evaluate(() => window.frameTest.changedFrames);
          // This route is visible and moving throughout this interval: update
          // every provided display frame, including between 60-Hz boundaries.
          expect(updated).toBeGreaterThanOrEqual(Math.floor(1.5 * (rate === 'adaptive' ? 120 : rate)) - 1);
        }
      }
      if (!reference) reference = states;
      else for (let frame = 0; frame < states.length; frame++) {
        expect(states[frame].lamps).toEqual(reference[frame].lamps);
        for (let i = 0; i < states[frame].tracks.length; i++) {
          for (const [key, value] of Object.entries(reference[frame].tracks[i])) expect(states[frame].tracks[i][key]).toBeCloseTo(value, 6);
        }
      }
      const counters = await page.evaluate(() => ({ count: window.frameTest.count, changedFrames: window.frameTest.changedFrames, maxPending: window.frameTest.maxPending, blockingListeners: window.frameTest.blockingListeners }));
      expect(counters.maxPending).toBe(1);
      expect(counters.blockingListeners).toEqual([]);
      // Pausing and resuming during a refresh-rate change must not jump phase.
      await page.evaluate(() => document.documentElement.dataset.motion = 'paused');
      await expect(page.locator('.network-panel')).toHaveAttribute('data-motion', 'still');
      const frozen = await page.locator('.signal-packet').first().getAttribute('transform');
      await page.evaluate(() => window.frameTest.step(62000));
      expect(await page.locator('.signal-packet').first().getAttribute('transform')).toBe(frozen);
      await page.evaluate(() => delete document.documentElement.dataset.motion);
      await expect(page.locator('.network-panel')).toHaveAttribute('data-motion', 'playing');
      await page.evaluate(() => window.frameTest.step(63000));
      expect(await page.locator('.signal-packet').first().getAttribute('transform')).toBe(frozen);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
      report.push({ engine, rate, passed: true, ...counters });
      await page.close();
    }
    console.log(`${engine}: 60/120/144/240 Hz and adaptive timing, uncapped updates, native scrolling settings and pause/resume passed`);
    await browser.close(); browser = undefined;
  }
} finally {
  await browser?.close(); server.kill();
  await mkdir('qa/refresh-rate', { recursive: true });
  await writeFile('qa/refresh-rate/report.json', JSON.stringify(report, null, 2));
}
