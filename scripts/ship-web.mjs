#!/usr/bin/env node
/**
 * One command to ship the web app safely:
 *   1. typecheck + server tests + static gate
 *   2. export + deploy to production
 *   3. wake the realtime service
 *   4. run the full E2E journey suite against the fresh deployment
 *
 * If any step fails, it stops and tells you what broke. No more "deploy and
 * hope, then wait for Kenams to find the bug".
 *
 *   npm run ship:web            # full pipeline
 *   npm run ship:web -- --skip-deploy   # just re-run E2E against current prod
 */
import { execSync } from 'node:child_process';

const skipDeploy = process.argv.includes('--skip-deploy');
const MOBILE_ENV = {
  EXPO_PUBLIC_NEON_AUTH_URL: 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth',
  EXPO_PUBLIC_NEON_DATA_API_URL: 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1',
  EXPO_PUBLIC_KSSENGER_SOCKET_URL: 'https://kssenger-server.onrender.com',
  // Same public client IDs already committed in plaintext in apps/mobile/eas.json
  // for native builds (EXPO_PUBLIC_* is baked into any client bundle regardless,
  // not a secret) — hardcoded here too so the web export doesn't silently drop
  // them when the calling shell doesn't happen to have them exported. This was
  // the actual cause of "now playing" sync being dead on the deployed web build:
  // this script used to read `EXPO_PUBLIC_LASTFM_API_KEY`, a name nothing else in
  // the codebase ever set or read (musicNowPlaying.ts reads
  // EXPO_PUBLIC_LASTFM_CLIENT_ID) — the web bundle never got a Last.fm key, so
  // `lastfmConfigured` was false and every Last.fm-sourced sync silently no-opped.
  EXPO_PUBLIC_SPOTIFY_CLIENT_ID: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || 'acdb17c786eb432aa1ceacbd49a2de88',
  EXPO_PUBLIC_LASTFM_CLIENT_ID: process.env.EXPO_PUBLIC_LASTFM_CLIENT_ID || '6cf2de22fd7a199162deaeab4b3bcb2d',
};

function run(label, cmd, opts = {}) {
  process.stdout.write(`\n▶ ${label}\n`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

try {
  run('typecheck', 'npm run typecheck');
  run('server tests', 'npm run test:server');
  run('static release gate', 'npm run release:check-static');

  if (!skipDeploy) {
    // --clear busts Metro's transform cache. Without it, Metro can keep serving
    // a previously-cached transform of a module that reads `process.env.EXPO_PUBLIC_*`
    // (e.g. musicNowPlaying.ts) with whatever value was inlined the very first time
    // that module was ever bundled on this machine — env var changes alone do NOT
    // invalidate Metro's cache. This silently kept shipping a web bundle with
    // lastfmConfigured/spotifyConfigured baked in as false even after the env vars
    // above were fixed, across multiple "successful" deploys. Confirmed by diffing
    // the exported bundle's content hash before/after an env-only change: identical.
    run('web export', 'npx expo export --platform web --clear', { cwd: 'apps/mobile', env: { ...process.env, ...MOBILE_ENV } });
    run('deploy to production', 'npx eas deploy --prod --alias kssenger', { cwd: 'apps/mobile' });
  }

  run('wake realtime', 'node -e "(async()=>{for(let i=0;i<12;i++){try{const r=await fetch(\'https://kssenger-server.onrender.com/health\');if((await r.text()).includes(\'\\"ok\\":true\')){console.log(\'realtime OK\');process.exit(0)}}catch{}await new Promise(s=>setTimeout(s,5000))}process.exit(1)})()"');

  run('E2E journey suite (vs production)', 'npm run test:e2e', { env: { ...process.env, E2E_BASE_URL: 'https://k-ssenger.expo.app' } });

  console.log('\n✅  Web shipped and every journey passed.');
} catch (err) {
  console.error('\n❌  ship:web stopped — fix the failure above before this counts as shipped.');
  process.exit(1);
}
