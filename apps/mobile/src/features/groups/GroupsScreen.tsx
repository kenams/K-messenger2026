import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const groups = [
  { id: 'g1', name: 'Les anciens 😎', members: 8, online: 5, last: 'Sarah: ce soir 21h ?', badge: 3 },
  { id: 'g2', name: 'ADF Crew 💻', members: 12, online: 7, last: 'Chris: migration terminée', badge: 0 },
  { id: 'g3', name: 'Famille ❤️', members: 6, online: 2, last: 'Maman: appelez-moi', badge: 1 },
];

export function GroupsScreen() {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View><Text style={styles.eyebrow}>MES GROUPES</Text><Text style={styles.title}>Des salons vivants, en mieux.</Text></View>
        <TouchableOpacity style={styles.newBtn}><Text style={styles.newText}>＋</Text></TouchableOpacity>
      </View>
      <View style={styles.quickRow}>
        <Quick icon="⚡" label="K-Pulse groupe" />
        <Quick icon="🎵" label="Playlist" />
        <Quick icon="📍" label="Se rejoindre" />
      </View>
      {groups.map((g) => (
        <TouchableOpacity key={g.id} style={styles.card} accessibilityRole="button">
          <View style={styles.avatar}><Text style={styles.avatarText}>{g.name.slice(0, 2)}</Text></View>
          <View style={styles.flex}>
            <View style={styles.row}><Text style={styles.name}>{g.name}</Text>{g.badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{g.badge}</Text></View>}</View>
            <Text style={styles.meta}>🟢 {g.online} en ligne · {g.members} membres</Text>
            <Text style={styles.last} numberOfLines={1}>{g.last}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
      <View style={styles.note}><Text style={styles.noteTitle}>💡 ADN K-ssenger</Text><Text style={styles.noteText}>Les groupes gardent pseudos, présence, musique, K-Pulse, appels et Moments partagés. Les administrateurs gèrent invitations, rôles, mute et bannissement.</Text></View>
    </ScrollView>
  );
}

function Quick({ icon, label }: { icon: string; label: string }) {
  return <TouchableOpacity style={styles.quick}><Text style={styles.quickIcon}>{icon}</Text><Text style={styles.quickLabel}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingBottom: 30 }, flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, eyebrow: { fontSize: 11, letterSpacing: 1.5, color: '#4d86aa', fontWeight: '900' }, title: { color: '#173448', fontSize: 20, fontWeight: '900', marginTop: 3 }, newBtn: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#2189c5', alignItems: 'center', justifyContent: 'center' }, newText: { color: '#fff', fontSize: 28 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 }, quick: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e9f2', borderRadius: 16, padding: 10, alignItems: 'center' }, quickIcon: { fontSize: 21 }, quickLabel: { color: '#4c7187', fontSize: 10, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 18, padding: 12, marginBottom: 9 }, avatar: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#dff2ff', borderWidth: 2, borderColor: '#7dc7ed', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#2879a8', fontWeight: '900' }, name: { color: '#173448', fontSize: 15, fontWeight: '900', flexShrink: 1 }, meta: { color: '#5d8298', fontSize: 11, marginTop: 3 }, last: { color: '#7893a3', fontSize: 12, marginTop: 4 }, badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: '#208dca', alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' }, chevron: { color: '#91a8b6', fontSize: 28 },
  note: { marginTop: 8, padding: 14, borderRadius: 17, backgroundColor: '#e8f7ff', borderWidth: 1, borderColor: '#b8dcf0' }, noteTitle: { color: '#2f7199', fontWeight: '900' }, noteText: { color: '#5f8093', fontSize: 12, lineHeight: 18, marginTop: 5 },
});
