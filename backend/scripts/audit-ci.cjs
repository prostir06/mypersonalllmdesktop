/**
 * Fail CI only on high/critical advisories not listed in the documented baseline.
 * Usage: node scripts/audit-ci.cjs
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ALLOWED_GHSA = new Set([
  'GHSA-3jxr-9vmj-r5cp',
  'GHSA-mh99-v99m-4gvg',
  'GHSA-rgw5-rvv9-x895',
  'GHSA-ggr8-5vv4-36mx',
  'GHSA-7p8r-x3mc-p8w7',
  'GHSA-h67p-54hq-rp68',
  'GHSA-52cp-r559-cp3m',
  'GHSA-5p4m-2wfm-xmqj',
  'GHSA-4r6h-8v6p-xvw6',
  'GHSA-5pgg-2g8v-p4x9',
]);

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
let report;
try {
  report = JSON.parse(stdout);
} catch {
  console.error('npm audit did not return JSON');
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
