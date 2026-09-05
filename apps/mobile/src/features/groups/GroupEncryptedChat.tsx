import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { canUnlockPrivateComposer, getKssengerE2eeStatus } from '../../lib/e2ee';
import {
  decryptSignalEnvelope,
  encryptForUsers,
  ensureLocalSignalDevice,
  newEncryptedMessageId,
} from '../../lib/signalDevice';
import { emitAck } from '../../lib/realtime';

export type GroupEncryptedMessage = {
  id: string;
  clientMessageId?: string;
  senderUserId: string;
  senderDeviceId?: string | null;
  createdAt: string;
  algorithm: string;
  ciphertext?: string;
  conversationId: string;
  receiptState?: 'delivered' | 'read';
};

type Props = {
  socket: Socket;
  groupId: string;
  currentUserId: string;
  memberIds: string[];
  messages: GroupEncryptedMessage[];
};

export function GroupEncryptedChat({ socket, groupId, currentUserId, memberIds, messages }: Props) {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});

  useEffect(() => {
    let active = true;
    void getKssengerE2eeStatus().then(async (status) => {
      const available = canUnlockPrivateComposer(status);
      if (available) await ensureLocalSignalDevice(currentUserId);
      if (active) setReady(available);
    }).catch(() => {
      if (active) setReady(false);
    }).finally(() => {
      if (active) setChecking(false);
    });
    return () => { active = false; };
  }, [currentUserId]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const pending = messages.filter((message) => (
      message.senderUserId !== currentUserId
      && message.algorithm === 'signal-libsignal-multidevice-v1'
      && !!message.ciphertext
      && !!message.senderDeviceId
      && plain[message.id] === undefined
      && !failed[message.id]
    ));
    void Promise.all(pending.map(async (message) => {
      try {
        const body = await decryptSignalEnvelope(
          currentUserId,
          message.senderUserId,
          message.senderDeviceId!,
          message.ciphertext!,
        );
        if (active) setPlain((current) => ({ ...current, [message.id]: body }));
      } catch {
        if (active) setFailed((current) => ({ ...current, [message.id]: true }));
      }
    }));
    return () => { active = false; };
  }, [messages, currentUserId, ready, plain, failed]);

  const send = async () => {
    const body = composer.trim();
    if (!body || sending || !ready) return;
    setSending(true);
    setNotice('Chiffrement du message de groupe…');
    try {
      const recipients = [...new Set(memberIds)].filter((id) => id !== currentUserId);
      const encrypted = await encryptForUsers(currentUserId, recipients, body);
      const clientMessageId = await newEncryptedMessageId();
      const createdAt = new Date().toISOString();
      const response = await emitAck<{ ok: boolean; id?: string; error?: string }>(socket, 'message:send', {
        clientMessageId,
        conversationId: groupId,
        senderDeviceId: encrypted.senderDeviceId,
        algorithm: encrypted.algorithm,
        ciphertext: encrypted.ciphertext,
        createdAt,
      });
      if (!response.ok || !response.id) throw new Error(response.error ?? 'GROUP_SEND_FAILED');
      setPlain((current) => ({ ...current, [response.id!]: body }));
      setComposer('');
      setNotice('🔐 Message de groupe chiffré et envoyé.');
    } catch {
      setNotice('Envoi refusé : tous les membres doivent disposer d’un appareil E2EE actif. Aucun plaintext n’a été envoyé.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.security}>
        <Text style={styles.securityText}>{ready ? '🔐 Groupe protégé par Signal/libsignal par appareil' : '🔒 Chat de groupe verrouillé tant que l’E2EE natif n’est pas validé'}</Text>
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {messages.length === 0 ? <Text style={styles.empty}>Aucun message. Lance la conversation du groupe.</Text> : messages.map((message) => {
        const mine = message.senderUserId === currentUserId;
        const body = plain[message.id];
        return (
          <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            <Text style={styles.body}>{body ?? (failed[message.id] ? '⚠️ Message impossible à déchiffrer sur cet appareil.' : '🔐 Message chiffré')}</Text>
            <Text style={styles.meta}>{new Date(message.createdAt).toLocaleTimeString()} {mine && message.receiptState ? (message.receiptState === 'read' ? ' · ✓✓ Lu' : ' · ✓ Reçu') : ''}</Text>
          </View>
        );
      })}
      {checking ? <ActivityIndicator /> : ready ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={composer}
            onChangeText={setComposer}
            placeholder="Message au groupe…"
            multiline
            maxLength={12000}
            editable={!sending}
          />
          <TouchableOpacity onPress={() => void send()} disabled={!composer.trim() || sending} style={[styles.send, (!composer.trim() || sending) && styles.disabled]}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>➤</Text>}
          </TouchableOpacity>
        </View>
      ) : <Text style={styles.locked}>Le composer reste bloqué : K-ssenger n’enverra jamais de texte en clair à la place.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  security: { backgroundColor: '#eaf3f7', borderRadius: 12, padding: 9, marginBottom: 9 },
  securityText: { color: '#486d82', textAlign: 'center', fontSize: 11, fontWeight: '800' },
  notice: { color: '#326e94', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  empty: { color: '#7893a3', textAlign: 'center', paddingVertical: 18 },
  bubble: { maxWidth: '84%', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 17, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#dff2ff', borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe9f1', borderBottomLeftRadius: 5 },
  body: { color: '#173448', fontSize: 14, lineHeight: 20 },
  meta: { color: '#7893a3', fontSize: 9, marginTop: 5, textAlign: 'right' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d7e9f3' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d6e7f0', borderRadius: 17, paddingHorizontal: 12, paddingVertical: 9 },
  send: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5' },
  disabled: { opacity: 0.45 },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  locked: { color: '#7893a3', textAlign: 'center', fontSize: 11, paddingVertical: 12 },
});
