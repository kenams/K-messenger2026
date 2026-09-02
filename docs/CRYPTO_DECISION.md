# K-ssenger — Choix de la bibliothèque E2EE (Phase B.10)

Statut : **EN ATTENTE DE VALIDATION KENAMS** — aucune ligne de crypto de production n'est écrite tant que ce doc n'est pas tranché. C'est la demande explicite de Kenams : contrôler ce choix avant qu'il soit gravé dans l'architecture.

## Rappel de la contrainte
Interdit : primitives cryptographiques (AES/ChaCha20/X25519/Curve25519...) écrites à la main.
Autorisé : implémenter un **protocole publié et éprouvé** (Double Ratchet, X3DH) en assemblant des **primitives auditées** fournies par une bibliothèque reconnue — c'est exactement ainsi que sont construits libsignal, Olm (Matrix) et Proteus (Wire) en interne. Il n'existe pas de "libraire universelle Double Ratchet" prête à l'emploi pour toutes les stacks ; chaque écosystème assemble le protocole sur des primitives auditées.

## Options évaluées

### 1. `signalapp/libsignal` (officiel Signal) — ❌ rejeté
- Cœur en Rust, bindings officiels Java (Android), Swift (iOS), Node (N-API).
- **Aucun binding React Native officiel.** Le README du projet précise lui-même que l'usage hors des clients Signal officiels n'est pas supporté.
- Intégration = écrire et maintenir deux modules natifs (JNI Android + Swift iOS) exposant l'API Rust via une passerelle RN maison, en tenant ça à jour à chaque release Signal. Charge de maintenance disproportionnée pour une seule personne.
- **Verdict : pas raisonnablement intégrable maintenant.** Ré-évaluable si Signal publie un jour des bindings RN officiels.

### 2. `@matrix-org/olm` (Matrix/Element) — ⚠️ candidat sérieux mais risqué
- Implémentation **Double Ratchet complète et auditée** (audit NCC Group), maintenue par Matrix.org, en production dans Element depuis des années.
- Problème : distribuée en **WebAssembly**. **Hermes (le moteur JS de React Native) ne supporte pas WebAssembly nativement.** Les wrappers communautaires (`react-native-olm` et dérivés) sont abandonnés ou très peu maintenus, et reposent sur des contournements fragiles (moteur JSC + polyfill WASM) qui peuvent casser à chaque montée de version Expo/RN.
- Faisable en théorie via un Dev Client + JSC forcé, mais fragilité + dette de maintenance élevées pour un projet solo.
- **Verdict : à garder en tête comme option si le choix n°3 se révèle insuffisant, mais pas le premier choix pour la vitesse de mise en prod.**

### 3. `react-native-libsodium` + Double Ratchet implémenté sur ces primitives — ✅ recommandé
- Bindings natifs (pas de WASM) autour de **libsodium**, la bibliothèque C auditée la plus déployée au monde (utilisée par Signal, WireGuard, Tresorit, etc. pour leurs primitives bas niveau).
- Fournit tout ce qu'il faut comme **primitives auditées** : `crypto_kx`/X25519 (échange de clé), `crypto_aead_xchacha20poly1305` (AEAD authentifié), `crypto_kdf`/`crypto_generichash` (dérivation de clé façon HKDF), `crypto_sign` Ed25519 (signatures d'identité).
- Maintenu activement, compatible Expo via **config plugin + Expo Dev Client / EAS Build** (pas Expo Go — attendu et accepté dans la spec de Kenams).
- On implémente par-dessus le **protocole Double Ratchet + X3DH tel que publié dans les spécifications officielles Signal** (documents publics, pas une invention) : c'est la même démarche que Wire pour Proteus. Le code du protocole sera testé contre les propriétés attendues (forward secrecy, rejet de ciphertext altéré, etc. — cf. `TEST 4/5/6` du cahier des charges).
- **Verdict : candidat retenu par défaut**, sous réserve de validation Kenams — meilleur rapport maintenabilité / niveau de sécurité réel pour une stack Expo/RN aujourd'hui.

### 4. `wireapp/proteus` — ❌ rejeté
- Implémentation Rust indépendante et auditée du protocole Axolotl/Double Ratchet, utilisée par Wire.
- Pas de bindings RN packagés/maintenus publiquement (Wire l'intègre nativement dans ses propres apps Swift/Kotlin, pas distribué pour RN).
- Même problème que libsignal : il faudrait maintenir des bindings natifs maison.

## Recommandation
**Option 3 : `react-native-libsodium`**, avec l'implémentation du protocole Double Ratchet + X3DH-like faite en JS/TS mais strictement à partir des primitives auditées de la lib (pas de primitive inventée), testée avec des tests automatisés démontrant les propriétés de sécurité attendues (§18 du cahier des charges).

Si Kenams préfère qu'on tente d'abord Olm (option 2) malgré le risque WASM/Hermes, on peut faire un spike technique isolé (quelques heures) avant de trancher définitivement — mais ce n'est pas la recommandation par défaut vu la fragilité de la piste RN.

## Prochaine étape (bloquée tant que non validée)
Dès le feu vert de Kenams sur l'option 3 (ou l'alternative choisie) :
1. `npx expo install react-native-libsodium` + config plugin + passage en Expo Dev Client.
2. `CryptoService` : génération identité (Ed25519 + X25519), stockage clé privée via `expo-secure-store`.
3. X3DH-like : établissement de session Alice/Bob sans échange manuel de clé.
4. Double Ratchet : dérivation de clé par message, chiffrement AEAD, déchiffrement, rejet ciphertext altéré.
5. Tests automatisés (Vitest) prouvant les propriétés ci-dessus, exécutés et montrés avec leur output réel.
