import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';
import type { Presence } from '../contacts/MsnContactsScreen';
import { GroupEncryptedChat, type GroupEncryptedMessage } from './GroupEncryptedChat';
import { getGroupModerationCapabilities, type GroupBanSummary } from './groupModeration';
import {
  banGroupMemberRealtime,
  listGroupBansRealtime,
  muteGroupMemberOneHour,
  unbanGroupMemberRealtime,
  unmuteGroupMember,
} from './groupModerationRealtime';

type GroupRole = 'member' | 'admin' | 'owner';
type ConversationMember = {
  userId: string;
  username: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  presence: Presence;
  role: GroupRole;
};
type ConversationSummary = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  role: GroupRole;
  createdAt: string;
  lastMessage: { id: string; senderUserId: string | null; createdAt: string | null } | null;
  members: ConversationMember[];
};
type ContactOption = { id: string; displayName: string; username: string; presence: Presence };
type ConversationsResponse = { ok: boolean; conversations?: ConversationSummary[]; error?: string };
type ContactsResponse = {
  ok: boolean;
  contacts?: Array<{ contact_id: string; profiles: { id: string; username: string; display_name: string; presence: Presence } }>;
  error?: string;
};
type HistoryResponse = { ok: boolean; messages?: GroupEncryptedMessage[]; error?: string };

