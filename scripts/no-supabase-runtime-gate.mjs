import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const roots = ['apps', 'packages'];
const ignoredDirectories = new Set([
  'node_modules',
  '.expo',
  '.next',
  'dist',
  'build',
  'coverage',
  'android',
  'ios',
]);
const textExtensions = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.yml', '.yaml',
  '.env', '.example', '.toml', '.gradle', '.kt', '.swift', '.md',
]);

const forbidden = [
  { label: 'Supabase package/client reference', pattern: /@supabase\//i },
  { label: 'Supabase environment variable', pattern: /\b(?:NEXT_PUBLIC_|EXPO_PUBLIC_)?SUPABASE_[A-Z0-9_]+\b/i },
  { label: 'Supabase hosted endpoint', pattern: /(?:https?:\/\/)?[a-z0-9-]+\.supabase\.co\b/i },
  { label: 'Supabase JS runtime package', pattern: /\bsupabase-js\b/i },
];

async function walk(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await walk(fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (textExtensions.has(extension) || entry.name === '.env.example') files.push(fullPath);
  }
  return files;
}

const findings = [];
for (const root of roots) {
  try {
    if (!(await stat(root)).isDirectory()) continue;
  } catch {
    continue;
  }
  for (const file of await walk(root)) {
    const content = await readFile(file, 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(content)) findings.push(`${file}: ${rule.label}`);
    }
  }
}

if (findings.length) {
  console.error('K-ssenger runtime must remain dedicated to Neon. Forbidden Supabase assumptions found:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Neon-only runtime gate passed: no Supabase runtime assumptions found in apps/ or packages/.');
