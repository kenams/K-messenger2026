import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export type Presence = 'online' | 'busy' | 'away' | 'invisible' | 'offline';
export type Contact = {
  id: string;
  displayName: string;
  nickname: string;
  handle: string;
  presence: Presence;
  statusMessage?: string;
  nowPlaying?: string;
  favorite?: boolean;
  group: 'Favoris' | 'Amis' | 'Travail' | 'Famille';
};

const contacts: Contact[] = [
  { id: '1', displayName: 'Sarah', nickname: 'Sαяαн ✨', handle: '@sarah', presence: 'online', statusMessage: 'ce soir on bouge ?', nowPlaying: 'SZA — Snooze', favorite: true, group: 'Favoris' },
  { id: '2', displayName: 'Mehdi', nickname: 'M3HDI 🚗', handle: '@mehdi', presence: 'online', statusMessage: 'en route', nowPlaying: 'Ninho — Jefe', favorite: true, group: 'Favoris' },
  { id: '3', displayName: 'Lisa', nickname: 'Liisa ♥', handle: '@lisa', presence: 'online', statusMessage: 'Disponible', nowPlaying: 'Aya Nakamura — Djadja', group: 'Amis' },
  { id: '4', displayName: 'Chris', nickname: 'Chri$ | AFK', handle: '@chris', presence: 'busy', statusMessage: 'Au travail', group: 'Travail' },
  { id: '5', displayName: 'Sofia', nickname: 'Sofia ☀️', handle: '@sofia', presence: 'away', statusMessage: 'revient bientôt', group: 'Amis' },
  { id: '6', displayName: 'Bob', nickname: 'B0B', handle: '@bob', presence: 'offline', statusMessage: 'À demain', group: 'Travail' },
];

const presenceIcon: Record<Presence, string> = {
  online: '🟢', busy: '🔴', away: '🟠', invisible: '👻', offline: '⚫',
};

export function MsnContactsScreen({ onOpen }: { onOpen: (contact: Contact) => void }) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => contacts.filter((c) => `${c.displayName} ${c.nickname} ${c.handle}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const onlineCount = filtered.filter((c) => c.presence !== 'offline').length;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.loginToast}>
        <Text style={styles.loginIcon}>🟢</Text>
        <View style={styles.flex}><Text style={styles.loginTitle}>Sarah vient de se connecter</Text><Text style={styles.loginSub}>Il y a quelques secondes · ⚡ K-Pulse</Text></View>
      </View>

      <View style={styles.toolbar}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un contact, pseudo..." placeholderTextColor="#7690a0" style={styles.search} />
        <TouchableOpacity style={styles.add}><Text style={styles.addText}>＋</Text></TouchableOpacity>
      </View>
      <Text style={styles.counter}>{onlineCount} en ligne · {filtered.length} contacts</Text>

      {(['Favoris', 'Amis', 'Travail', 'Famille'] as const).map((group) => {
        const items = filtered.filter((c) => c.group === group);
        if (!items.length) return null;
        const isCollapsed = collapsed[group];
        return (
          <View key={group} style={styles.group}>
            <TouchableOpacity style={styles.groupHeader} onPress={() => setCollapsed((v) => ({ ...v, [group]: !v[group] }))}>
              <Text style={styles.groupTitle}>{isCollapsed ? '▸' : '▾'} {group.toUpperCase()}</Text>
              <Text style={styles.groupCount}>{items.filter((c) => c.presence !== 'offline').length}/{items.length}</Text>
            </TouchableOpacity>
            {!isCollapsed && items.map((contact) => (
              <TouchableOpacity key={contact.id} style={styles.contact} onPress={() => onOpen(contact)} accessibilityRole="button">
                <View style={[styles.avatar, contact.presence === 'online' && styles.avatarOnline]}><Text style={styles.avatarText}>{contact.displayName[0]}</Text></View>
                <View style={styles.flex}>
                  <View style={styles.nameRow}><Text style={styles.presence}>{presenceIcon[contact.presence]}</Text><Text style={styles.nickname} numberOfLines={1}>{contact.nickname}</Text>{contact.favorite && <Text> ⭐</Text>}</View>
                  {!!contact.statusMessage && <Text style={styles.status} numberOfLines={1}>{contact.statusMessage}</Text>}
                  {!!contact.nowPlaying && <Text style={styles.music} numberOfLines={1}>🎵 {contact.nowPlaying}</Text>}
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 14, paddingBottom: 28 }, flex: { flex: 1 },
  loginToast: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 1, borderColor: '#a9d8f3', backgroundColor: '#e8f7ff', padding: 12, marginBottom: 12 },
  loginIcon: { fontSize: 22 }, loginTitle: { color: '#173448', fontWeight: '800' }, loginSub: { color: '#58809a', marginTop: 2, fontSize: 11 },
  toolbar: { flexDirection: 'row', gap: 9, alignItems: 'center' }, search: { flex: 1, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#d6e8f2', paddingHorizontal: 15, paddingVertical: 12, color: '#173448' },
  add: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5' }, addText: { color: '#fff', fontSize: 27, lineHeight: 30 }, counter: { marginTop: 8, marginLeft: 5, color: '#7893a3', fontSize: 11 },
  group: { marginTop: 14, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.70)', borderWidth: 1, borderColor: '#daeaf3' },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#dff1fb' }, groupTitle: { fontSize: 11, letterSpacing: 1, color: '#326e94', fontWeight: '900' }, groupCount: { color: '#5b8098', fontSize: 11, fontWeight: '700' },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderTopWidth: 1, borderTopColor: '#edf4f7' }, avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dcecf5', borderWidth: 2, borderColor: '#c2d7e3' }, avatarOnline: { borderColor: '#65c568', backgroundColor: '#e7f8ed' }, avatarText: { color: '#276b93', fontSize: 18, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center' }, presence: { fontSize: 10, marginRight: 5 }, nickname: { color: '#173448', fontSize: 15, fontWeight: '800', maxWidth: '82%' }, status: { color: '#668696', marginTop: 2, fontSize: 12 }, music: { color: '#3987b6', marginTop: 3, fontSize: 11, fontStyle: 'italic' }, chevron: { fontSize: 28, color: '#8fa7b5' },
});
