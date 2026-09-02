import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Presence = 'online' | 'busy' | 'away' | 'offline';
type Contact = { id: string; name: string; handle: string; status: Presence; note?: string; favorite?: boolean };

const CONTACTS: Contact[] = [
  { id: '1', name: 'Sarah', handle: '@sarah', status: 'online', note: '🎵 SZA', favorite: true },
  { id: '2', name: 'Mehdi', handle: '@mehdi', status: 'online', note: '🚗 En route · 12 min', favorite: true },
  { id: '3', name: 'Lisa', handle: '@lisa', status: 'online', note: 'Disponible' },
  { id: '4', name: 'Chris', handle: '@chris', status: 'busy', note: 'Au travail' },
  { id: '5', name: 'Sofia', handle: '@sofia', status: 'away', note: 'Revient bientôt' },
  { id: '6', name: 'Bob', handle: '@bob', status: 'offline' }
];

const dot: Record<Presence, string> = { online: '🟢', busy: '🔴', away: '🟠', offline: '⚫' };

export default function App() {
  const [tab, setTab] = useState<'contacts' | 'chats' | 'map' | 'moments' | 'me'>('contacts');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Contact | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<string[]>(['Salut 👋', 'Bienvenue sur K-ssenger.']);

  const filtered = useMemo(() => CONTACTS.filter(c => c.name.toLowerCase().includes(search.toLowerCase())), [search]);

  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setSelected(null)}><Text style={styles.back}>‹</Text></TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatName}>{dot[selected.status]} {selected.name}</Text>
            <Text style={styles.muted}>🔒 E2EE · {selected.note ?? 'Disponible'}</Text>
          </View>
          <Text style={styles.headerAction}>📞</Text>
          <Text style={styles.headerAction}>📍</Text>
        </View>
        <ScrollView style={styles.chatBody} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.systemBubble}><Text style={styles.systemText}>Conversation privée sécurisée</Text></View>
          {messages.map((m, i) => (
            <View key={`${m}-${i}`} style={[styles.bubble, i % 2 ? styles.mine : styles.theirs]}>
              <Text style={styles.bubbleText}>{m}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.composer}>
          <TouchableOpacity><Text style={styles.plus}>＋</Text></TouchableOpacity>
          <TextInput value={message} onChangeText={setMessage} placeholder="Message..." style={styles.input} />
          <TouchableOpacity onPress={() => { if (message.trim()) { setMessages(v => [...v, message.trim()]); setMessage(''); } }}><Text style={styles.send}>➤</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMessages(v => [...v, '⚡ WIZZ envoyé !'])}><Text style={styles.wizz}>⚡</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.avatarText}>K</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>K-SSENGER</Text>
          <Text style={styles.name}>KAH 😎</Text>
          <Text style={styles.status}>🟢 Disponible · 🎵 Changes — 2Pac</Text>
        </View>
        <Text style={styles.headerAction}>⚙️</Text>
      </View>

      {tab === 'contacts' && (
        <ScrollView style={styles.content}>
          <TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un contact" style={styles.search} />
          <Section title="⭐ FAVORIS" contacts={filtered.filter(c => c.favorite)} onOpen={setSelected} />
          <Section title={`EN LIGNE — ${filtered.filter(c => c.status !== 'offline').length}`} contacts={filtered.filter(c => c.status !== 'offline' && !c.favorite)} onOpen={setSelected} />
          <Section title={`HORS LIGNE — ${filtered.filter(c => c.status === 'offline').length}`} contacts={filtered.filter(c => c.status === 'offline')} onOpen={setSelected} />
        </ScrollView>
      )}

      {tab === 'chats' && <Placeholder title="Chats" subtitle="Tes conversations récentes apparaîtront ici." icon="💬" />}
      {tab === 'map' && <Placeholder title="K-MAP" subtitle="Partage ta position uniquement quand tu le décides." icon="📍" action="👻 Ghost Mode" />}
      {tab === 'moments' && <Placeholder title="Moments" subtitle="Photos, vidéos et statuts éphémères de tes amis." icon="✨" />}
      {tab === 'me' && <Placeholder title="Mon profil" subtitle="Pseudo, statut, musique, sécurité et confidentialité." icon="😎" action="🔒 Sécurité" />}

      <View style={styles.tabs}>
        <Tab active={tab === 'contacts'} label="Contacts" icon="👥" onPress={() => setTab('contacts')} />
        <Tab active={tab === 'chats'} label="Chats" icon="💬" onPress={() => setTab('chats')} />
        <Tab active={tab === 'map'} label="K-Map" icon="📍" onPress={() => setTab('map')} />
        <Tab active={tab === 'moments'} label="Moments" icon="✨" onPress={() => setTab('moments')} />
        <Tab active={tab === 'me'} label="Moi" icon="🙂" onPress={() => setTab('me')} />
      </View>
    </SafeAreaView>
  );
}

