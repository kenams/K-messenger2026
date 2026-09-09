# K-ssenger — « musique en cours » automatique

Le profil affiche ce que tu écoutes, sans le taper. Deux sources, toutes deux
**lecture seule et pilotées par le client** (le serveur ne stocke aucun jeton
musique) :

| Source | Couvre | Jeton stocké |
|---|---|---|
| **Spotify** | Spotify (compte gratuit OK en lecture) | refresh token → stockage sécurisé de l'appareil |
| **Last.fm** | Deezer, Apple Music, YouTube Music, Spotify… via le scrobble | juste le pseudo Last.fm |

`apps/mobile/src/lib/musicNowPlaying.ts` fait l'auth + les appels API.
`apps/mobile/src/features/profile/useNowPlayingSync.ts` sonde toutes les 45 s
tant que l'app est ouverte et écrit `profiles.now_playing_title/artist`.
L'UI est la carte « Synchro automatique » dans **Modifier mon profil**.

Les deux fonctionnalités **se cachent** si leur variable d'env est absente.

## 1. Spotify — 5 min, une seule fois

1. https://developer.spotify.com/dashboard → **Create app**
   - App name : `K-ssenger` · Redirect URI : **`https://k-ssenger.expo.app/`**
   - APIs : cocher **Web API**
2. Copier le **Client ID** (pas besoin du secret : PKCE).
3. Le passer au build web :

```bash
EXPO_PUBLIC_SPOTIFY_CLIENT_ID='xxxxxxxx' \
  # (+ les autres EXPO_PUBLIC_* du redéploiement)
```

Pour l'APK : ajouter `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` dans `eas.json` (env des
profils `preview` / `production`) et une redirect URI native
(`kssenger://spotify-callback`) — l'auth native n'est pas encore branchée
(web only pour l'instant).

## 2. Last.fm — 2 min, une seule fois

1. https://www.last.fm/api/account/create → obtenir une **API key** (instantané).
2. La passer au build :

```bash
EXPO_PUBLIC_LASTFM_API_KEY='xxxxxxxx'
```

## Redéploiement web complet

```bash
cd apps/mobile
EXPO_PUBLIC_NEON_AUTH_URL='https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth' \
EXPO_PUBLIC_NEON_DATA_API_URL='https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1' \
EXPO_PUBLIC_KSSENGER_SOCKET_URL='https://kssenger-server.onrender.com' \
EXPO_PUBLIC_SPOTIFY_CLIENT_ID='<client id spotify>' \
EXPO_PUBLIC_LASTFM_API_KEY='<api key last.fm>' \
  npx expo export --platform web
npx eas deploy --prod --alias kssenger
```
