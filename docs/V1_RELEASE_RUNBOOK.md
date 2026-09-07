# K-ssenger V1 — Release runbook

Ce document liste ce qui reste **strictement** à faire pour livrer la V1 `1.0.0`,
avec les commandes exactes. Tout ce qui n'est pas ici est déjà vert
(voir `PROJECT_STATE.md`, `npm run typecheck`, `npm run test:server`,
`npm run release:check-static`).

Dernière révision : 2026-09-07.

---

## Statut par gate

| # | Gate | État | Qui |
|---|------|------|-----|
| 1 | Migrations live `0019` + `0020` sur Neon prod | ⏳ à appliquer | credential DB requis |
| 2 | Preuve Signal 2 téléphones Android physiques via serveur prod | ⏳ | 2 appareils physiques |
| 3 | Validation Android physique (avatar/chat/K-Feed/Moments média, push, K-MAP GPS) | ⏳ | 1 appareil physique |
| 4 | Smoke Alice/Bob/Charlie physique complet | ⏳ | 2-3 appareils |
| 5 | Parité native iOS LibSignalClient + re-validation média/push/K-MAP iOS | ⏳ gros chantier natif Swift | dev natif iOS |
| 6 | Builds signés store Android + iOS | ⏳ | comptes Play Console / Apple Dev |

Aucune de ces 6 gates n'est franchissable depuis l'agent seul : elles
exigent un accès DB prod, des téléphones physiques, ou des comptes store.

---

## Gate 1 — Migrations live (le seul point "infra" pur)

Deux migrations non appliquées en prod : `neon/migrations/0019_account_delete_fk_semantics.sql`
et `neon/migrations/0020_device_links.sql`.

`0019` change 3 clés étrangères vers `neon_auth."user"` :
- `conversations.created_by` → `ON DELETE SET NULL` (+ colonne rendue nullable)
- `messages.sender_user_id` → `ON DELETE CASCADE` ⚠️ (supprimer un compte supprime **ses** messages chiffrés)
- `group_bans.banned_by` → `ON DELETE SET NULL` (+ nullable)

`0020` crée `public.device_links` (RLS + FORCE RLS + policies) pour le pairing web/mobile.
Le scaffold serveur (`deviceLinkStore.ts` / `deviceLinkSocket.ts`) est déjà déployé et attend cette table.

### Appliquer

```bash
# DB_URL = connection string de la branche main du projet Neon late-flower-65059830 (db kssenger)
export DB_URL='postgres://…'

psql "$DB_URL" -v ON_ERROR_STOP=1 -f neon/migrations/0019_account_delete_fk_semantics.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f neon/migrations/0020_device_links.sql
```

### Vérifier

```bash
export DB_URL='postgres://…'
export KSSENGER_PROJECT_ID='late-flower-65059830'
npm run release:check-neon-live          # doit passer au vert après 0019
node scripts/neon-account-delete-fk-integration-test.mjs
```

---

## Gate 2 & 3 & 4 — Preuves appareils physiques

APK preview installable : produite par
`cd apps/mobile && npx eas build --platform android --profile preview --non-interactive`.

Suivre `docs/ACCEPTANCE_TESTS.md` avec 2 (idéalement 3) téléphones Android réels,
serveur prod `kssenger-server.onrender.com` :

- **Signal 2 devices** : Alice (A1) ↔ Bob (B1) : découverte, claim de prekey, 1er
  `PreKeySignalMessage`, réponse `SignalMessage`, continuité Double Ratchet,
  révocation d'appareil, reconnexion + resync historique. Zéro fallback plaintext.
- **Média / push / K-MAP** : avatar, photo/vidéo de chat, K-Clip, Moment photo/vidéo,
  notif push reçue app fermée, permission GPS foreground + Ghost Mode.
- **Smoke complet** : contacts, présence, K-Pulse, chat direct, offline/reconnect,
  accusés, groupes (rôles/mute/ban), média, push, K-Feed (age gate), Moments, K-MAP,
  block/export/delete de compte (avec échec de re-login après suppression).

Consigner les résultats dans `docs/PROJECT_STATE.md` (section "Remote V1 Smoke").

---

## Gate 5 — iOS E2EE natif

Aujourd'hui iOS est **fail-closed volontaire** : le projet natif se génère mais il
n'y a pas de bridge LibSignalClient vérifié. Livrer iOS = implémenter le module natif
Swift (Session/Identity/PreKey/SignedPreKey/KyberPreKey stores derrière Keychain),
prouver PQXDH + ratchet sur device iOS physique, puis rejouer la validation média/push/K-MAP iOS.

**Décision produit possible : livrer V1 Android-only**, iOS en V1.1. Dans ce cas,
ne pas soumettre l'app iOS et retirer la cible du périmètre de release.

---

## Gate 6 — Builds signés store

- **Android** : `eas build --platform android --profile production` avec le keystore de
  release (EAS gère le keystore distant ; s'assurer que le compte Play Console existe et
  que `com.kahdigital.kssenger` y est réservé).
- **iOS** (si Gate 5 faite) : `eas build --platform ios --profile production` + provisioning
  Apple Developer. Avant soumission App Store : renseigner
  `ios.infoPlist.ITSAppUsesNonExemptEncryption` dans `apps/mobile/app.json`
  (K-ssenger utilise du chiffrement non exempté → `true` + fournir la
  documentation de conformité export, ou statuer sur l'exemption avec un
  juriste). EAS le signale à chaque build iOS tant que ce n'est pas fait.

## Artefacts produits le 2026-09-07

- APK preview (design system complet) : `https://expo.dev/artifacts/eas/RAHGmMYB2GZTq9wdeMHQmLcn8SPkicTmD3ZqKYrekzk.apk` (build `bd62d3dc`)
- AAB production Android : `https://expo.dev/artifacts/eas/DQqbh72QVRAuLya5vx3daI4hvAC_5ZdmizMF54aQsFo.aab` (build `3ad98648`, versionCode auto-bumpé à 2 pendant ce build — `app.json` remis à 1 dans le repo, à bumper volontairement lors de la vraie soumission)
- Build iOS **simulateur** (Xcode/Mac uniquement, pas iPhone) : `https://expo.dev/accounts/kenams/projects/k-ssenger/builds/8db496c1-80b1-42b8-810b-9b4930ee946f`

⚠️ Aucun build iOS installable sur iPhone n'est possible sans compte Apple
Developer (99 $/an) + TestFlight ou provisioning ad-hoc.

---

## Ordre recommandé

1. Gate 1 (5 min, dès que `DB_URL` dispo)
2. Gate 2-4 sur l'APK preview courante (1 session de test avec les téléphones)
3. Décider Android-only vs attendre iOS (Gate 5)
4. Gate 6 quand les comptes store sont prêts
