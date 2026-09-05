import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { getBackend } from '../../lib/backend';
import { getAuthenticatedUserId } from '../../lib/realtime';

type MomentVisibility = 'friends' | 'close_friends' | 'public';
type MomentKind = 'photo' | 'video' | 'text';

type MomentRow = {
  id: string;
  author_id: string;
  kind: MomentKind;
  caption: string | null;
  media_url: string | null;
  visibility: MomentVisibility;
  expires_at: string;
  created_at: string;
};

type Moment = MomentRow & {
  author: string;
  isMine: boolean;
};

export function MomentsScreen() {
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
      const { data, error } = await getBackend()
        .from('moments')
        .select('id,author_id,kind,caption,media_url,visibility,expires_at,created_at')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = ((data ?? []) as unknown) as MomentRow[];
      const authorIds = [...new Set(rows.map((row) => row.author_id))];
      const names = new Map<string, string>();
      if (authorIds.length) {
        const profileResponse = await getBackend().from('profiles').select('id,username,display_name').in('id', authorIds);
        if (!profileResponse.error) {
          for (const profile of ((profileResponse.data ?? []) as unknown) as Array<{ id: string; username?: string; display_name?: string }>) {
            names.set(profile.id, profile.username ? `@${profile.username}` : profile.display_name ?? 'K-ssenger');
          }
        }
      }

      setMoments(rows.map((row) => ({
        ...row,
        author: row.author_id === me ? '@moi' : names.get(row.author_id) ?? 'Contact K-ssenger',
        isMine: row.author_id === me,
      })));
      setNotice('');
    } catch {
      setMoments([]);
      setNotice('Moments est momentanément indisponible.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const publish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setNotice('');
    try {
      const me = userId || await getAuthenticatedUserId();
      const { error } = await getBackend().from('moments').insert({
        author_id: me,
        kind: 'text',
        caption: caption.trim(),
        media_url: null,
        visibility,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setCaption('');
      setNotice('Moment publié pour 24 h. Il reste soumis aux règles de modération K-ssenger.');
      await load();
    } catch {
      setNotice('Publication refusée pour le moment.');
    } finally {
      setPublishing(false);
    }
  };

  const deleteMoment = async (moment: Moment) => {
    if (!moment.isMine) return;
    const { error } = await getBackend().from('moments').delete().eq('id', moment.id).eq('author_id', userId);
    if (error) {
      setNotice('Suppression du Moment refusée.');
      return;
    }
    setMoments((current) => current.filter((item) => item.id !== moment.id));
    setNotice('Moment supprimé.');
  };

  const reportMoment = async (moment: Moment) => {
    if (moment.isMine) return;
    try {
      const me = userId || await getAuthenticatedUserId();
      const { error } = await getBackend().from('moment_reports').insert({
        moment_id: moment.id,
        reporter_id: me,
        reason: 'other',
        details: 'Signalement depuis l’application K-ssenger.',
      });
      if (error && !String(error.message ?? '').toLowerCase().includes('duplicate')) throw error;
      setNotice('Signalement transmis à la modération.');
    } catch {
      setNotice('Impossible d’envoyer le signalement pour le moment.');
    }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator /><Text style={styles.muted}>Chargement des Moments…</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        <Text style={styles.title}>Partager un moment</Text>
        <Text style={styles.subtitle}>Les Moments texte expirent après 24 h. Les médias existants sont lus nativement ; la création photo/vidéo reste verrouillée tant que l’upload privé K-ssenger n’est pas disponible dans l’app.</Text>

        <View style={styles.row}>
          <View style={[styles.chip, styles.chipActive]}><Text style={[styles.chipText, styles.chipTextActive]}>✍️ Texte</Text></View>
          <View style={[styles.chip, styles.chipDisabled]}><Text style={styles.chipText}>📸 Photo</Text></View>
          <View style={[styles.chip, styles.chipDisabled]}><Text style={styles.chipText}>🎥 Vidéo</Text></View>
        </View>

        <TextInput value={caption} onChangeText={setCaption} placeholder="Qu'est-ce qui se passe dans ta vie ?" style={styles.input} multiline maxLength={280} />

        <View style={styles.row}>
          {(['friends', 'close_friends', 'public'] as MomentVisibility[]).map((value) => (
            <Pressable key={value} onPress={() => setVisibility(value)} style={[styles.chip, visibility === value && styles.chipActive]}>
              <Text style={[styles.chipText, visibility === value && styles.chipTextActive]}>{value === 'friends' ? '👥 Amis' : value === 'close_friends' ? '💚 Proches' : '🌍 Public'}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable disabled={!canPublish} onPress={() => void publish()} style={[styles.publish, !canPublish && styles.publishDisabled]}>
          {publishing ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishText}>Publier pour 24 h</Text>}
        </Pressable>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
      </View>

      <FlatList
        data={moments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        ListEmptyComponent={<Text style={styles.empty}>Aucun Moment visible pour le moment.</Text>}
        renderItem={({ item }) => <MomentCard moment={item} onDelete={deleteMoment} onReport={reportMoment} />}
      />
    </View>
  );
}

function MomentVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; });
  return <VideoView player={player} style={styles.media} nativeControls allowsFullscreen contentFit="contain" />;
}

function MomentMedia({ moment }: { moment: Moment }) {
  const validUrl = moment.media_url && /^https:\/\//i.test(moment.media_url) ? moment.media_url : null;
  if (moment.kind === 'photo' && validUrl) return <Image source={{ uri: validUrl }} style={styles.media} resizeMode="cover" />;
  if (moment.kind === 'video' && validUrl) return <MomentVideo uri={validUrl} />;
  return <View style={styles.textMoment}><Text style={styles.textMomentIcon}>💭</Text><Text style={styles.textMomentCopy}>{moment.caption || 'Moment K-ssenger'}</Text></View>;
}

function MomentCard({ moment, onDelete, onReport }: { moment: Moment; onDelete: (moment: Moment) => void; onReport: (moment: Moment) => void }) {
  const remainingMs = Math.max(0, new Date(moment.expires_at).getTime() - Date.now());
  const remainingHours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.author}>{moment.author}</Text>
        <Text style={styles.time}>⏳ {remainingHours} h</Text>
      </View>
      <MomentMedia moment={moment} />
      {moment.kind !== 'text' && !!moment.caption && <Text style={styles.mediaCaption}>{moment.caption}</Text>}
      <Text style={styles.visibility}>{moment.visibility === 'friends' ? '👥 Amis' : moment.visibility === 'close_friends' ? '💚 Proches' : '🌍 Public'}</Text>
      <View style={styles.actions}>
        {moment.isMine ? (
          <Pressable onPress={() => onDelete(moment)}><Text style={styles.deleteAction}>Supprimer</Text></Pressable>
        ) : (
          <Pressable onPress={() => onReport(moment)}><Text style={styles.action}>⚑ Signaler</Text></Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef6fb' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: '#668293' },
  composer: { backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#d9e7ef' }, title: { fontSize: 20, fontWeight: '900', color: '#173448' }, subtitle: { marginTop: 4, fontSize: 12, color: '#668293' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: '#edf5f9' }, chipActive: { backgroundColor: '#238ac8' }, chipDisabled: { opacity: 0.48 }, chipText: { color: '#416679', fontWeight: '700', fontSize: 12 }, chipTextActive: { color: '#fff' },
  input: { marginTop: 10, minHeight: 74, backgroundColor: '#f4f8fa', borderWidth: 1, borderColor: '#d9e7ef', borderRadius: 14, padding: 12, textAlignVertical: 'top' }, publish: { marginTop: 12, minHeight: 46, backgroundColor: '#238ac8', paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, publishDisabled: { opacity: 0.45 }, publishText: { color: '#fff', fontWeight: '900' }, notice: { color: '#326e94', fontSize: 11, fontWeight: '700', marginTop: 10 },
  list: { padding: 12, gap: 12, flexGrow: 1 }, empty: { color: '#718a99', textAlign: 'center', padding: 28 }, card: { backgroundColor: '#fff', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: '#e1edf3' }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, author: { fontWeight: '900', color: '#173448' }, time: { color: '#718a99', fontSize: 11 },
  textMoment: { marginTop: 10, minHeight: 150, borderRadius: 16, backgroundColor: '#102c3d', alignItems: 'center', justifyContent: 'center', padding: 22 }, textMomentIcon: { fontSize: 36 }, textMomentCopy: { color: '#fff', fontSize: 20, lineHeight: 27, fontWeight: '800', textAlign: 'center', marginTop: 10 }, media: { width: '100%', height: 320, marginTop: 10, borderRadius: 16, backgroundColor: '#0c1d27' }, mediaCaption: { color: '#35566a', marginTop: 9, lineHeight: 18 }, visibility: { marginTop: 8, color: '#668293', fontSize: 11 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }, action: { color: '#416679', fontWeight: '700', fontSize: 12 }, deleteAction: { color: '#b42318', fontWeight: '800', fontSize: 12 },
});
