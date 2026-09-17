// One-off: create the clean "Kah" account for Kenams (kahdigital42@gmail.com).
// Idempotent (safe to re-run): reuses the account if it already exists.
//   node scripts/create-kah-account.mjs
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';

const EMAIL = 'kahdigital42@gmail.com';
const PASSWORD = 'KahDigital2026!';
const USERNAME = 'kah';
const DISPLAY_NAME = 'Kah';

// Same cookie-jar shim as web-test-populate-runner.mjs: the SDK's auth calls
// need Set-Cookie -> Cookie replay across requests, which Node's plain fetch
// does not do on its own.
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
function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}
globalThis.fetch = async (input, init = {}) => {
  const target = typeof input === 'string' || input instanceof URL ? String(input) : input?.url ?? '';
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init.headers) {
    const extra = new Headers(init.headers);
    for (const [key, value] of extra.entries()) headers.set(key, value);
  }
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

function makeAuthClient() {
  return createClient({ auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL }, dataApi: { url: DATA_API_URL } });
}
function makeDataClient(accessToken) {
  return createClient({ dataApi: { url: DATA_API_URL, getToken: async () => accessToken } });
}

async function main() {
  const auth = makeAuthClient();
  let session = null;

  const signup = await auth.auth.signUp({
    email: EMAIL,
    password: PASSWORD,
    options: { data: { username: USERNAME, display_name: DISPLAY_NAME } },
  });
  if (signup.error) {
    console.log(`signUp: ${signup.error.message} — trying sign-in (account may already exist)`);
    const signin = await auth.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signin.error) throw new Error(`signup(${signup.error.message}) + signin(${signin.error.message}) both failed`);
    session = signin.data?.session ?? null;
  } else {
    session = signup.data?.session ?? null;
    if (!session) {
      const signin = await auth.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      if (signin.error) throw new Error(`post-signup signin failed: ${signin.error.message}`);
      session = signin.data?.session ?? null;
    }
  }
  if (!session?.user?.id || !session?.access_token) throw new Error('session missing after signup/signin');

  const userId = session.user.id;
  const client = makeDataClient(session.access_token);

  const rpc = await client.rpc('ensure_my_kssenger_profile', { p_username: USERNAME, p_display_name: DISPLAY_NAME });
  if (rpc.error && !/USERNAME_TAKEN/i.test(rpc.error.message)) throw new Error(`ensure_profile: ${rpc.error.message}`);

  const enrich = await client.from('profiles').update({
    display_name: DISPLAY_NAME,
    custom_status: 'Le nouveau compte propre 🙌',
    presence: 'online',
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
  if (enrich.error) throw new Error(`profile enrich: ${enrich.error.message}`);

  try { await client.from('privacy_settings').insert({ user_id: userId }); } catch { /* already present */ }
  try { await client.from('user_age_profile').insert({ user_id: userId, birth_date: '1988-01-12', age_assurance_level: 'declared' }); } catch { /* already present */ }

  const check = await client.from('profiles').select('id, username, display_name').eq('id', userId).single();
  console.log('KAH_ACCOUNT_READY', JSON.stringify({ userId, email: EMAIL, password: PASSWORD, profile: check.data }));
}

main().catch((error) => { console.error('CREATE_KAH_ACCOUNT_FAILED:', error.message); process.exit(1); });
