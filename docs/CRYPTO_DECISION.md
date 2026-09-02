# K-ssenger — Choix de la bibliothèque E2EE (Phase B.10 → décision Kenams 02/09)

Statut : **partiellement tranché par Kenams.** `react-native-libsodium` = primitives auxiliaires (random, AEAD, X25519/Ed25519, chiffrement pièces jointes) validé. **Le protocole de session (Double Ratchet/X3DH) N'EST PAS encore autorisé en implémentation maison** — un dernier spike de faisabilité sur une implémentation complète et maintenue est requis avant.

## Décision Kenams (02/09/2026)
> Sécurité > simplicité Expo. On accepte Expo Dev Client, EAS et du natif. On n'accepte pas une crypto « presque Signal ».

1. ❌ Pas de spike Olm/libolm — **libolm est officiellement déprécié depuis 2024** au profit de `vodozemac` (annonce Matrix.org). Confirmé, écarté.
2. ✅ `react-native-libsodium` conservé pour les primitives auxiliaires uniquement (pas pour porter seul tout le protocole de session).
3. 🔍 Spike de faisabilité requis, dans cet ordre :
   - `vodozemac` (Rust, successeur officiel de libolm chez Matrix) — bindings React Native ?
   - Bridge natif Kotlin/Swift autour de `libsignal` officiel (accepter plus de natif si ça évite de coder le ratchet nous-mêmes).
   - Comparatif : maintenance, multi-device, sessions offline, key verification, migration, builds EAS.
4. Si aucune implémentation complète n'est raisonnablement intégrable → implémentation interne autorisée **seulement** avec : module crypto isolé, vecteurs de test officiels Signal, tests de compatibilité, fuzzing, tests out-of-order/replay/skipped-keys, `MAX_SKIP` strict, effacement des anciennes clés, versionnement explicite du protocole, **audit sécurité externe avant toute mise en production publique**. Ne jamais la présenter comme "aussi sûre que Signal" sans audit.

## Recherche — vodozemac (bureau, pas encore de POC compilé)
- Rust, publié par Matrix.org comme remplacement officiel de libolm (annonce août 2024), implémente Olm (Double Ratchet 1:1, équivalent X3DH+DR) et Megolm (groupes). Utilisé en production par le Matrix Rust SDK / clients Element modernes.
- Pas de package npm officiel `react-native-vodozemac`. Les bindings existants ciblent WASM (web, via `@matrix-org/matrix-sdk-crypto-wasm`) ou Node (via le Matrix Rust SDK compilé). **Aucun binding React Native/Hermes officiel identifié à ce jour.**
- Piste réaliste : `vodozemac` étant du Rust pur (contrairement à Olm/WASM), il est **théoriquement bindable en JSI/TurboModule** (Rust → C ABI → Kotlin/Swift → RN), à l'image de ce que fait le Matrix Rust SDK côté mobile natif (utilisé nativement par les apps Element Android/iOS, pas via RN). Ça veut dire : pas de lib RN prête à l'emploi, mais un bridge natif est plus réaliste techniquement qu'avec Olm/WASM.
- ⚠️ Cette section est une évaluation documentaire, **pas un POC compilé**. Un vrai test de faisabilité demande soit (a) un binding JSI expérimental à écrire et compiler pour Android/iOS, soit (b) un projet communautaire existant à auditer — aucun n'a été trouvé packagé et maintenu au moment de cet audit.

## Recherche — bridge natif autour de `libsignal` officiel (bureau, pas encore de POC compilé)
- `libsignal` fournit des bindings **officiels** Java (Android) et Swift (iOS) — donc pas de portage à faire depuis Rust brut comme pour vodozemac, juste un **pont RN classique** (Kotlin/Swift → module natif Expo → JS).
- C'est le chemin le plus proche de "vraie implémentation Signal", avec le coût : maintenir 2 modules natifs (un par plateforme) synchronisés avec les releases `libsignal`, et le README du projet rappelle que l'usage hors clients Signal officiels n'est pas garanti/supporté par l'équipe Signal (pas d'engagement de stabilité d'API pour usage tiers).
- Plus de travail natif que vodozemac à court terme (deux bindings au lieu d'un), mais la lib elle-même est la référence absolue et déjà auditée à grande échelle (c'est littéralement Signal).

## Ce qu'il manque pour trancher définitivement
Un **POC compilé Android + iOS réel** (pas juste de la doc) pour au moins une des deux pistes, incluant :
- build qui compile effectivement (EAS Build ou local si SDK dispo),
- un aller-retour de session chiffré entre deux instances de l'app,
- mesure de la charge de maintenance perçue (taille du bridge natif, surface d'API à maintenir).

**Cet environnement de dev ne dispose pas d'Android Studio/Xcode local** — un POC compilé nécessitera soit un accès EAS Build (cloud, compte Expo requis), soit que Kenams lance le build lui-même avec mon code. Je le signale maintenant plutôt que de prétendre avoir "testé" quelque chose que je n'ai pas réellement compilé.

## Prochaine étape
Pendant que ce spike se prépare, la Phase C non-controversée démarre immédiatement (voir commit suivant) : identité device, `SecureKeyStore`, modèle `devices`, abstractions `CryptoProvider`/`SessionStore` — sans écrire la state machine Double Ratchet, pour ne pas graver un choix non encore validé.
