import crypto from 'node:crypto';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
if (!AUTH_URL) throw new Error('KSSENGER_AUTH_URL is required');

const origin = new URL(AUTH_URL).origin;
const stamp = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const email = `kssenger-self-delete-${stamp}@example.com`;
const password = `Kss!${crypto.randomBytes(20).toString('base64url')}`;

function cookieHeader(response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookies = raw
    .flatMap((value) => String(value).split(/,(?=[^;,]+=)/g))
    .map((value) => value.split(';', 1)[0]?.trim())
    .filter(Boolean);
  if (!cookies.length) throw new Error('SELF_DELETE_SESSION_COOKIE_MISSING');
  return cookies.join('; ');
}

async function post(path, body, cookie) {
  return fetch(`${AUTH_URL}/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
}

const signup = await post('sign-up/email', {
  email,
  password,
  name: 'K-ssenger Self Delete Probe',
  callbackURL: AUTH_URL,
});
if (!signup.ok) throw new Error(`SELF_DELETE_SIGNUP_FAILED:${signup.status}:${await signup.text()}`);
const signupBody = await signup.json();
const userId = signupBody?.user?.id;
if (!userId) throw new Error('SELF_DELETE_USER_ID_MISSING');
const cookie = cookieHeader(signup);
console.log(`SELF_DELETE_PROBE_USER=${userId}`);

const deleted = await post('delete-user', { password }, cookie);
if (!deleted.ok) throw new Error(`SELF_DELETE_FAILED:${deleted.status}:${await deleted.text()}`);

const signinAfterDelete = await post('sign-in/email', { email, password, callbackURL: AUTH_URL });
if (signinAfterDelete.ok) throw new Error('SELF_DELETE_ACCOUNT_STILL_AUTHENTICATES');

console.log('NEON_AUTH_SELF_DELETE_PASS=true');
