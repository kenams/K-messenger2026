import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import type { Contact, Presence } from '../contacts/MsnContactsScreen';
import { ContactAvatar } from '../contacts/MsnContactsScreen';
import { clearContactAttention, useAttentionTick, useContactAttention } from '../attention/contactAttention';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';
import { getPreview, loadDirectPreview, loadGroupPreview, usePreviewTick } from '../../lib/lastMessagePreview';
import { formatListStamp } from '../../lib/timeFormat';
import { presenceColorFor, presenceLabel, radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

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
  createdAt: string;
  lastMessage: { id: string; senderUserId: string | null; createdAt: string | null } | null;
  members: ConversationMember[];
};

type Filter = 'all' | 'direct' | 'group';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'direct', label: 'Privés' },
  { value: 'group', label: 'Groupes' },
];

/** How many recent direct conversations get a decrypted preview up front. */
const PREVIEW_PREFETCH = 10;

export type ChatsSelection = { kind: 'direct'; contactId: string } | { kind: 'group'; groupId: string } | null;

/**
 * Desktop web conversation list — lives in the middle column so switching
 * Contacts ↔ Chats only swaps this list; the open conversation on the right
 * stays put.
 */
export function ChatsListPane({
  selection,
  onOpenContact,
  onOpenGroup,
  onManageGroups,
}: {
  selection: ChatsSelection;
  onOpenContact: (contact: Contact) => void;
  onOpenGroup: (groupId: string) => void;
  onManageGroups: () => void;
}) {
  const { styles, colors } = useThemedStyles();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const socketRef = useRef<Socket | null>(null);
  usePreviewTick();
  useAttentionTick();

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setNotice('Serveur temps réel K-ssenger non configuré pour ce build.');
      return;
    }
    let active = true;
    let cleanup: (() => void) | null = null;
    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, userId]) => {
      if (!active) return;
      socketRef.current = client;
      setCurrentUserId(userId);
      const load = async () => {
        const response = await emitAck<{ ok: boolean; conversations?: ConversationSummary[] }>(client, 'conversations:list');
        if (!response.ok) throw new Error('CONVERSATIONS_FAILED');
        if (active) setConversations(response.conversations ?? []);
      };
      let timer: ReturnType<typeof setTimeout> | null = null;
      // Coalesce bursts (several message:new in a row) into one list refresh.
      const refresh = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void load().catch(() => undefined); }, 400);
      };
      const onPresence = ({ userId: changed, status }: { userId: string; status: Presence }) => {
        setConversations((items) => items.map((conversation) => ({
          ...conversation,
          members: conversation.members.map((member) => member.userId === changed ? { ...member, presence: status } : member),
        })));
      };
      const events = ['connect', 'group:created', 'group:removed', 'group:left', 'group:updated', 'conversation:direct-ready', 'message:new', 'message:deleted'];
      events.forEach((event) => client.on(event, refresh));
      client.on('presence:changed', onPresence);
      cleanup = () => {
        if (timer) clearTimeout(timer);
        events.forEach((event) => client.off(event, refresh));
        client.off('presence:changed', onPresence);
      };
      try {
        await load();
        if (active) setNotice('');
      } catch {
        if (active) setNotice('Connexion aux conversations K-ssenger impossible.');
      } finally {
        if (active) setLoading(false);
      }
    }).catch(() => {
      if (active) { setLoading(false); setNotice('Connexion temps réel impossible.'); }
    });
    return () => { active = false; cleanup?.(); };
  }, []);

  // Decrypt previews for the most recent direct threads (on this device only).
  useEffect(() => {
    const client = socketRef.current;
    if (!client || !currentUserId) return;
    conversations
      .filter((conversation) => conversation.kind === 'direct' && conversation.lastMessage)
      .slice(0, PREVIEW_PREFETCH)
      .forEach((conversation) => {
        const peer = conversation.members.find((member) => member.userId !== currentUserId);
        if (peer && conversation.lastMessage) void loadDirectPreview(client, currentUserId, conversation.id, peer.userId, conversation.lastMessage.id);
      });
    conversations
      .filter((conversation) => conversation.kind === 'group' && conversation.lastMessage)
      .slice(0, PREVIEW_PREFETCH)
      .forEach((conversation) => {
        if (!conversation.lastMessage) return;
        const memberIds = conversation.members.map((member) => member.userId);
        void loadGroupPreview(client, currentUserId, conversation.id, memberIds, conversation.lastMessage.id);
      });
  }, [conversations, currentUserId]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter !== 'all' && conversation.kind !== filter) return false;
      if (!term) return true;
      const names = conversation.kind === 'group'
        ? `${conversation.title ?? ''} ${conversation.members.map((m) => m.displayName).join(' ')}`
        : conversation.members.filter((m) => m.userId !== currentUserId).map((m) => `${m.displayName} ${m.nickname ?? ''} ${m.username}`).join(' ');
      return names.toLowerCase().includes(term);
    });
  }, [conversations, filter, search, currentUserId]);

  const openDirect = (conversation: ConversationSummary) => {
    const peer = conversation.members.find((member) => member.userId !== currentUserId);
    if (!peer) { setNotice('Contact introuvable pour cette conversation.'); return; }
    clearContactAttention(peer.userId);
    onOpenContact({
      id: peer.userId,
      displayName: peer.displayName,
      nickname: peer.nickname || peer.displayName,
      handle: `@${peer.username}`,
      presence: peer.presence,
      avatarUrl: peer.avatarUrl ?? undefined,
      group: 'Amis',
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Conversations</Text>
          <TouchableOpacity style={styles.newGroup} onPress={onManageGroups} accessibilityRole="button" accessibilityLabel="Créer ou gérer mes groupes">
            <Text style={styles.newGroupText}>＋ Groupe</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            testID="chats-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher une conversation"
            placeholderTextColor={colors.inkFaint}
            style={styles.search}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.filters} accessibilityRole="tablist">
          {FILTERS.map((option) => {
            const active = option.value === filter;
            return (
              <TouchableOpacity
                key={option.value}
                testID={`chats-filter-${option.value}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(option.value)}
                style={[styles.filter, active && styles.filterActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.azure} /><Text style={styles.muted}>Chargement des conversations…</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {visible.map((conversation) => conversation.kind === 'direct'
            ? (
              <DirectRow
                key={conversation.id}
                conversation={conversation}
                currentUserId={currentUserId}
                selected={selection?.kind === 'direct' && conversation.members.some((m) => m.userId === selection.contactId && m.userId !== currentUserId)}
                onPress={() => openDirect(conversation)}
              />
            ) : (
              <GroupRow
                key={conversation.id}
                conversation={conversation}
                currentUserId={currentUserId}
                selected={selection?.kind === 'group' && selection.groupId === conversation.id}
                onPress={() => onOpenGroup(conversation.id)}
              />
            ))}
          {!visible.length && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>{search.trim() ? 'Aucun résultat' : 'Pas encore de conversation'}</Text>
              <Text style={styles.muted}>{search.trim() ? 'Essaie un autre nom.' : 'Ouvre un contact pour démarrer une discussion.'}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function RowShell({ selected, onPress, label, testID, children }: { selected: boolean; onPress: () => void; label: string; testID?: string; children: React.ReactNode }) {
  const { styles } = useThemedStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={(state) => [styles.row, (state as { hovered?: boolean }).hovered && !selected && styles.rowHover, selected && styles.rowSelected]}
    >
      {selected && <View style={styles.selectedBar} />}
      {children}
    </Pressable>
  );
}

function DirectRow({ conversation, currentUserId, selected, onPress }: { conversation: ConversationSummary; currentUserId: string; selected: boolean; onPress: () => void }) {
  const { styles, colors } = useThemedStyles();
  const peer = conversation.members.find((member) => member.userId !== currentUserId);
  const { unread, pulse } = useContactAttention(peer?.userId ?? '');
  if (!peer) return null;
  const name = peer.nickname || peer.displayName;
  const stamp = formatListStamp(conversation.lastMessage?.createdAt || conversation.createdAt);
  const preview = getPreview(conversation.id);
  const mine = conversation.lastMessage?.senderUserId === currentUserId;
  const previewText = !conversation.lastMessage
    ? 'Nouvelle conversation'
    : preview && preview.messageId === conversation.lastMessage.id
      ? preview.text
      : '🔒 Message chiffré';
  const hasUnread = unread > 0 && !selected;
  return (
    <RowShell selected={selected} onPress={onPress} label={`Conversation avec ${name}`} testID={`chat-row-${conversation.id}`}>
      <ContactAvatar displayName={peer.displayName} avatarUrl={peer.avatarUrl} presence={peer.presence} size={46} />
      <View style={styles.flex}>
        <View style={styles.line1}>
          <Text style={[styles.name, hasUnread && styles.nameUnread]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.stamp, hasUnread && styles.stampUnread]}>{stamp}</Text>
        </View>
        <View style={styles.line2}>
          <Text style={[styles.preview, hasUnread && styles.previewUnread]} numberOfLines={1}>
            {mine && <Text style={styles.previewYou}>Toi : </Text>}
            {previewText}
          </Text>
          {pulse && !selected && <Text style={styles.pulse}>⚡</Text>}
          {hasUnread && <View style={styles.badge}><Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text></View>}
        </View>
        <Text style={[styles.presence, { color: peer.presence === 'offline' ? colors.inkFaint : presenceColorFor(colors)[peer.presence] }]} numberOfLines={1}>
          {presenceLabel[peer.presence] ?? ''}
        </Text>
      </View>
    </RowShell>
  );
}

function GroupRow({ conversation, currentUserId, selected, onPress }: { conversation: ConversationSummary; currentUserId: string; selected: boolean; onPress: () => void }) {
  const { styles } = useThemedStyles();
  const title = conversation.title || 'Groupe K-ssenger';
  const online = conversation.members.filter((member) => member.presence === 'online').length;
  const preview = conversation.lastMessage ? getPreview(conversation.id) : undefined;
  const mine = conversation.lastMessage?.senderUserId === currentUserId;
  const sender = conversation.lastMessage && !mine
    ? conversation.members.find((member) => member.userId === conversation.lastMessage?.senderUserId)
    : undefined;
  const previewText = !conversation.lastMessage
    ? 'Aucun message pour l’instant'
    : preview && preview.messageId === conversation.lastMessage.id
      ? preview.text
      : '🔒 Message de groupe chiffré';
  return (
    <RowShell selected={selected} onPress={onPress} label={`Groupe ${title}`} testID={`chat-row-${conversation.id}`}>
      <View style={styles.groupAvatar}><Text style={styles.groupAvatarText}>{title.slice(0, 2).toUpperCase()}</Text></View>
      <View style={styles.flex}>
        <View style={styles.line1}>
          <Text style={styles.name} numberOfLines={1}>{title}</Text>
          <Text style={styles.stamp}>{formatListStamp(conversation.lastMessage?.createdAt || conversation.createdAt)}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {mine && <Text style={styles.previewYou}>Toi : </Text>}
          {sender && <Text style={styles.previewYou}>{(sender.nickname || sender.displayName).split(' ')[0]} : </Text>}
          {previewText}
        </Text>
        <Text style={styles.presenceMuted} numberOfLines={1}>{conversation.members.length} membres{online ? ` · ${online} en ligne` : ''}</Text>
      </View>
    </RowShell>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.sky },
    head: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.hairline, backgroundColor: palette.sky },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { ...typo.heading },
    newGroup: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
    newGroupText: { color: palette.azureDeep, fontSize: 11.5, fontWeight: '800' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.hairline, paddingHorizontal: spacing.md },
    searchIcon: { fontSize: 16, color: palette.inkFaint, marginRight: spacing.xs },
    search: { flex: 1, paddingVertical: 9, color: palette.ink, fontSize: 13.5, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) },
    filters: { flexDirection: 'row', gap: 6 },
    filter: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
    filterActive: { backgroundColor: palette.azureSoft },
    filterText: { color: palette.inkFaint, fontSize: 12, fontWeight: '800' },
    filterTextActive: { color: palette.azureDeep },
    notice: { color: palette.azureDeep, fontSize: 12, fontWeight: '700', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    muted: { ...typo.meta, color: palette.inkFaint, textAlign: 'center' },
    list: { paddingVertical: spacing.xs },
    flex: { flex: 1, minWidth: 0 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
      ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '140ms' } as object) : null),
    },
    rowHover: { backgroundColor: palette.surfaceSunken },
    rowSelected: { backgroundColor: palette.azureSoft },
    selectedBar: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, backgroundColor: palette.azure },
    line1: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    line2: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    name: { ...typo.name, fontSize: 14.5, flex: 1 },
    nameUnread: { fontWeight: '900' },
    stamp: { ...typo.micro, fontVariant: ['tabular-nums'] },
    stampUnread: { color: palette.azureDeep },
    preview: { flex: 1, color: palette.inkSoft, fontSize: 12.5, fontWeight: '500' },
    previewUnread: { color: palette.ink, fontWeight: '700' },
    previewYou: { color: palette.inkFaint, fontWeight: '600' },
    pulse: { fontSize: 12 },
    badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' },
    badgeText: { color: palette.white, fontSize: 10.5, fontWeight: '900' },
    presence: { fontSize: 10.5, fontWeight: '800', marginTop: 3 },
    presenceMuted: { fontSize: 10.5, fontWeight: '700', marginTop: 3, color: palette.inkFaint },
    groupAvatar: { width: 46, height: 46, borderRadius: 16, backgroundColor: palette.brassSoft, borderWidth: 1, borderColor: palette.hairline, alignItems: 'center', justifyContent: 'center' },
    groupAvatarText: { color: palette.azureDeep, fontSize: 15, fontWeight: '900' },
    empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl, gap: spacing.xs },
    emptyIcon: { fontSize: 36 },
    emptyTitle: { ...typo.heading },
  });
}

function useThemedStyles() {
  const { colors, type: typo } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors };
}
