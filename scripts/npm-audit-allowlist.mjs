/**
 * Fail when npm audit reports a high/critical advisory that is not allowlisted.
 * Usage: node scripts/npm-audit-allowlist.mjs <project-dir> <allowlist.json> [--print]
 * Allowlist entries are GHSA ids, or `package:<name>` when the advisory has no GHSA.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = path.resolve(process.argv[2] || '.');
const allowPath = process.argv[3] ? path.resolve(process.argv[3]) : '';
const printOnly = process.argv.includes('--print');

function collectIds(report) {
  const ids = new Set();
  for (const [name, entry] of Object.entries(report.vulnerabilities || {})) {
    const severity = String(entry.severity || '').toLowerCase();
    if (severity !== 'high' && severity !== 'critical') continue;
    const found = [];
    for (const item of entry.via || []) {
      if (typeof item !== 'object' || !item) continue;
      const hay = `${item.url || ''} ${item.source || ''} ${item.ghsa || ''}`;
      const matches = hay.match(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/gi) || [];
      found.push(...matches);
    }
    if (found.length === 0) ids.add(`package:${name}`);
    else found.forEach((id) => ids.add(id));
  }
  return [...ids].sort();
}

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  shell: process.platform === 'win32',
});
const stdout = result.stdout || '';
const jsonStart = stdout.indexOf('{');
let report;
try {
  if (jsonStart < 0) throw new Error('no JSON object in stdout');
  report = JSON.parse(stdout.slice(jsonStart));
} catch {
  console.error('npm audit did not return JSON');
  process.exit(1);
}

const found = collectIds(report);
if (printOnly) {
  console.log(JSON.stringify(found, null, 2));
  process.exit(0);
}

if (!allowPath) {
  console.error('allowlist path is required');
  process.exit(1);
}

const allowed = new Set(JSON.parse(readFileSync(allowPath, 'utf8')));
const unexpected = found.filter((id) => !allowed.has(id));
if (unexpected.length > 0) {
  console.error(`unexpected high/critical advisories:\n${unexpected.join('\n')}`);
  process.exit(1);
}
console.log(`audit allowlist ok (${found.length} known)`);
