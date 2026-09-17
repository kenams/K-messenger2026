# Android beta.13 — build local

- Source APK : `dccc43bc477b0dd6701b8d2582e2677701dcad63` dans le monorepo officiel.
- Build Android : `3`, version interne `2.0.0-beta.1`.
- Compilation dans `C:\kssenger`, copie avancée en fast-forward depuis le monorepo.
- JBR Android Studio 21 ; truststore `C:\Users\kenam\.gradle\avast-patched-cacerts.jks`.
- Variables publiques exportées depuis `apps/mobile/eas.json`, profil `preview`.
- Commande Gradle : `:app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64 --no-daemon --console=plain`.
- APK : `apps/mobile/dist-android/K-ssenger-latest.apk`, 44 043 676 octets.
- SHA-256 : `6a35d5bb6274e23dd3f340b6e9fab71353b20c91e6ca9361b7c92523b9c41e15`.
- Signature conservée : certificat Android Debug de beta.12, SHA-256
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.

`ship:web` complet réussi, puis confirmation sans déploiement : 92 tests serveur
et 23/23 E2E sans relance. Aucun build cloud payant utilisé.

La première compilation ARM64 seule ne démarrait pas dans l'émulateur x86_64
(bibliothèque native introuvable). L'APK finale inclut les deux architectures.
Son contrôle de démarrage a été interrompu par le quota du contrôle automatique
d'autorisation. Publication directe ensuite demandée par Kenams ; ne pas présenter
cette APK comme validée sur appareil ou comme ayant passé un Fulltest Android.

Release publiée le 17 septembre 2026 : `v2.0.0-beta.13`, marquée `latest`.
Taille et SHA-256 reçus par GitHub vérifiés ; redirection du lien stable vers beta.13 confirmée.
L'envoi avec `gh` restait bloqué ; l'envoi HTTPS avec curl/Schannel a réussi (HTTP 201).
Le QR code encode déjà le lien stable :
`https://github.com/kenams/K-messenger2026/releases/latest/download/K-ssenger-latest.apk`.
Il n'a pas besoin d'être modifié lorsque la release est marquée `latest`.
