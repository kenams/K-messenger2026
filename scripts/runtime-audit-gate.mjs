import { spawnSync } from 'node:child_process';

// These advisories are currently reachable only through the Expo/Metro build
// toolchain bundled by Expo SDK 54. They are NOT a blanket npm-audit bypass.
// Remove entries as soon as the supported Expo line provides patched transitive
// dependencies. Any other high/critical advisory fails the build.
const ALLOWED_BUILD_TOOL_ADVISORIES = new Map([
  ['GHSA-W3RX-R6R6-PGPR', 'image-size ICNS parser; no patched npm version currently published; Metro build-time asset inspection only'],
  ['GHSA-5P2G-FCMC-QVQQ', 'image-size JXL/HEIF parser; Expo/Metro build-time asset inspection only'],
  ['GHSA-6G55-P6WH-862Q', 'PostCSS source-map disclosure in Expo Metro build toolchain'],
  ['GHSA-FXQJ-RQCC-2CMP', 'PostCSS source-map disclosure incomplete-fix advisory in Expo Metro build toolchain'],
  ['GHSA-R28C-9Q8G-F849', 'PostCSS source-map path traversal in Expo Metro build toolchain'],
]);

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (!result.stdout?.trim()) {
  console.error('SECURITY_AUDIT_GATE_FAILED: npm audit returned no JSON output');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error('SECURITY_AUDIT_GATE_FAILED: unable to parse npm audit JSON');
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const advisoryIds = new Set();
const unknownHighNodes = new Set();

function visit(name, visited = new Set()) {
  if (visited.has(name)) return;
  visited.add(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability || !['high', 'critical'].includes(vulnerability.severity)) return;

  let foundLeaf = false;
  for (const via of vulnerability.via ?? []) {
    if (typeof via === 'string') {
      visit(via, visited);
      continue;
    }
    if (!via || !['high', 'critical'].includes(via.severity)) continue;
    foundLeaf = true;
    const match = String(via.url ?? '').match(/GHSA-[a-z0-9-]+/i);
    if (match) advisoryIds.add(match[0].toUpperCase());
    else unknownHighNodes.add(`${name}: ${via.title ?? 'high advisory without GHSA id'}`);
  }

  if (!foundLeaf && !(vulnerability.via ?? []).some((via) => typeof via === 'string')) {
    unknownHighNodes.add(`${name}: high/critical vulnerability without traceable advisory`);
  }
}

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  if (['high', 'critical'].includes(vulnerability?.severity)) visit(name);
}

const unapproved = [...advisoryIds].filter((id) => !ALLOWED_BUILD_TOOL_ADVISORIES.has(id));
if (unknownHighNodes.size || unapproved.length) {
  console.error('SECURITY_AUDIT_GATE_FAILED: untriaged high/critical runtime dependency advisory detected');
  for (const item of unknownHighNodes) console.error(` - ${item}`);
  for (const id of unapproved) console.error(` - ${id}`);
  process.exit(1);
}

const highCount = Number(report.metadata?.vulnerabilities?.high ?? 0);
const criticalCount = Number(report.metadata?.vulnerabilities?.critical ?? 0);
if (highCount || criticalCount) {
  console.warn(`SECURITY_AUDIT_TRIAGED: npm reports ${highCount} high / ${criticalCount} critical dependency nodes.`);
  for (const id of [...advisoryIds].sort()) {
    console.warn(` - ${id}: ${ALLOWED_BUILD_TOOL_ADVISORIES.get(id)}`);
  }
  console.warn('These exceptions are restricted to the pinned Expo/Metro build toolchain; new high/critical advisories still fail CI.');
} else {
  console.log('SECURITY_AUDIT_PASS: no high/critical runtime dependency advisories.');
}
