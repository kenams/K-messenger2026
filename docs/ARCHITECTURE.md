# K-ssenger — Architecture cible

## Principe
K-ssenger est une messagerie sociale mobile où l'identité MSN 2027 reste visible, mais où la sécurité, la fiabilité et la confidentialité sont modernes.

## Monorepo cible

```text
apps/
  mobile/              React Native + Expo Dev Build
  server/              Node.js + TypeScript + Socket.IO
packages/
  contracts/           DTO réseau partagés, ciphertext-only pour messages privés
  config/              configuration non secrète partagée
  ui/                   design tokens/composants partageables si utile
docs/
  PRODUCT_VISION.md
  UX_SPEC.md
  KMAP_SPEC.md
  SECURITY_MODEL.md
  ACCEPTANCE_TESTS.md
  PROJECT_STATE.md
supabase/
  migrations/
```

Le code local existant d'Agent-Kah doit être importé plutôt que réécrit. Les historiques Git locaux peuvent être conservés via branches/imports avant fusion.

## Mobile

Domaines : auth, onboarding, profiles, contacts, presence, conversations, messages, crypto, realtime, notifications, media, calls, kmap, moments, communities, moderation, settings, storage.

Secrets cryptographiques : Keychain/Keystore uniquement. AsyncStorage ne contient jamais de clé privée, recovery key ou secret de session E2EE.

## Backend

Domaines : auth, users, devices, contacts, blocks, presence, conversations, messages, realtime, notifications, attachments, calls, location-sharing, moderation, security, jobs.

Le serveur connaît l'identité authentifiée, les autorisations et les métadonnées nécessaires au service. Il ne reçoit jamais le plaintext des messages E2EE.

## Supabase

Tables principales : profiles, devices, contacts, contact_requests, blocks, conversations, conversation_members, messages, message_recipients, attachments, push_tokens, privacy_settings, user_settings, reports, moderation_actions.

K-MAP ajoute : location_shares, meetup_sessions, meetup_members. Les positions temps réel doivent être éphémères autant que possible. Pas d'historique de déplacement par défaut.

## Realtime

Chaque socket est authentifié. Le userId provient du JWT vérifié, jamais d'un payload client. Chaque action vérifie membership, device ownership, blocage et politique de confidentialité.

## Environnements

local / development / staging / production séparés. HTTPS/WSS uniquement hors local. Aucun secret dans EXPO_PUBLIC_*.

## Ordre d'intégration

1. Import code Agent-Kah
2. Auth/AuthZ/RLS
3. Contacts + présence
4. E2EE 1:1 reconnu/auditable
5. Chat fiable/offline
6. Wizz
7. Push
8. Pièces jointes E2EE
9. K-MAP sécurisé
10. Groupes/appels
11. Moments/Communautés
12. Store hardening/release
