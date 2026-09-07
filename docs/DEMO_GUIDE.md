# K-ssenger — Guide de démo

## Installer l'app

### Android (prêt, téléchargeable)
APK direct :
`https://expo.dev/artifacts/eas/RAHGmMYB2GZTq9wdeMHQmLcn8SPkicTmD3ZqKYrekzk.apk`

Ouvre le lien sur le téléphone → télécharge → autorise « sources inconnues » →
installe. Fonctionne sur 2 appareils Android en parallèle pour la démo du chat.

### iPhone
**Pas possible sans compte Apple Developer (99 $/an).** Options :
- Le build simulateur `8db496c1` tourne uniquement dans Xcode/Simulator sur un Mac.
- Pour un vrai iPhone : créer le compte Apple Developer, puis build TestFlight.

## Comptes de démo (déjà peuplés — `node scripts/demo-seed-runner.mjs`)

| Nom | E-mail | Mot de passe |
|-----|--------|--------------|
| Alice Nguyen | `demo.alice@kah-digital.ch` | `KahDemo2026!` |
| Bob Traoré | `demo.bob@kah-digital.ch` | `KahDemo2026!` |
| Cara Silva | `demo.cara@kah-digital.ch` | `KahDemo2026!` |

Déjà en place à la connexion :
- Les 3 sont **contacts** entre eux (buddy list remplie, statuts + musique « now playing »).
- Groupe **« KAH Digital — Démo »** (Alice propriétaire, Bob + Cara membres).
- Un **K-Pulse** (wizz) reçu par Alice.
- Un **Moment** texte publié par Alice.

Re-seeder à tout moment (idempotent) :
```bash
KSSENGER_AUTH_URL='https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth' \
KSSENGER_DATA_API_URL='https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1' \
KSSENGER_SOCKET_URL='https://kssenger-server.onrender.com' \
node scripts/demo-seed-runner.mjs
```

## Déroulé de démo suggéré (2 téléphones Android)

Tél 1 = **Alice**, Tél 2 = **Bob**.

1. **Connexion** — les deux se connectent, la buddy list apparaît déjà remplie
   (présence en couleur, pastille qui pulse, morceau en cours sous chaque nom).
2. **Chat direct E2EE** — Alice ouvre Bob, envoie « salut 👋 ». Ça arrive en direct
   sur le tél 2. Accusés ✓ / ✓✓ Lu. Chiffrement Signal natif Android bout en bout.
3. **Photo** — Alice envoie une photo dans le chat ; média privé signé.
4. **Wizz / K-Pulse** — Bob envoie un K-Pulse → l'écran d'Alice tremble (nudge MSN).
5. **Groupe** — ouvrir « KAH Digital — Démo », envoyer un message ; Bob le voit.
   Montrer les rôles (Alice peut promouvoir/mute/ban Cara).
6. **Moments** — onglet Moments : le post d'Alice, 24 h, visibilité amis.
7. **K-Feed** — onglet K-Feed (age gate 13+), publier un K-Clip vidéo.
8. **K-Map** — onglet K-Map : « Partager ma position · 30 min » vers Bob, précision
   approximative, puis Ghost Mode pour tout révoquer. Pas de tracking en fond.
9. **Profil / Moi** — changer le statut, la musique, l'avatar ; confidentialité
   (qui voit ma présence / ma musique / peut me wizzer) ; export de compte.

## Backend

Serveur Render (`kssenger-server.onrender.com`) : plan gratuit, se met en veille
après ~15 min d'inactivité. **Avant la démo, réveille-le** : ouvre
`https://kssenger-server.onrender.com/health` dans un navigateur (doit répondre
`200`), ou lance le seed juste avant. Premier login après veille = ~30 s de délai.
