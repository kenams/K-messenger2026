import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { launchImageLibrarySafe } from '../../lib/pickMedia';
import { getBackend } from '../../lib/backend';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import { getAuthenticatedUserId } from '../../lib/realtime';
import { palette, radius, spacing } from '../../theme/tokens';

export type FeedVideo = {
  id: string; ownerId: string; author: string; caption: string; ageRating: 13 | 16 | 18;
  violence: 'none' | 'mild' | 'graphic'; storagePath: string; mediaObjectId: string | null;
  moderationStatus: 'pending' | 'approved' | 'limited' | 'rejected'; publishedAt: string | null; isMine: boolean;
};
type VideoRow = {
  id: string; owner_id: string; caption: string; age_rating: 13 | 16 | 18; violence_level: 'none' | 'mild' | 'graphic';
  storage_path: string; media_object_id: string | null; moderation_status: FeedVideo['moderationStatus']; published_at: string | null;
};

const { height } = Dimensions.get('window');
const ITEM_HEIGHT = Math.max(520, height - 190);
const VIDEO_MIMES = new Set<SupportedMediaMime>(['video/mp4', 'video/quicktime']);

function inferVideoMime(asset: ImagePicker.ImagePickerAsset): SupportedMediaMime | null {
  const normalized = asset.mimeType?.toLowerCase();
  if (normalized && VIDEO_MIMES.has(normalized as SupportedMediaMime)) return normalized as SupportedMediaMime;
  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.mp4')) return 'video/mp4';
  if (uri.endsWith('.mov')) return 'video/quicktime';
  return null;
}

