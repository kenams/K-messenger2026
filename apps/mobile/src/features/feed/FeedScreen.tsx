import React, { useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

export type FeedVideo = {
  id: string;
  author: string;
  caption: string;
  ageRating: 13 | 16 | 18;
  violence: 'none' | 'mild' | 'graphic';
  likes: number;
  comments: number;
};

const { height } = Dimensions.get('window');
const ITEM_HEIGHT = Math.max(520, height - 190);

const DEMO_VIDEOS: FeedVideo[] = [
  { id: 'v1', author: '@sarah', caption: 'Premier K-Clip ✨', ageRating: 13, violence: 'none', likes: 214, comments: 18 },
  { id: 'v2', author: '@mehdi', caption: 'Session sport 🔥', ageRating: 16, violence: 'mild', likes: 91, comments: 12 },
  { id: 'v3', author: '@reporter', caption: 'Images sensibles — actualité', ageRating: 18, violence: 'graphic', likes: 38, comments: 9 }
];

export function FeedScreen({ userAge = 18 }: { userAge?: number }) {
  const allowed = useMemo(() => DEMO_VIDEOS.filter(v => userAge >= v.ageRating), [userAge]);
  return (
    <FlatList
      data={allowed}
      keyExtractor={item => item.id}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      renderItem={({ item }) => <VideoCard video={item} />}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Aucune vidéo disponible</Text><Text style={styles.emptyText}>Le contenu visible dépend de ton âge et de tes réglages de sécurité.</Text></View>}
    />
  );
}

function VideoCard({ video }: { video: FeedVideo }) {
  const sensitive = video.violence === 'graphic';
  const [revealed, setRevealed] = useState(!sensitive);

  return (
    <View style={styles.card}>
      <View style={styles.videoMock}>
        {revealed ? (
          <>
            <Text style={styles.play}>▶</Text>
            <Text style={styles.demo}>Zone vidéo publique</Text>
          </>
        ) : (
          <View style={styles.warning}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <Text style={styles.warningTitle}>Contenu sensible</Text>
            <Text style={styles.warningText}>Cette vidéo a été signalée comme pouvant contenir des images violentes ou choquantes.</Text>
            <Pressable style={styles.revealButton} onPress={() => setRevealed(true)} accessibilityRole="button">
              <Text style={styles.revealText}>J’ai 18 ans ou plus · Afficher</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.overlay}>
        <View style={styles.meta}>
          <Text style={styles.author}>{video.author}</Text>
          <Text style={styles.caption}>{video.caption}</Text>
          <Text style={styles.rating}>🔞 {video.ageRating}+ {video.violence !== 'none' ? '· contenu sensible' : ''}</Text>
        </View>
        <View style={styles.actions}>
          <Action icon="❤️" label={String(video.likes)} />
          <Action icon="💬" label={String(video.comments)} />
          <Action icon="↗️" label="Partager" />
          <Action icon="⚑" label="Signaler" />
        </View>
      </View>
    </View>
  );
}

function Action({ icon, label }: { icon: string; label: string }) {
  return <Pressable style={styles.action} accessibilityRole="button"><Text style={styles.actionIcon}>{icon}</Text><Text style={styles.actionLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  card: { height: ITEM_HEIGHT, backgroundColor: '#07131c', position: 'relative' },
  videoMock: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#102c3d' },
  play: { fontSize: 58, color: '#fff' },
  demo: { color: '#cceeff', marginTop: 12, fontWeight: '700' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' },
  meta: { flex: 1, paddingRight: 12 },
  author: { color: '#fff', fontWeight: '900', fontSize: 17 },
  caption: { color: '#fff', marginTop: 6, fontSize: 14 },
  rating: { color: '#d5e4ec', marginTop: 8, fontSize: 11 },
  actions: { gap: 14, alignItems: 'center' },
  action: { alignItems: 'center', minWidth: 52 },
  actionIcon: { fontSize: 27 },
  actionLabel: { color: '#fff', fontSize: 10, marginTop: 2 },
  warning: { margin: 24, padding: 24, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', maxWidth: 420 },
  warningIcon: { fontSize: 42 },
  warningTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 8 },
  warningText: { color: '#e3edf3', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  revealButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, backgroundColor: '#fff' },
  revealText: { color: '#102c3d', fontWeight: '900' },
  empty: { flex: 1, minHeight: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: '#173448' },
  emptyText: { marginTop: 8, textAlign: 'center', color: '#668293' }
});
