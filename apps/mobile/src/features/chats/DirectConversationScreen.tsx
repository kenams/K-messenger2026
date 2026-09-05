import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ActivityIndicator, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Socket } from 'socket.io-client';
import type { Contact } from '../contacts/MsnContactsScreen';
import { getBackend } from '../../lib/backend';
import { canUnlockPrivateComposer, getKssengerE2eeStatus } from '../../lib/e2ee';
import { loadLocalMessage, storeLocalMessage } from '../../lib/localMessageStore';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import {
  decryptDirectFromContact,
  encryptDirectForContact,
  ensureLocalSignalDevice,
  newEncryptedMessageId,
} from '../../lib/signalDevice';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket } from '../../lib/realtime';

type ReceiptState = 'delivered' | 'read';
type DirectResponse = { ok: boolean; conversationId?: string; error?: string };
type ChatContent =
  | { v: 1; type: 'text'; text: string }
  | { v: 1; type: 'media'; mediaId: string; mimeType: SupportedMediaMime; caption?: string };
type EncryptedMessage = {
  id: string;
  clientMessageId?: string;
  senderUserId: string;
  senderDeviceId?: string | null;
  createdAt: string;
  algorithm: string;
  ciphertext?: string;
  conversationId: string;
  receiptState?: ReceiptState;
  plaintext?: string;
  content?: ChatContent;
  decryptFailed?: boolean;
};
type HistoryResponse = { ok: boolean; messages?: EncryptedMessage[]; error?: string };
type SendResponse = { ok: boolean; id?: string; duplicate?: boolean; error?: string };

const CHAT_MIMES = new Set<SupportedMediaMime>(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
const CHAT_MAX_BYTES = 100 * 1024 * 1024;

function parseChatContent(value: string): ChatContent {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.v === 1 && parsed.type === 'text' && typeof parsed.text === 'string') {
      return { v: 1, type: 'text', text: parsed.text };
    }
    if (
      parsed.v === 1 && parsed.type === 'media' && typeof parsed.mediaId === 'string'
      && typeof parsed.mimeType === 'string' && CHAT_MIMES.has(parsed.mimeType as SupportedMediaMime)
    ) {
      return {
        v: 1,
        type: 'media',
        mediaId: parsed.mediaId,
        mimeType: parsed.mimeType as SupportedMediaMime,
        ...(typeof parsed.caption === 'string' && parsed.caption.trim() ? { caption: parsed.caption.slice(0, 500) } : {}),
      };
    }
  } catch {
    // Backward-compatible legacy encrypted text messages are still readable.
  }
  return { v: 1, type: 'text', text: value };
}

function serializeChatContent(content: ChatContent) {
  return JSON.stringify(content);
}

function inferChatMime(asset: ImagePicker.ImagePickerAsset): SupportedMediaMime | null {
  const normalized = asset.mimeType?.toLowerCase();
  if (normalized && CHAT_MIMES.has(normalized as SupportedMediaMime)) return normalized as SupportedMediaMime;
  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.mp4')) return 'video/mp4';
  if (uri.endsWith('.mov')) return 'video/quicktime';
  return null;
}

function ChatVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  return <VideoView player={player} style={styles.mediaPreview} nativeControls contentFit="contain" />;
}

