import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { emitAck, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

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

type ContactResponse = {
  ok: boolean;
  contacts?: Array<{
    contact_id: string;
    favorite: boolean;
    profiles: {
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      custom_status: string | null;
      presence: Presence;
    };
  }>;
  error?: string;
};

type SearchResponse = {
  ok: boolean;
  profiles?: Array<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    custom_status: string | null;
    presence: Presence;
  }>;
  error?: string;
};

type RequestsResponse = {
  ok: boolean;
  requests?: Array<{ id: string; sender_id: string; recipient_id: string; status: string }>;
};

const presenceIcon: Record<Presence, string> = {
  online: '🟢', busy: '🔴', away: '🟠', invisible: '👻', offline: '⚫',
};

export function MsnContactsScreen({ onOpen }: { onOpen: (contact: Contact) => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResponse['profiles']>([]);
  const [requests, setRequests] = useState<RequestsResponse['requests']>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [error, setError] = useState('');

  const loadContacts = async (client: Socket) => {
    const response = await emitAck<ContactResponse>(client, 'contacts:list');
    if (!response.ok) throw new Error(response.error ?? 'CONTACTS_FAILED');
    setContacts((response.contacts ?? []).map((row) => ({
      id: row.profiles.id,
      displayName: row.profiles.display_name,
      nickname: row.profiles.display_name,
      handle: `@${row.profiles.username}`,
      presence: row.profiles.presence,
      statusMessage: row.profiles.custom_status ?? undefined,
      favorite: row.favorite,
      group: row.favorite ? 'Favoris' : 'Amis',
    })));
  };

  const loadRequests = async (client: Socket) => {
    const response = await emitAck<RequestsResponse>(client, 'contacts:requests');
    if (response.ok) setRequests(response.requests ?? []);
  };

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setError('Serveur temps réel K-ssenger non configuré pour ce build.');
      return;
    }

    let active = true;
    let current: Socket | null = null;

    void getRealtimeSocket().then(async (client) => {
      if (!active) return;
      current = client;
      setSocket(client);

      const refresh = () => {
        void loadContacts(client).catch(() => setError('Impossible de charger les contacts.'));
        void loadRequests(client);
      };
      const onPresence = ({ userId, status }: { userId: string; status: Presence }) => {
        setContacts((items) => items.map((item) => item.id === userId ? { ...item, presence: status } : item));
      };
      const onRequest = () => void loadRequests(client);

      client.on('connect', refresh);
      client.on('presence:changed', onPresence);
      client.on('presence:login', onPresence);
      client.on('contact:request', onRequest);
      client.on('contact:accepted', refresh);
      client.on('contact:removed', refresh);

      try {
        await Promise.all([loadContacts(client), loadRequests(client)]);
        if (active) setError('');
      } catch {
        if (active) setError('Connexion aux contacts K-ssenger impossible.');
      } finally {
        if (active) setLoading(false);
      }

      return () => {
        client.off('connect', refresh);
        client.off('presence:changed', onPresence);
        client.off('presence:login', onPresence);
        client.off('contact:request', onRequest);
        client.off('contact:accepted', refresh);
        client.off('contact:removed', refresh);
      };
    }).catch(() => {
      if (active) {
        setLoading(false);
        setError('Connexion temps réel impossible.');
      }
    });

    return () => {
      active = false;
      current = null;
    };
  }, []);

  useEffect(() => {
    if (!socket || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void emitAck<SearchResponse>(socket, 'contacts:search', { query: search.trim() })
        .then((response) => setResults(response.ok ? (response.profiles ?? []) : []))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, socket]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) => `${c.displayName} ${c.nickname} ${c.handle}`.toLowerCase().includes(term));
  }, [contacts, search]);
  const onlineCount = filtered.filter((c) => c.presence !== 'offline').length;

  const requestContact = async (userId: string) => {
    if (!socket) return;
    const response = await emitAck<{ ok: boolean; error?: string }>(socket, 'contact:request', { userId });
    setError(response.ok ? 'Demande envoyée.' : 'Demande impossible.');
  };

  const acceptRequest = async (requestId: string) => {
    if (!socket) return;
    const response = await emitAck<{ ok: boolean }>(socket, 'contact:accept', { requestId });
    if (response.ok) {
      await Promise.all([loadContacts(socket), loadRequests(socket)]);
      setError('Contact ajouté.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text style={styles.counter}>Chargement de tes contacts…</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un contact ou @pseudo..." placeholderTextColor="#7690a0" style={styles.search} autoCapitalize="none" />
      </View>
      <Text style={styles.counter}>{onlineCount} en ligne · {filtered.length} contacts</Text>
      {!!error && <Text style={styles.notice}>{error}</Text>}

      {!!requests?.length && (
        <View style={styles.group}>
          <View style={styles.groupHeader}><Text style={styles.groupTitle}>DEMANDES</Text><Text style={styles.groupCount}>{requests.length}</Text></View>
          {requests.map((request) => (
            <View key={request.id} style={styles.contact}>
              <View style={styles.avatar}><Text style={styles.avatarText}>?</Text></View>
              <View style={styles.flex}><Text style={styles.nickname}>Nouvelle demande</Text><Text style={styles.status}>{request.sender_id}</Text></View>
              <TouchableOpacity style={styles.accept} onPress={() => void acceptRequest(request.id)}><Text style={styles.acceptText}>Accepter</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {search.trim().length >= 2 && !!results?.length && (
        <View style={styles.group}>
          <View style={styles.groupHeader}><Text style={styles.groupTitle}>UTILISATEURS</Text><Text style={styles.groupCount}>{results.length}</Text></View>
          {results.map((profile) => (
            <View key={profile.id} style={styles.contact}>
              <View style={[styles.avatar, profile.presence === 'online' && styles.avatarOnline]}><Text style={styles.avatarText}>{profile.display_name[0] ?? '?'}</Text></View>
              <View style={styles.flex}><Text style={styles.nickname}>{profile.display_name}</Text><Text style={styles.status}>@{profile.username}</Text></View>
              <TouchableOpacity style={styles.accept} onPress={() => void requestContact(profile.id)}><Text style={styles.acceptText}>Ajouter</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      )}

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
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}

      {!filtered.length && !search.trim() && <Text style={styles.empty}>Aucun contact pour le moment. Recherche un @pseudo pour commencer.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 14, paddingBottom: 28 }, flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  toolbar: { flexDirection: 'row', gap: 9, alignItems: 'center' }, search: { flex: 1, backgroundColor: '#fff', borderRadius: 17, borderWidth: 1, borderColor: '#d6e8f2', paddingHorizontal: 15, paddingVertical: 12, color: '#173448' },
  counter: { marginTop: 8, marginLeft: 5, color: '#7893a3', fontSize: 11 }, notice: { marginTop: 10, color: '#326e94', fontWeight: '700' }, empty: { marginTop: 30, textAlign: 'center', color: '#7893a3' },
  group: { marginTop: 14, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.70)', borderWidth: 1, borderColor: '#daeaf3' },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#dff1fb' }, groupTitle: { fontSize: 11, letterSpacing: 1, color: '#326e94', fontWeight: '900' }, groupCount: { color: '#5b8098', fontSize: 11, fontWeight: '700' },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderTopWidth: 1, borderTopColor: '#edf4f7' }, avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dcecf5', borderWidth: 2, borderColor: '#c2d7e3' }, avatarOnline: { borderColor: '#65c568', backgroundColor: '#e7f8ed' }, avatarText: { color: '#276b93', fontSize: 18, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center' }, presence: { fontSize: 10, marginRight: 5 }, nickname: { color: '#173448', fontSize: 15, fontWeight: '800', maxWidth: '82%' }, status: { color: '#668696', marginTop: 2, fontSize: 12 }, chevron: { fontSize: 28, color: '#8fa7b5' },
  accept: { backgroundColor: '#2189c5', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11 }, acceptText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});
