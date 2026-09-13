import { useEffect, useRef } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { getBackend } from '../../lib/backend';
import {
  completeSpotifyAuthFromUrl,
  fetchNowPlaying,
  getActiveMusicSource,
} from '../../lib/musicNowPlaying';
import type { MyProfile } from './useMyProfile';

const POLL_MS = 15_000;

/**
 * While a music provider is connected, keeps the profile's "now playing"
 * signature in sync with what the user is actually listening to.
 *
 * The client polls while K-ssenger is active, refreshes immediately when the
 * app returns to foreground, and consumes the native Spotify OAuth deep-link.
 */
export function useNowPlayingSync(profile: MyProfile, onProfileChanged: () => Promise<void>): void {
  const currentRef = useRef({ title: profile.now_playing_title ?? '', artist: profile.now_playing_artist ?? '' });
  currentRef.current = { title: profile.now_playing_title ?? '', artist: profile.now_playing_artist ?? '' };
  const profileIdRef = useRef(profile.id);
  profileIdRef.current = profile.id;
  const changedRef = useRef(onProfileChanged);
  changedRef.current = onProfileChanged;

  useEffect(() => {
    let active = true;
    let tickInFlight = false;

    const tick = async () => {
      if (!active || tickInFlight) return;
      tickInFlight = true;
      try {
        const source = await getActiveMusicSource(profileIdRef.current);
        if (!source || !active) return;

        const track = await fetchNowPlaying(profileIdRef.current);
        if (!active) return;
        const title = track?.title ?? '';
        const artist = track?.artist ?? '';
        if (currentRef.current.title === title && currentRef.current.artist === artist) return;

        const response = await getBackend()
          .from('profiles')
          .update({
            now_playing_title: title || null,
            now_playing_artist: artist || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profileIdRef.current);
        if (response.error) throw response.error;

        currentRef.current = { title, artist };
        await changedRef.current();
      } catch {
        /* transient — the next poll/foreground event retries */
      } finally {
        tickInFlight = false;
      }
    };

    void completeSpotifyAuthFromUrl().then((connected) => {
      if (connected) void tick();
    });
    void tick();

    const timer = setInterval(() => { void tick(); }, POLL_MS);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });
    const linkSubscription = Platform.OS === 'web'
      ? null
      : Linking.addEventListener('url', ({ url }) => {
          void completeSpotifyAuthFromUrl(url).then((connected) => {
            if (connected) void tick();
          });
        });

    return () => {
      active = false;
      clearInterval(timer);
      appStateSubscription.remove();
      linkSubscription?.remove();
    };
  }, []);
}
