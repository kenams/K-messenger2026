// The Metro `serializer.getPolyfills` mechanism (see git history: it used to
// live at shim/crypto-polyfill.js, wired in metro.config.js) turned out not
// to run at all for this project's release/export:embed bundling path — the
// polyfill source ends up IN the bundle (confirmed by grepping the built
// .bundle) but never executes before jose/@better-auth/utils hit
// module-scope `new TextEncoder()` / `crypto.getRandomValues`, crashing the
// app instantly on launch with "ReferenceError: Property 'crypto' doesn't
// exist" before anything renders. Root-caused against a real device +
// emulator logcat; not yet root-caused *why* Metro drops it for this build
// path specifically, but reproduced 100% reliably across multiple clean
// rebuilds, so the fix moved here instead of chasing the Metro mechanism
// further under time pressure.
//
// Fix: a static `import { Root } from './Root'` gets hoisted by Babel to
// run before any other statement in this file — same problem as the old
// polyfill, one level up. Using `require('./Root')` instead is a plain
// statement, not hoisted, so it only runs (and only then pulls in Root ->
// useAuthSession -> backend.ts -> jose) after the polyfills below have
// already run.
import { registerRootComponent } from 'expo';

/* eslint-disable no-var */
var g: any = typeof global !== 'undefined' ? global : globalThis;

if (typeof g.crypto !== 'object') g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = function (arr: Uint8Array) {
    // No Math.random() fallback: this backs PKCE verifiers and other
    // security-sensitive randomness. Fail loud rather than silently weaken it.
    var native = g.expo && g.expo.modules && g.expo.modules.ExpoCrypto;
    if (!native) throw new Error('crypto.getRandomValues: ExpoCrypto native module unavailable');
    if (typeof native.getRandomValues === 'function') {
      native.getRandomValues(arr);
      return arr;
    }
    if (typeof native.getRandomBase64String === 'function') {
      var binary = g.atob ? g.atob(native.getRandomBase64String(arr.length)) : null;
      if (!binary) throw new Error('crypto.getRandomValues: no base64 decoder available to finish decoding native output');
      for (var i = 0; i < arr.length; i++) arr[i] = binary.charCodeAt(i);
      return arr;
    }
    throw new Error('crypto.getRandomValues: ExpoCrypto native module exposes neither getRandomValues nor getRandomBase64String');
  };
}
// Not a real WebCrypto SubtleCrypto implementation — just enough that a
// top-level `crypto.subtle` property access doesn't throw.
if (typeof g.crypto.subtle !== 'object') g.crypto.subtle = {};
if (typeof g.crypto.randomUUID !== 'function') {
  g.crypto.randomUUID = function () {
    var bytes = g.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex: string[] = [];
    for (var i = 0; i < 16; i++) hex.push((bytes[i] + 0x100).toString(16).slice(1));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
  };
}
if (typeof g.TextEncoder !== 'function') {
  g.TextEncoder = function TextEncoder() {} as any;
  g.TextEncoder.prototype.encode = function (input: string) {
    input = input || '';
    var bytes: number[] = [];
    for (var i = 0; i < input.length; i++) {
      var code = input.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
        var low = input.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
          i++;
        }
      }
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return Uint8Array.from(bytes);
  };
}
if (typeof g.TextDecoder !== 'function') {
  g.TextDecoder = function TextDecoder() {} as any;
  g.TextDecoder.prototype.decode = function (input: any) {
    if (!input) return '';
    var bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input);
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b0 = bytes[i];
      var code, len;
      if (b0 < 0x80) { code = b0; len = 1; }
      else if ((b0 & 0xe0) === 0xc0) { code = b0 & 0x1f; len = 2; }
      else if ((b0 & 0xf0) === 0xe0) { code = b0 & 0x0f; len = 3; }
      else { code = b0 & 0x07; len = 4; }
      for (var k = 1; k < len && i + k < bytes.length; k++) code = (code << 6) | (bytes[i + k] & 0x3f);
      i += len;
      if (code > 0xffff) {
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      } else {
        out += String.fromCharCode(code);
      }
    }
    return out;
  };
}

// @neondatabase/auth's adapter builds responses via the WHATWG static helper
// `Response.json(data, init)` — present in browsers/Node 18+, absent from
// React Native's fetch/Response polyfill. Safe to patch here (unlike the
// crypto polyfill above): RN's own fetch polyfill (loaded by InitializeCore,
// before this entry module runs) already defines global Response.
if (typeof Response === 'function' && typeof Response.json !== 'function') {
  Response.json = (data: unknown, init?: ResponseInit) => {
    const headers = { 'content-type': 'application/json', ...(init?.headers as Record<string, string> | undefined) };
    return new Response(JSON.stringify(data), { ...init, headers });
  };
}

// Last-resort visibility: if something throws outside React's render tree
// (an async task, a bad import), surface it instead of a silent white screen.
const globalErrorUtils = (globalThis as { ErrorUtils?: { getGlobalHandler?: () => (e: unknown, f: boolean) => void; setGlobalHandler?: (h: (e: unknown, f: boolean) => void) => void } }).ErrorUtils;
if (globalErrorUtils?.setGlobalHandler) {
  const previous = globalErrorUtils.getGlobalHandler?.();
  globalErrorUtils.setGlobalHandler((error, isFatal) => {
    // eslint-disable-next-line no-console
    console.error('[K-ssenger] uncaught', isFatal ? '(fatal)' : '', error);
    previous?.(error, isFatal);
  });
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Root } = require('./Root');
registerRootComponent(Root);
