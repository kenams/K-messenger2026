# K-ssenger — Handoff pour ChatGPT (reprise du chantier V1)

Ce fichier = tout ce qu'il faut pour qu'un autre agent (ChatGPT / agent-kah-gpt)
reprenne K-ssenger et pousse la V1 le plus loin possible sans repartir de zéro.

État figé : **2026-09-07**, branche `feature/device-linking-scaffold`.

---

## 1. Contexte projet

- **K-ssenger** = messagerie sociale E2EE, feeling MSN/Windows Live 2005 modernisé
  (« MSN-2026 »), indépendante de Microsoft (aucune marque/son/asset MS).
- Monorepo npm workspaces : `apps/mobile` (Expo SDK 54, RN, Hermes),
  `apps/server` (Node + TS + Socket.IO), `packages/contracts`.
- Repo GitHub : `kenams/K-messenger2026`. Ne jamais force-push `main`.
- Backend **dédié** : projet Neon `late-flower-65059830` (db `kssenger`, PG17,
  `aws-eu-central-1`), Neon Better Auth + Neon Data API. Serveur Render
  `kssenger-server.onrender.com`. **Interdiction absolue de toucher un autre
  projet Neon/Supabase.** Le serveur fail-close si l'URL Auth/JWKS/audience ne
  correspond pas exactement à cette branche Neon.
- E2EE : `org.signal:libsignal-client/-android:0.100.0` (officiel, jamais de
  crypto maison). Module natif `apps/mobile/modules/kssenger-signal` =
  **Android uniquement** (`platforms:["android"]`). iOS E2EE = fail-closed
  volontaire tant que la parité native Swift n'est pas écrite + prouvée.

Docs de référence dans `docs/` :
`PROJECT_STATE.md` (canonique), `V1_RELEASE_RUNBOOK.md`, `ARCHITECTURE.md`,
`SECURITY_MODEL.md`, `ACCEPTANCE_TESTS.md`, `DEVICE_LINKING_PLAN.md`,
`KFEED_SPEC.md`, `KMAP_SPEC.md`, `UX_SPEC.md`.

## 2. Ce qui est FAIT (ne pas refaire)

- Serveur complet : auth JWT socket, membership, blocking (chat/groupe/invite/
  présence/K-Pulse/K-MAP), messages ciphertext-only + idempotence, historique,
  accusés, contacts full lifecycle, présence multi-socket + invisible, K-Pulse
  rate-limité, groupes (create/invite/roles/leave/transfer/mute/ban/unban),
  push metadata-only, account export v3, account delete (reauth + confirmation
  + token Neon frais + scope Neon dur), device-linking scaffold
  (`deviceLinkStore.ts` / `deviceLinkSocket.ts`, wiré dans `server.ts`).
- **92/92 tests serveur** verts (`npm run test:server`).
- Sécurité live Neon : 26 tables en RLS, FORCE RLS sur 6 tables sensibles,
  triggers de révocation K-MAP sur block/contact-removal installés.
- Mobile : tous les écrans câblés (auth, onboarding, contacts/buddy list,
  chat direct E2EE natif Android, groupes E2EE, K-Feed, Moments, K-MAP,
  profil, compte/données, confidentialité, push, age gate).
- **Design system « MSN-2026 » sur 100 % des écrans** (`apps/mobile/src/theme/`
  tokens + components : SkyBackground, PresenceBadge pulse, Equalizer,
  NowPlayingSheet, useNudgeShake, ScreenHeader, Card, Avatar, EmptyState,
  Notice, Field, Segmented, PrimaryButton).
