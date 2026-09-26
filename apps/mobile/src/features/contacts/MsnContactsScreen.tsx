import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { getBackend } from '../../lib/backend';
import { getMediaDownload } from '../../lib/media';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';
import { elevation, presenceLabel, radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Equalizer, PresenceBadge, SectionLabel, SkyBackground, useNudgeShake, usePulseUntilSeen, useReducedMotion } from '../../theme/components';
import { accentOf } from '../../theme/accent';
import { clearContactAttention, getContactActivity, seedContactActivity, seedContactUnread, useAttentionTick, useContactAttention, wireContactAttention } from '../attention/contactAttention';
import { onMessageReceivedFrom, playSound } from '../../lib/soundKit';
import {
  TONE_SOUND_OPTIONS,
  VIBRATION_PATTERN_OPTIONS,
  clearContactTone,
  getContactTone,
  setContactTone,
  type ContactTonePreference,
  type ToneSoundKey,
  type VibrationPatternKey,
} from '../../lib/kTone';

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
  accentColor?: string | null;
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
      accent_color?: string | null;
    };
    last_message_at: string | null;
    unread_count: number;
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
  const { styles } = useThemedStyles();
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

function KTonePanel({ myUserId, contactId }: { myUserId: string; contactId: string }) {
  const { styles } = useThemedStyles();
  const [prefs, setPrefs] = useState<ContactTonePreference>({ soundKey: null, vibrationPattern: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void getContactTone(myUserId, contactId).then((p) => { if (active) { setPrefs(p); setLoaded(true); } });
    return () => { active = false; };
  }, [myUserId, contactId]);

  const choose = (patch: Partial<ContactTonePreference>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      void setContactTone(myUserId, contactId, next);
      return next;
    });
  };

  const reset = () => {
    setPrefs({ soundKey: null, vibrationPattern: null });
    void clearContactTone(myUserId, contactId);
  };

  if (!loaded) return null;

  return (
    <View style={styles.toneCard}>
      <Text style={styles.toneSectionLabel}>Son</Text>
      <View style={styles.toneOptionsRow}>
        {TONE_SOUND_OPTIONS.map((option) => {
          const active = (prefs.soundKey ?? 'receive') === option.key;
          return (
            <View key={option.key} style={[styles.toneChip, active && styles.toneChipActive]}>
              <TouchableOpacity onPress={() => choose({ soundKey: option.key })} accessibilityRole="button">
                <Text style={[styles.toneChipText, active && styles.toneChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void playSound(option.key)}
                accessibilityLabel={`Écouter ${option.label}`}
                style={styles.tonePreviewBtn}
              >
                <Text style={styles.tonePreviewText}>▶</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      <Text style={styles.toneSectionLabel}>Vibration</Text>
      <View style={styles.toneOptionsRow}>
        {VIBRATION_PATTERN_OPTIONS.map((option) => {
          const active = (prefs.vibrationPattern ?? 'simple') === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.toneChip, active && styles.toneChipActive]}
              onPress={() => choose({ vibrationPattern: option.key })}
              accessibilityRole="button"
            >
              <Text style={[styles.toneChipText, active && styles.toneChipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={styles.toneResetBtn} onPress={reset} accessibilityRole="button">
        <Text style={styles.toneResetText}>Réinitialiser</Text>
      </TouchableOpacity>
    </View>
  );
}

function ContactRow({
  contact,
  managing,
  myUserId,
  toneOpen,
  onOpen,
  onToggleFavorite,
  onSendPulse,
  onToggleManage,
  onToggleTone,
  onRemove,
  onBlock,
}: {
  contact: Contact;
  managing: boolean;
  myUserId: string;
  toneOpen: boolean;
  onOpen: (contact: Contact) => void;
  onToggleFavorite: (contact: Contact) => void;
  onSendPulse: (contact: Contact) => void;
  onToggleManage: () => void;
  onToggleTone: () => void;
  onRemove: () => void;
  onBlock: () => void;
}) {
  const { styles } = useThemedStyles();
  const { unread, pulse } = useContactAttention(contact.id);
  const reducedMotion = useReducedMotion();
  const attention = unread > 0 || pulse;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!attention || reducedMotion) {
      blink.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.35, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [attention, reducedMotion, blink]);

  return (
    <View>
      <View style={styles.contact}>
        <TouchableOpacity style={styles.contactMain} onPress={() => { clearContactAttention(contact.id); onOpen(contact); }} accessibilityRole="button">
          {contact.accentColor ? <View style={[styles.accentEdge, { backgroundColor: accentOf(contact.accentColor) }]} /> : null}
          <Animated.View style={{ opacity: attention ? blink : 1 }}>
            <ContactAvatar displayName={contact.displayName} avatarUrl={contact.avatarUrl} presence={contact.presence} />
          </Animated.View>
          <View style={styles.flex}>
            <View style={styles.attentionNameRow}>
              <Text style={[styles.nickname, contact.accentColor ? { color: accentOf(contact.accentColor) } : null]} numberOfLines={1}>{contact.nickname}</Text>
              {pulse && <Text style={styles.attentionPulseIcon} accessibilityLabel={`${contact.displayName} t'a envoyé un K-Pulse`}>⚡</Text>}
              {unread > 0 && (
                <View style={styles.attentionBadge}>
                  <Text style={styles.attentionBadgeText}>{unread > 9 ? '9+' : unread}</Text>
                </View>
              )}
            </View>
            {!!contact.statusMessage && <Text style={styles.status} numberOfLines={1}>{contact.statusMessage}</Text>}
            {contact.nowPlaying
              ? <View style={styles.musicRow}><Equalizer size={12} /><Text style={styles.music} numberOfLines={1}>{contact.nowPlaying}</Text></View>
              : !contact.statusMessage && <Text style={styles.statusFaint}>{presenceLabel[contact.presence]}</Text>}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconBtn, contact.favorite && styles.favoriteActive]} onPress={() => onToggleFavorite(contact)} accessibilityLabel={contact.favorite ? `Retirer ${contact.displayName} des favoris` : `Ajouter ${contact.displayName} aux favoris`}><Text style={[styles.iconBtnText, contact.favorite && styles.favoriteActiveText]}>{contact.favorite ? '★' : '☆'}</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.iconBtn, styles.pulseBtn]} onPress={() => onSendPulse(contact)} accessibilityRole="button" accessibilityLabel={`Envoyer un K-Pulse à ${contact.displayName}`}><Text style={styles.iconBtnText}>⚡</Text></TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onToggleManage} accessibilityLabel={`Gérer ${contact.displayName}`}><Text style={styles.iconBtnText}>•••</Text></TouchableOpacity>
      </View>
      {managing && (
        <View style={styles.manageRow}>
          <TouchableOpacity style={styles.secondaryAction} onPress={onToggleTone}><Text style={styles.secondaryActionText}>🔔 Son personnalisé</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryAction} onPress={onRemove}><Text style={styles.secondaryActionText}>Retirer le contact</Text></TouchableOpacity>
          <TouchableOpacity style={styles.dangerAction} onPress={onBlock}><Text style={styles.dangerActionText}>Bloquer</Text></TouchableOpacity>
        </View>
      )}
      {managing && toneOpen && <KTonePanel myUserId={myUserId} contactId={contact.id} />}
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
  const { styles, colors } = useThemedStyles();
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
  const [toneOpenContactId, setToneOpenContactId] = useState<string | null>(null);
  const contactsRef = useRef<Contact[]>([]);
  const loginNotificationsRef = useRef<LoginNotifications>('favorites');
  const { style: shakeStyle, trigger: triggerShake } = useNudgeShake();
  // Re-render (and re-sort the buddy list below) whenever any contact pings us.
  useAttentionTick();
  const isKPulseNotice = notice.startsWith('⚡ K-Pulse reçu');
  const { style: noticePulseStyle } = usePulseUntilSeen(isKPulseNotice, notice);

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
      // Seed unread BEFORE activity: seedContactActivity below folds the
      // current tracked state (including whatever unread just got seeded)
      // back in, so the badge survives that call instead of racing it.
      if (row.unread_count) seedContactUnread(row.profiles.id, row.unread_count);
      // Base the buddy-list order on the real last-message time from the DB
      // so it survives app restarts, like WhatsApp — live socket activity
      // (wireContactAttention) still takes priority once it happens this
      // session since Date.now() is always more recent than a past message.
      if (row.last_message_at) seedContactActivity(row.profiles.id, Date.parse(row.last_message_at));
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
        accentColor: row.profiles.accent_color ?? null,
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
        if (senderId) onMessageReceivedFrom(userId, senderId);
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
      const unwireAttention = wireContactAttention(client, userId, () => new Set(contactsRef.current.map((c) => c.id)));
      cleanupListeners = () => {
        unwireAttention();
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
        // A freshly-authenticated socket can occasionally have its very first
        // `contacts:list` answered before the connection is fully warmed up
        // server-side (worse on a cold Render instance or a slow mobile
        // network), coming back `ok:true` with an empty list even though real
        // contacts exist. A single 1.5s retry wasn't enough on a real device
        // over cellular — back off across a few attempts before accepting an
        // empty list as the real "no contacts yet" state.
        const retryDelaysMs = [1500, 3000, 5000, 8000];
        const retryUntilNonEmpty = (attempt: number) => {
          if (!active || attempt >= retryDelaysMs.length || contactsRef.current.length > 0) return;
          setTimeout(() => {
            if (!active || !client.connected || contactsRef.current.length > 0) return;
            void loadContacts(client)
              .catch(() => undefined)
              .then(() => retryUntilNonEmpty(attempt + 1));
          }, retryDelaysMs[attempt]);
        };
        if (active && contactsRef.current.length === 0) retryUntilNonEmpty(0);
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.azure} /><Text style={styles.loadingText}>Chargement de tes contacts…</Text></View>;

  return (
    <SkyBackground>
      <Animated.View style={[styles.fill, shakeStyle]}>
        <ScrollView style={styles.page} contentContainerStyle={styles.content}>
          <View style={styles.toolbar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput testID="contact-search" value={search} onChangeText={setSearch} placeholder="Rechercher un contact ou @pseudo" placeholderTextColor={colors.inkFaint} style={styles.search} autoCapitalize="none" />
          </View>
          <Text style={styles.counter}>{onlineCount} en ligne · {filtered.length} contact{filtered.length > 1 ? 's' : ''}</Text>
          {!!notice && (
            <Animated.View style={[styles.noticePill, isKPulseNotice && noticePulseStyle]}>
              <Text style={styles.notice}>{notice}</Text>
            </Animated.View>
          )}

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
            // Whoever just messaged/K-Pulsed you rises to the top of their
            // section — no more hunting through the alphabetical list for
            // the person you're mid-conversation with (Kenams, 2026-09-21).
            const items = filtered.filter((c) => c.group === group)
              .sort((a, b) => getContactActivity(b.id) - getContactActivity(a.id));
            const isCollapsed = collapsed[group];
            const onlineHere = items.filter((c) => c.presence !== 'offline').length;
            return (
              <View key={group} style={styles.group}>
                <TouchableOpacity style={styles.collapseHeader} onPress={() => setCollapsed((v) => ({ ...v, [group]: !v[group] }))}>
                  <Text style={styles.groupTitle}>{isCollapsed ? '▸' : '▾'} {group.toUpperCase()}</Text>
                  <Text style={styles.groupCount}>{onlineHere}/{items.length}</Text>
                </TouchableOpacity>
                {!isCollapsed && items.map((contact) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    managing={managingContactId === contact.id}
                    myUserId={currentUserId}
                    toneOpen={toneOpenContactId === contact.id}
                    onOpen={onOpen}
                    onToggleFavorite={(c) => void toggleFavorite(c)}
                    onSendPulse={(c) => void sendKPulse(c)}
                    onToggleManage={() => setManagingContactId((id) => id === contact.id ? null : contact.id)}
                    onToggleTone={() => setToneOpenContactId((id) => id === contact.id ? null : contact.id)}
                    onRemove={() => void removeContact(contact)}
                    onBlock={() => void blockContact(contact)}
                  />
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

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
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
  attentionNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  attentionPulseIcon: { fontSize: 13 },
  attentionBadge: { backgroundColor: palette.danger, borderRadius: radius.pill, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  attentionBadgeText: { color: palette.white, fontSize: 10, fontWeight: '800' },
  accentEdge: { width: 3, alignSelf: 'stretch', borderRadius: radius.pill, marginRight: spacing.xs },
  status: { color: palette.inkSoft, marginTop: 2, fontSize: 12 },
  statusFaint: { color: palette.inkFaint, marginTop: 2, fontSize: 11 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
  music: { color: palette.music, fontSize: 11, fontWeight: '700', flexShrink: 1 },

  accept: { backgroundColor: palette.azure, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  acceptText: { color: palette.white, fontSize: 11, fontWeight: '900' },
  secondaryAction: { backgroundColor: palette.sky, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  secondaryActionText: { color: palette.inkSoft, fontSize: 11, fontWeight: '900' },
  dangerAction: { backgroundColor: palette.dangerSoft, borderWidth: 1, borderColor: palette.dangerBorder, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  dangerActionText: { color: palette.danger, fontSize: 11, fontWeight: '900' },

  iconBtn: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: palette.hairline, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { color: palette.inkSoft, fontSize: 16, fontWeight: '900' },
  pulseBtn: { backgroundColor: palette.pulseSoft, borderColor: palette.brass },
  favoriteActive: { backgroundColor: palette.favoriteSoft, borderColor: palette.favoriteBorder },
  favoriteActiveText: { color: palette.favoriteText },
  manageRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md },

  toneCard: { marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline, gap: spacing.sm },
  toneSectionLabel: { ...typo.label, color: palette.inkSoft, textTransform: 'uppercase', fontSize: 10.5 },
  toneOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  toneChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  toneChipActive: { backgroundColor: palette.azureSoft, borderColor: palette.azure },
  toneChipText: { color: palette.inkSoft, fontSize: 11.5, fontWeight: '800' },
  toneChipTextActive: { color: palette.azureDeep },
  tonePreviewBtn: { paddingHorizontal: 4 },
  tonePreviewText: { color: palette.azure, fontSize: 11, fontWeight: '900' },
  toneResetBtn: { alignSelf: 'flex-start' },
  toneResetText: { color: palette.inkFaint, fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },

  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { ...typo.heading, marginTop: spacing.sm },
  empty: { marginTop: spacing.xs, textAlign: 'center', color: palette.inkFaint, fontSize: 12, lineHeight: 18 },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