function ChatMedia({ content }: { content: Extract<ChatContent, { type: 'media' }> }) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setUri(null);
    setFailed(false);
    void getMediaDownload(content.mediaId)
      .then((download) => { if (active) setUri(download.url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [content.mediaId]);
  if (failed) return <Text style={styles.mediaError}>⚠️ Média indisponible ou non autorisé.</Text>;
  if (!uri) return <ActivityIndicator />;
  return (
    <View>
      {content.mimeType.startsWith('image/')
        ? <Image source={{ uri }} style={styles.mediaPreview} resizeMode="contain" />
        : <ChatVideo uri={uri} />}
      {!!content.caption && <Text style={styles.bodyText}>{content.caption}</Text>}
    </View>
  );
}

export function DirectConversationScreen({ contact, onBack }: { contact: Contact; onBack: () => void }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [history, setHistory] = useState<EncryptedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [e2eeReady, setE2eeReady] = useState(false);
  const canSend = useMemo(() => !!socket && !!conversationId && !!currentUserId && e2eeReady && !sending, [socket, conversationId, currentUserId, e2eeReady, sending]);

  useEffect(() => {
    let active = true;
    let clientRef: Socket | null = null;
    let messageHandler: ((message: EncryptedMessage) => void) | null = null;
    let receiptHandler: ((receipt: { messageId?: string; state?: ReceiptState }) => void) | null = null;
    let connectHandler: (() => void) | null = null;
    let disconnectHandler: (() => void) | null = null;

    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId(), getKssengerE2eeStatus()]).then(async ([client, userId, e2ee]) => {
      if (!active) return;
      clientRef = client;
      setSocket(client);
      setCurrentUserId(userId);
      const ready = canUnlockPrivateComposer(e2ee);
      setE2eeReady(ready);
      if (ready) await ensureLocalSignalDevice(userId);

      const { data: privacy } = await getBackend().from('privacy_settings').select('read_receipts').eq('user_id', userId).maybeSingle();
      const receiptState: ReceiptState = (privacy as { read_receipts?: boolean } | null)?.read_receipts === false ? 'delivered' : 'read';
      const direct = await emitAck<DirectResponse>(client, 'conversation:direct', { userId: contact.id });
      if (!direct.ok || !direct.conversationId) throw new Error(direct.error ?? 'DIRECT_CONVERSATION_FAILED');
      const id = direct.conversationId;
      setConversationId(id);

      const decryptMessage = async (message: EncryptedMessage): Promise<EncryptedMessage> => {
        if (message.senderUserId === userId) {
          if (message.plaintext) return { ...message, content: message.content ?? parseChatContent(message.plaintext) };
          try {
            const localPlaintext = await loadLocalMessage(userId, message.id);
            return localPlaintext ? { ...message, plaintext: localPlaintext, content: parseChatContent(localPlaintext) } : message;
          } catch {
            return message;
          }
        }
        if (!ready) return message;
        if (message.algorithm !== 'signal-libsignal-multidevice-v1' || !message.ciphertext || !message.senderDeviceId) return { ...message, decryptFailed: true };
        try {
          const plaintext = await decryptDirectFromContact(userId, message.senderUserId, message.senderDeviceId, message.ciphertext);
          return { ...message, plaintext, content: parseChatContent(plaintext) };
        } catch {
          return { ...message, decryptFailed: true };
        }
      };

      const acknowledge = async (messages: EncryptedMessage[]) => {
        await Promise.allSettled(messages.filter((message) => message.senderUserId !== userId && !message.decryptFailed).map((message) => emitAck(client, 'message:receipt', {
          conversationId: id, messageId: message.id, state: receiptState,
        })));
      };

      const syncConversation = async () => {
        const joined = await emitAck<{ ok: boolean }>(client, 'conversation:join', { conversationId: id });
        if (!joined.ok) throw new Error('DIRECT_JOIN_FAILED');
        const response = await emitAck<HistoryResponse>(client, 'conversation:history', { conversationId: id, limit: 50 });
        if (!response.ok) throw new Error(response.error ?? 'HISTORY_FAILED');
        const loaded = await Promise.all((response.messages ?? []).map(decryptMessage));
        if (active) setHistory(loaded);
        await acknowledge(loaded);
      };

      await syncConversation();
      messageHandler = (message) => {
        if (message.conversationId !== id) return;
        void decryptMessage(message).then((resolved) => {
          if (!active) return;
          setHistory((items) => items.some((item) => item.id === resolved.id) ? items : [...items, resolved]);
          if (resolved.senderUserId !== userId && !resolved.decryptFailed) {
            void emitAck(client, 'message:receipt', { conversationId: id, messageId: resolved.id, state: receiptState }).catch(() => undefined);
          }
        });
      };
      receiptHandler = (receipt) => {
        if (!receipt.messageId || !receipt.state) return;
        setHistory((items) => items.map((message) => message.id === receipt.messageId ? { ...message, receiptState: receipt.state } : message));
      };
      connectHandler = () => {
        if (!active) return;
        setNotice('Connexion rétablie · resynchronisation…');
        void syncConversation().then(() => { if (active) setNotice('Reconnecté · conversation resynchronisée.'); }).catch(() => { if (active) setNotice('Connexion rétablie, resynchronisation à retenter.'); });
      };
      disconnectHandler = () => { if (active) setNotice('Hors ligne · aucun envoi fantôme ne sera mis en attente.'); };
      client.on('message:new', messageHandler);
      client.on('message:receipt', receiptHandler);
      client.on('connect', connectHandler);
      client.on('disconnect', disconnectHandler);
      if (active) setNotice(ready ? '🔐 libsignal actif · clés privées protégées sur cet appareil.' : 'Le chat reste verrouillé : le contrôle natif E2EE de cet appareil n’est pas validé.');
    }).catch(() => { if (active) setNotice('Impossible d’ouvrir cette conversation pour le moment.'); }).finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      if (clientRef && messageHandler) clientRef.off('message:new', messageHandler);
      if (clientRef && receiptHandler) clientRef.off('message:receipt', receiptHandler);
      if (clientRef && connectHandler) clientRef.off('connect', connectHandler);
      if (clientRef && disconnectHandler) clientRef.off('disconnect', disconnectHandler);
    };
  }, [contact.id]);

  const sendKPulse = async () => {
    if (!socket) return;
    try {
      const response = await emitAck<{ ok: boolean }>(socket, 'kpulse:send', { recipientId: contact.id, variant: 'classic' });
      setNotice(response.ok ? `⚡ K-Pulse envoyé à ${contact.displayName}.` : 'K-Pulse refusé ou limité.');
    } catch { setNotice('K-Pulse impossible hors ligne.'); }
  };

  const sendContent = async (content: ChatContent) => {
    if (!canSend || !socket) return;
    setSending(true);
    setNotice('Chiffrement sur cet appareil…');
    try {
      const plaintext = serializeChatContent(content);
      const encrypted = await encryptDirectForContact(currentUserId, contact.id, plaintext);
      const clientMessageId = await newEncryptedMessageId();
      const createdAt = new Date().toISOString();
      const response = await emitAck<SendResponse>(socket, 'message:send', { clientMessageId, conversationId, senderDeviceId: encrypted.senderDeviceId, algorithm: encrypted.algorithm, ciphertext: encrypted.ciphertext, createdAt });
      if (!response.ok || !response.id) throw new Error(response.error ?? 'MESSAGE_SEND_FAILED');
      await storeLocalMessage(currentUserId, response.id, plaintext).catch(() => undefined);
      setComposer('');
      setHistory((items) => items.some((item) => item.id === response.id) ? items : [...items, {
        id: response.id!, clientMessageId, senderUserId: currentUserId, senderDeviceId: encrypted.senderDeviceId,
        createdAt, algorithm: encrypted.algorithm, ciphertext: encrypted.ciphertext, conversationId, plaintext, content,
      }]);
      setNotice(content.type === 'media' ? '🔐 Média privé chiffré et envoyé.' : '🔐 Message chiffré et envoyé.');
    } catch {
      setNotice('Envoi chiffré impossible. Aucun contenu en clair n’a été envoyé.');
    } finally { setSending(false); }
  };

  const sendMessage = async () => {
    const text = composer.trim();
    if (!text) return;
    await sendContent({ v: 1, type: 'text', text });
  };

  const pickAndSendMedia = async () => {
    if (!canSend || !conversationId) return;
    setSending(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice('Autorise l’accès aux photos et vidéos pour envoyer un média.'); return; }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 120 });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const mimeType = asset ? inferChatMime(asset) : null;
      if (!asset?.uri || !mimeType || (asset.fileSize !== undefined && asset.fileSize > CHAT_MAX_BYTES)) throw new Error('CHAT_MEDIA_UNSUPPORTED');
      setNotice('Upload privé du média…');
      const { mediaId } = await uploadLocalMedia({ uri: asset.uri, mimeType, byteSize: asset.fileSize ?? undefined, purpose: 'chat', conversationId });
      setSending(false);
      await sendContent({ v: 1, type: 'media', mediaId, mimeType, ...(composer.trim() ? { caption: composer.trim().slice(0, 500) } : {}) });
    } catch {
      setNotice('Média non envoyé. Formats acceptés : JPG, PNG, WebP, MP4/MOV · 100 Mo max.');
    } finally { setSending(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View style={styles.avatar}><Text style={styles.avatarText}>{contact.displayName[0] ?? '?'}</Text></View>
        <View style={styles.flex}><Text style={styles.name}>{contact.nickname}</Text><Text style={styles.sub}>{contact.handle} · {contact.presence}</Text></View>
        <TouchableOpacity style={styles.pulse} onPress={() => void sendKPulse()} accessibilityLabel={`Envoyer un K-Pulse à ${contact.displayName}`}><Text style={styles.pulseText}>⚡</Text></TouchableOpacity>
      </View>
      <View style={styles.security}><Text style={styles.securityText}>{e2eeReady ? '🔐 Signal/libsignal · texte et références média chiffrés de bout en bout' : '🛡️ Envoi verrouillé tant que le contrôle E2EE natif n’est pas validé'}</Text></View>
      {loading ? <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Ouverture de la conversation…</Text></View> : (
        <ScrollView style={styles.body} contentContainerStyle={styles.content}>
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {!history.length ? <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.emptyTitle}>Conversation prête</Text><Text style={styles.muted}>Envoie ton premier message ou média.</Text></View> : history.map((message) => {
            const mine = message.senderUserId === currentUserId;
            const content = message.content ?? (message.plaintext ? parseChatContent(message.plaintext) : undefined);
            return <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              {content?.type === 'media' ? <ChatMedia content={content} /> : <Text style={styles.bodyText}>{content?.type === 'text' ? content.text : (message.decryptFailed ? '⚠️ Impossible de déchiffrer ce message sur cet appareil.' : '🔐 Message chiffré')}</Text>}
              <Text style={styles.messageMeta}>{new Date(message.createdAt).toLocaleTimeString()} {mine && message.receiptState ? (message.receiptState === 'read' ? ' · ✓✓ Lu' : ' · ✓ Reçu') : ''}</Text>
            </View>;
          })}
        </ScrollView>
      )}
      {e2eeReady ? <View style={styles.composer}>
        <TouchableOpacity disabled={!canSend} onPress={() => void pickAndSendMedia()} style={[styles.attach, !canSend && styles.disabled]} accessibilityLabel="Envoyer une photo ou une vidéo"><Text style={styles.attachText}>＋</Text></TouchableOpacity>
        <TextInput style={styles.input} value={composer} onChangeText={setComposer} placeholder="Écrire un message…" maxLength={12000} multiline editable={!sending} />
        <TouchableOpacity disabled={!composer.trim() || sending} onPress={() => void sendMessage()} style={[styles.send, (!composer.trim() || sending) && styles.disabled]}>{sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>➤</Text>}</TouchableOpacity>
      </View> : <View style={styles.composerLocked}><Text style={styles.lock}>🔒</Text><View style={styles.flex}><Text style={styles.lockTitle}>Messagerie chiffrée verrouillée</Text><Text style={styles.muted}>Aucun plaintext ne sera envoyé pour contourner la sécurité.</Text></View></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#edf7fc' }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#d7e9f3' },
  back: { fontSize: 39, lineHeight: 40, color: '#2189c5' }, avatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: '#dff2ff', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#2a79a8', fontSize: 18, fontWeight: '900' },
  name: { color: '#173448', fontSize: 15, fontWeight: '900' }, sub: { color: '#6e8796', fontSize: 10, marginTop: 2 }, pulse: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#fff2bd', borderWidth: 1, borderColor: '#efcf65', alignItems: 'center', justifyContent: 'center' }, pulseText: { fontSize: 22 },
  security: { backgroundColor: '#eaf3f7', paddingHorizontal: 14, paddingVertical: 7 }, securityText: { color: '#617b89', fontSize: 10, lineHeight: 14, textAlign: 'center', fontWeight: '700' },
  body: { flex: 1 }, content: { padding: 14, paddingBottom: 28 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, notice: { color: '#326e94', fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  empty: { alignItems: 'center', marginTop: 70 }, emptyIcon: { fontSize: 44 }, emptyTitle: { color: '#173448', fontWeight: '900', fontSize: 18, marginTop: 8 }, muted: { color: '#7893a3', fontSize: 11, marginTop: 4 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 8 }, mine: { backgroundColor: '#dff2ff', alignSelf: 'flex-end', borderBottomRightRadius: 5 }, theirs: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 5, borderWidth: 1, borderColor: '#dbe9f1' }, bodyText: { color: '#173448', fontSize: 14, lineHeight: 20 }, messageMeta: { color: '#7893a3', fontSize: 9, marginTop: 5, textAlign: 'right' },
  mediaPreview: { width: 230, height: 230, borderRadius: 12, backgroundColor: '#dbe9f1', marginBottom: 6 }, mediaError: { color: '#a63d3d', fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, input: { flex: 1, maxHeight: 120, minHeight: 44, backgroundColor: '#f3f8fb', borderWidth: 1, borderColor: '#d6e7f0', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 }, send: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5' }, attach: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef6fa', borderWidth: 1, borderColor: '#cfe1eb' }, attachText: { color: '#2189c5', fontSize: 26, lineHeight: 28, fontWeight: '700' }, disabled: { opacity: 0.45 }, sendText: { color: '#fff', fontWeight: '900', fontSize: 20 },
  composerLocked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#d7e9f3' }, lock: { fontSize: 22 }, lockTitle: { color: '#173448', fontWeight: '800', fontSize: 12 },
});