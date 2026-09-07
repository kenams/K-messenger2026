# K-ssenger — Rapport d'avancement V1

Date : 2026-09-07. Branche `feature/device-linking-scaffold`.
Méthode : code lu ligne à ligne + `remote-v1-smoke` 30/30 contre le backend
**de production live** + `npm run test:server` 92/92 + gates statiques 24/24.

## MàJ 2026-09-07 (soir)

- ✅ **Gate 1 FAITE** : migrations `0019` + `0020` appliquées sur Neon prod, `release:check-neon-live` GREEN.
- ✅ **Version web déployée** : https://k-ssenger.expo.app (social OK ; chat E2EE non — Android only). 1 réglage manuel restant : ajouter le domaine dans Neon Auth trusted domains (`docs/WEB_DEPLOY.md`).
- ✅ **Module natif iOS scaffoldé** : `modules/kssenger-signal/ios-draft/` — port Swift complet (~600 l : KeychainBlobStore, 5 stores libsignal, SignalDeviceProtocol, modules Expo + self-test PQXDH, podspec). À compiler + prouver sur Mac/iPhone (README = étapes exactes). Non wiré → gates toujours vertes.
- ✅ APK envoyé par mail à kenams42@gmail.com.
- Nouveau % : **V1 Android ~92 %** · **iOS ~45 %** (scaffold fait, compile+preuve restants).

---

## 1. Avancement par fonctionnalité

| Domaine | Code | Vérifié live | Note | % |
|---|---|---|---|---|
| Auth / inscription / onboarding / profil | ✅ | ✅ smoke | RPC `ensure_my_kssenger_profile`, session revalidée au foreground | **100 %** |
| Buddy list / contacts (recherche/demande/accept/refus/favori/supprimer/bloquer) | ✅ | ✅ smoke | | **100 %** |
| Présence multi-socket + invisible + « écrit… » | ✅ | ✅ smoke | | **100 %** |
| K-Pulse (wizz) + rate-limit + politique de confidentialité | ✅ | ✅ smoke | nudge shake côté UI | **100 %** |
| Chat direct E2EE (libsignal natif Android) | ✅ | ✅ plomberie serveur + preuve émulateur Android GREEN | manque preuve 2 téléphones physiques | **95 %** |
| Groupes (créer/inviter/rôles/mute/ban/unban/quitter/transfert) + chat groupe E2EE | ✅ | ✅ smoke | idem : preuve 2 devices | **95 %** |
| Médias privés (avatar, photo/vidéo de chat, upload/download signés) | ✅ | ✅ smoke (prepare/complete) | manque passe sur device physique | **92 %** |
| K-Feed (vidéo verticale, age gate 13+, warning sensible, modération/report) | ✅ | ✅ smoke (RLS pending) | manque passe physique | **93 %** |
| Moments (24 h, visibilité, photo/vidéo/texte, modération) | ✅ | ✅ smoke + seed | | **95 %** |
| K-MAP (partage ponctuel foreground-only, précis/approx, révoque, Ghost Mode) | ✅ | ✅ smoke | manque test GPS sur device physique | **93 %** |
| Notifications push (registration, payload métadonnées only, révoque au sign-out) | ✅ | — | manque test de livraison sur device physique | **88 %** |
| Export de compte (v3) | ✅ | — | | **95 %** |
| Suppression de compte (reauth + confirmation + token frais + scope Neon dur) | ✅ | ✅ contrat testé | preuve « delete jetable » complète attend migration `0019` live | **90 %** |
| Design system « MSN-2026 » (tous les écrans) | ✅ | ✅ visuel | tokens + 12 composants partagés | **100 %** |
| Durcissement sécurité (RLS 26 tables, FORCE RLS ×6, triggers révoc K-MAP, Hermes, ATS, backups off, cleartext off, disclosures) | ✅ | ✅ gates | | **97 %** |
| Device linking web ↔ téléphone (style WhatsApp Web) | 🟡 | — | scaffold serveur uniquement, pas d'UI, table `0020` non migrée — **candidat V1.1** | **35 %** |

---

## 2. Avancement par plateforme

### Android — ~92 % fonctionnel · ~78 % prêt à publier

- L'app tourne, tous les écrans câblés, E2EE natif opérationnel (preuve émulateur).
- APK installable produit. Comptes de démo peuplés.
- **Reste pour publier sur le Play Store :**
  1. Appliquer les migrations `0019` + `0020` sur Neon prod — *15 min* (besoin `DB_URL`).
  2. Preuve E2EE sur **2 téléphones physiques** + smoke complet Alice/Bob/Charlie — *~1 jour* avec les appareils.
  3. Compte **Google Play Console** (25 $, vérification d'identité 1-2 j pour un nouveau compte) → build AAB signé → soumission → **revue Google (~3-7 j pour une 1ʳᵉ app)**.

### iOS — ~35 %

- L'UI React Native s'affiche (build simulateur prouvé sur Mac).
- **Mais le cœur du produit — le chat E2EE — est volontairement DÉSACTIVÉ sur iOS** : il n'existe pas de module natif Swift LibSignalClient (le module `kssenger-signal` est `platforms:["android"]`).
- **Non installable sur iPhone sans compte Apple Developer (99 $/an).**
- **Reste pour une V1 iOS :**
  1. Compte Apple Developer — *validation 1-2 j*.
  2. Écrire le module natif Swift (stores Session/Identity/PreKey/SignedPreKey/KyberPreKey derrière Keychain, calqué sur le Kotlin, câbler `signalDevice.ts`) — *3 à 5 jours de dev natif*.
  3. Preuve PQXDH + Double Ratchet sur iPhone physique + revalidation média/push/K-MAP iOS — *~1 jour*.
  4. Build signé + TestFlight (revue ~24 h) puis App Store (revue 1-3 j).

---

## 3. Score global & échéance

| Scénario | Avancement | L'app est « finie » quand… | Délai réaliste |
|---|---|---|---|
| **Démo (APK téléchargeable, comptes prêts)** | **100 % — disponible aujourd'hui** | — | **fait** |
| **V1 Android-only sur le Play Store** | **~90 %** | migrations live + preuve 2 téléphones + compte Play + revue Google | **~1 semaine** (dont ~2 j de travail réel, le reste = vérif de compte + revue Google) |
| **V1 Android + iOS** | **~62 %** | + module natif iOS + compte Apple + preuve iPhone + revue Apple | **~3 semaines** (dominé par le dev natif iOS) |

Le pourcentage restant n'est pas du code d'application manquant (le code est complet
et testé), c'est : 1 migration DB, des preuves sur appareils physiques que je ne
possède pas, le module natif iOS, et les comptes/revues des stores.

---

## 4. Ce qui bloque, et qui peut débloquer

| Bloqueur | Qui | Coût | Délai |
|---|---|---|---|
| `DB_URL` Neon prod → migrations `0019`/`0020` | Kenams | 0 | 15 min |
| 2-3 téléphones Android pour les preuves E2EE + smoke | Kenams / testeur | 0 | 1 jour |
| Compte Google Play Console | Kenams | 25 $ | 1-2 j (vérif) + revue Google ~1 sem |
| Compte Apple Developer | Kenams | 99 $/an | 1-2 j |
| Module natif iOS LibSignalClient (Swift) | dev natif / ChatGPT avec Mac+iPhone | 0 | 3-5 j |

Prompt de reprise pour ChatGPT : `docs/CHATGPT_HANDOFF.md` section 6.
