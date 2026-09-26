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

## Ta propre musique à côté de ton pseudo

Déjà en place (pas besoin d'y retoucher) : `ProfileHeader` (bandeau du haut,
mobile + rail desktop) et `MeScreen` (onglet **Moi**) affichent tous les deux
`profile.now_playing_title/artist` — c'est-à-dire **ton propre** morceau,
pas seulement celui des contacts. La synchro est écrite par ton propre
appareil via `useNowPlayingSync`, donc dès qu'une source est connectée, ton
pseudo affiche le morceau en cours, exactement comme pour un contact.

## Contrôles play/pause/suivant/précédent (Spotify uniquement)

Le tiroir « J'écoute en ce moment » (`NowPlayingSheet`, ouvert en tapant le
badge musique) affiche un transport play/pause/suivant/précédent **seulement
si Spotify est connecté**. Implémentation dans
`apps/mobile/src/lib/musicNowPlaying.ts` (`spotifyPlay/Pause/Next/Previous`,
`fetchSpotifyPlaybackStatus`) et `apps/mobile/src/theme/components.tsx`
(`SpotifyPlaybackControls`, dans `NowPlayingSheet`).

**Last.fm n'a et n'aura jamais de contrôles** : c'est un service de scrobble
en lecture seule, il n'existe structurellement aucune API Last.fm pour
piloter la lecture, quelle que soit l'app source (Deezer, Apple Music…). Le
composant ne rend rien si la source active n'est pas Spotify — jamais de
bouton désactivé qui ferait semblant.

**Contrôle Spotify — prérequis structurels de l'API Web Spotify (pas une
limite K-ssenger)** :
- Compte **Premium** obligatoire (Spotify refuse play/pause/skip aux comptes
  gratuits, 403 `PREMIUM_REQUIRED`).
- Un **appareil Spotify actif** (l'app ouverte quelque part) — sinon 404, et
  K-ssenger affiche « Ouvre Spotify sur un appareil… ».
- Scope OAuth étendu : `user-modify-playback-state` (ajouté en plus de
  `user-read-currently-playing user-read-playback-state`). **Les comptes déjà
  connectés avant ce changement doivent se déconnecter puis reconnecter
  Spotify une fois** (bouton dans Modifier mon profil → Synchro automatique)
  pour obtenir un refresh token avec le nouveau scope — sinon les boutons
  répondent "Commande Spotify impossible" (403 faute de scope).

Le refresh token reste uniquement sur l'appareil (SecureStore natif /
localStorage web) — jamais loggé, jamais envoyé au serveur K-ssenger, qui ne
stocke toujours aucun jeton musique.

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
EXPO_PUBLIC_LASTFM_CLIENT_ID='xxxxxxxx'
```

⚠️ Le nom exact de la variable lue par le code est `EXPO_PUBLIC_LASTFM_CLIENT_ID`
(voir `apps/mobile/src/lib/musicNowPlaying.ts`). Toute autre variante
(`EXPO_PUBLIC_LASTFM_API_KEY`…) est silencieusement ignorée : `lastfmConfigured`
reste `false` et Last.fm ne s'affiche jamais, sans erreur visible.

## Redéploiement web complet

```bash
cd apps/mobile
EXPO_PUBLIC_NEON_AUTH_URL='https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth' \
EXPO_PUBLIC_NEON_DATA_API_URL='https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1' \
EXPO_PUBLIC_KSSENGER_SOCKET_URL='https://kssenger-server.onrender.com' \
EXPO_PUBLIC_SPOTIFY_CLIENT_ID='<client id spotify>' \
EXPO_PUBLIC_LASTFM_CLIENT_ID='<api key last.fm>' \
  npx expo export --platform web
npx eas deploy --prod --alias kssenger
```
