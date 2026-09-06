import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { GroupsScreen } from '../groups/GroupsScreen';
import { DirectConversationScreen } from './DirectConversationScreen';
import type { Contact, Presence } from '../contacts/MsnContactsScreen';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';

type ConversationMember = {
  userId: string;
  username: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  presence: Presence;
};

type ConversationSummary = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  avatarUrl: string | null;
  role: 'member' | 'admin' | 'owner';
  createdAt: string;
  lastMessage: { id: string; senderUserId: string | null; createdAt: string | null } | null;
  members: ConversationMember[];
};

type ConversationsResponse = {
  ok: boolean;
  conversations?: ConversationSummary[];
  error?: string;
};

export function ChatsHubScreen() {
  const [mode, setMode] = useState<'private' | 'groups'>('private');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [notice, setNotice] = useState('');

  const loadConversations = async (client: Socket) => {
    const response = await emitAck<ConversationsResponse>(client, 'conversations:list');
    if (!response.ok) throw new Error(response.error ?? 'CONVERSATIONS_FAILED');
    setConversations(response.conversations ?? []);
  };

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setNotice('Serveur temps réel K-ssenger non configuré pour ce build.');
      return;
    }

    let active = true;
    let clientRef: Socket | null = null;
    let cleanup: (() => void) | null = null;

    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, userId]) => {
      if (!active) return;
      clientRef = client;
      setSocket(client);
      setCurrentUserId(userId);

      const refresh = () => void loadConversations(client).catch(() => setNotice('Impossible de charger les conversations.'));
      client.on('connect', refresh);
      client.on('group:created', refresh);
      client.on('conversation:direct-ready', refresh);
      client.on('message:new', refresh);
      cleanup = () => {
        client.off('connect', refresh);
        client.off('group:created', refresh);
        client.off('conversation:direct-ready', refresh);
        client.off('message:new', refresh);
      };

      try {
        await loadConversations(client);
        if (active) setNotice('');
      } catch {
        if (active) setNotice('Connexion aux conversations K-ssenger impossible.');
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
      cleanup?.();
      clientRef = null;
    };
  }, []);

  const directConversations = useMemo(
    () => conversations.filter((conversation) => conversation.kind === 'direct'),
    [conversations],
  );

  const openDirect = (conversation: ConversationSummary) => {
    const peer = conversation.members.find((member) => member.userId !== currentUserId);
    if (!peer) {
      setNotice('Contact introuvable pour cette conversation.');
      return;
    }
    setSelectedContact({
      id: peer.userId,
      displayName: peer.displayName,
      nickname: peer.nickname || peer.displayName,
      handle: `@${peer.username}`,
      presence: peer.presence,
      group: 'Amis',
    });
  };

  if (selectedContact) {
    return <DirectConversationScreen contact={selectedContact} onBack={() => setSelectedContact(null)} />;
  }

  if (mode === 'groups') {
    return <View style={styles.fill}><Segment mode={mode} setMode={setMode} /><GroupsScreen /></View>;
  }

  return (
    <View style={styles.fill}>
      <Segment mode={mode} setMode={setMode} />
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {loading ? (
        <View style={styles.center}><ActivityIndicator /><Text style={styles.empty}>Chargement des conversations…</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {directConversations.map((conversation) => {
            const peer = conversation.members.find((member) => member.userId !== currentUserId);
            if (!peer) return null;
            const time = conversation.lastMessage?.createdAt || conversation.createdAt;
            return (
              <TouchableOpacity key={conversation.id} style={styles.chat} accessibilityRole="button" onPress={() => openDirect(conversation)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{peer.displayName[0]?.toUpperCase() ?? '?'}</Text>
                  <Text style={styles.presenceDot}>{presenceIcon(peer.presence)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{peer.nickname || peer.displayName}</Text>
                  <Text style={styles.preview} numberOfLines={1}>{conversation.lastMessage ? 'Message chiffré reçu dans cette conversation' : 'Nouvelle conversation'}</Text>
                  <Text style={styles.music} numberOfLines={1}>@{peer.username}</Text>
                </View>
                <View style={styles.right}><Text style={styles.time}>{formatTime(time)}</Text><Text style={styles.chevron}>›</Text></View>
              </TouchableOpacity>
            );
          })}
          {!directConversations.length && <Text style={styles.empty}>Aucune conversation privée. Ouvre un contact pour commencer.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

function presenceIcon(presence: Presence) {
  if (presence === 'online') return '🟢';
  if (presence === 'busy') return '🔴';
  if (presence === 'away') return '🟠';
  return '⚫';
}

function formatTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Segment({ mode, setMode }: { mode: 'private' | 'groups'; setMode: (mode: 'private' | 'groups') => void }) {
  return <View style={styles.segmentWrap}><TouchableOpacity style={[styles.segment, mode === 'private' && styles.segmentActive]} onPress={() => setMode('private')}><Text style={[styles.segmentText, mode === 'private' && styles.segmentTextActive]}>💬 Privés</Text></TouchableOpacity><TouchableOpacity style={[styles.segment, mode === 'groups' && styles.segmentActive]} onPress={() => setMode('groups')}><Text style={[styles.segmentText, mode === 'groups' && styles.segmentTextActive]}>👥 Groupes</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 }, flex: { flex: 1 }, content: { padding: 14 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, notice: { marginHorizontal: 16, marginBottom: 4, color: '#326e94', fontWeight: '700' },
  segmentWrap: { flexDirection: 'row', margin: 14, padding: 4, borderRadius: 16, backgroundColor: '#dcecf5' }, segment: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' }, segmentActive: { backgroundColor: '#fff' }, segmentText: { color: '#618397', fontWeight: '800' }, segmentTextActive: { color: '#227eB4' },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, marginBottom: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2' }, avatar: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#e3f4fd', alignItems: 'center', justifyContent: 'center', position: 'relative' }, avatarText: { color: '#287aa8', fontSize: 19, fontWeight: '900' }, presenceDot: { position: 'absolute', right: -3, bottom: -3, fontSize: 12 }, name: { color: '#173448', fontSize: 15, fontWeight: '900' }, preview: { color: '#627f90', fontSize: 12, marginTop: 3 }, music: { color: '#3987b6', fontSize: 10, marginTop: 4 }, right: { alignItems: 'flex-end', minWidth: 42 }, time: { color: '#8aa0ad', fontSize: 10 }, chevron: { color: '#91a8b6', fontSize: 25, marginTop: 6 }, empty: { padding: 20, textAlign: 'center', color: '#7893a3' },
});
