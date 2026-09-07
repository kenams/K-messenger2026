# kssenger-signal — iOS module (scaffold)

Port of the Android native Signal Protocol module to iOS, using the official
`LibSignalClient` Swift package. **Not yet wired** — `expo-module.config.json`
still says `"platforms": ["android"]` on purpose so builds and the static
release gate stay green until this is compiled and proven on a physical iPhone.

## Files

| File | Mirrors (Android) |
|---|---|
| `KeychainBlobStore.swift` | `KeystoreBlobStore.kt` — encrypted-at-rest blob store (Keychain instead of Android Keystore) |
| `SignalStores.swift` | `Signal{Identity,Session,PreKey,SignedPreKey,KyberPreKey}Store.kt` |
| `SignalDeviceProtocol.swift` | `SignalDeviceProtocol.kt` — provision / processRemoteBundle / hasSession / encrypt / decrypt |
| `KssengerSignalModule.swift` | `KssengerSignalModule.kt` — bridge `KssengerSignalBridge`, incl. `getStatus` PQXDH self-test |
| `KssengerLocalMessageModule.swift` | `KssengerLocalMessageModule.kt` — bridge `KssengerLocalMessageBridge` |
| `KssengerSignal.podspec` | `build.gradle` |

The JS surface (method names, args, return shapes, base64 encoding, wire JSON)
is identical to Android — see `apps/mobile/src/lib/signalDevice.ts`.

> Lives at `ios-draft/` (not `ios/`) so the static release gate check
> "no unvalidated iOS Signal bridge is shipped" stays green. Rename the folder
> to `ios/` as part of step 2 below, and update that gate check in
> `scripts/release-candidate-static-gate.mjs` once the device proof passes.

## Steps to finish (needs a Mac + Xcode + a physical iPhone)

1. **Verify the `LibSignalClient` Swift API** against the pinned version. This
   code was written without a toolchain; expect small signature fixes:
   - store protocol method names / `context:` params (`IdentityKeyStore`,
     `SessionStore`, `PreKeyStore`, `SignedPreKeyStore`, `KyberPreKeyStore`)
   - free functions: `processPreKeyBundle`, `signalEncrypt`,
     `signalDecrypt`, `signalDecryptPreKey`
   - `PreKeyBundle` / `SignedPreKeyRecord` / `KyberPreKeyRecord` / `PreKeyRecord`
     initializers, `KEMKeyPair.generate()` key type
   - `CiphertextMessage.messageType` cases (`.preKey`, `.whisper`)
   - Confirm the correct pod name/version (`LibSignalClient` on CocoaPods).
2. **Wire it**: set `expo-module.config.json` to
   `"platforms": ["android", "ios"]` with
   `"ios": { "modules": ["KssengerSignalModule", "KssengerLocalMessageModule"] }`.
3. **Open the JS guard**: in `apps/mobile/src/lib/signalDevice.ts`, change
   `if (Platform.OS !== 'android' || !bridge)` to
   `if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !bridge)`.
   (`e2ee.ts` already allows iOS; the composer stays locked until
   `getStatus().selfTestPassed` is true, so this is safe.)
4. **Prove on device**: `npx eas build -p ios --profile development`, install on
   an iPhone, confirm `getKssengerE2eeStatus().available === true`, then run a
   real 2-device exchange (iPhone ↔ Android) through the production server:
   discovery, prekey claim, first `PreKeySignalMessage`, `SignalMessage` reply,
   ratchet continuity, reconnect.
5. **Re-validate iOS** media / push / K-MAP flows, then update
   `docs/PROJECT_STATE.md` and lift the "iOS deliberately fail-closed" note.

## Security invariants (unchanged)

- No custom cryptography — only `LibSignalClient`.
- Private identity / session bytes never cross the JS bridge.
- Keychain items: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- iOS composer stays fail-closed until step 4 passes on a physical device.
