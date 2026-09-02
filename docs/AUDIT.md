# K-ssenger — Audit de l'existant (Phase B)

## Stack actuelle
- Expo `~54.0.24`, React Native `0.81.5`, React `19.1.0`
- `socket.io-client@4.8.1` (client seulement — **aucun serveur dans le repo ni ailleurs sur le workspace**)
- `crypto-es@3.1.2` (AES-JS pur, legacy)
- Aucun test, aucun TypeScript, aucun `.env`, aucun backend

## Contrat Socket.IO actuel (côté client, `App.js`)

### Émis par le client
| Event | Payload actuel | Note |
|---|---|---|
| `setNickname` | `{ nickname, status, avatarEmoji }` | connexion initiale |
| `updateStatus` | `status: string` | change de statut |
| `sendMessage` | `{ cipherText, iv }` | AES-CBC legacy |
| `sendNudge` | `null` | wizz global, pas de rate limit |

### Écouté par le client
| Event | Payload attendu | Note |
|---|---|---|
| `connect_error` | `Error` | toast |
| `nicknameOk` | `{ nickname, users[] }` | confirme la connexion |
| `nicknameError` | `string` | pseudo refusé |
| `userList` | `users[]` | liste globale |
| `message` | `{ from, cipherText?, iv?, text?, system?, time, color? }` | reçoit soit un message chiffré, soit un message système en clair |
| `nudge` | `{ from }` | déclenche vibration + shake |

→ Ce contrat sera repris presque tel quel pour le nouveau serveur, mais **`sendMessage`/`message` transporteront un ciphertext E2EE (Double Ratchet) au lieu d'AES-CBC partagé**, et il faudra ajouter `message:ack`/`message:read`, `presence:*`, `typing:*`, `device:*` (cf. spec).

## Crypto legacy (`legacyCrypto`, à retirer après migration)
- `PBKDF2(passphrase, salt="k-ssenger-salt-v1", 100000 iter, SHA256)` → clé AES-256 **identique pour tout le monde qui connaît la passphrase**.
- AES-CBC + PKCS7, IV aléatoire par message (correct pour CBC) mais **pas d'authentification (pas d'AEAD/HMAC)** → un attaquant qui contrôle le serveur peut altérer un ciphertext sans que le client le détecte autrement qu'un déchiffrement "poubelle".
- La clé ne transite jamais sur le réseau (bon point), mais elle est **partagée manuellement hors-bande** entre tous les participants → aucune identité par device, aucune forward secrecy, un seul membre qui fuite la passphrase compromet tout l'historique.
- **Verdict : à remplacer intégralement, pas de réutilisation possible dans l'architecture cible.**

## Config actuelle à supprimer
- `SERVER_URL = "http://192.168.1.100:3000"` en dur dans `App.js` (ligne 20) → à remplacer par variable d'environnement (`app.config.ts` + `expo-constants` / `EXPO_PUBLIC_*`).
- Pas d'`app.json` orienté production (bundle id, permissions, icônes à vérifier séparément en Phase F).

## Dépendances à évaluer (Phase B.10 — voir docs/CRYPTO_DECISION.md)
- `libsignal` (officiel Signal) — pas de bindings React Native.
- `@matrix-org/olm` — Double Ratchet audité, mais WASM (incompatible Hermes en l'état).
- `react-native-libsodium` — primitives auditées, natif, maintenu, compatible Expo Dev Client.

Détail complet et décision → `docs/CRYPTO_DECISION.md`.
