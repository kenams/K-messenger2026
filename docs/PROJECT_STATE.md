Branch: feature/e2ee-migration
Last commit: bb24d50

DONE
- Audit legacy (docs/AUDIT.md)
- libsodium primitives (src/crypto/CryptoProvider.js)
- DeviceIdentity (src/devices/DeviceIdentity.js)
- SecureKeyStore (src/storage/SecureKeyStore.js)
- legacyAes isolated (src/crypto/legacyAes.js), App.js unchanged behavior
- 14 crypto tests green (tests/crypto-provider.test.js, `npm test`)

CURRENT
- E2EE session protocol spike (vodozemac vs libsignal native bridge)

DECISIONS
- No libolm/Olm (deprecated 2024 -> vodozemac)
- No hand-rolled Double Ratchet unless spike proves nothing else integrable
- libsodium = primitives only, never the whole protocol
- MSN-first product (see docs/PRODUCT_VISION.md), build order: E2EE -> presence/Wizz -> groups -> calls -> Moments -> communities
- Token economy mode active: short reports (FAIT/TESTS/COMMIT/BLOCAGE/SUIVANT), no re-audits, no re-confirmation of settled decisions

NEXT
- Finish vodozemac/libsignal-native-bridge feasibility writeup (docs/CRYPTO_DECISION.md)
- Backend foundation: Node+TS+Socket.IO server matching docs/AUDIT.md event contract
- Supabase schema: profiles/devices/conversations/messages (ciphertext only) + RLS
- First Alice/Bob encrypted round-trip (once protocol picked)

BLOCKERS
- No Android/iOS native build environment here (no Xcode/Android Studio) -> real compiled POC needs EAS Build (Kenams' Expo account) or Kenams' own machine
