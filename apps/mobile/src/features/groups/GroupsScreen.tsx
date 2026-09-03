import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, isRealtimeConfigured } from '../../lib/realtime';
import type { Presence } from '../contacts/MsnContactsScreen';

type ReceiptState = 'delivered' | 'read';
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
  role: 'member' | 'admin' | 'owner';
  createdAt: string;
  lastMessage: { id: string; senderUserId: string | null; createdAt: string | null } | null;
  members: ConversationMember[];
};

type ContactOption = {
  id: string;
  displayName: string;
  username: string;
  presence: Presence;
};

type EncryptedMessage = {
  id: string;
  senderUserId: string;
  createdAt: string;
  algorithm: string;
  conversationId: string;
  receiptState?: ReceiptState;
};

type ConversationsResponse = { ok: boolean; conversations?: ConversationSummary[]; error?: string };
type HistoryResponse = { ok: boolean; messages?: EncryptedMessage[]; error?: string };
type ContactsResponse = {
  ok: boolean;
  contacts?: Array<{
    contact_id: string;
    profiles: { id: string; username: string; display_name: string; presence: Presence };
  }>;
  error?: string;
};

export function GroupsScreen() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(isRealtimeConfigured);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<ConversationSummary | null>(null);
  const [groupHistory, setGroupHistory] = useState<EncryptedMessage[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  const loadData = async (client: Socket) => {
    const [conversationResponse, contactResponse] = await Promise.all([
      emitAck<ConversationsResponse>(client, 'conversations:list'),
      emitAck<ContactsResponse>(client, 'contacts:list'),
    ]);
    if (!conversationResponse.ok) throw new Error(conversationResponse.error ?? 'CONVERSATIONS_FAILED');
    if (!contactResponse.ok) throw new Error(contactResponse.error ?? 'CONTACTS_FAILED');
    setConversations(conversationResponse.conversations ?? []);
    setContacts((contactResponse.contacts ?? []).map((row) => ({
      id: row.profiles.id,
      displayName: row.profiles.display_name,
      username: row.profiles.username,
      presence: row.profiles.presence,
    })));
  };

  useEffect(() => {
    if (!isRealtimeConfigured) {
      setLoading(false);
      setNotice('Serveur temps réel K-ssenger non configuré pour ce build.');
      return;
    }

    let active = true;
    let cleanup: (() => void) | null = null;

    void getRealtimeSocket().then(async (client) => {
      if (!active) return;
      setSocket(client);
      const refresh = () => void loadData(client).catch(() => setNotice('Impossible de charger les groupes.'));
      client.on('connect', refresh);
      client.on('group:created', refresh);
      client.on('message:new', refresh);
      cleanup = () => {
        client.off('connect', refresh);
        client.off('group:created', refresh);
        client.off('message:new', refresh);
      };
      try {
        await loadData(client);
        if (active) setNotice('');
      } catch {
        if (active) setNotice('Connexion aux groupes K-ssenger impossible.');
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
    };
  }, []);

  useEffect(() => {
    if (!socket || !selectedGroup) return;
    let active = true;
    let currentUserId = '';

    const onMessage = (message: EncryptedMessage) => {
      if (message.conversationId !== selectedGroup.id) return;
      setGroupHistory((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
      if (currentUserId && message.senderUserId !== currentUserId) {
        void emitAck(socket, 'message:receipt', {
          conversationId: selectedGroup.id,
          messageId: message.id,
          state: 'read',
        }).catch(() => undefined);
      }
    };
    const onReceipt = (receipt: { messageId?: string; state?: ReceiptState }) => {
      if (!receipt.messageId || !receipt.state) return;
      setGroupHistory((items) => items.map((message) => (
        message.id === receipt.messageId ? { ...message, receiptState: receipt.state } : message
      )));
    };

    void getAuthenticatedUserId().then((id) => {
      if (active) currentUserId = id;
    }).catch(() => undefined);
    socket.on('message:new', onMessage);
    socket.on('message:receipt', onReceipt);
    return () => {
      active = false;
      socket.off('message:new', onMessage);
      socket.off('message:receipt', onReceipt);
    };
  }, [socket, selectedGroup]);

  const groups = useMemo(() => conversations.filter((conversation) => conversation.kind === 'group'), [conversations]);

  const toggleMember = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const createGroup = async () => {
    if (!socket || !title.trim() || selectedIds.length < 1) {
      setNotice('Choisis un nom et au moins un contact.');
      return;
    }
    const response = await emitAck<{ ok: boolean; conversationId?: string; error?: string }>(socket, 'group:create', {
      title: title.trim(),
      memberIds: selectedIds,
    });
    if (!response.ok) {
      setNotice('Création du groupe refusée. Vérifie les contacts et blocages.');
      return;
    }
    setTitle('');
    setSelectedIds([]);
    setCreating(false);
    setNotice('Groupe créé.');
    await loadData(socket);
  };

  const openGroup = async (group: ConversationSummary) => {
    if (!socket) return;
    setGroupLoading(true);
    setNotice('');
    try {
      const joined = await emitAck<{ ok: boolean; error?: string }>(socket, 'conversation:join', { conversationId: group.id });
      if (!joined.ok) throw new Error(joined.error ?? 'GROUP_JOIN_FAILED');
      const response = await emitAck<HistoryResponse>(socket, 'conversation:history', { conversationId: group.id, limit: 50 });
      if (!response.ok) throw new Error(response.error ?? 'GROUP_HISTORY_FAILED');
      const currentUserId = await getAuthenticatedUserId();
      const loaded = response.messages ?? [];
      setSelectedGroup(group);
      setGroupHistory(loaded);
      await Promise.allSettled(
        loaded
          .filter((message) => message.senderUserId !== currentUserId)
          .map((message) => emitAck(socket, 'message:receipt', {
            conversationId: group.id,
            messageId: message.id,
            state: 'read',
          })),
      );
    } catch {
      setNotice('Impossible d’ouvrir ce groupe.');
    } finally {
      setGroupLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text style={styles.empty}>Chargement des groupes…</Text></View>;

  if (selectedGroup) {
    const online = selectedGroup.members.filter((member) => member.presence === 'online' || member.presence === 'busy' || member.presence === 'away').length;
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => { setSelectedGroup(null); setGroupHistory([]); }}><Text style={styles.back}>‹ Groupes</Text></TouchableOpacity>
        <View style={styles.groupHero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(selectedGroup.title || 'K').slice(0, 2).toUpperCase()}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.groupTitle}>{selectedGroup.title || 'Groupe K-ssenger'}</Text>
            <Text style={styles.meta}>🟢 {online} actifs · {selectedGroup.members.length} membres · {selectedGroup.role}</Text>
          </View>
        </View>
        <View style={styles.memberPanel}>
          <Text style={styles.creatorLabel}>MEMBRES</Text>
          {selectedGroup.members.map((member) => (
            <View key={member.userId} style={styles.memberRow}>
              <Text>{member.presence === 'online' ? '🟢' : member.presence === 'busy' ? '🔴' : member.presence === 'away' ? '🟠' : '⚫'}</Text>
              <View style={styles.flex}><Text style={styles.memberName}>{member.nickname || member.displayName}</Text><Text style={styles.memberHandle}>@{member.username}</Text></View>
            </View>
          ))}
        </View>
        <View style={styles.securityBox}><Text style={styles.noteText}>🔒 Historique réel du salon. Le serveur ne renvoie que des enveloppes chiffrées ; aucun contenu plaintext n’est généré pour contourner l’E2EE.</Text></View>
        {groupLoading ? <ActivityIndicator /> : !groupHistory.length ? (
          <Text style={styles.empty}>Aucun message chiffré dans ce groupe pour le moment.</Text>
        ) : groupHistory.map((message) => (
          <View key={message.id} style={styles.envelope}>
            <Text style={styles.envelopeTitle}>🔐 Message chiffré</Text>
            <Text style={styles.last}>{new Date(message.createdAt).toLocaleString()} · {message.algorithm}</Text>
            {!!message.receiptState && <Text style={styles.receipt}>{message.receiptState === 'read' ? '✓✓ Lu' : '✓ Reçu'}</Text>}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View><Text style={styles.eyebrow}>MES GROUPES</Text><Text style={styles.title}>Tes salons K-ssenger réels.</Text></View>
        <TouchableOpacity style={styles.newBtn} onPress={() => setCreating((value) => !value)}><Text style={styles.newText}>{creating ? '×' : '＋'}</Text></TouchableOpacity>
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      {creating && (
        <View style={styles.creator}>
          <Text style={styles.creatorTitle}>Nouveau groupe</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={80} placeholder="Nom du groupe" style={styles.input} />
          <Text style={styles.creatorLabel}>Sélectionne tes contacts</Text>
          <View style={styles.contactGrid}>
            {contacts.map((contact) => {
              const selected = selectedIds.includes(contact.id);
              return (
                <TouchableOpacity key={contact.id} style={[styles.contactChip, selected && styles.contactChipSelected]} onPress={() => toggleMember(contact.id)}>
                  <Text style={styles.contactPresence}>{contact.presence === 'online' ? '🟢' : contact.presence === 'busy' ? '🔴' : contact.presence === 'away' ? '🟠' : '⚫'}</Text>
                  <Text style={[styles.contactText, selected && styles.contactTextSelected]} numberOfLines={1}>{contact.displayName}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!contacts.length && <Text style={styles.empty}>Ajoute d’abord des contacts pour créer un groupe.</Text>}
          <TouchableOpacity style={[styles.createBtn, (!title.trim() || !selectedIds.length) && styles.createBtnDisabled]} onPress={() => void createGroup()} disabled={!title.trim() || !selectedIds.length}>
            <Text style={styles.createText}>Créer avec {selectedIds.length} contact(s)</Text>
          </TouchableOpacity>
        </View>
      )}

      {groups.map((group) => {
        const online = group.members.filter((member) => member.presence === 'online' || member.presence === 'busy' || member.presence === 'away').length;
        return (
          <TouchableOpacity key={group.id} style={styles.card} accessibilityRole="button" onPress={() => void openGroup(group)} disabled={groupLoading}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(group.title || 'K').slice(0, 2).toUpperCase()}</Text></View>
            <View style={styles.flex}>
              <View style={styles.row}><Text style={styles.name}>{group.title || 'Groupe K-ssenger'}</Text><Text style={styles.role}>{group.role}</Text></View>
              <Text style={styles.meta}>🟢 {online} actifs · {group.members.length} membres</Text>
              <Text style={styles.last} numberOfLines={1}>{group.lastMessage ? 'Dernier message chiffré disponible' : 'Aucun message pour le moment'}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        );
      })}

      {!groups.length && !creating && <Text style={styles.empty}>Aucun groupe. Appuie sur ＋ pour créer ton premier salon.</Text>}
      <View style={styles.note}><Text style={styles.noteTitle}>🔒 Sécurité</Text><Text style={styles.noteText}>La création est vérifiée côté serveur : uniquement tes contacts, avec contrôle des blocages. Les salons rejoignent un canal Socket.IO autorisé par appartenance.</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingBottom: 30 }, flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }, eyebrow: { fontSize: 11, letterSpacing: 1.5, color: '#4d86aa', fontWeight: '900' }, title: { color: '#173448', fontSize: 20, fontWeight: '900', marginTop: 3 }, newBtn: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#2189c5', alignItems: 'center', justifyContent: 'center' }, newText: { color: '#fff', fontSize: 28 }, notice: { marginBottom: 12, color: '#326e94', fontWeight: '700' },
  creator: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d9e9f2', borderRadius: 18, padding: 14, marginBottom: 16 }, creatorTitle: { color: '#173448', fontWeight: '900', fontSize: 16 }, creatorLabel: { color: '#5d8298', fontSize: 11, fontWeight: '800', marginTop: 12, marginBottom: 7 }, input: { borderWidth: 1, borderColor: '#d6e8f2', backgroundColor: '#f8fcfe', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, color: '#173448' }, contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, contactChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#d6e8f2', backgroundColor: '#f8fcfe', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 8, maxWidth: '48%' }, contactChipSelected: { backgroundColor: '#2189c5', borderColor: '#2189c5' }, contactPresence: { fontSize: 10 }, contactText: { color: '#52768a', fontSize: 11, fontWeight: '800', maxWidth: 120 }, contactTextSelected: { color: '#fff' }, createBtn: { marginTop: 14, backgroundColor: '#2189c5', borderRadius: 14, padding: 11, alignItems: 'center' }, createBtnDisabled: { opacity: 0.45 }, createText: { color: '#fff', fontWeight: '900' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 18, padding: 12, marginBottom: 9 }, avatar: { width: 52, height: 52, borderRadius: 17, backgroundColor: '#dff2ff', borderWidth: 2, borderColor: '#7dc7ed', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#2879a8', fontWeight: '900' }, name: { color: '#173448', fontSize: 15, fontWeight: '900', flexShrink: 1 }, role: { color: '#4d86aa', fontSize: 9, textTransform: 'uppercase', fontWeight: '900' }, meta: { color: '#5d8298', fontSize: 11, marginTop: 3 }, last: { color: '#7893a3', fontSize: 12, marginTop: 4 }, chevron: { color: '#91a8b6', fontSize: 28 }, empty: { padding: 18, textAlign: 'center', color: '#7893a3' },
  note: { marginTop: 8, padding: 14, borderRadius: 17, backgroundColor: '#e8f7ff', borderWidth: 1, borderColor: '#b8dcf0' }, noteTitle: { color: '#2f7199', fontWeight: '900' }, noteText: { color: '#5f8093', fontSize: 12, lineHeight: 18, marginTop: 5 },
  back: { color: '#2189c5', fontWeight: '900', fontSize: 16, marginBottom: 12 }, groupHero: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 18, padding: 14 }, groupTitle: { color: '#173448', fontSize: 20, fontWeight: '900' }, memberPanel: { marginTop: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dceaf2', borderRadius: 18, padding: 12 }, memberRow: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#edf4f7' }, memberName: { color: '#173448', fontWeight: '800' }, memberHandle: { color: '#7893a3', fontSize: 10, marginTop: 2 }, securityBox: { marginVertical: 12, padding: 12, borderRadius: 14, backgroundColor: '#eaf3f7' }, envelope: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 15, padding: 12, marginBottom: 8 }, envelopeTitle: { color: '#173448', fontWeight: '800' }, receipt: { marginTop: 6, color: '#4d86aa', fontSize: 10, fontWeight: '800' },
});
