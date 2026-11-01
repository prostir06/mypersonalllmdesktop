import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '../build/assets');

const MAX_ENTRY_JS_BYTES = 180 * 1024; // 180 KB uncompressed

if (!fs.existsSync(assetsDir)) {
  console.error(`Bundle check failed: ${assetsDir} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const entryFiles = files.filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f));

if (entryFiles.length === 0) {
  console.error('Bundle check failed: no entry index-*.js asset found.');
  process.exit(1);
}

for (const file of entryFiles) {
  const fullPath = path.join(assetsDir, file);
  const { size } = fs.statSync(fullPath);
  const kb = (size / 1024).toFixed(2);
  if (size > MAX_ENTRY_JS_BYTES) {
    console.error(
      `Bundle budget exceeded: ${file} is ${kb} KB (limit: ${(MAX_ENTRY_JS_BYTES / 1024).toFixed(0)} KB)`
    );
    process.exit(1);
  }
  console.log(`Bundle budget OK: ${file} = ${kb} KB (limit: 180 KB)`);
}
