# Dependency audit — 2026-09-03

## apps/server
`npm audit` (isolated workspace): **0 vulnerabilities**.

## Monorepo root (pulls in apps/mobile via Expo)
`npm audit`: 7 moderate, 9 high, 0 critical — **16 total, all transitive from `expo` (SDK 54, direct dep of apps/mobile)**.

| Package | Severity | Direct? | Fix available |
|---|---|---|---|
| expo | high | yes | bump to SDK 57 |
| @expo/cli, @expo/metro, @expo/metro-config, metro, metro-config, metro-transform-worker, image-size, postcss | high | no (transitive, build tooling) | via expo bump |
| @expo/config, @expo/config-plugins, @expo/prebuild-config, expo-asset, expo-constants, uuid, xcode | moderate | no (transitive, build tooling) | via expo bump |

**Impact assessment**: every flagged package is part of the Metro bundler / Expo prebuild / native-config toolchain — build-time and local-dev tooling (bundling, asset processing, native project generation). None of them run in the shipped app's runtime message/crypto/network path. Real-world exploitability here means "a malicious file triggers a bundler bug on a developer's machine during `expo start`/build", not "an attacker reaches this over the network in production."

**Fix available = SDK 54 -> 57, a major Expo SDK jump (54/55/56/57), not a patch.** `apps/mobile` and the Android native project were just deliberately pinned to SDK 54 (commit `3d349d9`, "align React Native with Expo SDK 54"). Bumping 3 major SDKs would require a full React Native version bump + native project re-alignment + a fresh Android/iOS smoke build — exactly the kind of change `npm audit fix --force` should never be run for blindly.

**Decision: do not upgrade now.** Accepted risk, tracked here, revisit as a dedicated "bump to Expo SDK 5x" task with its own native rebuild/test pass — not bundled into security-fix or feature commits. Re-run `npm audit` after any future Expo SDK bump to confirm these clear.
