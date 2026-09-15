import { cp, mkdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { transform } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
let html = (await readFile(resolve(root, 'public/index.html'), 'utf8')).replace(/\r\n?/g, '\n');
for (const [, path] of html.matchAll(/(?:src|href|content)="(?:https:\/\/b3n\.ai)?(\/[^"#]*)"/g)) {
  await stat(resolve(root, `public${path}`));
}
const manifest = JSON.parse(await readFile(resolve(root, 'public/site.webmanifest'), 'utf8'));
for (const icon of manifest.icons) await stat(resolve(root, `public${icon.src}`));
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'public'), resolve(root, 'dist'), { recursive: true });
await mkdir(resolve(root, 'dist/static'), { recursive: true });
const target = ['chrome110', 'firefox115', 'safari16'];
const minify = async (code, loader) => (await transform(code, { loader, minify: true, target, legalComments: 'none' })).code;
async function emit(name, contents) {
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 16);
  const extension = extname(name);
  const path = `/static/${basename(name, extension)}.${hash}${extension}`;
  await writeFile(resolve(root, `dist${path}`), contents);
  return path;
}

const geometry = JSON.parse(await readFile(resolve(root, 'scripts/ambient-geometry.json'), 'utf8'));
for (const [, path] of html.matchAll(/class="trace-line" d="([^"]+)"/g)) {
  if (geometry[path]?.length !== 129) throw new Error('Signal routes changed: run npm run geometry before building.');
}
const main = await readFile(resolve(root, 'public/main.js'), 'utf8');
const packedGeometry = Object.fromEntries(Object.entries(geometry).map(([path, points]) => {
  const bytes = Buffer.alloc(points.length * 8);
  points.forEach(([x, y], index) => { bytes.writeFloatLE(x, index * 8); bytes.writeFloatLE(y, index * 8 + 4); });
  return [path, bytes.toString('base64')];
}));
const ambient = (await readFile(resolve(root, 'public/ambient.js'), 'utf8')).replace('const cachedSamples = null;', `const cachedSamples = ${JSON.stringify(packedGeometry)};`);
const app = await emit('app.js', await minify(`(() => {\n${main}\n${ambient}\n})();`, 'js'));
const css = await emit('styles.css', await minify(await readFile(resolve(root, 'public/styles.css'), 'utf8'), 'css'));
const theme = await minify(await readFile(resolve(root, 'public/theme.js'), 'utf8'), 'js');
html = html.replace('<script src="/theme.js"></script>', `<script>${theme.trim()}</script>`)
  .replace('href="/styles.css"', `href="${css}"`)
  .replace('<script src="/main.js" defer></script>', `<script src="${app}" defer></script>`)
  .replace('  <script src="/ambient.js" defer></script>\n', '');
// Fingerprinted assets can be cached without serving an old logo after edits.
const assets = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"#]*)"/g)].map(match => match[1]));
for (const path of assets) {
  const hashed = await emit(basename(path), await readFile(resolve(root, `public${path}`)));
  html = html.replaceAll(`"${path}"`, `"${hashed}"`);
}
await writeFile(resolve(root, 'dist/index.html'), html);
// Keep stable public URLs usable, but do not ship redundant JavaScript copies.
for (const file of ['main.js', 'ambient.js', 'theme.js', 'styles.css']) await rm(resolve(root, `dist/${file}`));
// Validate the output as well as the source, including removed bundle inputs.
for (const [, path] of html.matchAll(/(?:src|href|content)="(?:https:\/\/b3n\.ai)?(\/[^"#]*)"/g)) {
  await stat(resolve(root, `dist${path}`));
}
console.log('Built minified, fingerprinted assets with precomputed animation geometry.');
