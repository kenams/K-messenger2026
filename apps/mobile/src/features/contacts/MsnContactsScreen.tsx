import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { getBackend } from '../../lib/backend';
import { getMediaDownload } from '../../lib/media';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';
import { elevation, palette, presenceLabel, radius, spacing, type as typo } from '../../theme/tokens';
import { Equalizer, PresenceBadge, SectionLabel, SkyBackground, useNudgeShake } from '../../theme/components';

export type Presence = 'online' | 'busy' | 'away' | 'invisible' | 'offline';
export type Contact = {
  id: string;
  displayName: string;
  nickname: string;
  handle: string;
  presence: Presence;
  avatarUrl?: string;
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

type ContactRequestCounterpart = { id: string; username: string; display_name: string };
type ContactRequest = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: string;
  counterpart?: ContactRequestCounterpart;
};
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

const CONTACT_POLL_MS = 25_000;

function mediaIdFromAvatar(value: string | null | undefined): string | null {
  if (!value?.startsWith('media:')) return null;
  const id = value.slice('media:'.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function httpsAvatar(value: string | null | undefined): string | null {
  return value && /^https:\/\//i.test(value) ? value : null;
}

function ContactAvatar({ displayName, avatarUrl, presence }: { displayName: string; avatarUrl?: string | null; presence?: Presence }) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => httpsAvatar(avatarUrl));
  const mediaId = mediaIdFromAvatar(avatarUrl);

  useEffect(() => {
    let active = true;
    const legacyUrl = httpsAvatar(avatarUrl);
    if (!mediaId) {
      setResolvedUrl(legacyUrl);
      return () => { active = false; };
    }
    setResolvedUrl(null);
    void getMediaDownload(mediaId)
      .then((download) => { if (active) setResolvedUrl(download.url); })
      .catch(() => { if (active) setResolvedUrl(null); });
    return () => { active = false; };
  }, [avatarUrl, mediaId]);

  const online = presence === 'online';
  return (
    <View style={styles.avatarWrap}>
      {resolvedUrl
        ? <Image source={{ uri: resolvedUrl }} style={[styles.avatar, online && styles.avatarOnline]} />
        : <View style={[styles.avatar, online && styles.avatarOnline]}><Text style={styles.avatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text></View>}
      {presence && <View style={styles.avatarBadge}><PresenceBadge presence={presence} size={13} /></View>}
    </View>
  );
}

function requestName(request: ContactRequest, currentUserId: string): { name: string; handle: string } {
  if (request.counterpart) {
    return { name: request.counterpart.display_name, handle: `@${request.counterpart.username}` };
  }
  const other = request.sender_id === currentUserId ? request.recipient_id : request.sender_id;
  return { name: 'Utilisateur K-ssenger', handle: `#${other.slice(0, 8)}` };
}

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
  const { style: shakeStyle, trigger: triggerShake } = useNudgeShake();

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
        avatarUrl: row.profiles.avatar_url ?? undefined,
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
    let pollTimer: ReturnType<typeof setInterval> | null = null;

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
        triggerShake();
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

      // Keep custom status and live "now playing" fresh even without a
      // dedicated broadcast: a light poll while the buddy list is open.
      pollTimer = setInterval(() => {
        if (client.connected) void loadContacts(client).catch(() => undefined);
      }, CONTACT_POLL_MS);

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
      if (pollTimer) clearInterval(pollTimer);
      cleanupListeners?.();
    };
  }, [triggerShake]);

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

  // Directory hits, minus people who are already a contact, blocked, or myself,
  // with the pending-request ones tagged so we don't offer "Ajouter" twice.
  const directoryResults = useMemo(() => {
    const contactIds = new Set(contacts.map((c) => c.id));
    const blockedIds = new Set(blockedUsers.map((b) => b.id));
    const pendingIds = new Set(requests.flatMap((r) => [r.sender_id, r.recipient_id]));
    return (results ?? [])
      .filter((p) => p.id !== currentUserId && !contactIds.has(p.id) && !blockedIds.has(p.id))
      .map((p) => ({ profile: p, pending: pendingIds.has(p.id) }));
  }, [results, contacts, blockedUsers, requests, currentUserId]);
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={palette.azure} /><Text style={styles.loadingText}>Chargement de tes contacts…</Text></View>;

  return (
    <SkyBackground>
      <Animated.View style={[styles.fill, shakeStyle]}>
        <ScrollView style={styles.page} contentContainerStyle={styles.content}>
          <View style={styles.toolbar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput testID="contact-search" value={search} onChangeText={setSearch} placeholder="Rechercher un contact ou @pseudo" placeholderTextColor={palette.inkFaint} style={styles.search} autoCapitalize="none" />
          </View>
          <Text style={styles.counter}>{onlineCount} en ligne · {filtered.length} contact{filtered.length > 1 ? 's' : ''}</Text>
          {!!notice && <View style={styles.noticePill}><Text style={styles.notice}>{notice}</Text></View>}

          {!!incomingRequests.length && (
            <View style={styles.group}>
              <SectionLabel right={<Text style={styles.groupCount}>{incomingRequests.length}</Text>}>Demandes reçues</SectionLabel>
              {incomingRequests.map((request) => {
                const who = requestName(request, currentUserId);
                return (
                  <View key={request.id} style={styles.contact}>
                    <View style={styles.avatarWrap}><View style={styles.avatar}><Text style={styles.avatarText}>{who.name[0]?.toUpperCase() ?? '?'}</Text></View></View>
                    <View style={styles.flex}><Text style={styles.nickname} numberOfLines={1}>{who.name}</Text><Text style={styles.status}>{who.handle} · veut t'ajouter</Text></View>
                    <TouchableOpacity style={styles.secondaryAction} onPress={() => void declineRequest(request.id)}><Text style={styles.secondaryActionText}>Refuser</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.accept} onPress={() => void acceptRequest(request.id)}><Text style={styles.acceptText}>Accepter</Text></TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {!!outgoingRequests.length && (
            <View style={styles.group}>
              <SectionLabel right={<Text style={styles.groupCount}>{outgoingRequests.length}</Text>}>Demandes envoyées</SectionLabel>
              {outgoingRequests.map((request) => {
                const who = requestName(request, currentUserId);
                return (
                  <View key={request.id} style={styles.contact}>
                    <View style={styles.avatarWrap}><View style={styles.avatar}><Text style={styles.avatarText}>{who.name[0]?.toUpperCase() ?? '?'}</Text></View></View>
                    <View style={styles.flex}><Text style={styles.nickname} numberOfLines={1}>{who.name}</Text><Text style={styles.status}>{who.handle} · en attente</Text></View>
                    <TouchableOpacity style={styles.secondaryAction} onPress={() => void cancelRequest(request.id)}><Text style={styles.secondaryActionText}>Annuler</Text></TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {search.trim().length >= 2 && directoryResults.length > 0 && (
            <View style={styles.group}>
              <View style={styles.plainHeader}>
                <SectionLabel right={<Text style={styles.groupCount}>{directoryResults.length}</Text>}>Utilisateurs</SectionLabel>
              </View>
              {directoryResults.map(({ profile, pending }) => (
                <View key={profile.id} style={styles.contact}>
                  <ContactAvatar displayName={profile.display_name} avatarUrl={profile.avatar_url} presence={profile.presence} />
                  <View style={styles.flex}><Text style={styles.nickname}>{profile.display_name}</Text><Text style={styles.status}>@{profile.username}</Text></View>
                  {pending ? (
                    <Text style={styles.pendingTag}>Demande envoyée</Text>
                  ) : (
                    <TouchableOpacity style={styles.accept} onPress={() => void requestContact(profile.id)}><Text style={styles.acceptText}>Ajouter</Text></TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          )}

          {!!blockedUsers.length && !search.trim() && (
            <View style={styles.group}>
              <TouchableOpacity style={styles.collapseHeader} onPress={() => setBlockedCollapsed((value) => !value)} accessibilityRole="button" accessibilityLabel="Afficher ou masquer les personnes bloquées">
                <Text style={styles.groupTitle}>{blockedCollapsed ? '▸' : '▾'} PERSONNES BLOQUÉES</Text>
                <Text style={styles.groupCount}>{blockedUsers.length}</Text>
              </TouchableOpacity>
              {!blockedCollapsed && blockedUsers.map((blocked) => (
                <View key={blocked.id} style={styles.contact}>
                  <ContactAvatar displayName={blocked.display_name} avatarUrl={blocked.avatar_url} />
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
            const onlineHere = items.filter((c) => c.presence !== 'offline').length;
            return (
              <View key={group} style={styles.group}>
                <TouchableOpacity style={styles.collapseHeader} onPress={() => setCollapsed((v) => ({ ...v, [group]: !v[group] }))}>
                  <Text style={styles.groupTitle}>{isCollapsed ? '▸' : '▾'} {group.toUpperCase()}</Text>
                  <Text style={styles.groupCount}>{onlineHere}/{items.length}</Text>
                </TouchableOpacity>
                {!isCollapsed && items.map((contact) => (
                  <View key={contact.id}>
                    <View style={styles.contact}>
                      <TouchableOpacity style={styles.contactMain} onPress={() => onOpen(contact)} accessibilityRole="button">
                        <ContactAvatar displayName={contact.displayName} avatarUrl={contact.avatarUrl} presence={contact.presence} />
                        <View style={styles.flex}>
                          <Text style={styles.nickname} numberOfLines={1}>{contact.nickname}</Text>
                          {!!contact.statusMessage && <Text style={styles.status} numberOfLines={1}>{contact.statusMessage}</Text>}
                          {contact.nowPlaying
                            ? <View style={styles.musicRow}><Equalizer size={12} /><Text style={styles.music} numberOfLines={1}>{contact.nowPlaying}</Text></View>
                            : !contact.statusMessage && <Text style={styles.statusFaint}>{presenceLabel[contact.presence]}</Text>}
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.iconBtn, contact.favorite && styles.favoriteActive]} onPress={() => void toggleFavorite(contact)} accessibilityLabel={contact.favorite ? `Retirer ${contact.displayName} des favoris` : `Ajouter ${contact.displayName} aux favoris`}><Text style={[styles.iconBtnText, contact.favorite && styles.favoriteActiveText]}>{contact.favorite ? '★' : '☆'}</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.iconBtn, styles.pulseBtn]} onPress={() => void sendKPulse(contact)} accessibilityLabel={`Envoyer un K-Pulse à ${contact.displayName}`}><Text style={styles.iconBtnText}>⚡</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => setManagingContactId((id) => id === contact.id ? null : contact.id)} accessibilityLabel={`Gérer ${contact.displayName}`}><Text style={styles.iconBtnText}>•••</Text></TouchableOpacity>
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

          {!filtered.length && !search.trim() && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👋</Text>
              <Text style={styles.emptyTitle}>Ta liste est vide</Text>
              <Text style={styles.empty}>Cherche un @pseudo ci-dessus pour envoyer ta première demande.</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: palette.sky },
  loadingText: { color: palette.inkSoft, marginTop: spacing.md, fontWeight: '700' },

  toolbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.md },
  searchIcon: { fontSize: 18, color: palette.inkFaint, marginRight: spacing.xs },
  search: { flex: 1, paddingVertical: spacing.md, color: palette.ink, fontSize: 14 },
  counter: { marginTop: spacing.sm, marginLeft: spacing.xs, ...typo.micro },
  noticePill: { marginTop: spacing.sm, backgroundColor: palette.azureSoft, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  notice: { color: palette.azureDeep, fontWeight: '700', fontSize: 12 },

  group: { marginTop: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, ...elevation.card },
  collapseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, backgroundColor: palette.surfaceSunken, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  plainHeader: { paddingHorizontal: spacing.md, paddingTop: spacing.sm + 2, backgroundColor: palette.surfaceSunken, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  pendingTag: { color: palette.inkFaint, fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase' },
  groupTitle: { ...typo.label, color: palette.inkSoft, textTransform: 'uppercase' },
  groupCount: { color: palette.inkFaint, fontSize: 11, fontWeight: '800' },

  contact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderTopWidth: 1, borderTopColor: palette.hairlineSoft },
  contactMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarWrap: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azureSoft, borderWidth: 2, borderColor: palette.hairline },
  avatarOnline: { borderColor: palette.onlineRing },
  avatarText: { color: palette.azureDeep, fontSize: 18, fontWeight: '900' },
  avatarBadge: { position: 'absolute', right: -3, bottom: -3 },

  nickname: { ...typo.name, maxWidth: '92%' },
  status: { color: palette.inkSoft, marginTop: 2, fontSize: 12 },
  statusFaint: { color: palette.inkFaint, marginTop: 2, fontSize: 11 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
  music: { color: palette.music, fontSize: 11, fontWeight: '700', flexShrink: 1 },

  accept: { backgroundColor: palette.azure, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  acceptText: { color: palette.white, fontSize: 11, fontWeight: '900' },
  secondaryAction: { backgroundColor: palette.sky, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  secondaryActionText: { color: palette.inkSoft, fontSize: 11, fontWeight: '900' },
  dangerAction: { backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: '#EFB4B4', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  dangerActionText: { color: palette.danger, fontSize: 11, fontWeight: '900' },

  iconBtn: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: palette.inkSoft, fontSize: 16, fontWeight: '900' },
  pulseBtn: { backgroundColor: palette.pulseSoft, borderColor: '#EFCF65' },
  favoriteActive: { backgroundColor: '#FFF7D6', borderColor: '#E7CA5C' },
  favoriteActiveText: { color: '#B48A00' },
  manageRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },

  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { ...typo.heading, marginTop: spacing.sm },
  empty: { marginTop: spacing.xs, textAlign: 'center', color: palette.inkFaint, fontSize: 12, lineHeight: 18 },
});
