import { chromium, firefox, webkit, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

// Run `npm run qa` for a fresh local server, or `npm run qa -- https://your-site`.
const suppliedUrl = process.argv[2];
const url = suppliedUrl || 'http://127.0.0.1:4183';
const output = resolve('qa', process.env.QA_NAME || 'latest');
await mkdir(output, { recursive: true });
let server;
if (!suppliedUrl) {
  server = spawn(process.execPath, ['scripts/serve.mjs', 'dist'], { env: { ...process.env, PORT: '4183' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => {
    server.stdout.once('data', ok);
    server.once('error', fail);
    server.once('exit', code => fail(new Error(`Preview exited: ${code}`)));
  });
}

const report = { url, generatedAt: new Date().toISOString(), checks: [], captures: [] };
const engines = { chromium, firefox, webkit };
const selected = (process.env.TEST_BROWSERS || 'chromium,firefox,webkit').split(',');
let activeBrowser;
try {
  for (const engine of selected) {
    activeBrowser = await engines[engine].launch();
    for (const colorScheme of ['light', 'dark']) {
      for (const [label, width, height] of [['desktop', 1440, 1000], ['phone', 390, 844], ['small-phone', 320, 740]]) {
        const context = await activeBrowser.newContext({ viewport: { width, height }, colorScheme, reducedMotion: 'reduce', hasTouch: label !== 'desktop' });
        const page = await context.newPage();
        await page.addInitScript(() => {
          window.geometryCalls = 0;
          const sample = SVGGeometryElement.prototype.getPointAtLength;
          SVGGeometryElement.prototype.getPointAtLength = function (...args) { window.geometryCalls++; return sample.apply(this, args); };
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
        const response = await page.goto(url, { waitUntil: 'networkidle' });
        expect(response.status()).toBe(200);
        await expect(page.locator('h1')).toHaveText('Ben Shamloufard.');
        await expect(page.locator('h1')).toBeVisible();
        // Production loads precomputed paths instead of sampling on the device.
        expect(await page.evaluate(() => window.geometryCalls)).toBe(0);
        const screenshot = `${engine}-${label}-${colorScheme}.png`;
        // Capture a completed paint before measuring inherited theme values.
        // Headless WebKit can report unresolved custom properties before this.
        await page.screenshot({ path: resolve(output, screenshot), fullPage: true, animations: 'disabled' });
        await expect(page.locator('body')).toHaveCSS('background-color', colorScheme === 'dark' ? 'rgb(21, 22, 23)' : 'rgb(250, 250, 250)');
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          background: getComputedStyle(document.body).backgroundColor,
          brokenImages: [...document.images].filter(img => !img.loading && (!img.complete || !img.naturalWidth)).map(img => img.src),
          resourceBytes: performance.getEntriesByType('resource').reduce((sum, item) => sum + item.transferSize, 0),
          domContentLoadedMs: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
        }));
        expect(metrics.overflow).toBe(false);
        expect(metrics.background).toBe(colorScheme === 'dark' ? 'rgb(21, 22, 23)' : 'rgb(250, 250, 250)');
        expect(metrics.brokenImages).toEqual([]);
        report.captures.push({ screenshot, engine, label, colorScheme, metrics });

        // Focus first so headless Firefox has an active input target after capture.
        await page.locator('#valkai summary').focus();
        // Check native disclosure behavior and every expanded row at every width.
        for (const id of ['valkai', 'ramp', 'amazon', 'bair', 'games']) {
          await page.locator(`#${id} summary`).focus();
          await page.locator(`#${id} summary`).click();
          await expect(page.locator(`#${id}`)).toHaveAttribute('open', '');
        }
        await page.locator('#bair .project-images').scrollIntoViewIfNeeded();
        await expect(page.locator('#bair img').nth(1)).toBeVisible();
        await page.waitForFunction(() => [...document.querySelectorAll('#bair img')].every(img => img.complete && img.naturalWidth > 0));
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        if (engine === 'chromium' && label !== 'small-phone') {
          await page.screenshot({ path: resolve(output, `${engine}-${label}-${colorScheme}-expanded.png`), fullPage: true, animations: 'disabled' });
          const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
          report.checks.push({ check: 'accessibility', label, colorScheme, violations: accessibility.violations });
          expect(accessibility.violations).toEqual([]);
        }
        expect(errors).toEqual([]);
        await context.close();
      }
    }

    const context = await activeBrowser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto(url);
    const network = page.locator('.network-panel');
    const packet = network.locator('.signal-packet').first();
    const surfacePacket = page.locator('.surface-panel .signal-packet').first();
    await expect(network).toHaveAttribute('data-motion', 'playing');
    const initialPosition = await packet.getAttribute('transform');
    const surfacePosition = await surfacePacket.getAttribute('transform');
    await page.waitForTimeout(250);
    expect(await packet.getAttribute('transform')).not.toBe(initialPosition);
    expect(await surfacePacket.getAttribute('transform')).not.toBe(surfacePosition);
    // Theme follows a live system change, manual choice persists, System restores it.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 22, 23)');
    await page.getByLabel('Color theme').selectOption('light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 250, 250)');
    await page.reload();
    await expect(page.getByLabel('Color theme')).toHaveValue('light');
    await page.getByLabel('Color theme').selectOption('system');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(21, 22, 23)');
    // Pause, persistence, and system reduced-motion all stop the ambient layer.
    await page.locator('#motion-toggle').focus();
    await page.getByRole('button', { name: 'Pause background animation' }).click();
    await expect(network).toHaveAttribute('data-motion', 'still');
    await network.scrollIntoViewIfNeeded();
    const frozenState = () => page.locator('.ambient-stage').locator('.signal-track, .signal-packet, .trace-line, .trace-glow, .node-lamp').evaluateAll(elements => elements.map(element => [element.getAttribute('transform'), element.getAttribute('style')]));
    const pausedState = await frozenState();
    const pausedPosition = await packet.getAttribute('transform');
    await page.waitForTimeout(200);
    expect(await packet.getAttribute('transform')).toBe(pausedPosition);
    expect(await frozenState()).toEqual(pausedState);
    await page.reload();
    await expect(page.locator('#motion-toggle')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#motion-toggle').focus();
    await page.getByRole('button', { name: 'Resume background animation' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(network).toHaveAttribute('data-motion', 'still');
    await expect(page.locator('#motion-toggle')).toBeDisabled();
    await network.scrollIntoViewIfNeeded();
    const reducedPosition = await packet.getAttribute('transform');
    await page.waitForTimeout(200);
    expect(await packet.getAttribute('transform')).toBe(reducedPosition);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(network).toHaveAttribute('data-motion', 'playing');
    // The corner drawings stay fixed during scrolling; high contrast hides them.
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(network).toHaveAttribute('data-motion', 'still');
    await expect(page.locator('.ambient-stage')).toBeHidden();
    const highContrastState = await frozenState();
    await page.waitForTimeout(200);
    expect(await frozenState()).toEqual(highContrastState);
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    // Keyboard and in-page links open the corresponding content.
    await page.locator('#amazon summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#amazon')).toHaveAttribute('open', '');
    await page.locator('a[href="#valkai"]').focus();
    await page.locator('a[href="#valkai"]').click();
    await expect(page.locator('#valkai')).toHaveAttribute('open', '');
    const pdf = await context.request.get(`${url.replace(/\/$/, '')}/resume.pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    expect(await page.getByRole('link', { name: 'GitHub', exact: true }).getAttribute('href')).toBe('https://github.com/bshamloufard');
    // 200% text enlargement remains within the viewport.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await context.close();

    // Reading and native interactions continue to work without JavaScript.
    const noJs = await activeBrowser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
    const noJsPage = await noJs.newPage();
    await noJsPage.goto(url);
    await noJsPage.locator('#bair summary').focus();
    // Native keyboard activation also works while focus scrolls into view.
    await noJsPage.keyboard.press('Enter');
    await expect(noJsPage.locator('#bair .entry-content')).toBeVisible();
    await expect(noJsPage.locator('body')).toHaveCSS('background-color', 'rgb(21, 22, 23)');
    await expect(noJsPage.locator('.ambient-network')).toBeVisible();
    await expect(noJsPage.locator('.signal-track').first()).toHaveCSS('opacity', '0');
    await noJs.close();
    report.checks.push({ engine, check: 'themes, visible animation, pause, reduced motion, high contrast, keyboard, resume, links, text enlargement, no JavaScript', passed: true });
    await activeBrowser.close();
    activeBrowser = undefined;
    console.log(`${engine}: passed`);
  }
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.stack;
  process.exitCode = 1;
  console.error(error);
} finally {
  await activeBrowser?.close();
  server?.kill();
  await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Screenshots and report: ${output}`);
}
