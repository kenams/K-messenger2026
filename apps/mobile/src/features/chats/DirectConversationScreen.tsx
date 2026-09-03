import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Socket } from 'socket.io-client';
import type { Contact } from '../contacts/MsnContactsScreen';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket } from '../../lib/realtime';

type ReceiptState = 'delivered' | 'read';
type DirectResponse = { ok: boolean; conversationId?: string; error?: string };
type EncryptedMessage = {
  id: string;
  senderUserId: string;
  createdAt: string;
  algorithm: string;
  conversationId: string;
  receiptState?: ReceiptState;
};
type HistoryResponse = {
  ok: boolean;
  messages?: EncryptedMessage[];
  error?: string;
};

export function DirectConversationScreen({ contact, onBack }: { contact: Contact; onBack: () => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversationId, setConversationId] = useState('');
  const [history, setHistory] = useState<EncryptedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    let clientRef: Socket | null = null;
    let messageHandler: ((message: EncryptedMessage) => void) | null = null;
    let receiptHandler: ((receipt: { messageId?: string; state?: ReceiptState }) => void) | null = null;

    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, currentUserId]) => {
      if (!active) return;
      clientRef = client;
      setSocket(client);
      const direct = await emitAck<DirectResponse>(client, 'conversation:direct', { userId: contact.id });
      if (!direct.ok || !direct.conversationId) throw new Error(direct.error ?? 'DIRECT_CONVERSATION_FAILED');
      const id = direct.conversationId;
      setConversationId(id);

      const joined = await emitAck<{ ok: boolean }>(client, 'conversation:join', { conversationId: id });
      if (!joined.ok) throw new Error('DIRECT_JOIN_FAILED');

      const response = await emitAck<HistoryResponse>(client, 'conversation:history', { conversationId: id, limit: 50 });
      if (!response.ok) throw new Error(response.error ?? 'HISTORY_FAILED');
      const loaded = response.messages ?? [];
      if (active) setHistory(loaded);

      await Promise.allSettled(
        loaded
          .filter((message) => message.senderUserId !== currentUserId)
          .map((message) => emitAck(client, 'message:receipt', {
            conversationId: id,
            messageId: message.id,
            state: 'read',
          })),
      );

      messageHandler = (message) => {
        if (message.conversationId !== id) return;
        setHistory((items) => items.some((item) => item.id === message.id) ? items : [...items, message]);
        if (message.senderUserId !== currentUserId) {
          void emitAck(client, 'message:receipt', {
            conversationId: id,
            messageId: message.id,
            state: 'read',
          }).catch(() => undefined);
        }
      };
      receiptHandler = (receipt) => {
        if (!receipt.messageId || !receipt.state) return;
        setHistory((items) => items.map((message) => (
          message.id === receipt.messageId ? { ...message, receiptState: receipt.state } : message
        )));
      };
      client.on('message:new', messageHandler);
      client.on('message:receipt', receiptHandler);
      if (active) setNotice('Conversation sécurisée ouverte. Accusés de lecture actifs.');
    }).catch(() => {
      if (active) setNotice('Impossible d’ouvrir cette conversation pour le moment.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      if (clientRef && messageHandler) clientRef.off('message:new', messageHandler);
      if (clientRef && receiptHandler) clientRef.off('message:receipt', receiptHandler);
    };
  }, [contact.id]);

  const sendKPulse = async () => {
    if (!socket) return;
    const response = await emitAck<{ ok: boolean }>(socket, 'kpulse:send', { recipientId: contact.id, variant: 'classic' });
    setNotice(response.ok ? `⚡ K-Pulse envoyé à ${contact.displayName}.` : 'K-Pulse refusé ou limité.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View style={styles.avatar}><Text style={styles.avatarText}>{contact.displayName[0] ?? '?'}</Text></View>
        <View style={styles.flex}>
          <Text style={styles.name}>{contact.nickname}</Text>
          <Text style={styles.sub}>{contact.handle} · {contact.presence}</Text>
        </View>
        <TouchableOpacity style={styles.pulse} onPress={() => void sendKPulse()} accessibilityLabel={`Envoyer un K-Pulse à ${contact.displayName}`}><Text style={styles.pulseText}>⚡</Text></TouchableOpacity>
      </View>

      <View style={styles.security}><Text style={styles.securityText}>🛡️ Le serveur ne stocke que des enveloppes chiffrées. L’envoi de texte reste verrouillé tant que le protocole E2EE natif n’est pas intégré et validé sur appareil.</Text></View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Ouverture de la conversation…</Text></View>
      ) : (
        <ScrollView style={styles.body} contentContainerStyle={styles.content}>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {!!conversationId && <Text style={styles.meta}>Conversation active · {conversationId.slice(0, 8)}…</Text>}
          {!history.length ? (
            <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.emptyTitle}>Conversation prête</Text><Text style={styles.muted}>Aucun message chiffré pour le moment.</Text></View>
          ) : history.map((message) => (
            <View key={message.id} style={styles.envelope}>
              <Text style={styles.envelopeTitle}>🔐 Message chiffré</Text>
              <Text style={styles.muted}>{new Date(message.createdAt).toLocaleString()} · {message.algorithm}</Text>
              {!!message.receiptState && <Text style={styles.receipt}>{message.receiptState === 'read' ? '✓✓ Lu' : '✓ Reçu'}</Text>}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.composerLocked}>
        <Text style={styles.lock}>🔒</Text>
        <View style={styles.flex}><Text style={styles.lockTitle}>Messagerie chiffrée en préparation</Text><Text style={styles.muted}>Aucun plaintext ne sera envoyé pour contourner cette étape.</Text></View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' },
  back: { fontSize: 39, lineHeight: 40, color: '#2189c5' }, avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#dff2ff', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#2a79a8', fontSize: 18, fontWeight: '900' },
  name: { color: '#173448', fontSize: 15, fontWeight: '900' }, sub: { color: '#6e8796', fontSize: 10, marginTop: 2 }, pulse: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#fff2bd', borderWidth: 1, borderColor: '#efcf65', alignItems: 'center', justifyContent: 'center' }, pulseText: { fontSize: 22 },
  security: { backgroundColor: '#eaf3f7', paddingHorizontal: 14, paddingVertical: 7 }, securityText: { color: '#617b89', fontSize: 9, lineHeight: 13, textAlign: 'center' },
  body: { flex: 1 }, content: { padding: 14, paddingBottom: 28 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, notice: { color: '#326e94', fontWeight: '800', marginBottom: 8 }, meta: { color: '#8ba0ac', fontSize: 10, marginBottom: 12 },
  empty: { alignItems: 'center', marginTop: 70 }, emptyIcon: { fontSize: 44 }, emptyTitle: { color: '#173448', fontWeight: '900', fontSize: 18, marginTop: 8 }, muted: { color: '#7893a3', fontSize: 11, marginTop: 4 },
  envelope: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderRadius: 15, padding: 12, marginBottom: 8 }, envelopeTitle: { color: '#173448', fontWeight: '800' }, receipt: { marginTop: 6, color: '#4d86aa', fontSize: 10, fontWeight: '800' },
  composerLocked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, lock: { fontSize: 22 }, lockTitle: { color: '#173448', fontWeight: '800', fontSize: 12 },
});
