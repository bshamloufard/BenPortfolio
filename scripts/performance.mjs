// A repeatable lab profile, not a physical-phone or battery benchmark.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const directory = process.argv[2] || 'dist';
const output = resolve('qa', process.env.PERF_NAME || 'performance');
const seconds = Number(process.env.PERF_SECONDS || 4);
const repeats = Number(process.env.PERF_REPEATS || 2);
const headed = process.env.PERF_HEADED === '1';
const scrolling = process.env.PERF_SCROLL === '1';
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs', directory], {
  env: { ...process.env, PORT: '4185' }, stdio: ['ignore', 'pipe', 'inherit'],
});
let browser;
const report = { directory, seconds, repeats, headed, scrolling, results: [] };
try {
  await new Promise((ok, fail) => { server.stdout.once('data', ok); server.once('error', fail); server.once('exit', code => fail(new Error(`Server exited: ${code}`))); });
  browser = await chromium.launch({ headless: !headed });
  for (const [name, width, height, scale, throttle] of [['desktop', 1440, 1000, 1, 1], ['phone-slow-cpu', 390, 844, 2, 4]]) {
    for (let run = 0; run < repeats; run++) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'dark' });
      const page = await context.newPage();
      if (headed) await page.bringToFront();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await cdp.send('Performance.enable');
      await page.addInitScript(() => {
        window.lab = { longTasks: [], shifts: [] };
        new PerformanceObserver(list => window.lab.longTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: true });
        new PerformanceObserver(list => window.lab.shifts.push(...list.getEntries().filter(e => !e.hadRecentInput).map(e => e.value))).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto('http://127.0.0.1:4185', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      const load = await page.evaluate(() => ({
        bytes: performance.getEntriesByType('resource').reduce((sum, e) => sum + e.transferSize, 0) + performance.getEntriesByType('navigation')[0].transferSize,
        requests: performance.getEntriesByType('resource').length + 1,
        longTasks: window.lab.longTasks, cls: window.lab.shifts.reduce((sum, n) => sum + n, 0),
      }));
      if (scrolling) {
        await page.evaluate(() => document.querySelectorAll('details').forEach(entry => entry.open = true));
        await page.waitForTimeout(500);
      }
      for (const state of scrolling ? ['scrolling'] : ['playing', 'paused']) {
        if (state === 'paused') await page.evaluate(() => document.documentElement.dataset.motion = 'paused');
        await page.waitForTimeout(100);
        await page.evaluate(scrolling => {
          window.lab.gaps = []; window.lab.writes = 0; window.lab.last = 0;
          window.lab.scrollFrames = 0; window.lab.scrollMin = scrollY; window.lab.scrollMax = scrollY; window.lab.lastScroll = scrollY;
          window.lab.observer = new MutationObserver(records => window.lab.writes += records.length);
          window.lab.observer.observe(document.querySelector('.ambient-stage'), { attributes: true, subtree: true });
          function sample(now) {
            if (window.lab.last) window.lab.gaps.push(now - window.lab.last);
            window.lab.last = now;
            if (scrolling) {
              const y = scrollY;
              if (y !== window.lab.lastScroll) window.lab.scrollFrames++;
              window.lab.lastScroll = y;
              window.lab.scrollMin = Math.min(window.lab.scrollMin, y);
              window.lab.scrollMax = Math.max(window.lab.scrollMax, y);
            }
            window.lab.frame = requestAnimationFrame(sample);
          }
          window.lab.frame = requestAnimationFrame(sample);
          if (scrolling) {
            let bottom = false;
            const move = () => scrollTo({ top: (bottom = !bottom) ? document.documentElement.scrollHeight - innerHeight : 0, behavior: 'smooth' });
            move(); window.lab.scrollTimer = setInterval(move, 1500);
          }
        }, scrolling);
        const before = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        await browser.startTracing(page, { categories: ['devtools.timeline'], screenshots: false });
        await page.waitForTimeout(seconds * 1000);
        const trace = JSON.parse((await browser.stopTracing()).toString());
        const after = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const frames = await page.evaluate(() => {
          cancelAnimationFrame(window.lab.frame); clearInterval(window.lab.scrollTimer); window.lab.observer.disconnect();
          const gaps = window.lab.gaps.sort((a, b) => a - b);
          const median = gaps[Math.floor(gaps.length / 2)];
          return { count: gaps.length, observedHz: Math.round(1000 / median), medianGapMs: median, p95GapMs: gaps[Math.floor(gaps.length * .95)], gapsOver1_5Frames: gaps.filter(n => n > median * 1.5).length, gapsOver34ms: gaps.filter(n => n > 34).length, writes: window.lab.writes, scrollFrames: window.lab.scrollFrames, scrollDistance: window.lab.scrollMax - window.lab.scrollMin };
        });
        const measured = after.Timestamp - before.Timestamp;
        const cpu = Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(key => [key, +(1000 * (after[key] - before[key]) / measured).toFixed(3)]));
        const paints = trace.traceEvents.filter(e => e.name === 'Paint' && e.ph === 'X');
        const result = { name, run, state, throttle, load, ...cpu, ...frames, paintMsPerSecond: +(paints.reduce((sum, e) => sum + e.dur, 0) / 1000 / measured).toFixed(3) };
        report.results.push(result);
        console.log(JSON.stringify(result));
      }
      await context.close();
    }
  }
} finally {
  await browser?.close(); server.kill();
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
}
