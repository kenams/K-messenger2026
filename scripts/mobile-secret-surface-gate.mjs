import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const MOBILE_ROOT = join(ROOT, 'apps', 'mobile');
const ALLOWED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json']);
const SKIP_DIRS = new Set(['node_modules', '.expo', 'android', 'ios', 'dist', 'build']);

const forbidden = [
  /\bDATABASE_URL\b/,
  /\bDIRECT_URL\b/,
  /\bNEON_API_KEY\b/,
  /\bNEON_DATABASE_URL\b/,
  /\bPGPASSWORD\b/,
  /\bPOSTGRES_PASSWORD\b/,
  /\bAUTH_SECRET\b/,
  /\bBETTER_AUTH_SECRET\b/,
  /\bJWT_SECRET\b/,
  /\bSERVICE_ROLE(?:_KEY)?\b/,
  /\bPRIVATE_KEY\b/,
  /\bAWS_SECRET_ACCESS_KEY\b/,
  /\bEXPO_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|DATABASE_URL|API_KEY)\b/,
];

const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (entry.name === '.env.example' || ALLOWED_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
}

await walk(MOBILE_ROOT);

const violations = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const path = relative(ROOT, file);
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('#')) return;
    for (const pattern of forbidden) {
      if (pattern.test(line)) {
        violations.push(`${path}:${index + 1} matches ${pattern}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Mobile secret-surface gate failed. Server/database credentials must never enter the mobile app or EXPO_PUBLIC_* environment.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Mobile secret-surface gate passed across ${files.length} checked files.`);
