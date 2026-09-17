// One-off: create 10 additional bot accounts (extends the existing 10 from
// web-test-populate.mjs to 20 total). Same pattern, same shared password.
// Idempotent — safe to re-run.
//   node scripts/create-new-bots.mjs
import crypto from 'node:crypto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';
const BOT_PASSWORD = 'KssBot2026!';

export const NEW_BOTS = [
  { key: 'nadia', email: 'kenams42+kss-nadia@gmail.com', username: 'nadia_b', displayName: 'Nadia Belkacem', status: 'Debout depuis les aurores ☀️', presence: 'online' },
  { key: 'julien', email: 'kenams42+kss-julien@gmail.com', username: 'julien_p', displayName: 'Julien Petit', status: 'Sur un projet perso 🛠️', presence: 'online' },
  { key: 'amine', email: 'kenams42+kss-amine@gmail.com', username: 'amine_z', displayName: 'Amine Ziani', status: 'Salle de sport 💪', presence: 'busy' },
  { key: 'camille', email: 'kenams42+kss-camille@gmail.com', username: 'camille_r', displayName: 'Camille Roux', status: 'Petit café du matin ☕', presence: 'online' },
  { key: 'youssef', email: 'kenams42+kss-youssef@gmail.com', username: 'youssef_a', displayName: 'Youssef Amrani', status: 'En cours ou en retard 😅', presence: 'away' },
  { key: 'manon', email: 'kenams42+kss-manon@gmail.com', username: 'manon_l', displayName: 'Manon Laurent', status: 'Journée chargée 📚', presence: 'busy' },
  { key: 'bilal', email: 'kenams42+kss-bilal@gmail.com', username: 'bilal_h', displayName: 'Bilal Haddad', status: 'Dispo si besoin', presence: 'online' },
  { key: 'charlotte', email: 'kenams42+kss-charlotte@gmail.com', username: 'charlotte_m', displayName: 'Charlotte Menard', status: 'En balade 🚶‍♀️', presence: 'away' },
  { key: 'adama', email: 'kenams42+kss-adama@gmail.com', username: 'adama_k', displayName: 'Adama Koné', status: 'Tranquille à la maison', presence: 'online' },
  { key: 'emma', email: 'kenams42+kss-emma@gmail.com', username: 'emma_b', displayName: 'Emma Bernard', status: 'Weekend mode 🎉', presence: 'online' },
];

const authOrigin = new URL(AUTH_URL).origin;
const nativeFetch = globalThis.fetch.bind(globalThis);
const cookieJar = new Map();
function absorbSetCookies(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  for (const value of values) {
    const pair = String(value).split(';', 1)[0];
    const equals = pair.indexOf('=');
    if (equals <= 0) continue;
    const name = pair.slice(0, equals).trim();
    const cookieValue = pair.slice(equals + 1).trim();
    if (!cookieValue) cookieJar.delete(name);
    else cookieJar.set(name, cookieValue);
  }
}
function cookieHeader() { return [...cookieJar.entries()].map(([n, v]) => `${n}=${v}`).join('; '); }
globalThis.fetch = async (input, init = {}) => {
  const target = typeof input === 'string' || input instanceof URL ? String(input) : input?.url ?? '';
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init.headers) { const extra = new Headers(init.headers); for (const [k, v] of extra.entries()) headers.set(k, v); }
  const isAuthRequest = target.startsWith(authOrigin);
  if (isAuthRequest) {
    if (!headers.has('origin')) headers.set('origin', authOrigin);
    const cookies = cookieHeader();
    if (cookies) headers.set('cookie', cookies);
  }
  const response = await nativeFetch(input, { ...init, headers });
  if (isAuthRequest) absorbSetCookies(response);
  return response;
};

function makeAuthClient() { return createClient({ auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL }, dataApi: { url: DATA_API_URL } }); }
function makeDataClient(token) { return createClient({ dataApi: { url: DATA_API_URL, getToken: async () => token } }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureAccount(spec) {
  cookieJar.clear();
  const auth = makeAuthClient();
  let session = null;
  let signup;
  for (let attempt = 0; attempt < 5; attempt++) {
    signup = await auth.auth.signUp({ email: spec.email, password: BOT_PASSWORD, options: { data: { username: spec.username, display_name: spec.displayName } } });
    if (!signup.error || !/too many requests|rate/i.test(signup.error.message)) break;
    const wait = 8000 * (attempt + 1);
    console.log(`  … ${spec.key} rate-limited, pause ${wait / 1000}s`);
    await sleep(wait);
  }
  if (signup.error) {
    const signin = await auth.auth.signInWithPassword({ email: spec.email, password: BOT_PASSWORD });
    if (signin.error) throw new Error(`${spec.key}: signup(${signup.error.message}) + signin(${signin.error.message}) failed`);
    session = signin.data?.session ?? null;
  } else {
    session = signup.data?.session ?? null;
    if (!session) {
      const signin = await auth.auth.signInWithPassword({ email: spec.email, password: BOT_PASSWORD });
      if (signin.error) throw new Error(`${spec.key} post-signup signin failed: ${signin.error.message}`);
      session = signin.data?.session ?? null;
    }
  }
  if (!session?.user?.id || !session?.access_token) throw new Error(`${spec.key} session missing`);
  const userId = session.user.id;
  const client = makeDataClient(session.access_token);
  const rpc = await client.rpc('ensure_my_kssenger_profile', { p_username: spec.username, p_display_name: spec.displayName });
  if (rpc.error && !/USERNAME_TAKEN/i.test(rpc.error.message)) throw new Error(`${spec.key} ensure_profile: ${rpc.error.message}`);
  const enrich = await client.from('profiles').update({ display_name: spec.displayName, custom_status: spec.status, presence: spec.presence, updated_at: new Date().toISOString() }).eq('id', userId);
  if (enrich.error) throw new Error(`${spec.key} profile enrich: ${enrich.error.message}`);
  try { await client.from('privacy_settings').insert({ user_id: userId }); } catch { /* present */ }
  try { await client.from('user_age_profile').insert({ user_id: userId, birth_date: '1994-03-10', age_assurance_level: 'declared' }); } catch { /* present */ }
  console.log(`  ✓ ${spec.key.padEnd(10)} ${spec.email.padEnd(32)} id=${userId}`);
  return { ...spec, userId };
}

async function main() {
  console.log('Creating 10 new bot accounts (KssBot2026!)...\n');
  const created = [];
  for (const spec of NEW_BOTS) { created.push(await ensureAccount(spec)); await sleep(2500); }
  console.log('\nNEW_BOTS_READY');
  console.log(JSON.stringify(created.map((b) => ({ key: b.key, userId: b.userId, email: b.email })), null, 2));
}
main().catch((e) => { console.error('CREATE_NEW_BOTS_FAILED:', e.message); process.exit(1); });
