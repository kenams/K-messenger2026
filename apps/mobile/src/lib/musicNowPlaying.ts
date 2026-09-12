import { Linking, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Automatic "now playing" for the profile signature.
 *
 * Spotify is the primary one-tap provider. Last.fm remains an optional fallback
 * for Spotify accounts/API states that do not expose currently-playing, and for
 * other players that scrobble to Last.fm.
 *
 * Tokens/usernames stay on-device. The server only receives the final
 * title/artist written to the authenticated profile.
 */

export const SPOTIFY_CLIENT_ID = (process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '').trim();
// Last.fm calls this public read identifier an "API key". The separate Last.fm
// shared secret is never embedded in K-ssenger.
export const LASTFM_CLIENT_ID = (process.env.EXPO_PUBLIC_LASTFM_CLIENT_ID ?? '').trim();
export const spotifyConfigured = SPOTIFY_CLIENT_ID.length > 0;
export const lastfmConfigured = LASTFM_CLIENT_ID.length > 0;

export type NowPlayingTrack = { title: string; artist: string };
export type MusicSource = 'spotify' | 'lastfm' | null;

const SPOTIFY_SCOPE = 'user-read-currently-playing user-read-playback-state';
const SPOTIFY_NATIVE_REDIRECT = 'kssenger://spotify-callback';
const K_SPOTIFY = 'kssenger.music.spotify';
const K_SPOTIFY_VERIFIER = 'kssenger.music.spotify.verifier';
const K_LASTFM = 'kssenger.music.lastfm';

type SpotifyTokens = { refreshToken: string; accessToken: string; expiresAt: number };

// ---------------------------------------------------------------------------
// storage (web: localStorage, native: SecureStore)
// ---------------------------------------------------------------------------

async function readKey(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key.replace(/\./g, '_'));
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    const nativeKey = key.replace(/\./g, '_');
    if (value === null) await SecureStore.deleteItemAsync(nativeKey);
    else await SecureStore.setItemAsync(nativeKey, value);
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(48);
  return base64UrlFromBytes(bytes);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function spotifyRedirectUri(): string {
  if (Platform.OS !== 'web') return SPOTIFY_NATIVE_REDIRECT;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/`;
}

function currentSpotifyCallbackUrl(explicitUrl?: string): string | null {
  if (explicitUrl) return explicitUrl;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.href;
  return null;
}

function clearWebSpotifyQuery(url: URL): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  ['code', 'state', 'error'].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash);
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

/**
 * Starts Spotify Authorization Code + PKCE.
 * Web returns to the current Expo origin; Android/iOS return to the K-ssenger
 * custom scheme declared in app.json. No Spotify secret is embedded.
 */
export async function beginSpotifyAuth(): Promise<void> {
  if (!spotifyConfigured) return;

  const verifier = await makeVerifier();
  const challenge = await challengeFromVerifier(verifier);
  const state = base64UrlFromBytes(await Crypto.getRandomBytesAsync(12));
  await writeKey(K_SPOTIFY_VERIFIER, JSON.stringify({ verifier, state }));

  const redirectUri = spotifyRedirectUri();
  if (!redirectUri) return;

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPE,
    state,
  });
  const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(authorizeUrl);
    return;
  }
  await Linking.openURL(authorizeUrl);
}

/**
 * Finishes Spotify OAuth from either the web callback or a native deep link.
 * Pass a URL from React Native Linking on native. On web it can be omitted.
 */
export async function completeSpotifyAuthFromUrl(explicitUrl?: string): Promise<boolean> {
  if (!spotifyConfigured) return false;

  let rawUrl = currentSpotifyCallbackUrl(explicitUrl);
  if (!rawUrl && Platform.OS !== 'web') rawUrl = await Linking.getInitialURL();
  if (!rawUrl) return false;
  if (Platform.OS !== 'web' && !rawUrl.startsWith(SPOTIFY_NATIVE_REDIRECT)) return false;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return false;

  try {
    const stored = await readKey(K_SPOTIFY_VERIFIER);
    if (!stored) { clearWebSpotifyQuery(url); return false; }
    const { verifier, state: expectedState } = JSON.parse(stored) as { verifier: string; state: string };
    if (state !== expectedState) { clearWebSpotifyQuery(url); return false; }

    const redirectUri = spotifyRedirectUri();
    if (!redirectUri) return false;

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    });
    if (!res.ok) { clearWebSpotifyQuery(url); return false; }

    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token || !json.refresh_token || !json.expires_in) {
      clearWebSpotifyQuery(url);
      return false;
    }
    await persistSpotifyTokens({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + Math.max(60, json.expires_in - 60) * 1000,
    });
    await writeKey(K_SPOTIFY_VERIFIER, null);
    clearWebSpotifyQuery(url);
    return true;
  } catch {
    clearWebSpotifyQuery(url);
    return false;
  }
}

async function persistSpotifyTokens(tokens: SpotifyTokens): Promise<void> {
  await writeKey(K_SPOTIFY, JSON.stringify(tokens));
}

async function readSpotifyTokens(): Promise<SpotifyTokens | null> {
  const raw = await readKey(K_SPOTIFY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SpotifyTokens>;
    if (!parsed.refreshToken || !parsed.accessToken || typeof parsed.expiresAt !== 'number') return null;
    return parsed as SpotifyTokens;
  } catch {
    return null;
  }
}

async function validSpotifyAccessToken(): Promise<string | null> {
  const tokens = await readSpotifyTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) await writeKey(K_SPOTIFY, null);
      return null;
    }
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token || !json.expires_in) return null;
    const next: SpotifyTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + Math.max(60, json.expires_in - 60) * 1000,
    };
    await persistSpotifyTokens(next);
    return next.accessToken;
  } catch {
    return null;
  }
}

export async function isSpotifyConnected(): Promise<boolean> {
  return (await readSpotifyTokens()) !== null;
}

export async function disconnectSpotify(): Promise<void> {
  await writeKey(K_SPOTIFY, null);
  await writeKey(K_SPOTIFY_VERIFIER, null);
}

async function fetchSpotifyNowPlaying(): Promise<NowPlayingTrack | null> {
  const token = await validSpotifyAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 204 || res.status === 202) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as {
      is_playing?: boolean;
      item?: { name?: string; artists?: { name?: string }[] } | null;
    };
    if (!json.is_playing || !json.item?.name) return null;
    const artist = (json.item.artists ?? []).map((a) => a.name).filter(Boolean).join(', ');
    return { title: json.item.name.slice(0, 120), artist: artist.slice(0, 120) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Last.fm
// ---------------------------------------------------------------------------

export async function getLastfmUsername(): Promise<string | null> {
  return (await readKey(K_LASTFM)) || null;
}

export async function setLastfmUsername(username: string): Promise<void> {
  const clean = username.trim().replace(/^@/, '').slice(0, 40);
  await writeKey(K_LASTFM, clean.length ? clean : null);
}

export async function disconnectLastfm(): Promise<void> {
  await writeKey(K_LASTFM, null);
}

async function fetchLastfmNowPlaying(username: string): Promise<NowPlayingTrack | null> {
  if (!lastfmConfigured || !username) return null;
  try {
    const params = new URLSearchParams({
      method: 'user.getrecenttracks',
      user: username,
      api_key: LASTFM_CLIENT_ID,
      format: 'json',
      limit: '1',
    });
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      recenttracks?: { track?: Array<{ name?: string; artist?: { '#text'?: string }; '@attr'?: { nowplaying?: string } }> };
    };
    const track = json.recenttracks?.track?.[0];
    if (!track || track['@attr']?.nowplaying !== 'true' || !track.name) return null;
    return { title: track.name.slice(0, 120), artist: (track.artist?.['#text'] ?? '').slice(0, 120) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// unified
// ---------------------------------------------------------------------------

export async function getActiveMusicSource(): Promise<MusicSource> {
  if (await isSpotifyConnected()) return 'spotify';
  if (await getLastfmUsername()) return 'lastfm';
  return null;
}

/**
 * Returns the track currently playing.
 *
 * Important: a stored Spotify session is not treated as authoritative. Spotify
 * can legitimately return no track (or deny currently-playing for an account
 * or app configuration). In that case we immediately fall back to Last.fm so a
 * valid scrobble is never hidden by a stale/limited Spotify connection.
 */
export async function fetchNowPlaying(): Promise<NowPlayingTrack | null> {
  if (await isSpotifyConnected()) {
    const spotifyTrack = await fetchSpotifyNowPlaying();
    if (spotifyTrack) return spotifyTrack;
  }

  const lastfm = await getLastfmUsername();
  if (lastfm) {
    const lastfmTrack = await fetchLastfmNowPlaying(lastfm);
    if (lastfmTrack) return lastfmTrack;
  }
  return null;
}
