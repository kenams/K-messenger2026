import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Automatic "now playing" for the profile signature.
 *
 * Two providers, both read-only and client-driven so the server never holds a
 * music token:
 *  - Spotify: Authorisation Code + PKCE (public client, no secret). We keep the
 *    refresh token in this device's secure storage and poll
 *    `/me/player/currently-playing`.
 *  - Last.fm: an app-level API key + the user's Last.fm name. `getRecentTracks`
 *    exposes the currently scrobbling track, which covers Deezer, Apple Music,
 *    YouTube Music and anything else that scrobbles.
 *
 * Both features hide themselves when their env key is absent.
 */

export const SPOTIFY_CLIENT_ID = (process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '').trim();
export const LASTFM_API_KEY = (process.env.EXPO_PUBLIC_LASTFM_API_KEY ?? '').trim();
export const spotifyConfigured = SPOTIFY_CLIENT_ID.length > 0;
export const lastfmConfigured = LASTFM_API_KEY.length > 0;

export type NowPlayingTrack = { title: string; artist: string };
export type MusicSource = 'spotify' | 'lastfm' | null;

const SPOTIFY_SCOPE = 'user-read-currently-playing user-read-playback-state';
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
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  // btoa exists on web and on React Native (Hermes) since RN 0.74.
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

function webRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/`;
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

/** Kick off the Spotify consent redirect (web only for now). */
export async function beginSpotifyAuth(): Promise<void> {
  if (!spotifyConfigured || Platform.OS !== 'web' || typeof window === 'undefined') return;
  const verifier = await makeVerifier();
  const challenge = await challengeFromVerifier(verifier);
  const state = base64UrlFromBytes(await Crypto.getRandomBytesAsync(12));
  await writeKey(K_SPOTIFY_VERIFIER, JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: webRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPE,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

/**
 * On web load, finish the Spotify redirect if `?code=` is present. Returns true
 * when a connection was just established. Always strips the OAuth query params.
 */
export async function completeSpotifyAuthFromUrl(): Promise<boolean> {
  if (!spotifyConfigured || Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return false;

  const clearQuery = () => {
    ['code', 'state', 'error'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash);
  };

  try {
    const stored = await readKey(K_SPOTIFY_VERIFIER);
    if (!stored) { clearQuery(); return false; }
    const { verifier, state: expectedState } = JSON.parse(stored) as { verifier: string; state: string };
    if (state !== expectedState) { clearQuery(); return false; }

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: webRedirectUri(),
        code_verifier: verifier,
      }).toString(),
    });
    if (!res.ok) { clearQuery(); return false; }
    const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    await persistSpotifyTokens({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + (json.expires_in - 60) * 1000,
    });
    await writeKey(K_SPOTIFY_VERIFIER, null);
    clearQuery();
    return true;
  } catch {
    clearQuery();
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
    return JSON.parse(raw) as SpotifyTokens;
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
    const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    const next: SpotifyTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + (json.expires_in - 60) * 1000,
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
  const clean = username.trim().slice(0, 40);
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
      api_key: LASTFM_API_KEY,
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

/** The track playing right now, from whichever provider is connected. */
export async function fetchNowPlaying(): Promise<NowPlayingTrack | null> {
  if (await isSpotifyConnected()) return fetchSpotifyNowPlaying();
  const lastfm = await getLastfmUsername();
  if (lastfm) return fetchLastfmNowPlaying(lastfm);
  return null;
}
