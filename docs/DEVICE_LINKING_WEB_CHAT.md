# K-ssenger — chat web via téléphone lié (device linking)

Modèle WhatsApp Web : le **téléphone reste le seul détenteur des clés Signal**.
Le navigateur ne fait aucune crypto Signal ; il passe le texte composé au
téléphone par un **tunnel authentifié X25519 / XSalsa20-Poly1305** (tweetnacl),
le téléphone chiffre (Signal) + `message:send`, et renvoie les messages entrants
déchiffrés par le même tunnel. Le serveur ne relaie que des blobs
`{ciphertext, nonce}` (`link:envelope`) entre les 2 appareils d'un même compte —
aucun plaintext du tunnel ne le traverse.

## Fichiers
| Rôle | Fichier |
|---|---|
| Primitives tunnel (pur JS) | `apps/mobile/src/lib/deviceLink.ts` |
| État client (web + téléphone) | `apps/mobile/src/lib/deviceLinkClient.ts` |
| Helpers contenu chat partagés | `apps/mobile/src/lib/chatContent.ts` |
| Écran appairage (web) | `apps/mobile/src/features/devicelink/WebLinkScreen.tsx` |
| Écran appareils liés (téléphone) | `apps/mobile/src/features/devicelink/LinkedDevicesScreen.tsx` |
| Conversation web relayée | `apps/mobile/src/features/devicelink/WebRelayConversationScreen.tsx` |
| Serveur (déjà en place, branche) | `apps/server/src/deviceLinkSocket.ts` + `deviceLinkStore.ts` |
| Table | `neon/migrations/0020_device_links.sql` (appliquée en prod) |

## Flux
1. Web : « Lier mon téléphone » → `link:init(webPublicKey)` → `linkId` + code 6 chiffres (SHA-512 de linkId, anti-mélange).
2. Téléphone : Moi → Appareils liés → saisir le code → `link:approve(linkId, phonePublicKey)`. Le secret du téléphone va dans SecureStore (`kssenger.phonelink.<linkId>`).
3. Les 2 dérivent `shared = box.before(peerPub, ownSecret)`. Web le garde en `sessionStorage`.
4. Chat : `send:req` / `history:req` / `recv` scellés dans le tunnel via `link:envelope`.

## État (2026-09-08)
- ✅ Code écrit, typecheck vert, crypto tunnel vérifiée (agreement, roundtrip, rejet tamper + mauvaise clé, code déterministe).
- ✅ UI web (appairage) rendue et testée en local.
- ⛔ **Ne fonctionne pas en prod** : le serveur déployé sur Render tourne encore `main` (`3e5901b`), sans les handlers `link:*`. Il faut **merger `feature/device-linking-scaffold` → `main` puis redéployer le serveur Render**.
- ⛔ Bout-en-bout (web tape → téléphone relaie → contact reçoit) : à prouver sur **un Android physique** qui fait tourner le pont relais (`useDeviceLinkRelay`).

## MVP / limites
- Texte 1:1 uniquement. Groupes + médias = plus tard.
- Le téléphone doit être en ligne (app ouverte) pour que le web envoie/reçoive.
- Seul l'appareil qui a approuvé peut relayer (il détient le secret).
