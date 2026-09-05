import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { getBackend } from '../../lib/backend';
import { getAuthenticatedUserId } from '../../lib/realtime';

export type FeedVideo = {
  id: string;
  ownerId: string;
  author: string;
  caption: string;
  ageRating: 13 | 16 | 18;
  violence: 'none' | 'mild' | 'graphic';
  storagePath: string;
  moderationStatus: 'pending' | 'approved' | 'limited' | 'rejected';
  publishedAt: string | null;
  isMine: boolean;
};

type VideoRow = {
  id: string;
  owner_id: string;
  caption: string;
  age_rating: 13 | 16 | 18;
  violence_level: 'none' | 'mild' | 'graphic';
  storage_path: string;
  moderation_status: FeedVideo['moderationStatus'];
  published_at: string | null;
};

const { height } = Dimensions.get('window');
const ITEM_HEIGHT = Math.max(520, height - 190);

export function FeedScreen({ userAge = 18 }: { userAge?: number }) {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const me = await getAuthenticatedUserId();
      const { data, error } = await getBackend()
        .from('public_videos')
        .select('id,owner_id,caption,age_rating,violence_level,storage_path,moderation_status,published_at')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      const rows = ((data ?? []) as unknown) as VideoRow[];
      const visibleRows = rows.filter((row) => row.owner_id === me || userAge >= row.age_rating);
      const ownerIds = [...new Set(visibleRows.map((row) => row.owner_id))];
      const authors = new Map<string, string>();
      if (ownerIds.length) {
        const profiles = await getBackend().from('profiles').select('id,username,display_name').in('id', ownerIds);
        if (!profiles.error) {
          for (const profile of ((profiles.data ?? []) as unknown) as Array<{ id: string; username?: string; display_name?: string }>) {
            authors.set(profile.id, profile.username ? `@${profile.username}` : profile.display_name ?? 'K-ssenger');
          }
        }
      }
      setVideos(visibleRows.map((row) => ({
        id: row.id,
        ownerId: row.owner_id,
        author: row.owner_id === me ? '@moi' : authors.get(row.owner_id) ?? 'K-ssenger',
        caption: row.caption,
        ageRating: row.age_rating,
        violence: row.violence_level,
        storagePath: row.storage_path,
        moderationStatus: row.moderation_status,
        publishedAt: row.published_at,
        isMine: row.owner_id === me,
      })));
      setNotice('');
    } catch {
      setVideos([]);
      setNotice('K-Feed est momentanément indisponible.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, [userAge]);

  const report = async (video: FeedVideo) => {
    if (video.isMine) return;
    try {
      const reporterId = await getAuthenticatedUserId();
      const { error } = await getBackend().from('video_reports').insert({
        video_id: video.id,
        reporter_id: reporterId,
        reason: 'other',
        details: 'Signalement depuis le K-Feed mobile.',
      });
      if (error && !String(error.message ?? '').toLowerCase().includes('duplicate')) throw error;
      setNotice('Vidéo signalée à la modération K-ssenger.');
    } catch {
      setNotice('Signalement impossible pour le moment.');
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>Chargement du K-Feed…</Text></View>;

  return (
    <View style={styles.container}>
      {!!notice && <View style={styles.noticeBox}><Text style={styles.notice}>{notice}</Text></View>}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        renderItem={({ item }) => <VideoCard video={item} onReport={report} />}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Aucun K-Clip disponible</Text><Text style={styles.emptyText}>Seuls les clips autorisés par Neon RLS, l’âge et la modération apparaissent ici.</Text></View>}
      />
    </View>
  );
}

function NativeKClip({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
  });

  return (
    <VideoView
      player={player}
      style={styles.nativeVideo}
      nativeControls
      allowsFullscreen
      allowsPictureInPicture
      contentFit="contain"
    />
  );
}

function VideoCard({ video, onReport }: { video: FeedVideo; onReport: (video: FeedVideo) => void }) {
  const sensitive = video.violence === 'graphic';
  const [revealed, setRevealed] = useState(!sensitive);
  const playableUrl = /^https:\/\//i.test(video.storagePath) ? video.storagePath : null;
  const publicState = video.moderationStatus === 'approved' || video.moderationStatus === 'limited';

  return (
    <View style={styles.card}>
      <View style={styles.videoSurface}>
        {!revealed ? (
          <View style={styles.warning}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>Contenu sensible</Text>
            <Text style={styles.warningText}>Ce K-Clip est classé 18+ avec images potentiellement choquantes.</Text>
            <Pressable style={styles.revealButton} onPress={() => setRevealed(true)}><Text style={styles.revealText}>Afficher le contenu</Text></Pressable>
          </View>
        ) : playableUrl && publicState ? (
          <NativeKClip uri={playableUrl} />
        ) : (
          <View style={styles.mediaPending}>
            <Text style={styles.play}>▣</Text>
            <Text style={styles.mediaLabel}>{video.isMine && !publicState ? 'Clip en attente de modération' : 'Média indisponible'}</Text>
            <Text style={styles.mediaHint}>K-ssenger n’affiche jamais un faux média à la place du fichier réel.</Text>
          </View>
        )}
      </View>

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.meta}>
          <Text style={styles.author}>{video.author}</Text>
          <Text style={styles.caption}>{video.caption || 'K-Clip'}</Text>
          <Text style={styles.rating}>{video.ageRating}+ {video.violence !== 'none' ? '· contenu sensible' : ''} · {video.moderationStatus}</Text>
        </View>
        <View style={styles.actions}>
          {!video.isMine && <Pressable style={styles.action} onPress={() => onReport(video)}><Text style={styles.actionIcon}>⚑</Text><Text style={styles.actionLabel}>Signaler</Text></Pressable>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07131c' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#668293' }, noticeBox: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#15384d' }, notice: { color: '#d7effc', textAlign: 'center', fontSize: 11, fontWeight: '700' },
  card: { height: ITEM_HEIGHT, backgroundColor: '#07131c', position: 'relative' }, videoSurface: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#102c3d' }, nativeVideo: { width: '100%', height: '100%', backgroundColor: '#000' }, mediaPending: { alignItems: 'center', padding: 30 }, play: { fontSize: 58, color: '#fff' }, mediaLabel: { color: '#fff', marginTop: 12, fontWeight: '900', textAlign: 'center' }, mediaHint: { color: '#a8c4d4', marginTop: 7, fontSize: 11, textAlign: 'center', maxWidth: 320 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' }, meta: { flex: 1, paddingRight: 12 }, author: { color: '#fff', fontWeight: '900', fontSize: 17 }, caption: { color: '#fff', marginTop: 6, fontSize: 14 }, rating: { color: '#d5e4ec', marginTop: 8, fontSize: 11 }, actions: { gap: 14, alignItems: 'center' }, action: { alignItems: 'center', minWidth: 52 }, actionIcon: { fontSize: 27, color: '#fff' }, actionLabel: { color: '#fff', fontSize: 10, marginTop: 2 },
  warning: { margin: 24, padding: 24, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', maxWidth: 420 }, warningIcon: { fontSize: 42 }, warningTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 8 }, warningText: { color: '#e3edf3', textAlign: 'center', marginTop: 8, lineHeight: 20 }, revealButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: '#fff' }, revealText: { color: '#102c3d', fontWeight: '900' },
  empty: { flex: 1, minHeight: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: '#eef6fb' }, emptyTitle: { fontSize: 22, fontWeight: '900', color: '#173448' }, emptyText: { marginTop: 8, textAlign: 'center', color: '#668293', lineHeight: 20 },
});
