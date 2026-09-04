const authUrl = process.env.KSSENGER_AUTH_URL;
if (!authUrl) throw new Error('KSSENGER_AUTH_URL is required');

const authOrigin = new URL(authUrl).origin;
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

await import('./remote-v1-smoke.mjs');
