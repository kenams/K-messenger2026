import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { launchImageLibrarySafe } from '../../lib/pickMedia';
import { getBackend } from '../../lib/backend';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import { getAuthenticatedUserId } from '../../lib/realtime';
import { EmptyState, ScreenHeader } from '../../theme/components';
import { palette, radius, spacing, type as typo } from '../../theme/tokens';

type MomentVisibility = 'friends' | 'close_friends' | 'public';
type MomentKind = 'photo' | 'video' | 'text';
type MomentRow = { id: string; author_id: string; kind: MomentKind; caption: string | null; media_url: string | null; media_object_id: string | null; visibility: MomentVisibility; expires_at: string; created_at: string; is_pinned: boolean };
type Reactions = { total: number; byEmoji: Record<string, number>; mine: string | null };
type Moment = MomentRow & { author: string; isMine: boolean; reactions: Reactions };
const IMAGE_MIMES = new Set<SupportedMediaMime>(['image/jpeg','image/png','image/webp']);
const VIDEO_MIMES = new Set<SupportedMediaMime>(['video/mp4','video/quicktime']);

export const MOMENT_REACTIONS = ['❤️', '🔥', '😂', '😮', '👏'] as const;

const VISIBILITY_LABEL: Record<MomentVisibility, string> = {
  friends: '👥 Amis',
  close_friends: '💚 Proches',
  public: '🌍 Public',
};

const emptyReactions = (): Reactions => ({ total: 0, byEmoji: {}, mine: null });
const LOAD_ERROR = 'Moments est momentanément indisponible.';

function inferMomentMime(asset: ImagePicker.ImagePickerAsset, kind: 'photo' | 'video'): SupportedMediaMime | null {
  const normalized = asset.mimeType?.toLowerCase();
  const allowed = kind === 'photo' ? IMAGE_MIMES : VIDEO_MIMES;
  if (normalized && allowed.has(normalized as SupportedMediaMime)) return normalized as SupportedMediaMime;
  const uri = asset.uri.toLowerCase();
  if (kind === 'photo') {
    if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
    if (uri.endsWith('.png')) return 'image/png';
    if (uri.endsWith('.webp')) return 'image/webp';
  } else {
    if (uri.endsWith('.mp4')) return 'video/mp4';
    if (uri.endsWith('.mov')) return 'video/quicktime';
  }
  return null;
}

