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
  ...(process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ? { EXPO_PUBLIC_SPOTIFY_CLIENT_ID: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID } : {}),
  ...(process.env.EXPO_PUBLIC_LASTFM_API_KEY ? { EXPO_PUBLIC_LASTFM_API_KEY: process.env.EXPO_PUBLIC_LASTFM_API_KEY } : {}),
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
    run('web export', 'npx expo export --platform web', { cwd: 'apps/mobile', env: { ...process.env, ...MOBILE_ENV } });
    run('deploy to production', 'npx eas deploy --prod --alias kssenger', { cwd: 'apps/mobile' });
  }

  run('wake realtime', 'node -e "(async()=>{for(let i=0;i<12;i++){try{const r=await fetch(\'https://kssenger-server.onrender.com/health\');if((await r.text()).includes(\'\\"ok\\":true\')){console.log(\'realtime OK\');process.exit(0)}}catch{}await new Promise(s=>setTimeout(s,5000))}process.exit(1)})()"');

  run('E2E journey suite (vs production)', 'npm run test:e2e', { env: { ...process.env, E2E_BASE_URL: 'https://k-ssenger.expo.app' } });

  console.log('\n✅  Web shipped and every journey passed.');
} catch (err) {
  console.error('\n❌  ship:web stopped — fix the failure above before this counts as shipped.');
  process.exit(1);
}
