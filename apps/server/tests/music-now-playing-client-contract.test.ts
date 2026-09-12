import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const musicSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/lib/musicNowPlaying.ts'),
  'utf8',
);
const syncSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/features/profile/useNowPlayingSync.ts'),
  'utf8',
);

describe('mobile now-playing contract', () => {
  it('supports one-tap Spotify PKCE on native through the K-ssenger deep link', () => {
    expect(musicSource).toContain("const SPOTIFY_NATIVE_REDIRECT = 'kssenger://spotify-callback'");
    expect(musicSource).toContain('code_challenge_method: \'S256\'');
    expect(musicSource).toContain('await Linking.openURL(authorizeUrl)');
    expect(musicSource).toContain('Linking.getInitialURL()');
  });

  it('falls back to Last.fm when a connected Spotify session has no current track', () => {
    const spotifyFetch = musicSource.indexOf('const spotifyTrack = await fetchSpotifyNowPlaying();');
    const lastfmFetch = musicSource.indexOf('const lastfmTrack = await fetchLastfmNowPlaying(lastfm);');

    expect(spotifyFetch).toBeGreaterThan(-1);
    expect(lastfmFetch).toBeGreaterThan(spotifyFetch);
    expect(musicSource).toContain('if (spotifyTrack) return spotifyTrack;');
    expect(musicSource).toContain('if (lastfmTrack) return lastfmTrack;');
  });

  it('refreshes quickly and rechecks after native OAuth/foreground events', () => {
    expect(syncSource).toContain('const POLL_MS = 15_000;');
    expect(syncSource).toContain("Linking.addEventListener('url'");
    expect(syncSource).toContain("AppState.addEventListener('change'");
    expect(syncSource).toContain("state === 'active'");
  });
});
