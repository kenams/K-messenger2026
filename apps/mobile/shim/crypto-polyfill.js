// Metro polyfill — bundled and executed BEFORE react-native's own
// InitializeCore and Expo's "winter" runtime, which is the earliest possible
// point in the bundle (module 0's own index.tsx runs LAST among the bundle's
// entry-level requires, after those two, so a fix placed there never runs in
// time — confirmed against a real crash log: the crash-causing module was
// required before index.tsx ever got a chance to execute a single line).
//
// jose and @better-auth/utils (both used by our auth client) assume a global
// WebCrypto `crypto` and global `TextEncoder`/`TextDecoder` exist — true in
// browsers/Node 19+, but Hermes/React Native has neither. Several of their
// files construct these at MODULE SCOPE (e.g. jose's
// `export const encoder = new TextEncoder()`), which throws the instant
// they're required — closing the app on launch, before anything renders,
// with no on-screen error ("ReferenceError: Property 'crypto' doesn't exist").
/* eslint-disable no-var */
var g = typeof global !== 'undefined' ? global : globalThis;

if (typeof g.crypto !== 'object') g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = function (arr) {
    var secure = null;
    try {
      // Deferred require — safe here too, but kept lazy since expo-crypto's
      // own native module may not be linked yet this early in some builds.
      secure = require('expo-crypto').getRandomBytes(arr.length);
    } catch (e) {
      secure = null;
    }
    for (var i = 0; i < arr.length; i++) {
      arr[i] = secure ? secure[i] : Math.floor(Math.random() * 256);
    }
    return arr;
  };
}
// Not a real WebCrypto SubtleCrypto implementation — just enough that a
// top-level `crypto.subtle` PROPERTY ACCESS doesn't throw. Any code that
// actually CALLS crypto.subtle.importKey/sign/etc. (deferred, real usage —
// e.g. actual JWT signing) will still fail; that's a real follow-up if our
// auth flow ever needs it, not something fixable with a stub.
if (typeof g.crypto.subtle !== 'object') g.crypto.subtle = {};
if (typeof g.crypto.randomUUID !== 'function') {
  g.crypto.randomUUID = function () {
    var bytes = g.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = [];
    for (var i = 0; i < 16; i++) hex.push((bytes[i] + 0x100).toString(16).slice(1));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
  };
}

// Manual UTF-8 codecs — no dependency on the deprecated escape()/unescape()
// globals, which may be just as absent as TextEncoder itself on this runtime.
if (typeof g.TextEncoder !== 'function') {
  g.TextEncoder = function TextEncoder() {};
  g.TextEncoder.prototype.encode = function (input) {
    input = input || '';
    var bytes = [];
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
  g.TextDecoder = function TextDecoder() {};
  g.TextDecoder.prototype.decode = function (input) {
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
