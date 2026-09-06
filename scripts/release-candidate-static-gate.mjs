import fs from 'node:fs';

const app = JSON.parse(fs.readFileSync(new URL('../apps/mobile/app.json', import.meta.url), 'utf8'));
const eas = JSON.parse(fs.readFileSync(new URL('../apps/mobile/eas.json', import.meta.url), 'utf8'));
const rootPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const mobilePackage = JSON.parse(fs.readFileSync(new URL('../apps/mobile/package.json', import.meta.url), 'utf8'));
const serverPackage = JSON.parse(fs.readFileSync(new URL('../apps/server/package.json', import.meta.url), 'utf8'));
const envExample = fs.readFileSync(new URL('../apps/mobile/.env.example', import.meta.url), 'utf8');
const signalModule = JSON.parse(fs.readFileSync(new URL('../apps/mobile/modules/kssenger-signal/expo-module.config.json', import.meta.url), 'utf8'));
const iosSignalModuleUrl = new URL('../apps/mobile/modules/kssenger-signal/ios', import.meta.url);

const EXPECTED = Object.freeze({
  appName: 'K-ssenger',
  slug: 'k-ssenger',
  scheme: 'kssenger',
  version: '1.0.0',
  bundleIdentifier: 'com.kahdigital.kssenger',
  androidPackage: 'com.kahdigital.kssenger',
  authUrl: 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth',
  dataApiUrl: 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1',
  socketUrl: 'https://kssenger-server.onrender.com',
});

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

const expo = app?.expo ?? {};
check('release app name is K-ssenger', expo.name === EXPECTED.appName, String(expo.name ?? 'missing'));
check('release slug is stable', expo.slug === EXPECTED.slug, String(expo.slug ?? 'missing'));
check('deep-link scheme is stable', expo.scheme === EXPECTED.scheme, String(expo.scheme ?? 'missing'));
check('mobile release version is 1.0.0', expo.version === EXPECTED.version, String(expo.version ?? 'missing'));
check('root package version matches release', rootPackage.version === EXPECTED.version, String(rootPackage.version ?? 'missing'));
check('mobile package version matches release', mobilePackage.version === EXPECTED.version, String(mobilePackage.version ?? 'missing'));
check('server package version matches release', serverPackage.version === EXPECTED.version, String(serverPackage.version ?? 'missing'));
check('runtime version follows app version', expo.runtimeVersion?.policy === 'appVersion', JSON.stringify(expo.runtimeVersion ?? null));
check('iOS bundle identifier is stable', expo.ios?.bundleIdentifier === EXPECTED.bundleIdentifier, String(expo.ios?.bundleIdentifier ?? 'missing'));
check('iOS build number exists', /^\d+$/.test(String(expo.ios?.buildNumber ?? '')) && Number(expo.ios.buildNumber) >= 1, String(expo.ios?.buildNumber ?? 'missing'));
check('iOS ATS forbids arbitrary loads', expo.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads === false, JSON.stringify(expo.ios?.infoPlist?.NSAppTransportSecurity ?? null));
check('iOS ATS does not exempt local networking', expo.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking === false, JSON.stringify(expo.ios?.infoPlist?.NSAppTransportSecurity ?? null));
check('Android package identifier is stable', expo.android?.package === EXPECTED.androidPackage, String(expo.android?.package ?? 'missing'));
check('Android versionCode exists', Number.isInteger(expo.android?.versionCode) && expo.android.versionCode >= 1, String(expo.android?.versionCode ?? 'missing'));
check('Android release backups are disabled', expo.android?.allowBackup === false, String(expo.android?.allowBackup ?? 'missing'));
check('Android cleartext traffic is disabled', expo.android?.usesCleartextTraffic === false, String(expo.android?.usesCleartextTraffic ?? 'missing'));

const productionEnv = eas?.build?.production?.env ?? {};
check('production Neon Auth endpoint is dedicated K-ssenger', productionEnv.EXPO_PUBLIC_NEON_AUTH_URL === EXPECTED.authUrl, String(productionEnv.EXPO_PUBLIC_NEON_AUTH_URL ?? 'missing'));
check('production Neon Data API endpoint is dedicated K-ssenger', productionEnv.EXPO_PUBLIC_NEON_DATA_API_URL === EXPECTED.dataApiUrl, String(productionEnv.EXPO_PUBLIC_NEON_DATA_API_URL ?? 'missing'));
check('production realtime endpoint is K-ssenger', productionEnv.EXPO_PUBLIC_KSSENGER_SOCKET_URL === EXPECTED.socketUrl, String(productionEnv.EXPO_PUBLIC_KSSENGER_SOCKET_URL ?? 'missing'));
check('production build is not a development client', eas?.build?.production?.developmentClient !== true);
check('production build does not request internal distribution', eas?.build?.production?.distribution !== 'internal');

const forbidden = [
  /SUPABASE_/i,
  /\.supabase\.co/i,
  /DATABASE_URL\s*=/i,
  /NEON_API_KEY\s*=/i,
  /JWT_SECRET\s*=/i,
  /PRIVATE_KEY\s*=/i,
];
check('mobile example env contains no backend secret or Supabase runtime marker', forbidden.every((pattern) => !pattern.test(envExample)));

for (const [key, value] of Object.entries(productionEnv)) {
  if (!key.startsWith('EXPO_PUBLIC_')) continue;
  let parsed;
  try { parsed = new URL(String(value)); } catch { parsed = null; }
  check(`${key} is HTTPS without URL credentials`, !!parsed && parsed.protocol === 'https:' && !parsed.username && !parsed.password, String(value));
}

const signalPlatforms = Array.isArray(signalModule?.platforms) ? signalModule.platforms : [];
check('native Signal module remains Android-only until vetted iOS parity lands', signalPlatforms.length === 1 && signalPlatforms[0] === 'android', JSON.stringify(signalPlatforms));
check('no unvalidated iOS Signal bridge is shipped', !fs.existsSync(iosSignalModuleUrl));

if (failed) throw new Error(`KSSENGER_RELEASE_CANDIDATE_STATIC_GATE_FAILED:${failed}`);
console.log('KSSENGER_RELEASE_CANDIDATE_STATIC_GATE_PASS=true');