export function GroupsScreen() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ConversationSummary | null>(null);
  const [history, setHistory] = useState<GroupEncryptedMessage[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [bans, setBans] = useState<GroupBanSummary[]>([]);

  const groups = useMemo(() => conversations.filter((item) => item.kind === 'group'), [conversations]);

  const loadData = async (client: Socket) => {
    const [conversationResponse, contactResponse] = await Promise.all([
      emitAck<ConversationsResponse>(client, 'conversations:list'),
      emitAck<ContactsResponse>(client, 'contacts:list'),
    ]);
    if (!conversationResponse.ok) throw new Error(conversationResponse.error ?? 'CONVERSATIONS_FAILED');
    if (!contactResponse.ok) throw new Error(contactResponse.error ?? 'CONTACTS_FAILED');
    const next = conversationResponse.conversations ?? [];
    setConversations(next);
    setContacts((contactResponse.contacts ?? []).map((row) => ({
      id: row.profiles.id,
      displayName: row.profiles.display_name,
      username: row.profiles.username,
      presence: row.profiles.presence,
    })));
    if (selectedGroup) setSelectedGroup(next.find((item) => item.id === selectedGroup.id && item.kind === 'group') ?? null);
    return next;
  };

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setNotice('Serveur temps réel K-ssenger indisponible pour ce build.');
      return;
    }
    let active = true;
    let cleanup: (() => void) | undefined;
    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, userId]) => {
      if (!active) return;
      setSocket(client);
      setCurrentUserId(userId);
      const refresh = () => void loadData(client).catch(() => undefined);
      ['connect', 'group:created', 'group:invited', 'group:removed', 'group:left', 'group:updated'].forEach((event) => client.on(event, refresh));
      cleanup = () => ['connect', 'group:created', 'group:invited', 'group:removed', 'group:left', 'group:updated'].forEach((event) => client.off(event, refresh));
      await loadData(client);
      if (active) setNotice('');
    }).catch(() => {
      if (active) setNotice('Connexion aux groupes impossible.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; cleanup?.(); };
  }, []);

  useEffect(() => {
    if (!socket || !selectedGroup) return;
    const groupId = selectedGroup.id;
    const onMessage = (message: GroupEncryptedMessage) => {
      if (message.conversationId !== groupId) return;
      setHistory((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
      if (message.senderUserId !== currentUserId) {
        void emitAck(socket, 'message:receipt', { conversationId: groupId, messageId: message.id, state: 'read' }).catch(() => undefined);
      }
    };
    const onReceipt = (receipt: { messageId?: string; state?: 'delivered' | 'read' }) => {
      if (!receipt.messageId || !receipt.state) return;
      setHistory((items) => items.map((item) => item.id === receipt.messageId ? { ...item, receiptState: receipt.state } : item));
    };
    const onUpdated = () => void loadData(socket).catch(() => undefined);
    socket.on('message:new', onMessage);
    socket.on('message:receipt', onReceipt);
    socket.on('group:updated', onUpdated);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:receipt', onReceipt);
      socket.off('group:updated', onUpdated);
    };
  }, [socket, selectedGroup?.id, currentUserId]);

  const createGroup = async () => {
    if (!socket || busy || !title.trim() || selectedIds.length === 0) return;
    setBusy(true);
    try {
      const result = await emitAck<{ ok: boolean; conversationId?: string; error?: string }>(socket, 'group:create', {
        title: title.trim(), memberIds: selectedIds,
      });
      if (!result.ok) throw new Error(result.error ?? 'GROUP_CREATE_FAILED');
      setTitle(''); setSelectedIds([]); setCreating(false);
      await loadData(socket);
      setNotice('Groupe créé. Tous les membres devront avoir un appareil E2EE actif pour envoyer des messages.');
    } catch {
      setNotice('Création refusée. Vérifie les contacts et blocages.');
    } finally { setBusy(false); }
  };

  const openGroup = async (group: ConversationSummary) => {
    if (!socket || busy) return;
    setBusy(true);
    try {
      const joined = await emitAck<{ ok: boolean; error?: string }>(socket, 'conversation:join', { conversationId: group.id });
      if (!joined.ok) throw new Error(joined.error ?? 'JOIN_FAILED');
      const response = await emitAck<HistoryResponse>(socket, 'conversation:history', { conversationId: group.id, limit: 50 });
      if (!response.ok) throw new Error(response.error ?? 'HISTORY_FAILED');
      setSelectedGroup(group);
      setHistory(response.messages ?? []);
      if (group.role === 'owner' || group.role === 'admin') {
        setBans(await listGroupBansRealtime(group.id).catch(() => []));
      } else setBans([]);
    } catch { setNotice('Impossible d’ouvrir ce groupe.'); }
    finally { setBusy(false); }
  };

  const mutation = async (event: string, payload: Record<string, unknown>, success: string) => {
    if (!socket || !selectedGroup || busy) return;
    setBusy(true);
    try {
      const response = await emitAck<{ ok: boolean; error?: string }>(socket, event, payload);
      if (!response.ok) throw new Error(response.error ?? 'GROUP_MUTATION_FAILED');
      const next = await loadData(socket);
      setSelectedGroup(next.find((item) => item.id === selectedGroup.id && item.kind === 'group') ?? null);
      setNotice(success);
    } catch { setNotice('Action refusée par les permissions du groupe.'); }
    finally { setBusy(false); }
  };

  const moderate = async (action: () => Promise<void>, success: string) => {
    if (!selectedGroup || busy) return;
    setBusy(true);
    try {
      await action();
      if (socket) await loadData(socket);
      if (selectedGroup.role === 'owner' || selectedGroup.role === 'admin') setBans(await listGroupBansRealtime(selectedGroup.id).catch(() => []));
      setNotice(success);
    } catch { setNotice('Action de modération refusée.'); }
    finally { setBusy(false); }
  };

  const leave = async () => {
    if (!socket || !selectedGroup || busy) return;
    setBusy(true);
    try {
      const result = await emitAck<{ ok: boolean; error?: string }>(socket, 'group:leave', { conversationId: selectedGroup.id });
      if (!result.ok) throw new Error(result.error ?? 'LEAVE_FAILED');
      setSelectedGroup(null); setHistory([]); setBans([]);
      await loadData(socket);
      setNotice('Tu as quitté le groupe.');
    } catch { setNotice('Le propriétaire doit transférer son rôle avant de quitter.'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Chargement des groupes…</Text></View>;

  if (selectedGroup && socket) {
    const existingIds = new Set(selectedGroup.members.map((member) => member.userId));
    const inviteCandidates = contacts.filter((contact) => !existingIds.has(contact.id));
    const canManage = selectedGroup.role === 'owner' || selectedGroup.role === 'admin';
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => { setSelectedGroup(null); setHistory([]); setBans([]); }}><Text style={styles.back}>‹ Groupes</Text></TouchableOpacity>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(selectedGroup.title || 'K').slice(0, 2).toUpperCase()}</Text></View>
          <View style={styles.flex}><Text style={styles.groupTitle}>{selectedGroup.title || 'Groupe K-ssenger'}</Text><Text style={styles.meta}>{selectedGroup.members.length} membres · {selectedGroup.role}</Text></View>
        </View>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}

        <GroupEncryptedChat
          socket={socket}
          groupId={selectedGroup.id}
          currentUserId={currentUserId}
          memberIds={selectedGroup.members.map((member) => member.userId)}
          messages={history}
        />

        <View style={styles.panel}>
          <Text style={styles.label}>MEMBRES</Text>
          {selectedGroup.members.map((member) => {
            const self = member.userId === currentUserId;
            const capabilities = getGroupModerationCapabilities(currentUserId, selectedGroup.role, { userId: member.userId, role: member.role });
            const canRole = selectedGroup.role === 'owner' && !self && member.role !== 'owner';
            const canRemove = canManage && !self && member.role !== 'owner';
            return (
              <View key={member.userId} style={styles.member}>
                <Text>{member.presence === 'online' ? '🟢' : member.presence === 'busy' ? '🔴' : member.presence === 'away' ? '🟠' : '⚫'}</Text>
                <View style={styles.flex}><Text style={styles.memberName}>{member.nickname || member.displayName}{self ? ' (toi)' : ''}</Text><Text style={styles.muted}>@{member.username} · {member.role}</Text></View>
                <View style={styles.actions}>
                  {canRole && <TouchableOpacity disabled={busy} style={styles.action} onPress={() => void mutation('group:role-set', { conversationId: selectedGroup.id, userId: member.userId, role: member.role === 'admin' ? 'member' : 'admin' }, 'Rôle modifié.')}><Text style={styles.actionText}>{member.role === 'admin' ? 'Membre' : 'Admin'}</Text></TouchableOpacity>}
                  {capabilities.canMute && <TouchableOpacity disabled={busy} style={styles.action} onPress={() => void moderate(() => muteGroupMemberOneHour(selectedGroup.id, member.userId), 'Membre en sourdine 1 h.')}><Text style={styles.actionText}>Mute</Text></TouchableOpacity>}
                  {capabilities.canBan && <TouchableOpacity disabled={busy} style={styles.danger} onPress={() => void moderate(() => banGroupMemberRealtime(selectedGroup.id, member.userId), 'Membre banni.')}><Text style={styles.dangerText}>Ban</Text></TouchableOpacity>}
                  {canRemove && <TouchableOpacity disabled={busy} style={styles.danger} onPress={() => void mutation('group:member-remove', { conversationId: selectedGroup.id, userId: member.userId }, 'Membre retiré.')}><Text style={styles.dangerText}>Retirer</Text></TouchableOpacity>}
                </View>
              </View>
            );
          })}
        </View>

        {canManage && inviteCandidates.length > 0 && <View style={styles.panel}><Text style={styles.label}>INVITER</Text><View style={styles.chips}>{inviteCandidates.map((contact) => <TouchableOpacity key={contact.id} disabled={busy} style={styles.chip} onPress={() => void mutation('group:member-add', { conversationId: selectedGroup.id, userId: contact.id }, `${contact.displayName} invité.`)}><Text style={styles.chipText}>＋ {contact.displayName}</Text></TouchableOpacity>)}</View></View>}

        {canManage && <View style={styles.panel}><Text style={styles.label}>BANNIS</Text>{bans.length === 0 ? <Text style={styles.muted}>Aucun membre banni.</Text> : bans.map((ban) => <View key={ban.userId} style={styles.member}><View style={styles.flex}><Text style={styles.memberName}>{ban.displayName}</Text><Text style={styles.muted}>@{ban.username}</Text></View><TouchableOpacity disabled={busy} style={styles.action} onPress={() => void moderate(() => unbanGroupMemberRealtime(selectedGroup.id, ban.userId), 'Membre débanni.')}><Text style={styles.actionText}>Débannir</Text></TouchableOpacity></View>)}</View>}

        {selectedGroup.role !== 'owner' && <TouchableOpacity disabled={busy} style={styles.leave} onPress={() => void leave()}><Text style={styles.dangerText}>Quitter le groupe</Text></TouchableOpacity>}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><View><Text style={styles.eyebrow}>MES GROUPES</Text><Text style={styles.title}>Salons K-ssenger</Text></View><TouchableOpacity style={styles.new} onPress={() => setCreating((value) => !value)}><Text style={styles.newText}>{creating ? '×' : '＋'}</Text></TouchableOpacity></View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {creating && <View style={styles.panel}><Text style={styles.label}>NOUVEAU GROUPE</Text><TextInput value={title} onChangeText={setTitle} placeholder="Nom du groupe" maxLength={80} style={styles.input}/><View style={styles.chips}>{contacts.map((contact) => { const selected = selectedIds.includes(contact.id); return <TouchableOpacity key={contact.id} style={[styles.chip, selected && styles.chipSelected]} onPress={() => setSelectedIds((ids) => selected ? ids.filter((id) => id !== contact.id) : [...ids, contact.id])}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{contact.displayName}</Text></TouchableOpacity>; })}</View><TouchableOpacity disabled={busy || !title.trim() || selectedIds.length === 0} style={[styles.primary, (!title.trim() || selectedIds.length === 0) && styles.disabled]} onPress={() => void createGroup()}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.primaryText}>Créer le groupe</Text>}</TouchableOpacity></View>}
      {groups.map((group) => <TouchableOpacity key={group.id} style={styles.card} disabled={busy} onPress={() => void openGroup(group)}><View style={styles.avatar}><Text style={styles.avatarText}>{(group.title || 'K').slice(0,2).toUpperCase()}</Text></View><View style={styles.flex}><Text style={styles.groupTitle}>{group.title || 'Groupe K-ssenger'}</Text><Text style={styles.meta}>{group.members.length} membres · {group.role}</Text><Text style={styles.muted}>{group.lastMessage ? 'Dernier message chiffré disponible' : 'Aucun message'}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>)}
      {groups.length === 0 && !creating && <Text style={styles.empty}>Aucun groupe. Appuie sur ＋ pour créer ton premier salon.</Text>}
      <View style={styles.security}><Text style={styles.securityTitle}>🔐 Sécurité</Text><Text style={styles.muted}>Rôles et modération sont vérifiés côté serveur. Les messages utilisent les sessions libsignal de chaque appareil.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#edf7fc' }, content: { padding: 16, paddingBottom: 36 }, flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, eyebrow: { color: '#4d86aa', fontWeight: '900', letterSpacing: 1.4, fontSize: 10 }, title: { color: '#173448', fontWeight: '900', fontSize: 22, marginTop: 3 }, new: { width: 45, height: 45, borderRadius: 15, backgroundColor: '#2189c5', alignItems: 'center', justifyContent: 'center' }, newText: { color: '#fff', fontSize: 28 },
  notice: { color: '#326e94', fontWeight: '700', textAlign: 'center', marginBottom: 10 }, back: { color: '#2189c5', fontWeight: '900', fontSize: 16, marginBottom: 12 }, hero: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, backgroundColor: '#fff', borderRadius: 19, borderWidth: 1, borderColor: '#dceaf2' }, groupTitle: { color: '#173448', fontWeight: '900', fontSize: 18 }, meta: { color: '#5d8298', fontSize: 11, marginTop: 3 }, muted: { color: '#7893a3', fontSize: 10, marginTop: 2 },
  avatar: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#dff2ff', borderWidth: 2, borderColor: '#7dc7ed', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#2879a8', fontWeight: '900' }, panel: { marginTop: 13, padding: 13, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#dceaf2' }, label: { color: '#4d86aa', fontWeight: '900', fontSize: 10, letterSpacing: 1.1, marginBottom: 8 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#edf4f7' }, memberName: { color: '#173448', fontWeight: '800' }, actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4, maxWidth: 165 }, action: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 9, backgroundColor: '#e8f7ff' }, actionText: { color: '#2879a8', fontWeight: '900', fontSize: 9 }, danger: { paddingHorizontal: 7, paddingVertical: 6, borderRadius: 9, backgroundColor: '#fff0ef' }, dangerText: { color: '#b42318', fontWeight: '900', fontSize: 10 }, leave: { marginTop: 13, padding: 12, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: '#e6b7b2', backgroundColor: '#fff7f6' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 }, chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#eef7fb', borderWidth: 1, borderColor: '#d6e8f2' }, chipSelected: { backgroundColor: '#2189c5', borderColor: '#2189c5' }, chipText: { color: '#416679', fontWeight: '800', fontSize: 11 }, chipTextSelected: { color: '#fff' }, input: { minHeight: 44, borderWidth: 1, borderColor: '#d6e8f2', borderRadius: 14, backgroundColor: '#f8fcfe', paddingHorizontal: 12, marginBottom: 8 }, primary: { marginTop: 12, minHeight: 46, borderRadius: 14, backgroundColor: '#2189c5', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 }, primaryText: { color: '#fff', fontWeight: '900' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 18, padding: 12, marginBottom: 9 }, chevron: { color: '#91a8b6', fontSize: 28 }, empty: { color: '#7893a3', textAlign: 'center', padding: 24 }, security: { marginTop: 12, padding: 14, backgroundColor: '#e8f7ff', borderRadius: 17, borderWidth: 1, borderColor: '#b8dcf0' }, securityTitle: { color: '#2f7199', fontWeight: '900' },
});
