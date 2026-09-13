// The global.crypto / TextEncoder / TextDecoder polyfill jose and
// @better-auth/utils need on Hermes/React Native now lives in
// shim/crypto-polyfill.js, wired in as a Metro `serializer.getPolyfills`
// entry (see metro.config.js) instead of an import here. Expo/RN's bundler
// always requires InitializeCore and Expo's "winter" runtime before this
// entry module, no matter how early in this file the code appears — a
// version of this fix placed right here, as literally the first statement,
// never ran in time (verified against a real crash log where this entry
// module hadn't executed a single line before the crash). Polyfills are the
// one thing guaranteed to run before all of that.

import { registerRootComponent } from 'expo';
import { Root } from './Root';

// @neondatabase/auth's adapter builds responses via the WHATWG static helper
// `Response.json(data, init)` (a spec addition, not an instance method) —
// present in browsers and Node 18+, absent from React Native's fetch/Response
// polyfill. Missing it throws "Response.json is not a function" on every
// Data API / auth call on native, closing over the real error and surfacing
// as a generic "erreur réseau" — never caught because prior test passes were
// web-only (browser fetch has this natively). RN's own fetch polyfill (loaded
// by InitializeCore, before this entry module runs) already defines global
// Response, so patching it here — unlike the crypto polyfill above, which
// must run before Response itself exists — is safe.
if (typeof Response === 'function' && typeof Response.json !== 'function') {
  Response.json = (data: unknown, init?: ResponseInit) => {
    const headers = { 'content-type': 'application/json', ...(init?.headers as Record<string, string> | undefined) };
    return new Response(JSON.stringify(data), { ...init, headers });
  };
}

// Last-resort visibility: if something throws outside React's render tree
// (an async task, a bad import), surface it instead of a silent white screen.
// React render errors are still caught by RootErrorBoundary inside <Root/>.
const globalErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: unknown, f: boolean) => void; setGlobalHandler?: (h: (e: unknown, f: boolean) => void) => void } }).ErrorUtils;
if (globalErrorUtils?.setGlobalHandler) {
  const previous = globalErrorUtils.getGlobalHandler?.();
  globalErrorUtils.setGlobalHandler((error, isFatal) => {
    // eslint-disable-next-line no-console
    console.error('[K-ssenger] uncaught', isFatal ? '(fatal)' : '', error);
    previous?.(error, isFatal);
  });
}

registerRootComponent(Root);
