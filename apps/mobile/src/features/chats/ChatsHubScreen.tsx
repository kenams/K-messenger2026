import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { GroupsScreen } from '../groups/GroupsScreen';
import { DirectConversationScreen } from './DirectConversationScreen';
import type { Contact, Presence } from '../contacts/MsnContactsScreen';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';
import { Avatar, Card, EmptyState, Notice, Segmented, SkyBackground } from '../../theme/components';
import { palette, spacing, type as typo } from '../../theme/tokens';

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
  const [, setSocket] = useState<Socket | null>(null);
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

  const segment = (
    <Segmented
      value={mode}
      onChange={setMode}
      options={[
        { value: 'private', label: '💬 Privés' },
        { value: 'groups', label: '👥 Groupes' },
      ]}
    />
  );

  if (mode === 'groups') {
    return (
      <SkyBackground>
        {segment}
        <GroupsScreen />
      </SkyBackground>
    );
  }

  return (
    <SkyBackground>
      {segment}
      {!!notice && <Notice>{notice}</Notice>}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.azure} />
          <Text style={styles.loadingText}>Chargement des conversations…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {directConversations.map((conversation) => {
            const peer = conversation.members.find((member) => member.userId !== currentUserId);
            if (!peer) return null;
            const time = conversation.lastMessage?.createdAt || conversation.createdAt;
            return (
              <Card key={conversation.id} style={styles.row} onPress={() => openDirect(conversation)}>
                <Avatar label={peer.displayName} presence={peer.presence} size={50} />
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>{peer.nickname || peer.displayName}</Text>
                  <Text style={styles.preview} numberOfLines={1}>
                    {conversation.lastMessage ? '🔒 Message chiffré' : 'Nouvelle conversation'}
                  </Text>
                  <Text style={styles.handle} numberOfLines={1}>@{peer.username}</Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.time}>{formatTime(time)}</Text>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Card>
            );
          })}
          {!directConversations.length && (
            <EmptyState
              icon="💬"
              title="Aucune conversation privée"
              hint="Ouvre un contact depuis ta liste pour démarrer une discussion chiffrée."
            />
          )}
        </ScrollView>
      )}
    </SkyBackground>
  );
}

function formatTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  loadingText: { ...typo.meta },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typo.name },
  preview: { ...typo.meta, marginTop: 2 },
  handle: { color: palette.azure, fontSize: 11, fontWeight: '700', marginTop: 3 },
  right: { alignItems: 'flex-end', minWidth: 42 },
  time: { ...typo.micro },
  chevron: { color: palette.inkFaint, fontSize: 24, marginTop: 4 },
});
