// Expo default Metro config + Node core shims.
//
// tweetnacl (device-linking tunnel crypto) contains an unconditional
// `require('crypto')` in its PRNG bootstrap. On Hermes/Android that specifier
// does not resolve, Metro emits a stub that throws "Requiring unknown module",
// and because tweetnacl is imported from App.tsx that throw happens at launch
// and closes the app instantly (web is unaffected: it takes the
// `self.crypto.getRandomValues` branch). Aliasing the Node core modules tweetnacl
// and tweetnacl-util may touch to an empty module makes the import safe; the real
// CSPRNG is wired via `nacl.setPRNG(expo-crypto)` in src/lib/deviceLink.ts.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const emptyModule = require.resolve('./shim/empty-module.js');
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: emptyModule,
  stream: emptyModule,
  buffer: emptyModule,
  vm: emptyModule,
};

// global.crypto / TextEncoder / TextDecoder polyfill (see shim/crypto-polyfill.js
// for the full story). This MUST run as a Metro polyfill, not a normal import
// at the top of src/index.tsx: Expo/RN's bundler always requires
// InitializeCore and Expo's "winter" runtime before the app's own entry
// module, no matter how early in that entry file the code appears — verified
// against a real crash log where the entry module (index.tsx) never executed
// a single line before the crash. Polyfills are the one thing guaranteed to
// run before all of that.
const defaultGetPolyfills = config.serializer.getPolyfills
  ? config.serializer.getPolyfills.bind(config.serializer)
  : () => [];
config.serializer.getPolyfills = (...args) => [
  require.resolve('./shim/crypto-polyfill.js'),
  ...defaultGetPolyfills(...args),
];

module.exports = config;
