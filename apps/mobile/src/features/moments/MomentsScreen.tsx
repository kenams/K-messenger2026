import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type MomentVisibility = 'friends' | 'close_friends' | 'public';
type MomentKind = 'photo' | 'video' | 'text';

type Moment = {
  id: string;
  author: string;
  kind: MomentKind;
  caption: string;
  visibility: MomentVisibility;
  expiresInHours: number;
  reactions: number;
  replies: number;
};

const DEMO_MOMENTS: Moment[] = [
  { id: 'm1', author: '@sarah', kind: 'photo', caption: 'Petit café avant le boulot ☕', visibility: 'friends', expiresInHours: 17, reactions: 14, replies: 3 },
  { id: 'm2', author: '@mehdi', kind: 'video', caption: 'Training du soir 🔥', visibility: 'public', expiresInHours: 21, reactions: 31, replies: 5 },
  { id: 'm3', author: '@lisa', kind: 'text', caption: 'Qui sort ce soir ?', visibility: 'close_friends', expiresInHours: 8, reactions: 9, replies: 7 },
];

export function MomentsScreen() {
  const [moments, setMoments] = useState(DEMO_MOMENTS);
  const [caption, setCaption] = useState('');
  const [kind, setKind] = useState<MomentKind>('photo');
  const [visibility, setVisibility] = useState<MomentVisibility>('friends');

  const canPublish = useMemo(() => caption.trim().length > 0, [caption]);

  const publish = () => {
    if (!canPublish) return;
    setMoments((current) => [
      {
        id: `local-${Date.now()}`,
        author: '@moi',
        kind,
        caption: caption.trim(),
        visibility,
        expiresInHours: 24,
        reactions: 0,
        replies: 0,
      },
      ...current,
    ]);
    setCaption('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.composer}>
        <Text style={styles.title}>Partager un moment</Text>
        <Text style={styles.subtitle}>Photo, vidéo ou texte. Par défaut, un Moment disparaît après 24 h.</Text>

        <View style={styles.row}>
          {(['photo', 'video', 'text'] as MomentKind[]).map((value) => (
            <Pressable key={value} onPress={() => setKind(value)} style={[styles.chip, kind === value && styles.chipActive]}>
              <Text style={[styles.chipText, kind === value && styles.chipTextActive]}>{value === 'photo' ? '📸 Photo' : value === 'video' ? '🎥 Vidéo' : '✍️ Texte'}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Qu'est-ce qui se passe dans ta vie ?"
          style={styles.input}
          multiline
          maxLength={280}
        />

        <View style={styles.row}>
          {(['friends', 'close_friends', 'public'] as MomentVisibility[]).map((value) => (
            <Pressable key={value} onPress={() => setVisibility(value)} style={[styles.chip, visibility === value && styles.chipActive]}>
              <Text style={[styles.chipText, visibility === value && styles.chipTextActive]}>
                {value === 'friends' ? '👥 Amis' : value === 'close_friends' ? '💚 Proches' : '🌍 Public'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable disabled={!canPublish} onPress={publish} style={[styles.publish, !canPublish && styles.publishDisabled]}>
          <Text style={styles.publishText}>Publier le moment</Text>
        </Pressable>
      </View>

      <FlatList
        data={moments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <MomentCard moment={item} />}
      />
    </View>
  );
}

function MomentCard({ moment }: { moment: Moment }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.author}>{moment.author}</Text>
        <Text style={styles.time}>⏳ {moment.expiresInHours} h</Text>
      </View>
      <View style={styles.mediaMock}>
        <Text style={styles.mediaIcon}>{moment.kind === 'photo' ? '📸' : moment.kind === 'video' ? '▶️' : '💭'}</Text>
      </View>
      <Text style={styles.caption}>{moment.caption}</Text>
      <Text style={styles.visibility}>{moment.visibility === 'friends' ? '👥 Amis' : moment.visibility === 'close_friends' ? '💚 Proches' : '🌍 Public'}</Text>
      <View style={styles.actions}>
        <Text style={styles.action}>❤️ {moment.reactions}</Text>
        <Text style={styles.action}>💬 {moment.replies}</Text>
        <Text style={styles.action}>↗️ Partager</Text>
        <Text style={styles.action}>⚑ Signaler</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef6fb' },
  composer: { backgroundColor: '#fff', padding: 14, borderBottomWidth: 1, borderBottomColor: '#d9e7ef' },
  title: { fontSize: 20, fontWeight: '900', color: '#173448' },
  subtitle: { marginTop: 4, fontSize: 12, color: '#668293' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: '#edf5f9' },
  chipActive: { backgroundColor: '#238ac8' },
  chipText: { color: '#416679', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#fff' },
  input: { marginTop: 10, minHeight: 74, backgroundColor: '#f4f8fa', borderWidth: 1, borderColor: '#d9e7ef', borderRadius: 14, padding: 12, textAlignVertical: 'top' },
  publish: { marginTop: 12, backgroundColor: '#238ac8', paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  publishDisabled: { opacity: 0.45 },
  publishText: { color: '#fff', fontWeight: '900' },
  list: { padding: 12, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: '#e1edf3' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontWeight: '900', color: '#173448' },
  time: { color: '#718a99', fontSize: 11 },
  mediaMock: { marginTop: 10, height: 220, borderRadius: 16, backgroundColor: '#102c3d', alignItems: 'center', justifyContent: 'center' },
  mediaIcon: { fontSize: 52 },
  caption: { marginTop: 10, color: '#173448', fontSize: 15 },
  visibility: { marginTop: 6, color: '#668293', fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  action: { color: '#416679', fontWeight: '700', fontSize: 12 },
});
