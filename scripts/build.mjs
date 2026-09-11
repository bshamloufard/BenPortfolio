import { cp, mkdir, rm, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)) {
  await stat(resolve(root, `public${path}`));
}
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist'), { recursive: true });
await cp(resolve(root, 'public'), resolve(root, 'dist'), { recursive: true });
console.log('Built portfolio to dist. All local asset references exist.');
