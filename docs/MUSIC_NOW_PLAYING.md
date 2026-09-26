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

⚠️ Une version précédente de ce document affirmait que c'était « déjà en
place » via des composants `ProfileHeader`/`MeScreen` — **ces composants
n'existent pas dans le code** (vérifié par grep sur tout `apps/mobile/src`,
2026-09-26). L'affirmation n'avait jamais été vérifiée visuellement en prod.

État réel : `apps/mobile/src/features/profile/ProfileEditScreen.tsx`
(l'écran **Modifier mon profil**) affiche maintenant ton propre morceau en
cours (icône équaliseur + `Titre — Artiste`) juste sous le nom d'écran, à
côté de ton nom affiché — même style que dans la liste de contacts
(`MsnContactsScreen`). La donnée vient de `profile.now_playing_title/artist`,
écrite par ton propre appareil via `useNowPlayingSync` (sondage 45 s).

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
3. Le mettre à jour dans `scripts/ship-web.mjs` (`MOBILE_ENV.EXPO_PUBLIC_SPOTIFY_CLIENT_ID`)
   puis `npm run ship:web` — jamais un `expo export` tapé à la main.

Pour l'APK : ajouter `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` dans `eas.json` (env des
profils `preview` / `production`) et une redirect URI native
(`kssenger://spotify-callback`) — l'auth native n'est pas encore branchée
(web only pour l'instant).

## 2. Last.fm — 2 min, une seule fois

1. https://www.last.fm/api/account/create → obtenir une **API key** (instantané).
2. La mettre à jour dans `scripts/ship-web.mjs` (`MOBILE_ENV.EXPO_PUBLIC_LASTFM_CLIENT_ID`)
   puis `npm run ship:web`.

⚠️ Le nom exact de la variable lue par le code est `EXPO_PUBLIC_LASTFM_CLIENT_ID`
(voir `apps/mobile/src/lib/musicNowPlaying.ts`). Toute autre variante
(`EXPO_PUBLIC_LASTFM_API_KEY`…) est silencieusement ignorée : `lastfmConfigured`
reste `false` et Last.fm ne s'affiche jamais, sans erreur visible.

## Redéploiement web complet

Ne jamais retaper `expo export` à la main. Une seule commande, voir
`docs/WEB_DEPLOY.md` :

```bash
npm run ship:web
```

Les client IDs Spotify/Last.fm sont câblés en dur (avec fallback) dans
`scripts/ship-web.mjs`, donc ce script ne peut pas les oublier — c'est
exactement ce qui a cassé le now-playing en prod deux fois de suite quand le
redéploiement se faisait par copier-coller manuel.
