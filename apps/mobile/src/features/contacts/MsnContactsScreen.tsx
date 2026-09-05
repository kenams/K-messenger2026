import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { getBackend } from '../../lib/backend';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

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
  group: string;
};

type ContactResponse = {
  ok: boolean;
  contacts?: Array<{
    contact_id: string;
    favorite: boolean;
    list_name: string;
    profiles: {
      id: string;
      username: string;
      display_name: string;
      nickname: string | null;
      avatar_url: string | null;
      custom_status: string | null;
      presence: Presence;
      now_playing_title: string | null;
      now_playing_artist: string | null;
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

type ContactRequest = { id: string; sender_id: string; recipient_id: string; status: string };
type RequestsResponse = { ok: boolean; requests?: ContactRequest[] };
type LoginNotifications = 'all_contacts' | 'favorites' | 'nobody';
type BlockedUser = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  blocked_at: string;
};
type BlockedResponse = { ok: boolean; blocked?: BlockedUser[]; error?: string };
type SimpleAck = { ok: boolean; error?: string };

const presenceIcon: Record<Presence, string> = {
  online: '🟢', busy: '🔴', away: '🟠', invisible: '👻', offline: '⚫',
};

export function MsnContactsScreen({ onOpen }: { onOpen: (contact: Contact) => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResponse['profiles']>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [blockedCollapsed, setBlockedCollapsed] = useState(true);
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [notice, setNotice] = useState('');
  const [managingContactId, setManagingContactId] = useState<string | null>(null);
  const contactsRef = useRef<Contact[]>([]);
  const loginNotificationsRef = useRef<LoginNotifications>('favorites');

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const loadContacts = async (client: Socket) => {
    const response = await emitAck<ContactResponse>(client, 'contacts:list');
    if (!response.ok) throw new Error(response.error ?? 'CONTACTS_FAILED');
    setContacts((response.contacts ?? []).map((row) => {
      const nowPlaying = row.profiles.now_playing_title
        ? `${row.profiles.now_playing_artist ? `${row.profiles.now_playing_artist} — ` : ''}${row.profiles.now_playing_title}`
        : undefined;
      return {
        id: row.profiles.id,
        displayName: row.profiles.display_name,
        nickname: row.profiles.nickname ?? row.profiles.display_name,
        handle: `@${row.profiles.username}`,
        presence: row.profiles.presence,
        statusMessage: row.profiles.custom_status ?? undefined,
        nowPlaying,
        favorite: row.favorite,
        group: row.favorite ? 'Favoris' : (row.list_name || 'Amis'),
      };
    }));
  };

  const loadRequests = async (client: Socket) => {
    const response = await emitAck<RequestsResponse>(client, 'contacts:requests');
    if (response.ok) setRequests(response.requests ?? []);
  };

  const loadBlockedUsers = async (client: Socket) => {
    const response = await emitAck<BlockedResponse>(client, 'contacts:blocked');
    if (!response.ok) throw new Error(response.error ?? 'BLOCKED_CONTACTS_FAILED');
    setBlockedUsers(response.blocked ?? []);
  };

  const loadLoginNotificationPreference = async (userId: string) => {
    const { data } = await getBackend()
      .from('privacy_settings')
      .select('login_notifications')
      .eq('user_id', userId)
      .maybeSingle();
    const value = (data as { login_notifications?: LoginNotifications } | null)?.login_notifications;
    if (value === 'all_contacts' || value === 'favorites' || value === 'nobody') {
      loginNotificationsRef.current = value;
    }
  };

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setNotice('Serveur temps réel K-ssenger non configuré pour ce build.');
      return;
    }

    let active = true;
    let cleanupListeners: (() => void) | null = null;

    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, userId]) => {
      if (!active) return;
      setSocket(client);
      setCurrentUserId(userId);
      void loadLoginNotificationPreference(userId);

      const refresh = () => {
        void loadContacts(client).catch(() => setNotice('Impossible de charger les contacts.'));
        void loadRequests(client);
        void loadBlockedUsers(client).catch(() => setNotice('Impossible de charger les personnes bloquées.'));
      };
      const onPresence = ({ userId: changedUserId, status }: { userId: string; status: Presence }) => {
        setContacts((items) => items.map((item) => item.id === changedUserId ? { ...item, presence: status } : item));
      };
      const onPresenceLogin = ({ userId: changedUserId, status }: { userId: string; status: Presence }) => {
        onPresence({ userId: changedUserId, status });
        const sender = contactsRef.current.find((item) => item.id === changedUserId);
        const preference = loginNotificationsRef.current;
        const shouldNotify = preference === 'all_contacts' || (preference === 'favorites' && sender?.favorite);
        if (sender && shouldNotify) setNotice(`🟢 ${sender.nickname} vient de se connecter.`);
      };
      const onRequest = () => void loadRequests(client);
      const onBlockedChanged = () => {
        void Promise.all([loadContacts(client), loadRequests(client), loadBlockedUsers(client)])
          .catch(() => setNotice('Synchronisation de la liste de blocage impossible.'));
      };
      const onKPulse = ({ senderId }: { senderId: string }) => {
        const sender = contactsRef.current.find((item) => item.id === senderId);
        setNotice(`⚡ K-Pulse reçu${sender ? ` de ${sender.nickname}` : ''} !`);
      };

      client.on('connect', refresh);
      client.on('presence:changed', onPresence);
      client.on('presence:login', onPresenceLogin);
      client.on('contact:request', onRequest);
      client.on('contact:accepted', refresh);
      client.on('contact:declined', onRequest);
      client.on('contact:cancelled', onRequest);
      client.on('contact:removed', refresh);
      client.on('contact:blocked', onBlockedChanged);
      client.on('contact:unblocked', onBlockedChanged);
      client.on('kpulse:receive', onKPulse);
      cleanupListeners = () => {
        client.off('connect', refresh);
        client.off('presence:changed', onPresence);
        client.off('presence:login', onPresenceLogin);
        client.off('contact:request', onRequest);
        client.off('contact:accepted', refresh);
        client.off('contact:declined', onRequest);
        client.off('contact:cancelled', onRequest);
        client.off('contact:removed', refresh);
        client.off('contact:blocked', onBlockedChanged);
        client.off('contact:unblocked', onBlockedChanged);
        client.off('kpulse:receive', onKPulse);
      };

      try {
        await Promise.all([loadContacts(client), loadRequests(client), loadBlockedUsers(client)]);
        if (active) setNotice('');
      } catch {
        if (active) setNotice('Connexion aux contacts K-ssenger impossible.');
      } finally {
        if (active) setLoading(false);
      }
    }).catch(() => {
      if (active) {
        setLoading(false);
        setNotice('Connexion temps réel impossible.');
      }
    });

    return () => {
      active = false;
      cleanupListeners?.();
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
    return contacts.filter((c) => `${c.displayName} ${c.nickname} ${c.handle} ${c.statusMessage ?? ''} ${c.nowPlaying ?? ''}`.toLowerCase().includes(term));
  }, [contacts, search]);
  const groups = useMemo(() => Array.from(new Set(filtered.map((contact) => contact.group))), [filtered]);
  const incomingRequests = requests.filter((request) => request.recipient_id === currentUserId);
  const outgoingRequests = requests.filter((request) => request.sender_id === currentUserId);
  const onlineCount = filtered.filter((c) => c.presence !== 'offline').length;

  const requestContact = async (userId: string) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:request', { userId });
    setNotice(response.ok ? 'Demande envoyée.' : 'Demande impossible.');
    if (response.ok) await loadRequests(socket);
  };

  const acceptRequest = async (requestId: string) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:accept', { requestId });
    if (response.ok) {
      await Promise.all([loadContacts(socket), loadRequests(socket)]);
      setNotice('Contact ajouté.');
    } else {
      setNotice('Impossible d’accepter cette demande.');
    }
  };

  const declineRequest = async (requestId: string) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:decline', { requestId });
    if (response.ok) {
      await loadRequests(socket);
      setNotice('Demande refusée.');
    } else {
      setNotice('Impossible de refuser cette demande.');
    }
  };

  const cancelRequest = async (requestId: string) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:cancel', { requestId });
    if (response.ok) {
      await loadRequests(socket);
      setNotice('Demande annulée.');
    } else {
      setNotice('Impossible d’annuler cette demande.');
    }
  };

  const toggleFavorite = async (contact: Contact) => {
    if (!socket) return;
    const nextFavorite = !contact.favorite;
    const response = await emitAck<SimpleAck>(socket, 'contact:favorite', {
      userId: contact.id,
      favorite: nextFavorite,
    });
    if (!response.ok) {
      setNotice('Impossible de modifier ce favori.');
      return;
    }
    await loadContacts(socket);
    setNotice(nextFavorite ? `⭐ ${contact.nickname} ajouté aux Favoris.` : `${contact.nickname} retiré des Favoris.`);
  };

  const sendKPulse = async (contact: Contact) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'kpulse:send', { recipientId: contact.id, variant: 'classic' });
    setNotice(response.ok ? `⚡ K-Pulse envoyé à ${contact.displayName}.` : 'K-Pulse refusé ou limité.');
  };

  const removeContact = async (contact: Contact) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:remove', { userId: contact.id });
    if (!response.ok) {
      setNotice('Impossible de retirer ce contact.');
      return;
    }
    setManagingContactId(null);
    await loadContacts(socket);
    setNotice(`${contact.nickname} a été retiré de tes contacts.`);
  };

  const blockContact = async (contact: Contact) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:block', { userId: contact.id });
    if (!response.ok) {
      setNotice('Blocage impossible.');
      return;
    }
    setManagingContactId(null);
    await Promise.all([loadContacts(socket), loadRequests(socket), loadBlockedUsers(socket)]);
    setNotice(`${contact.nickname} est bloqué. Les interactions et partages actifs sont coupés.`);
  };

  const unblockContact = async (blocked: BlockedUser) => {
    if (!socket) return;
    const response = await emitAck<SimpleAck>(socket, 'contact:unblock', { userId: blocked.id });
    if (!response.ok) {
      setNotice('Déblocage impossible.');
      return;
    }
    await loadBlockedUsers(socket);
    setNotice(`${blocked.display_name} est débloqué. Il n’a pas été réajouté automatiquement à tes contacts.`);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text style={styles.counter}>Chargement de tes contacts…</Text></View>;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <TextInput value={search} onChangeText={setSearch} placeholder="Rechercher un contact ou @pseudo..." placeholderTextColor="#7690a0" style={styles.search} autoCapitalize="none" />
      </View>
      <Text style={styles.counter}>{onlineCount} en ligne · {filtered.length} contacts</Text>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      {!!incomingRequests.length && (
        <View style={styles.group}>
          <View style={styles.groupHeader}><Text style={styles.groupTitle}>DEMANDES REÇUES</Text><Text style={styles.groupCount}>{incomingRequests.length}</Text></View>
          {incomingRequests.map((request) => (
            <View key={request.id} style={styles.contact}>
              <View style={styles.avatar}><Text style={styles.avatarText}>?</Text></View>
              <View style={styles.flex}><Text style={styles.nickname}>Nouvelle demande</Text><Text style={styles.status}>{request.sender_id}</Text></View>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => void declineRequest(request.id)}><Text style={styles.secondaryActionText}>Refuser</Text></TouchableOpacity>
              <TouchableOpacity style={styles.accept} onPress={() => void acceptRequest(request.id)}><Text style={styles.acceptText}>Accepter</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {!!outgoingRequests.length && (
        <View style={styles.group}>
          <View style={styles.groupHeader}><Text style={styles.groupTitle}>DEMANDES ENVOYÉES</Text><Text style={styles.groupCount}>{outgoingRequests.length}</Text></View>
          {outgoingRequests.map((request) => (
            <View key={request.id} style={styles.contact}>
              <View style={styles.flex}><Text style={styles.nickname}>En attente</Text><Text style={styles.status}>{request.recipient_id}</Text></View>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => void cancelRequest(request.id)}><Text style={styles.secondaryActionText}>Annuler</Text></TouchableOpacity>
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

      {!!blockedUsers.length && !search.trim() && (
        <View style={styles.group}>
          <TouchableOpacity style={styles.groupHeader} onPress={() => setBlockedCollapsed((value) => !value)} accessibilityRole="button" accessibilityLabel="Afficher ou masquer les personnes bloquées">
            <Text style={styles.groupTitle}>{blockedCollapsed ? '▸' : '▾'} PERSONNES BLOQUÉES</Text>
            <Text style={styles.groupCount}>{blockedUsers.length}</Text>
          </TouchableOpacity>
          {!blockedCollapsed && blockedUsers.map((blocked) => (
            <View key={blocked.id} style={styles.contact}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{blocked.display_name[0] ?? '?'}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.nickname}>{blocked.display_name}</Text>
                <Text style={styles.status}>@{blocked.username} · interactions coupées</Text>
              </View>
              <TouchableOpacity style={styles.secondaryAction} onPress={() => void unblockContact(blocked)} accessibilityLabel={`Débloquer ${blocked.display_name}`}>
                <Text style={styles.secondaryActionText}>Débloquer</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {groups.map((group) => {
        const items = filtered.filter((c) => c.group === group);
        const isCollapsed = collapsed[group];
        return (
          <View key={group} style={styles.group}>
            <TouchableOpacity style={styles.groupHeader} onPress={() => setCollapsed((v) => ({ ...v, [group]: !v[group] }))}>
              <Text style={styles.groupTitle}>{isCollapsed ? '▸' : '▾'} {group.toUpperCase()}</Text>
              <Text style={styles.groupCount}>{items.filter((c) => c.presence !== 'offline').length}/{items.length}</Text>
            </TouchableOpacity>
            {!isCollapsed && items.map((contact) => (
              <View key={contact.id}>
                <View style={styles.contact}>
                  <TouchableOpacity style={styles.contactMain} onPress={() => onOpen(contact)} accessibilityRole="button">
                    <View style={[styles.avatar, contact.presence === 'online' && styles.avatarOnline]}><Text style={styles.avatarText}>{contact.displayName[0]}</Text></View>
                    <View style={styles.flex}>
                      <View style={styles.nameRow}><Text style={styles.presence}>{presenceIcon[contact.presence]}</Text><Text style={styles.nickname} numberOfLines={1}>{contact.nickname}</Text></View>
                      {!!contact.statusMessage && <Text style={styles.status} numberOfLines={1}>{contact.statusMessage}</Text>}
                      {!!contact.nowPlaying && <Text style={styles.music} numberOfLines={1}>♫ {contact.nowPlaying}</Text>}
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.favorite, contact.favorite && styles.favoriteActive]} onPress={() => void toggleFavorite(contact)} accessibilityLabel={contact.favorite ? `Retirer ${contact.displayName} des favoris` : `Ajouter ${contact.displayName} aux favoris`}><Text style={styles.favoriteText}>{contact.favorite ? '★' : '☆'}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.pulse} onPress={() => void sendKPulse(contact)} accessibilityLabel={`Envoyer un K-Pulse à ${contact.displayName}`}><Text style={styles.pulseText}>⚡</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.more} onPress={() => setManagingContactId((id) => id === contact.id ? null : contact.id)} accessibilityLabel={`Gérer ${contact.displayName}`}><Text style={styles.moreText}>•••</Text></TouchableOpacity>
                </View>
                {managingContactId === contact.id && (
                  <View style={styles.manageRow}>
                    <TouchableOpacity style={styles.secondaryAction} onPress={() => void removeContact(contact)}><Text style={styles.secondaryActionText}>Retirer le contact</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.dangerAction} onPress={() => void blockContact(contact)}><Text style={styles.dangerActionText}>Bloquer</Text></TouchableOpacity>
                  </View>
                )}
              </View>
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
  contact: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderTopWidth: 1, borderTopColor: '#edf4f7' }, contactMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dcecf5', borderWidth: 2, borderColor: '#c2d7e3' }, avatarOnline: { borderColor: '#65c568', backgroundColor: '#e7f8ed' }, avatarText: { color: '#276b93', fontSize: 18, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center' }, presence: { fontSize: 10, marginRight: 5 }, nickname: { color: '#173448', fontSize: 15, fontWeight: '800', maxWidth: '82%' }, status: { color: '#668696', marginTop: 2, fontSize: 12 }, music: { color: '#4e7d55', marginTop: 2, fontSize: 11, fontStyle: 'italic' },
  accept: { backgroundColor: '#2189c5', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11 }, acceptText: { color: '#fff', fontSize: 11, fontWeight: '900' }, secondaryAction: { backgroundColor: '#eef4f7', borderWidth: 1, borderColor: '#d5e2e9', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11 }, secondaryActionText: { color: '#52768a', fontSize: 11, fontWeight: '900' }, dangerAction: { backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#efb4b4', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11 }, dangerActionText: { color: '#a63d3d', fontSize: 11, fontWeight: '900' }, favorite: { width: 34, height: 38, borderRadius: 12, borderWidth: 1, borderColor: '#d5e2e9', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, favoriteActive: { backgroundColor: '#fff7d6', borderColor: '#e7ca5c' }, favoriteText: { color: '#b48a00', fontSize: 19, fontWeight: '900' }, pulse: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#fff2bd', borderWidth: 1, borderColor: '#efcf65', alignItems: 'center', justifyContent: 'center' }, pulseText: { fontSize: 20 }, more: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d5e2e9', alignItems: 'center', justifyContent: 'center' }, moreText: { color: '#52768a', fontWeight: '900', letterSpacing: 1 }, manageRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 11, paddingBottom: 10 },
});