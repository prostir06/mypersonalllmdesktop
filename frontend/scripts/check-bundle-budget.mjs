import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../build/assets');
const indexHtmlPath = path.resolve(__dirname, '../build/index.html');

const MAX_INITIAL_JS_GZIP = 350 * 1024;

if (!fs.existsSync(assetsDir) || !fs.existsSync(indexHtmlPath)) {
  console.error('Bundle check failed: build output is missing. Run "npm run build" first.');
  process.exit(1);
}

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const refs = [
  ...new Set(
    [...indexHtml.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1])
  ),
];

if (refs.length === 0) {
  console.error('Bundle check failed: index.html references no JS.');
  process.exit(1);
}

let total = 0;
for (const ref of refs) {
  const file = path.join(assetsDir, path.basename(ref.split('?')[0]));
  if (!fs.existsSync(file)) {
    console.error(`Bundle check failed: missing asset ${ref}`);
    process.exit(1);
  }
  total += zlib.gzipSync(fs.readFileSync(file)).length;
}

const kb = (total / 1024).toFixed(2);
if (total > MAX_INITIAL_JS_GZIP) {
  console.error(
    `Bundle budget exceeded: initial JS is ${kb} KB gzip (limit: 350 KB)`
  );
  process.exit(1);
}
console.log(`Bundle budget OK: initial JS = ${kb} KB gzip across ${refs.length} files (limit: 350 KB)`);

if (/modulepreload[^>]*jspdf/i.test(indexHtml)) {
  console.error('Bundle check failed: index.html preloads jspdf');
  process.exit(1);
}
console.log('Bundle check OK: jspdf is not preloaded');
