/**
 * Fail when @typescript-eslint/no-explicit-any warnings grow past the baseline.
 * Usage: node scripts/any-ratchet.mjs frontend|backend
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = process.argv[2];
if (project !== 'frontend' && project !== 'backend') {
  console.error('usage: node scripts/any-ratchet.mjs frontend|backend');
  process.exit(2);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(readFileSync(path.join(root, 'scripts', 'any-baseline.json'), 'utf8'));
const allowed = baseline[project];
if (typeof allowed !== 'number') {
  console.error(`missing baseline for ${project}`);
  process.exit(2);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['eslint', '.', '-f', 'json'], {
  cwd: path.join(root, project),
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(result.stdout || '[]');
} catch {
  console.error(result.stderr || result.stdout || 'eslint did not return JSON');
  process.exit(1);
}

let count = 0;
for (const file of report) {
  for (const message of file.messages || []) {
    if (message.ruleId === '@typescript-eslint/no-explicit-any') count += 1;
  }
}

console.log(`${project} explicit any: ${count} (baseline ${allowed})`);
if (count > allowed) {
  console.error(`${project} explicit any grew from ${allowed} to ${count}`);
  process.exit(1);
}
