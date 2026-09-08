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

module.exports = config;