export function FeedScreen({ userAge = 18 }: { userAge?: number }) {
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const me = await getAuthenticatedUserId();
      const { data, error } = await getBackend().from('public_videos')
        .select('id,owner_id,caption,age_rating,violence_level,storage_path,media_object_id,moderation_status,published_at')
        .order('published_at', { ascending: false, nullsFirst: false }).limit(100);
      if (error) throw error;
      const rows = ((data ?? []) as unknown) as VideoRow[];
      const visibleRows = rows.filter((row) => row.owner_id === me || userAge >= row.age_rating);
      const ownerIds = [...new Set(visibleRows.map((row) => row.owner_id))];
      const authors = new Map<string, string>();
      if (ownerIds.length) {
        const profiles = await getBackend().from('profiles').select('id,username,display_name').in('id', ownerIds);
        if (!profiles.error) for (const profile of ((profiles.data ?? []) as unknown) as Array<{ id: string; username?: string; display_name?: string }>) authors.set(profile.id, profile.username ? `@${profile.username}` : profile.display_name ?? 'K-ssenger');
      }
      const nextVideos = visibleRows.map((row) => ({
        id: row.id, ownerId: row.owner_id, author: row.owner_id === me ? '@moi' : authors.get(row.owner_id) ?? 'K-ssenger',
        caption: row.caption, ageRating: row.age_rating, violence: row.violence_level, storagePath: row.storage_path,
        mediaObjectId: row.media_object_id, moderationStatus: row.moderation_status, publishedAt: row.published_at, isMine: row.owner_id === me,
      }));
      setVideos(nextVideos);
      setActiveId((current) => current && nextVideos.some((video) => video.id === current) ? current : (nextVideos[0]?.id ?? null));
      setNotice('');
    } catch { setVideos([]); setActiveId(null); setNotice('K-Feed est momentanément indisponible.'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void load(); }, [userAge]);

  const createClip = async () => {
    if (uploading) return;
    setUploading(true); setNotice('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice('Autorise l’accès aux vidéos choisies pour publier un K-Clip.'); return; }
      const picked = await launchImageLibrarySafe({ mediaTypes: ['videos'], quality: 1, allowsEditing: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.uri) throw new Error('UNSUPPORTED_KCLIP');
      const mime = inferVideoMime(asset);
      if (!mime) throw new Error('UNSUPPORTED_KCLIP');
      const { mediaId } = await uploadLocalMedia({ uri: asset.uri, mimeType: mime, byteSize: asset.fileSize ?? undefined, purpose: 'kfeed' });
      const ownerId = await getAuthenticatedUserId();
      const { error } = await getBackend().from('public_videos').insert({
        owner_id: ownerId, media_object_id: mediaId, storage_path: `media:${mediaId}`, caption: '', age_rating: 13,
        violence_level: 'none', visibility: 'public', moderation_status: 'pending', published_at: null,
      });
      if (error) throw error;
      setNotice('K-Clip envoyé. Il reste privé pour toi tant que la modération ne l’a pas validé.');
      await load(true);
    } catch { setNotice('Publication impossible. Le fichier doit être une vidéo MP4/MOV de 100 Mo maximum.'); }
    finally { setUploading(false); }
  };

  const report = async (video: FeedVideo) => {
    if (video.isMine) return;
    try {
      const reporterId = await getAuthenticatedUserId();
      const { error } = await getBackend().from('video_reports').insert({ video_id: video.id, reporter_id: reporterId, reason: 'other', details: 'Signalement depuis le K-Feed mobile.' });
      if (error && !String(error.message ?? '').toLowerCase().includes('duplicate')) throw error;
      setNotice('Vidéo signalée à la modération K-ssenger.');
    } catch { setNotice('Signalement impossible pour le moment.'); }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={palette.azure} /><Text style={styles.muted}>Chargement du K-Feed…</Text></View>;
  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View>
          <Text style={styles.toolbarBrand}>K-SSENGER</Text>
          <Text style={styles.toolbarTitle}>K-Feed</Text>
        </View>
        <Pressable disabled={uploading} style={[styles.createButton, uploading && styles.disabled]} onPress={() => void createClip()}>
          <Text style={styles.createText}>{uploading ? 'Envoi…' : '＋ K-Clip'}</Text>
        </Pressable>
      </View>
      {!!notice && <View style={styles.noticeBox}><Text style={styles.notice}>{notice}</Text></View>}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.white} />}
        onMomentumScrollEnd={(event) => {
          const index = Math.max(0, Math.min(videos.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
          setActiveId(videos[index]?.id ?? null);
        }}
        renderItem={({ item }) => <VideoCard video={item} active={item.id === activeId} onReport={report} />}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>▶️</Text><Text style={styles.emptyTitle}>Aucun K-Clip disponible</Text><Text style={styles.emptyText}>Publie le premier clip. Les médias restent privés jusqu’à leur validation.</Text></View>}
      />
    </View>
  );
}

function NativeKClip({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; });
  useEffect(() => {
    if (active) player.play();
    else player.pause();
    return () => { player.pause(); };
  }, [active, player]);
  return <VideoView player={player} style={styles.nativeVideo} nativeControls allowsFullscreen allowsPictureInPicture contentFit="contain" />;
}