function Section({ title, contacts, onOpen }: { title: string; contacts: Contact[]; onOpen: (c: Contact) => void }) {
  if (!contacts.length) return null;
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{contacts.map(c => (
    <TouchableOpacity key={c.id} style={styles.contact} onPress={() => onOpen(c)}>
      <View style={styles.contactAvatar}><Text style={styles.contactAvatarText}>{c.name[0]}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.contactName}>{dot[c.status]} {c.name}</Text><Text style={styles.muted}>{c.note ?? c.handle}</Text></View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  ))}</View>;
}

function Placeholder({ title, subtitle, icon, action }: { title: string; subtitle: string; icon: string; action?: string }) {
  return <View style={styles.placeholder}><Text style={styles.placeholderIcon}>{icon}</Text><Text style={styles.placeholderTitle}>{title}</Text><Text style={styles.placeholderText}>{subtitle}</Text>{action && <TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>{action}</Text></TouchableOpacity>}</View>;
}

function Tab({ active, label, icon, onPress }: { active: boolean; label: string; icon: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.tab} onPress={onPress}><Text style={styles.tabIcon}>{icon}</Text><Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef6fb' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d9e7ef' },
  avatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#4aa3df', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#b9e5ff' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '800' }, brand: { fontSize: 11, letterSpacing: 2.1, color: '#3d83b8', fontWeight: '800' }, name: { fontSize: 19, fontWeight: '800', color: '#173448', marginTop: 2 }, status: { fontSize: 12, color: '#517286', marginTop: 2 }, headerAction: { fontSize: 20, marginLeft: 10 },
  content: { flex: 1, paddingHorizontal: 14 }, search: { marginVertical: 14, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#d6e4ec' }, section: { marginBottom: 14 }, sectionTitle: { fontSize: 12, color: '#55778a', fontWeight: '800', marginBottom: 6, marginLeft: 4 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 12, borderRadius: 16, marginBottom: 7, borderWidth: 1, borderColor: '#e1edf3' }, contactAvatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#dff2ff', alignItems: 'center', justifyContent: 'center' }, contactAvatarText: { fontWeight: '800', color: '#2e76a8', fontSize: 18 }, contactName: { fontWeight: '750', color: '#173448', fontSize: 15 }, muted: { color: '#718a99', fontSize: 12, marginTop: 2 }, chevron: { fontSize: 28, color: '#91a7b5' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d9e7ef', paddingTop: 8, paddingBottom: 10 }, tab: { flex: 1, alignItems: 'center' }, tabIcon: { fontSize: 20 }, tabLabel: { fontSize: 10, color: '#8197a4', marginTop: 2 }, tabActive: { color: '#2788c4', fontWeight: '800' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 }, placeholderIcon: { fontSize: 60 }, placeholderTitle: { fontSize: 28, fontWeight: '900', color: '#173448', marginTop: 12 }, placeholderText: { textAlign: 'center', color: '#668293', fontSize: 15, marginTop: 8, lineHeight: 21 }, primary: { backgroundColor: '#238ac8', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 18 }, primaryText: { color: '#fff', fontWeight: '800' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d9e7ef' }, back: { fontSize: 38, color: '#238ac8', lineHeight: 40 }, chatName: { fontWeight: '850', fontSize: 17, color: '#173448' }, chatBody: { flex: 1, padding: 14 }, systemBubble: { alignSelf: 'center', backgroundColor: '#dfeef6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginVertical: 12 }, systemText: { fontSize: 11, color: '#597484' }, bubble: { maxWidth: '80%', padding: 11, borderRadius: 16, marginBottom: 8 }, mine: { alignSelf: 'flex-end', backgroundColor: '#caecff' }, theirs: { alignSelf: 'flex-start', backgroundColor: '#fff' }, bubbleText: { color: '#173448', fontSize: 15 }, composer: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d9e7ef', padding: 10 }, plus: { fontSize: 28, color: '#238ac8' }, input: { flex: 1, backgroundColor: '#edf5f9', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }, send: { fontSize: 22, color: '#238ac8' }, wizz: { fontSize: 26 }
});
