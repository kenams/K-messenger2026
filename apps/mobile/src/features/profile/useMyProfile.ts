import { useCallback, useEffect, useState } from 'react';
import { getBackend } from '../../lib/backend';

export type MyProfile = {
  id: string;
  username: string;
  display_name: string;
  nickname: string | null;
  avatar_url: string | null;
  avatar_media_id: string | null;
  bio: string | null;
  custom_status: string | null;
  presence: 'online' | 'busy' | 'away' | 'invisible' | 'offline';
  now_playing_title: string | null;
  now_playing_artist: string | null;
};

export function useMyProfile(userId: string) {
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await getBackend()
        .from('profiles')
        .select('id,username,display_name,nickname,avatar_url,avatar_media_id,bio,custom_status,presence,now_playing_title,now_playing_artist')
        .eq('id', userId)
        .maybeSingle();

      if (queryError) {
        setProfile(null);
        setError('PROFILE_LOAD_FAILED');
        return;
      }
      setProfile((data as MyProfile | null) ?? null);
    } catch {
      setProfile(null);
      setError('PROFILE_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, loading, error, refresh };
}