function VideoCard({ video, active, onReport }: { video: FeedVideo; active: boolean; onReport: (video: FeedVideo) => void }) {
  const sensitive = video.violence === 'graphic';
  const [revealed, setRevealed] = useState(!sensitive);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const publicState = video.moderationStatus === 'approved' || video.moderationStatus === 'limited';

  useEffect(() => {
    let mounted = true;
    if (!video.mediaObjectId || (!video.isMine && !publicState)) return () => { mounted = false; };
    void getMediaDownload(video.mediaObjectId).then((download) => { if (mounted) setSignedUrl(download.url); }).catch(() => { if (mounted) setSignedUrl(null); });
    return () => { mounted = false; };
  }, [video.mediaObjectId, video.isMine, publicState]);

  const legacyUrl = /^https:\/\//i.test(video.storagePath) ? video.storagePath : null;
  const playableUrl = signedUrl ?? legacyUrl;
  return (
    <View style={styles.card}>
      <View style={styles.videoSurface}>
        {!revealed ? <View style={styles.warning}><Text style={styles.warningIcon}>⚠️</Text><Text style={styles.warningTitle}>Contenu sensible</Text><Text style={styles.warningText}>Ce K-Clip est classé 18+ avec images potentiellement choquantes.</Text><Pressable style={styles.revealButton} onPress={() => setRevealed(true)}><Text style={styles.revealText}>Afficher le contenu</Text></Pressable></View>
        : playableUrl && (publicState || video.isMine) ? <NativeKClip uri={playableUrl} active={active} />
        : <View style={styles.mediaPending}><Text style={styles.play}>▣</Text><Text style={styles.mediaLabel}>{video.isMine && !publicState ? 'Clip en attente de modération' : 'Média indisponible'}</Text><Text style={styles.mediaHint}>K-ssenger ne remplace jamais le fichier réel par un faux média.</Text></View>}
      </View>
      <View style={styles.overlay} pointerEvents="box-none"><View style={styles.meta}><Text style={styles.author}>{video.author}</Text><Text style={styles.caption}>{video.caption || 'K-Clip'}</Text><Text style={styles.rating}>{video.ageRating}+ {video.violence !== 'none' ? '· contenu sensible' : ''} · {video.moderationStatus}</Text></View><View style={styles.actions}>{!video.isMine && <Pressable style={styles.action} onPress={() => onReport(video)}><Text style={styles.actionIcon}>⚑</Text><Text style={styles.actionLabel}>Signaler</Text></Pressable>}</View></View>
    </View>
  );
}

const ink = '#07131c';
const inkPanel = '#102c3d';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ink },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: ink },
  muted: { color: '#7fa0b1' },
  toolbar: { minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: ink, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  toolbarBrand: { color: '#6FB4F2', fontSize: 10, letterSpacing: 2.6, fontWeight: '900' },
  toolbarTitle: { color: palette.white, fontWeight: '900', fontSize: 20, marginTop: 2, letterSpacing: -0.3 },
  createButton: { backgroundColor: palette.azure, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 1 },
  createText: { color: palette.white, fontWeight: '900', fontSize: 12.5 },
  disabled: { opacity: 0.5 },
  noticeBox: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: '#153a4f' },
  notice: { color: '#d7effc', textAlign: 'center', fontSize: 11, fontWeight: '700' },
  card: { height: ITEM_HEIGHT, backgroundColor: ink, position: 'relative' },
  videoSurface: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: inkPanel },
  nativeVideo: { width: '100%', height: '100%', backgroundColor: '#000' },
  mediaPending: { alignItems: 'center', padding: spacing.xxl },
  play: { fontSize: 58, color: palette.white },
  mediaLabel: { color: palette.white, marginTop: spacing.md, fontWeight: '900', textAlign: 'center' },
  mediaHint: { color: '#a8c4d4', marginTop: spacing.sm, fontSize: 11, textAlign: 'center', maxWidth: 320 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  meta: { flex: 1, paddingRight: spacing.md },
  author: { color: palette.white, fontWeight: '900', fontSize: 17 },
  caption: { color: palette.white, marginTop: spacing.xs, fontSize: 14 },
  rating: { color: '#d5e4ec', marginTop: spacing.sm, fontSize: 11 },
  actions: { gap: spacing.md, alignItems: 'center' },
  action: { alignItems: 'center', minWidth: 52 },
  actionIcon: { fontSize: 26, color: palette.white },
  actionLabel: { color: palette.white, fontSize: 10, marginTop: 2 },
  warning: { margin: spacing.xl, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', maxWidth: 420 },
  warningIcon: { fontSize: 42 },
  warningTitle: { color: palette.white, fontSize: 22, fontWeight: '900', marginTop: spacing.sm },
  warningText: { color: '#e3edf3', textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
  revealButton: { marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: palette.white },
  revealText: { color: inkPanel, fontWeight: '900' },
  empty: { flex: 1, minHeight: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, backgroundColor: ink, gap: spacing.xs },
  emptyIcon: { fontSize: 34 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: palette.white },
  emptyText: { marginTop: spacing.xs, textAlign: 'center', color: '#9db4c2', lineHeight: 20, maxWidth: 300 },
});