export function MomentsScreen({ onPinnedChange }: { onPinnedChange?: () => void }) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<MomentVisibility>('friends');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState('');
  const [userId, setUserId] = useState('');
  const canPublish = useMemo(() => caption.trim().length > 0 && !publishing, [caption, publishing]);

  const load = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const me = userId || await getAuthenticatedUserId();
      if (!userId) setUserId(me);
      const now = new Date().toISOString();
      const { data, error } = await getBackend().from('moments')
        .select('id,author_id,kind,caption,media_url,media_object_id,visibility,expires_at,created_at,is_pinned')
        .or(`expires_at.gt.${now},is_pinned.eq.true`)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const rows = ((data ?? []) as unknown) as MomentRow[];

      const authorIds = [...new Set(rows.map((row) => row.author_id))];
      const names = new Map<string, string>();
      if (authorIds.length) {
        const profileResponse = await getBackend().from('profiles').select('id,username,display_name').in('id', authorIds);
        if (!profileResponse.error) for (const profile of ((profileResponse.data ?? []) as unknown) as Array<{ id: string; username?: string; display_name?: string }>) names.set(profile.id, profile.username ? `@${profile.username}` : profile.display_name ?? 'K-ssenger');
      }

      const reactionsByMoment = new Map<string, Reactions>();
      const momentIds = rows.map((row) => row.id);
      if (momentIds.length) {
        const rx = await getBackend().from('moment_reactions').select('moment_id,user_id,reaction').in('moment_id', momentIds);
        if (!rx.error) {
          for (const r of ((rx.data ?? []) as unknown) as Array<{ moment_id: string; user_id: string; reaction: string }>) {
            const bucket = reactionsByMoment.get(r.moment_id) ?? emptyReactions();
            bucket.total += 1;
            bucket.byEmoji[r.reaction] = (bucket.byEmoji[r.reaction] ?? 0) + 1;
            if (r.user_id === me) bucket.mine = r.reaction;
            reactionsByMoment.set(r.moment_id, bucket);
          }
        }
      }

      setMoments(rows.map((row) => ({
        ...row,
        author: row.author_id === me ? '@moi' : names.get(row.author_id) ?? 'Contact K-ssenger',
        isMine: row.author_id === me,
        reactions: reactionsByMoment.get(row.id) ?? emptyReactions(),
      })));
      setNotice((current) => (current === LOAD_ERROR ? '' : current));
    } catch { setMoments([]); setNotice(LOAD_ERROR); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void load(); }, []);

  const insertMoment = async (me: string, kind: MomentKind, mediaObjectId: string | null) => {
    const { error } = await getBackend().from('moments').insert({
      author_id: me, kind, caption: caption.trim() || null, media_url: mediaObjectId ? `media:${mediaObjectId}` : null,
      media_object_id: mediaObjectId, visibility, moderation_status: 'pending', expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    if (error) throw error;
  };

  const publishText = async () => {
    if (!canPublish) return;
    setPublishing(true); setNotice('');
    try {
      const me = userId || await getAuthenticatedUserId();
      await insertMoment(me, 'text', null);
      setCaption(''); setNotice('Moment texte publié pour 24 h.'); await load();
    } catch { setNotice('Publication refusée pour le moment.'); }
    finally { setPublishing(false); }
  };

  const publishMedia = async (kind: 'photo' | 'video') => {
    if (publishing) return;
    setPublishing(true); setNotice('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice('Autorise l’accès au média que tu choisis pour publier ce Moment.'); return; }
      const picked = await launchImageLibrarySafe({ mediaTypes: kind === 'photo' ? ['images'] : ['videos'], quality: 1, allowsEditing: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.uri) throw new Error('UNSUPPORTED_MOMENT_MEDIA');
      const mime = inferMomentMime(asset, kind);
      if (!mime) throw new Error('UNSUPPORTED_MOMENT_MEDIA');
      const { mediaId } = await uploadLocalMedia({ uri: asset.uri, mimeType: mime, byteSize: asset.fileSize ?? undefined, purpose: 'moment' });
      const me = userId || await getAuthenticatedUserId();
      await insertMoment(me, kind, mediaId);
      setCaption('');
      setNotice(visibility === 'public'
        ? `Moment ${kind === 'photo' ? 'photo' : 'vidéo'} envoyé. Il reste visible seulement par toi tant que la modération ne l’a pas validé.`
        : `Moment ${kind === 'photo' ? 'photo' : 'vidéo'} partagé avec tes ${visibility === 'close_friends' ? 'proches' : 'contacts'}.`);
      await load();
    } catch { setNotice('Publication média impossible. Formats autorisés : JPG/PNG/WebP ou MP4/MOV, 100 Mo maximum.'); }
    finally { setPublishing(false); }
  };

  const deleteMoment = async (moment: Moment) => {
    if (!moment.isMine) return;
    const { error } = await getBackend().from('moments').delete().eq('id', moment.id).eq('author_id', userId);
    if (error) { setNotice('Suppression du Moment refusée.'); return; }
    setMoments((current) => current.filter((item) => item.id !== moment.id)); setNotice('Moment supprimé.');
    onPinnedChange?.();
  };

  const togglePin = async (moment: Moment) => {
    if (!moment.isMine) return;
    const nextPinned = !moment.is_pinned;
    try {
      // one pin at a time
      if (nextPinned) await getBackend().from('moments').update({ is_pinned: false }).eq('author_id', userId).eq('is_pinned', true);
      await getBackend().from('moments').update({ is_pinned: nextPinned }).eq('id', moment.id).eq('author_id', userId);
      await getBackend().from('profiles').update({ pinned_moment_id: nextPinned ? moment.id : null, updated_at: new Date().toISOString() }).eq('id', userId);
      onPinnedChange?.();
      await load();
      setNotice(nextPinned ? 'Moment épinglé sur ton profil.' : 'Moment désépinglé.');
    } catch { setNotice('Impossible d’épingler ce Moment.'); }
  };

  const react = async (moment: Moment, emoji: string) => {
    const me = userId || await getAuthenticatedUserId();
    const current = moment.reactions.mine;
    // optimistic
    setMoments((list) => list.map((m) => {
      if (m.id !== moment.id) return m;
      const byEmoji = { ...m.reactions.byEmoji };
      if (current) byEmoji[current] = Math.max(0, (byEmoji[current] ?? 1) - 1);
      const removing = current === emoji;
      if (!removing) byEmoji[emoji] = (byEmoji[emoji] ?? 0) + 1;
      const total = Object.values(byEmoji).reduce((a, b) => a + b, 0);
      return { ...m, reactions: { total, byEmoji, mine: removing ? null : emoji } };
    }));
    try {
      if (current === emoji) {
        await getBackend().from('moment_reactions').delete().eq('moment_id', moment.id).eq('user_id', me);
      } else if (current) {
        await getBackend().from('moment_reactions').update({ reaction: emoji, created_at: new Date().toISOString() }).eq('moment_id', moment.id).eq('user_id', me);
      } else {
        await getBackend().from('moment_reactions').insert({ moment_id: moment.id, user_id: me, reaction: emoji });
      }
    } catch {
      setNotice('Réaction non enregistrée.');
      await load();
    }
  };

  const reportMoment = async (moment: Moment) => {
    if (moment.isMine) return;
    try {
      const me = userId || await getAuthenticatedUserId();
      const { error } = await getBackend().from('moment_reports').insert({ moment_id: moment.id, reporter_id: me, reason: 'other', details: 'Signalement depuis l’application K-ssenger.' });
      if (error && !String(error.message ?? '').toLowerCase().includes('duplicate')) throw error;
      setNotice('Signalement transmis à la modération.');
    } catch { setNotice('Impossible d’envoyer le signalement pour le moment.'); }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={palette.azure} /><Text style={styles.muted}>Chargement des Moments…</Text></View>;
  return (
    <View style={styles.container}>
      <ScreenHeader title="Moments" subtitle="Texte, photo ou vidéo · 24 h · média privé" />
      <FlatList
        data={moments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.azure} />}
        ListHeaderComponent={
          <View style={styles.composer}>
            <Text style={styles.title}>Partager un moment</Text>
            <View style={styles.row}>
              <View style={[styles.chip, styles.chipActive]}><Text style={[styles.chipText, styles.chipTextActive]}>✍️ Texte</Text></View>
              <Pressable disabled={publishing} onPress={() => void publishMedia('photo')} style={styles.chip}><Text style={styles.chipText}>📸 Photo</Text></Pressable>
              <Pressable disabled={publishing} onPress={() => void publishMedia('video')} style={styles.chip}><Text style={styles.chipText}>🎥 Vidéo</Text></Pressable>
            </View>
            <TextInput value={caption} onChangeText={setCaption} placeholder="Qu'est-ce qui se passe dans ta vie ?" placeholderTextColor={palette.inkFaint} style={styles.input} multiline maxLength={280} />
            <View style={styles.row}>
              {(['friends','close_friends','public'] as MomentVisibility[]).map((value) => (
                <Pressable key={value} onPress={() => setVisibility(value)} style={[styles.chip, visibility === value && styles.chipActive]}>
                  <Text style={[styles.chipText, visibility === value && styles.chipTextActive]}>{VISIBILITY_LABEL[value]}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable disabled={!canPublish} onPress={() => void publishText()} style={[styles.publish, !canPublish && styles.publishDisabled]}>
              {publishing ? <ActivityIndicator color={palette.white} /> : <Text style={styles.publishText}>Publier le texte pour 24 h</Text>}
            </Pressable>
            {!!notice && <Text style={styles.notice}>{notice}</Text>}
          </View>
        }
        ListEmptyComponent={<EmptyState icon="✨" title="Aucun Moment visible" hint="Publie le premier moment : il disparaît au bout de 24 h." />}
        renderItem={({ item }) => <MomentCard moment={item} onDelete={deleteMoment} onReport={reportMoment} onReact={react} onTogglePin={togglePin} />}
      />
    </View>
  );
}

function MomentVideo({ uri }: { uri: string }) { const player = useVideoPlayer(uri, (instance) => { instance.loop = true; }); return <VideoView player={player} style={styles.media} nativeControls allowsFullscreen contentFit="contain" />; }

function MomentMedia({ moment }: { moment: Moment }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!moment.media_object_id) return () => { active = false; };
    void getMediaDownload(moment.media_object_id).then((download) => { if (active) setSignedUrl(download.url); }).catch(() => { if (active) setSignedUrl(null); });
    return () => { active = false; };
  }, [moment.media_object_id]);
  const legacy = moment.media_url && /^https:\/\//i.test(moment.media_url) ? moment.media_url : null;
  const uri = signedUrl ?? legacy;
  if (moment.kind === 'photo' && uri) return <Image source={{ uri }} style={styles.media} resizeMode="cover" />;
  if (moment.kind === 'video' && uri) return <MomentVideo uri={uri} />;
  if (moment.kind !== 'text') return <View style={styles.textMoment}><ActivityIndicator color={palette.white} /><Text style={styles.textMomentCopy}>Média privé en chargement…</Text></View>;
  return <View style={styles.textMoment}><Text style={styles.textMomentIcon}>💭</Text><Text style={styles.textMomentCopy}>{moment.caption || 'Moment K-ssenger'}</Text></View>;
}

function MomentCard({ moment, onDelete, onReport, onReact, onTogglePin }: {
  moment: Moment;
  onDelete: (moment: Moment) => void;
  onReport: (moment: Moment) => void;
  onReact: (moment: Moment, emoji: string) => void;
  onTogglePin: (moment: Moment) => void;
}) {
  const remainingHours = Math.max(1, Math.ceil(Math.max(0, new Date(moment.expires_at).getTime() - Date.now()) / 3_600_000));
  return (
    <View style={[styles.card, moment.is_pinned && styles.cardPinned]}>
      <View style={styles.cardTop}>
        <Text style={styles.author}>{moment.author}</Text>
        <Text style={styles.time}>{moment.is_pinned ? '📌 épinglé' : `⏳ ${remainingHours} h`}</Text>
      </View>
      <MomentMedia moment={moment} />
      {moment.kind !== 'text' && !!moment.caption && <Text style={styles.mediaCaption}>{moment.caption}</Text>}
      <Text style={styles.visibility}>{VISIBILITY_LABEL[moment.visibility]}</Text>

      <View style={styles.reactionBar}>
        {MOMENT_REACTIONS.map((emoji) => {
          const count = moment.reactions.byEmoji[emoji] ?? 0;
          const active = moment.reactions.mine === emoji;
          return (
            <Pressable
              key={emoji}
              onPress={() => onReact(moment, emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Réagir ${emoji}`}
              style={[styles.reaction, active && styles.reactionActive]}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {count > 0 ? <Text style={[styles.reactionCount, active && styles.reactionCountActive]}>{count}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        {moment.isMine ? (
          <>
            <Pressable onPress={() => onTogglePin(moment)}><Text style={styles.action}>{moment.is_pinned ? '📌 Désépingler' : '📌 Épingler'}</Text></Pressable>
            <Pressable onPress={() => onDelete(moment)}><Text style={styles.deleteAction}>Supprimer</Text></Pressable>
          </>
        ) : (
          <Pressable onPress={() => onReport(moment)}><Text style={styles.action}>⚑ Signaler</Text></Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.sky },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: palette.sky },
  muted: { ...typo.meta },
  composer: { backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.hairline, padding: spacing.lg, marginBottom: spacing.md },
  title: { ...typo.heading },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.azureSoft },
  chipActive: { backgroundColor: palette.azure },
  chipText: { color: palette.inkSoft, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: palette.white },
  input: { marginTop: spacing.md, minHeight: 74, backgroundColor: palette.sky, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top', color: palette.ink },
  publish: { marginTop: spacing.md, minHeight: 46, backgroundColor: palette.azure, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  publishDisabled: { opacity: 0.45 },
  publishText: { color: palette.white, fontWeight: '900' },
  notice: { color: palette.azureDeep, fontSize: 11, fontWeight: '700', marginTop: spacing.md },
  list: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: palette.hairline },
  cardPinned: { borderColor: palette.brass, borderWidth: 1.5, backgroundColor: palette.brassSoft },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { ...typo.name },
  time: { ...typo.micro },
  textMoment: { marginTop: spacing.md, minHeight: 150, borderRadius: radius.md, backgroundColor: '#102c3d', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  textMomentIcon: { fontSize: 36 },
  textMomentCopy: { color: palette.white, fontSize: 20, lineHeight: 27, fontWeight: '800', textAlign: 'center', marginTop: spacing.md },
  media: { width: '100%', height: 320, marginTop: spacing.md, borderRadius: radius.md, backgroundColor: '#0c1d27' },
  mediaCaption: { color: palette.inkSoft, marginTop: spacing.sm, lineHeight: 18 },
  visibility: { marginTop: spacing.sm, ...typo.micro, fontWeight: '500' },
  reactionBar: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, flexWrap: 'wrap' },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline },
  reactionActive: { backgroundColor: palette.azureSoft, borderColor: palette.azure },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: '800', color: palette.inkSoft },
  reactionCountActive: { color: palette.azureDeep },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.lg, marginTop: spacing.md, alignItems: 'center' },
  action: { color: palette.inkSoft, fontWeight: '700', fontSize: 12 },
  deleteAction: { color: palette.danger, fontWeight: '800', fontSize: 12 },
});
