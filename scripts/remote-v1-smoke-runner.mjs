const authUrl = process.env.KSSENGER_AUTH_URL;
if (!authUrl) throw new Error('KSSENGER_AUTH_URL is required');

const authOrigin = new URL(authUrl).origin;
const nativeFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init = {}) => {
  const target = typeof input === 'string' || input instanceof URL ? String(input) : input?.url ?? '';
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init.headers) {
    const extra = new Headers(init.headers);
    for (const [key, value] of extra.entries()) headers.set(key, value);
  }
  if (target.startsWith(authOrigin) && !headers.has('origin')) headers.set('origin', authOrigin);
  return nativeFetch(input, { ...init, headers });
};

await import('./remote-v1-smoke.mjs');