- Durcissement natif : Hermes forcé + gate, K-MAP foreground-only (Android
  bloque `ACCESS_BACKGROUND_LOCATION`, iOS pas d'always-location), backups
  Android off, cleartext interdit, ATS iOS strict, disclosures perm.
  explicites, APK interne avec checksum SHA-256.
- **`npm run release:check-static` = 24/24 PASS.** `npm run typecheck` vert.
- **`remote-v1-smoke` = 30/30 PASS contre le backend prod LIVE** (2026-09-07) :
  auth + Signal prekeys/claims/discovery, contacts, présence, K-Pulse,
  échange ciphertext + accusés + historique, groupes (rôles/mute/ban/unban/
  reinvite/transfert), K-MAP, Moments, K-Feed, enforcement du block, reconnect.
  `KSSENGER_AUTH_URL=… KSSENGER_DATA_API_URL=… KSSENGER_SOCKET_URL=… node scripts/remote-v1-smoke-runner.mjs`
- APK preview V1.0.0 + AAB prod + build iOS simulateur : voir `docs/V1_RELEASE_RUNBOOK.md`.
- **Comptes de démo peuplés** (`node scripts/demo-seed-runner.mjs`, idempotent) —
  3 comptes credentials fixes, contacts mutuels, 1 groupe, K-Pulse, Moment.
  Détails + déroulé : `docs/DEMO_GUIDE.md`.

## 3. Ce qui RESTE — les 6 gates V1 (détail + commandes dans `docs/V1_RELEASE_RUNBOOK.md`)

| # | Gate | Bloqueur |
|---|------|----------|
| 1 | Appliquer `neon/migrations/0019_account_delete_fk_semantics.sql` + `0020_device_links.sql` sur Neon prod | besoin `DB_URL` (secret déploiement) |
| 2 | Preuve Signal 2 téléphones Android physiques via serveur prod | 2 appareils réels (émulateur interdit) |
| 3 | Validation Android physique média/push/K-MAP GPS | 1 appareil réel |
| 4 | Smoke Alice/Bob/Charlie physique complet (`docs/ACCEPTANCE_TESTS.md`) | 2-3 appareils |
| 5 | Parité native iOS LibSignalClient + revalidation iOS | gros module Swift + device iOS |
| 6 | Builds signés store (Android AAB prod + iOS) | comptes Play Console / Apple Developer |

Après gate 1 : `npm run release:check-neon-live` (avec `DB_URL` +
`KSSENGER_PROJECT_ID=late-flower-65059830`) doit passer au vert, puis
`node scripts/neon-account-delete-fk-integration-test.mjs`.

### Décision produit ouverte
**V1 = Android-only maintenant, iOS en V1.1 ?** C'est la voie rapide.
Sinon la V1 attend le module natif iOS (gate 5).

## 4. Commandes utiles

```bash
npm run typecheck                     # workspaces
npm run test:server                   # 92 tests
npm run release:check-static          # 24 checks, doit finir KSSENGER_RELEASE_CANDIDATE_STATIC_GATE_PASS=true
npm run release:check-neon-live       # nécessite DB_URL + KSSENGER_PROJECT_ID

cd apps/mobile
npx eas build -p android --profile preview --non-interactive       # APK test
npx eas build -p android --profile production --non-interactive    # AAB store
npx eas build -p ios --profile preview-ios --non-interactive       # .app simulateur (no creds)
npx eas build -p ios --profile production --non-interactive        # device/TestFlight (Apple creds requis)
```

EAS : compte `kenams` / kenams42@gmail.com, projectId
`990e00eb-6114-45ef-acf5-5d49087aef50`, keystore Android distant géré par EAS.

## 5. Règles non négociables (SECURITY_MODEL.md)

- Jamais affaiblir RLS/autorisation pour débloquer l'UX.
- Jamais logger plaintext / tokens / clés / sessions Signal.
- Jamais inventer de crypto ni annoncer « E2EE production » sans preuve 2 devices physiques.
- Jamais de secret backend/DB dans le bundle mobile.
- K-MAP foreground-only, opt-in explicite, zéro tracking caché.
- Push = métadonnées allow-list only.
- Aucun autre projet Neon/DB modifié.
- iOS reste fail-closed tant que la parité native n'est pas prouvée.
- Garder PR de release en draft tant que les gates DB live + devices physiques
  ne sont pas franchies.

---

## 6. PROMPT À COLLER DANS CHATGPT

> Tu reprends le projet **K-ssenger** (messagerie E2EE, monorepo
> `kenams/K-messenger2026`, branche `feature/device-linking-scaffold`). Lis
> d'abord `docs/CHATGPT_HANDOFF.md`, `docs/PROJECT_STATE.md` et
> `docs/V1_RELEASE_RUNBOOK.md` : l'état complet y est. Ne refais pas ce qui est
> déjà fait (serveur, écrans mobile, design system, durcissement — tout est
> vert : `npm run typecheck`, `npm run test:server` 92/92,
> `npm run release:check-static` 24/24).
>
> **Objectif : finir la V1 `1.0.0`.** Travaille en autonomie totale, ne demande
> une confirmation que pour une action irréversible en prod (migration DB live,
> suppression de données, dépense réelle, soumission store).
>
> Fais, dans l'ordre :
>
> 1. **Migrations Neon prod.** Quand tu as le `DB_URL` du projet Neon
>    `late-flower-65059830` (db `kssenger`), applique
>    `neon/migrations/0019_account_delete_fk_semantics.sql` puis
>    `0020_device_links.sql` via `psql -v ON_ERROR_STOP=1 -f`. Rappel : `0019`
>    met `messages.sender_user_id` en `ON DELETE CASCADE` (voulu). Ensuite
>    `KSSENGER_PROJECT_ID=late-flower-65059830 DB_URL=… npm run
>    release:check-neon-live` (doit passer vert) et
>    `node scripts/neon-account-delete-fk-integration-test.mjs`. Consigne dans
>    `docs/PROJECT_STATE.md`.
>
> 2. **Décision iOS.** Propose et acte : V1 **Android-only** (iOS V1.1) ou V1
>    bi-plateforme. Si Android-only : retire iOS du périmètre de release, garde
>    le build simulateur comme démo, documente-le.
>
> 3. **Builds store.**
>    - Android : `cd apps/mobile && npx eas build -p android --profile
>      production --non-interactive` → AAB. Vérifie que la fiche Play Console
>      `com.kahdigital.kssenger` existe ; si oui `eas submit -p android
>      --latest`.
>    - iOS (seulement si V1 bi-plateforme ET parité native iOS faite +
>      prouvée) : `eas build -p ios --profile production` avec les credentials
>      Apple Developer.
>
> 4. **Parité E2EE iOS** (si V1 bi-plateforme). Implémente le module natif
>    Swift dans `apps/mobile/modules/kssenger-signal/ios/` avec
>    `LibSignalClient` (Session/Identity/PreKey/SignedPreKey/KyberPreKey stores
>    derrière Keychain), calque l'API sur `KssengerSignalModule.kt`, passe
>    `platforms` à `["android","ios"]`, prouve PQXDH + Double Ratchet sur un
>    iPhone physique, puis rejoue la validation média/push/K-MAP iOS.
>
> 5. **Preuves appareils physiques** (gates 2-4). Rédige le protocole précis
>    depuis `docs/ACCEPTANCE_TESTS.md` pour un testeur avec 2-3 Android réels
>    (serveur prod), récupère les résultats, consigne-les dans
>    `docs/PROJECT_STATE.md` section « Remote V1 Smoke ».
>
> 6. **Livraison.** Quand gates 1-4 (Android) sont franchies : sors la PR de
>    release du mode draft, tag `v1.0.0`, publie.
>
> Contraintes absolues : jamais affaiblir RLS/auth, jamais logger de secret ni
> de plaintext, jamais de crypto maison, jamais de secret backend dans le
> bundle mobile, jamais toucher un autre projet Neon/Supabase, iOS reste
> fail-closed tant que la parité native n'est pas prouvée. Commit + push à
> chaque étape significative, messages en anglais technique.
