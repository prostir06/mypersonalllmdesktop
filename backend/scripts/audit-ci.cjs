/**
 * Fail CI only on high/critical advisories not listed in the documented baseline.
 * Usage: node scripts/audit-ci.cjs
 */
const { spawnSync } = require('child_process');
const path = require('path');

/** Residual high/critical after non-breaking `npm audit fix` (xlsx replaced with exceljs, 0 high/critical). */
const ALLOWED_GHSA = new Set([]);

function collectHighGhsa(report) {
  const ids = new Set();
  const vulns = report.vulnerabilities || {};
  for (const entry of Object.values(vulns)) {
    const severity = String(entry.severity || '').toLowerCase();
    if (severity !== 'high' && severity !== 'critical') continue;
    for (const item of entry.via || []) {
      if (typeof item !== 'object' || !item) continue;
      const hay = `${item.url || ''} ${item.source || ''} ${item.ghsa || ''}`;
      const match = hay.match(/GHSA-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/i);
      if (match) ids.add(match[0]);
    }
  }
  return ids;
}

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  shell: true,
});

const stdout = result.stdout || '';
const jsonStart = stdout.indexOf('{');
let report;
try {
  if (jsonStart < 0) throw new Error('no JSON object in stdout');
  report = JSON.parse(stdout.slice(jsonStart));
} catch (err) {
  console.error('npm audit did not return JSON');
  console.error(err instanceof Error ? err.message : String(err));
  console.error(stdout || result.stderr);
  process.exit(1);
}

const found = [...collectHighGhsa(report)];
const unexpected = found.filter((id) => !ALLOWED_GHSA.has(id));
const known = found.filter((id) => ALLOWED_GHSA.has(id));

console.log(`Known high/critical (baseline): ${known.join(', ') || '(none)'}`);
if (unexpected.length > 0) {
  console.error(`New high/critical advisories: ${unexpected.join(', ')}`);
  process.exit(1);
}

console.log('Audit CI: no new high/critical advisories outside baseline.');
process.exit(0);
