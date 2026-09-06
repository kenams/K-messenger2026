import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { canUnlockPrivateComposer, getKssengerE2eeStatus } from '../../lib/e2ee';
import { loadLocalMessage, storeLocalMessage } from '../../lib/localMessageStore';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
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

type GroupContent =
  | { v: 1; type: 'text'; text: string }
  | { v: 1; type: 'media'; mediaId: string; mimeType: SupportedMediaMime; caption?: string };

type Props = {
  socket: Socket;
  groupId: string;
  currentUserId: string;
  memberIds: string[];
  messages: GroupEncryptedMessage[];
};

const GROUP_MEDIA_MIMES = new Set<SupportedMediaMime>(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
const GROUP_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

function parseGroupContent(value: string): GroupContent {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.v === 1 && parsed.type === 'text' && typeof parsed.text === 'string') {
      return { v: 1, type: 'text', text: parsed.text };
    }
    if (
      parsed.v === 1 && parsed.type === 'media'
      && typeof parsed.mediaId === 'string'
      && typeof parsed.mimeType === 'string'
      && GROUP_MEDIA_MIMES.has(parsed.mimeType as SupportedMediaMime)
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
    // Legacy group messages were encrypted as plain text and remain readable.
  }
  return { v: 1, type: 'text', text: value };
}

function serializeGroupContent(content: GroupContent) {
  return JSON.stringify(content);
}

function inferGroupMime(asset: ImagePicker.ImagePickerAsset): SupportedMediaMime | null {
  const normalized = asset.mimeType?.toLowerCase();
  if (normalized && GROUP_MEDIA_MIMES.has(normalized as SupportedMediaMime)) return normalized as SupportedMediaMime;
  const uri = asset.uri.toLowerCase();
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.mp4')) return 'video/mp4';
  if (uri.endsWith('.mov')) return 'video/quicktime';
  return null;
}

function GroupVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  return <VideoView player={player} style={styles.mediaPreview} nativeControls contentFit="contain" />;
}

function GroupMedia({ content }: { content: Extract<GroupContent, { type: 'media' }> }) {
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
        : <GroupVideo uri={uri} />}
      {!!content.caption && <Text style={styles.body}>{content.caption}</Text>}
    </View>
  );
}

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
    const pending = messages.filter((message) => plain[message.id] === undefined && !failed[message.id]);
    void Promise.all(pending.map(async (message) => {
      try {
        const body = message.senderUserId === currentUserId
          ? await loadLocalMessage(currentUserId, message.id)
          : (
            message.algorithm === 'signal-libsignal-multidevice-v1' && message.ciphertext && message.senderDeviceId
              ? await decryptSignalEnvelope(currentUserId, message.senderUserId, message.senderDeviceId, message.ciphertext)
              : null
          );
        if (active && body !== null) setPlain((current) => ({ ...current, [message.id]: body }));
      } catch {
        if (active && message.senderUserId !== currentUserId) setFailed((current) => ({ ...current, [message.id]: true }));
      }
    }));
    return () => { active = false; };
  }, [messages, currentUserId, ready, plain, failed]);

  const sendContent = async (content: GroupContent) => {
    if (sending || !ready) return;
    setSending(true);
    setNotice('Chiffrement du message de groupe…');
    try {
      const plaintext = serializeGroupContent(content);
      const recipients = [...new Set(memberIds)].filter((id) => id !== currentUserId);
      const encrypted = await encryptForUsers(currentUserId, recipients, plaintext);
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
      await storeLocalMessage(currentUserId, response.id, plaintext).catch(() => undefined);
      setPlain((current) => ({ ...current, [response.id!]: plaintext }));
      setComposer('');
      setNotice(content.type === 'media' ? '🔐 Média privé du groupe chiffré et envoyé.' : '🔐 Message de groupe chiffré et envoyé.');
    } catch {
      setNotice('Envoi refusé : tous les membres doivent disposer d’un appareil E2EE actif. Aucun plaintext n’a été envoyé.');
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const body = composer.trim();
    if (!body) return;
    await sendContent({ v: 1, type: 'text', text: body });
  };

  const pickAndSendMedia = async () => {
    if (sending || !ready) return;
    setSending(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice('Autorise l’accès aux photos et vidéos pour partager un média dans ce groupe.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 120 });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.uri) throw new Error('GROUP_MEDIA_UNSUPPORTED');
      const mimeType = inferGroupMime(asset);
      if (!mimeType || (asset.fileSize !== undefined && asset.fileSize > GROUP_MEDIA_MAX_BYTES)) throw new Error('GROUP_MEDIA_UNSUPPORTED');
      setNotice('Upload privé du média du groupe…');
      const { mediaId } = await uploadLocalMedia({
        uri: asset.uri,
        mimeType,
        byteSize: asset.fileSize ?? undefined,
        purpose: 'chat',
        conversationId: groupId,
      });
      setSending(false);
      await sendContent({
        v: 1,
        type: 'media',
        mediaId,
        mimeType,
        ...(composer.trim() ? { caption: composer.trim().slice(0, 500) } : {}),
      });
    } catch {
      setNotice('Média non envoyé. Formats acceptés : JPG, PNG, WebP, MP4/MOV · 100 Mo max.');
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
        const serialized = plain[message.id];
        const content = serialized ? parseGroupContent(serialized) : undefined;
        return (
          <View key={message.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            {content?.type === 'media'
              ? <GroupMedia content={content} />
              : <Text style={styles.body}>{content?.type === 'text' ? content.text : (failed[message.id] ? '⚠️ Message impossible à déchiffrer sur cet appareil.' : '🔐 Message chiffré')}</Text>}
            <Text style={styles.meta}>{new Date(message.createdAt).toLocaleTimeString()} {mine && message.receiptState ? (message.receiptState === 'read' ? ' · ✓✓ Lu' : ' · ✓ Reçu') : ''}</Text>
          </View>
        );
      })}
      {checking ? <ActivityIndicator /> : ready ? (
        <View style={styles.composer}>
          <TouchableOpacity onPress={() => void pickAndSendMedia()} disabled={sending} style={[styles.attach, sending && styles.disabled]} accessibilityLabel="Envoyer une photo ou une vidéo au groupe">
            <Text style={styles.attachText}>＋</Text>
          </TouchableOpacity>
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
  mediaPreview: { width: 230, height: 230, borderRadius: 12, backgroundColor: '#dbe9f1', marginBottom: 6 },
  mediaError: { color: '#a63d3d', fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#d7e9f3' },
  attach: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef6fa', borderWidth: 1, borderColor: '#cfe1eb' },
  attachText: { color: '#2189c5', fontSize: 26, lineHeight: 28, fontWeight: '700' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d6e7f0', borderRadius: 17, paddingHorizontal: 12, paddingVertical: 9 },
  send: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2189c5' },
  disabled: { opacity: 0.45 },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  locked: { color: '#7893a3', textAlign: 'center', fontSize: 11, paddingVertical: 12 },
});
