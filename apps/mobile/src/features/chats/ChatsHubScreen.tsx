import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GroupsScreen } from '../groups/GroupsScreen';

const chats = [
  { id: '1', name: 'Sαяαн ✨', presence: '🟢', preview: 'T’es où ? 😂', time: '23:08', badge: 2, music: '🎵 SZA — Snooze' },
  { id: '2', name: 'M3HDI 🚗', presence: '🟢', preview: 'J’arrive dans 12 min', time: '22:54', badge: 0, music: '🎵 Ninho — Jefe' },
  { id: '3', name: 'Sofia ☀️', presence: '🟠', preview: 'À demain !', time: '21:17', badge: 0, music: '' },
];

export function ChatsHubScreen() {
  const [mode, setMode] = useState<'private' | 'groups'>('private');
  if (mode === 'groups') {
    return <View style={styles.fill}><Segment mode={mode} setMode={setMode} /><GroupsScreen /></View>;
  }
  return (
    <View style={styles.fill}>
      <Segment mode={mode} setMode={setMode} />
      <ScrollView contentContainerStyle={styles.content}>
        {chats.map((chat) => (
          <TouchableOpacity key={chat.id} style={styles.chat} accessibilityRole="button">
            <View style={styles.avatar}><Text style={styles.avatarText}>{chat.name[0]}</Text><Text style={styles.presenceDot}>{chat.presence}</Text></View>
            <View style={styles.flex}><Text style={styles.name}>{chat.name}</Text><Text style={styles.preview} numberOfLines={1}>{chat.preview}</Text>{!!chat.music && <Text style={styles.music} numberOfLines={1}>{chat.music}</Text>}</View>
            <View style={styles.right}><Text style={styles.time}>{chat.time}</Text>{chat.badge > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{chat.badge}</Text></View>}</View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function Segment({ mode, setMode }: { mode: 'private' | 'groups'; setMode: (mode: 'private' | 'groups') => void }) {
  return <View style={styles.segmentWrap}><TouchableOpacity style={[styles.segment, mode === 'private' && styles.segmentActive]} onPress={() => setMode('private')}><Text style={[styles.segmentText, mode === 'private' && styles.segmentTextActive]}>💬 Privés</Text></TouchableOpacity><TouchableOpacity style={[styles.segment, mode === 'groups' && styles.segmentActive]} onPress={() => setMode('groups')}><Text style={[styles.segmentText, mode === 'groups' && styles.segmentTextActive]}>👥 Groupes</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 }, flex: { flex: 1 }, content: { padding: 14 }, segmentWrap: { flexDirection: 'row', margin: 14, padding: 4, borderRadius: 16, backgroundColor: '#dcecf5' }, segment: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' }, segmentActive: { backgroundColor: '#fff' }, segmentText: { color: '#618397', fontWeight: '800' }, segmentTextActive: { color: '#227eB4' }, chat: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginBottom: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2' }, avatar: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#e3f4fd', alignItems: 'center', justifyContent: 'center', position: 'relative' }, avatarText: { color: '#287aa8', fontSize: 19, fontWeight: '900' }, presenceDot: { position: 'absolute', right: -3, bottom: -3, fontSize: 12 }, name: { color: '#173448', fontSize: 15, fontWeight: '900' }, preview: { color: '#627f90', fontSize: 12, marginTop: 3 }, music: { color: '#3987b6', fontSize: 10, marginTop: 4, fontStyle: 'italic' }, right: { alignItems: 'flex-end', minWidth: 42 }, time: { color: '#8aa0ad', fontSize: 10 }, badge: { marginTop: 8, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: '#238ac8', alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' } });