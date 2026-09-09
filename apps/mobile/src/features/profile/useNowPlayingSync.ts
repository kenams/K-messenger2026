import { useEffect, useRef } from 'react';
import { getBackend } from '../../lib/backend';
import {
  completeSpotifyAuthFromUrl,
  fetchNowPlaying,
  getActiveMusicSource,
} from '../../lib/musicNowPlaying';
import type { MyProfile } from './useMyProfile';

const POLL_MS = 45_000;

/**
 * While a music provider is connected, keeps the profile's "now playing"
 * signature in sync with what the user is actually listening to. Client-driven
 * (the poll only runs while the app is open) and a no-op when nothing is
 * connected.
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

    const tick = async () => {
      if (!active) return;
      const source = await getActiveMusicSource();
      if (!source || !active) return;

      const track = await fetchNowPlaying();
      if (!active) return;
      const title = track?.title ?? '';
      const artist = track?.artist ?? '';
      if (currentRef.current.title === title && currentRef.current.artist === artist) return;

      try {
        await getBackend()
          .from('profiles')
          .update({
            now_playing_title: title || null,
            now_playing_artist: artist || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profileIdRef.current);
        currentRef.current = { title, artist };
        await changedRef.current();
      } catch {
        /* transient — the next poll retries */
      }
    };

    void completeSpotifyAuthFromUrl().then(() => { void tick(); });
    void tick();
    const timer = setInterval(() => { void tick(); }, POLL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
}
