import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { launchImageLibrarySafe } from '../../lib/pickMedia';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { Socket } from 'socket.io-client';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import { ensureChatDevice, encodePlaintext, readMessageText } from '../../lib/chatTransport';
import { QUICK_REACTIONS, isBigEmoji, isSendKey, myReaction, summarizeReactions, type MessageReaction } from '../../lib/chatExtras';
import { GROUP_ENCRYPTED_ALGO, decryptGroupMessage, encryptGroupMessage } from '../../lib/groupE2ee';
import { EmojiPanel } from '../chats/EmojiPanel';
import { VoiceComposerButton } from '../chats/VoiceComposerButton';
import { VoiceMessageBubble } from '../chats/VoiceMessageBubble';
import { VOICE_MIME, type VoiceRecordingResult } from '../../lib/voiceRecording';
import { emitAck, waitForSocketReady } from '../../lib/realtime';
import { onMessageSent } from '../../lib/soundKit';
import { radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

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
  reactions?: MessageReaction[];
  deletedAt?: string | null;
};

type GroupContent =
  | { v: 1; type: 'text'; text: string }
  | { v: 1; type: 'media'; mediaId: string; mimeType: SupportedMediaMime; caption?: string }
  | { v: 1; type: 'voice'; mediaId: string; mimeType: SupportedMediaMime; durationMs: number };

type Props = {
  socket: Socket;
  groupId: string;
  currentUserId: string;
  memberIds: string[];
  messages: GroupEncryptedMessage[];
  groupKey?: string | null;
  onReact?: (messageId: string, reactions: MessageReaction[]) => void;
  onDelete?: (messageId: string, deletedAt: string) => void;
};

const GROUP_UNDECRYPTABLE_TEXT = '🔒 Message chiffré (clé indisponible sur cet appareil)';

function readGroupMessageText(message: GroupEncryptedMessage, groupKey: string | null | undefined): string {
  if (message.algorithm === GROUP_ENCRYPTED_ALGO) {
    const opened = groupKey ? decryptGroupMessage(message.ciphertext ?? '', groupKey) : null;
    return opened ?? GROUP_UNDECRYPTABLE_TEXT;
  }
  return readMessageText(message);
}

const GROUP_MEDIA_MIMES = new Set<SupportedMediaMime>(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
const GROUP_VOICE_MIMES = new Set<SupportedMediaMime>(['audio/m4a', 'audio/webm']);
const GROUP_MEDIA_MAX_BYTES = 100 * 1024 * 1024;
const GROUP_MAX_VOICE_DURATION_MS = 600_000;

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
    if (
      parsed.v === 1 && parsed.type === 'voice' && typeof parsed.mediaId === 'string'
      && typeof parsed.mimeType === 'string' && GROUP_VOICE_MIMES.has(parsed.mimeType as SupportedMediaMime)
      && typeof parsed.durationMs === 'number' && Number.isInteger(parsed.durationMs)
      && parsed.durationMs > 0 && parsed.durationMs <= GROUP_MAX_VOICE_DURATION_MS
    ) {
      return { v: 1, type: 'voice', mediaId: parsed.mediaId, mimeType: parsed.mimeType as SupportedMediaMime, durationMs: parsed.durationMs };
    }
  } catch {
    // Plain string message — show it as text.
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
  const { styles } = useThemedStyles();
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  return <VideoView player={player} style={styles.mediaPreview} nativeControls contentFit="contain" />;
}

function GroupMedia({ content }: { content: Extract<GroupContent, { type: 'media' }> }) {
  const { styles } = useThemedStyles();
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

export function GroupEncryptedChat({ socket, groupId, currentUserId, messages, groupKey, onReact, onDelete }: Props) {
  const { styles, colors } = useThemedStyles();
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const deviceIdRef = useRef('');
  const [deviceReady, setDeviceReady] = useState(false);

  useEffect(() => {
    let active = true;
    void ensureChatDevice(currentUserId)
      .then((id) => { if (active) { deviceIdRef.current = id; setDeviceReady(true); } })
      .catch(() => { if (active) setNotice('Impossible d’initialiser l’envoi pour le moment.'); });
    return () => { active = false; };
  }, [currentUserId]);

  const sendContent = async (content: GroupContent) => {
    if (sending || !deviceReady) return;
    setSending(true);
    setNotice('');
    try {
      const payload = serializeGroupContent(content);
      const { algorithm, ciphertext } = groupKey ? encryptGroupMessage(payload, groupKey) : encodePlaintext(payload);
      const clientMessageId = Crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const response = await emitAck<{ ok: boolean; id?: string; error?: string }>(socket, 'message:send', {
        clientMessageId,
        conversationId: groupId,
        senderDeviceId: deviceIdRef.current,
        algorithm,
        ciphertext,
        createdAt,
      });
      if (!response.ok || !response.id) throw new Error(response.error ?? 'GROUP_SEND_FAILED');
      setComposer('');
      onMessageSent();
    } catch {
      setNotice('Message non envoyé. Réessaie.');
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const body = composer.trim();
    if (!body) return;
    setShowEmoji(false);
    await sendContent({ v: 1, type: 'text', text: body });
  };

  const sendQuick = async (emoji: string) => {
    if (sending || !deviceReady) return;
    await sendContent({ v: 1, type: 'text', text: emoji });
  };

  const react = async (message: GroupEncryptedMessage, emoji: string) => {
    const mine = myReaction(message.reactions, currentUserId);
    const nextReaction = mine === emoji ? null : emoji;
    setReactingId(null);
    try {
      const res = await emitAck<{ ok: boolean; reactions?: MessageReaction[] }>(socket, 'message:react', {
        conversationId: groupId, messageId: message.id, reaction: nextReaction,
      });
      if (res.ok && res.reactions) onReact?.(message.id, res.reactions);
    } catch {
      setNotice('Réaction non enregistrée.');
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (deletingId) return;
    setReactingId(null);
    setDeletingId(messageId);
    try {
      // Waits for the server's confirmation before updating the UI (unlike
      // the direct-chat version, deliberately not optimistic) — a message
      // marked "deleted" that the server never actually deleted is a worse
      // lie than a half-second delay. See DirectConversationScreen.tsx for
      // the incident this avoids.
      // Same real cause as direct messages (see realtime.ts waitForSocketReady):
      // emitAck rejects instantly while the socket is mid-reconnect, so a
      // blind fixed-delay retry can fire before reconnection actually
      // finishes. Wait for the real 'connect' event between attempts.
      let res = await emitAck<{ ok: boolean }>(socket, 'message:delete', { conversationId: groupId, messageId }).catch(() => ({ ok: false }));
      for (let attempt = 1; !res.ok && attempt < 4; attempt += 1) {
        await waitForSocketReady(socket, 2500);
        res = await emitAck<{ ok: boolean }>(socket, 'message:delete', { conversationId: groupId, messageId }).catch(() => ({ ok: false }));
      }
      if (res.ok) onDelete?.(messageId, new Date().toISOString());
      else setNotice('Suppression impossible.');
    } finally {
      setDeletingId(null);
    }
  };

  const pickAndSendMedia = async () => {
    if (sending || !deviceReady) return;
    setSending(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setNotice('Autorise l’accès aux photos et vidéos pour partager un média dans ce groupe.');
        return;
      }
      const picked = await launchImageLibrarySafe({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 120 });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.uri) throw new Error('GROUP_MEDIA_UNSUPPORTED');
      const mimeType = inferGroupMime(asset);
      if (!mimeType || (asset.fileSize !== undefined && asset.fileSize > GROUP_MEDIA_MAX_BYTES)) throw new Error('GROUP_MEDIA_UNSUPPORTED');
      setNotice('Envoi du média du groupe…');
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

  const sendVoiceNote = async (recording: VoiceRecordingResult) => {
    if (sending || !deviceReady) return;
    setSending(true);
    try {
      setNotice('Envoi du message vocal du groupe…');
      const { mediaId } = await uploadLocalMedia({ uri: recording.uri, mimeType: VOICE_MIME, purpose: 'chat', conversationId: groupId });
      setSending(false);
      await sendContent({ v: 1, type: 'voice', mediaId, mimeType: VOICE_MIME, durationMs: recording.durationMs });
    } catch {
      setNotice('Message vocal non envoyé.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.security}>
        <Text style={styles.securityText}>{groupKey ? '🔒 Chiffré de bout en bout — même K-ssenger ne peut pas lire ces messages.' : '🔒 Connexion sécurisée (TLS). Le chiffrement de bout en bout s’active dès que ta clé de groupe est prête.'}</Text>
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {messages.length === 0 ? <Text style={styles.empty}>Aucun message. Lance la conversation du groupe.</Text> : messages.map((message) => {
        const mine = message.senderUserId === currentUserId;
        if (message.deletedAt) {
          return (
            <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
              <View style={[styles.bubble, styles.bubbleDeleted]}>
                <Text style={styles.bodyDeleted}>{mine ? 'Tu as supprimé ce message' : 'Ce message a été supprimé'}</Text>
              </View>
            </View>
          );
        }
        const content = parseGroupContent(readGroupMessageText(message, groupKey));
        const big = content.type === 'text' && isBigEmoji(content.text);
        const summary = summarizeReactions(message.reactions, currentUserId);
        const mineReaction = myReaction(message.reactions, currentUserId);
        return (
          <View key={message.id} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setReactingId((id) => id === message.id ? null : message.id)}
              style={[styles.bubble, mine ? styles.mine : styles.theirs, big && styles.bubbleBig]}
            >
              {content.type === 'media' ? <GroupMedia content={content} />
                : content.type === 'voice' ? <VoiceMessageBubble mediaId={content.mediaId} durationMs={content.durationMs} mine={mine} colors={colors} />
                : <Text style={big ? styles.bigEmoji : styles.body}>{content.text}</Text>}
              <Text style={styles.meta}>{new Date(message.createdAt).toLocaleTimeString()} {mine && message.receiptState ? (message.receiptState === 'read' ? ' · ✓✓ Lu' : ' · ✓ Reçu') : ''}</Text>
            </TouchableOpacity>
            {summary.length > 0 && (
              <View style={[styles.chips, mine ? styles.chipsMine : styles.chipsTheirs]}>
                {summary.map((s) => (
                  <TouchableOpacity key={s.emoji} onPress={() => void react(message, s.emoji)} style={[styles.chip, s.mine && styles.chipMine]}>
                    <Text style={styles.chipText}>{s.emoji}{s.count > 1 ? ` ${s.count}` : ''}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {reactingId === message.id && (
              <View style={[styles.reactBar, mine ? styles.chipsMine : styles.chipsTheirs]}>
                {QUICK_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => void react(message, emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={`Réagir ${emoji}`}
                    style={[styles.reactBtn, mineReaction === emoji && styles.reactBtnActive]}
                  >
                    <Text style={styles.reactBtnText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {reactingId === message.id && mine && (
              <TouchableOpacity
                onPress={() => void deleteMessage(message.id)}
                disabled={deletingId === message.id}
                accessibilityRole="button"
                accessibilityLabel="Supprimer ce message"
                style={[styles.deleteBtn, deletingId === message.id && styles.disabled]}
              >
                <Text style={styles.deleteBtnText}>{deletingId === message.id ? 'Suppression…' : '🗑️ Supprimer'}</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      <View style={styles.quickRow}>
        {QUICK_REACTIONS.map((emoji) => (
          <TouchableOpacity key={emoji} disabled={sending || !deviceReady} onPress={() => void sendQuick(emoji)} accessibilityRole="button" accessibilityLabel={`Envoyer ${emoji}`} style={[styles.quickBtn, (sending || !deviceReady) && styles.disabled]}>
            <Text style={styles.quickEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {showEmoji && <EmojiPanel onPick={(emoji) => setComposer((c) => (c + emoji).slice(0, 12000))} />}
      <View style={styles.composer}>
        {!recordingVoice && (
          <TouchableOpacity onPress={() => void pickAndSendMedia()} disabled={sending || !deviceReady} style={[styles.attach, (sending || !deviceReady) && styles.disabled]} accessibilityLabel="Envoyer une photo ou une vidéo au groupe">
            <Text style={styles.attachText}>＋</Text>
          </TouchableOpacity>
        )}
        {!recordingVoice && (
          <TouchableOpacity onPress={() => setShowEmoji((v) => !v)} accessibilityRole="button" accessibilityLabel="Ouvrir les emojis" style={[styles.attach, showEmoji && styles.attachActive]}>
            <Text style={styles.attachText}>😊</Text>
          </TouchableOpacity>
        )}
        {!composer.trim() && (
          <VoiceComposerButton
            colors={colors}
            disabled={sending || !deviceReady}
            onRecorded={(r) => void sendVoiceNote(r)}
            onRecordingStateChange={setRecordingVoice}
          />
        )}
        {!recordingVoice && (
          <>
            <TextInput
              style={styles.input}
              value={composer}
              onChangeText={setComposer}
              placeholder="Message au groupe…"
              placeholderTextColor={colors.inkFaint}
              multiline
              maxLength={12000}
              editable={!sending}
              onFocus={() => setShowEmoji(false)}
              onKeyPress={(e) => {
                if (isSendKey(e.nativeEvent as unknown as { key?: string; shiftKey?: boolean })) {
                  (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                  void send();
                }
              }}
            />
            <TouchableOpacity onPress={() => void send()} disabled={!composer.trim() || sending || !deviceReady} accessibilityRole="button" accessibilityLabel="Envoyer au groupe" style={[styles.send, (!composer.trim() || sending || !deviceReady) && styles.disabled]}>
              {sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>➤</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  wrap: { marginTop: spacing.md },
  security: { backgroundColor: palette.azureSoft, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  securityText: { color: palette.azureDeep, textAlign: 'center', fontSize: 11, fontWeight: '800' },
  notice: { color: palette.azureDeep, fontWeight: '700', textAlign: 'center', marginBottom: spacing.sm },
  empty: { color: palette.inkSoft, textAlign: 'center', paddingVertical: spacing.lg },
  row: { marginBottom: spacing.sm, maxWidth: '86%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleBig: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 2, paddingVertical: 0 },
  bubbleDeleted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.hairline, borderStyle: 'dashed' },
  bodyDeleted: { color: palette.inkFaint, fontSize: 14, fontStyle: 'italic' },
  deleteBtn: { marginTop: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: palette.inkFaint },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chipsMine: { justifyContent: 'flex-end' },
  chipsTheirs: { justifyContent: 'flex-start' },
  chip: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  chipMine: { backgroundColor: palette.azureSoft, borderColor: palette.azure },
  chipText: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  reactBar: { flexDirection: 'row', gap: 2, marginTop: 4, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.pill, padding: 3 },
  reactBtn: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  reactBtnActive: { backgroundColor: palette.azureSoft },
  reactBtnText: { fontSize: 17 },
  mine: { alignSelf: 'flex-end', backgroundColor: palette.azureSoft, borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderBottomLeftRadius: 5 },
  body: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  bigEmoji: { fontSize: 40, lineHeight: 48 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 4, marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: palette.hairline },
  quickBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  quickEmoji: { fontSize: 19 },
  attachActive: { backgroundColor: palette.azure, borderColor: palette.azure },
  meta: { color: palette.inkFaint, fontSize: 9, marginTop: 5, textAlign: 'right' },
  mediaPreview: { width: 230, height: 230, borderRadius: radius.md, backgroundColor: palette.hairline, marginBottom: 6 },
  mediaError: { color: palette.danger, fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.hairline },
  attach: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azureSoft, borderWidth: 1, borderColor: palette.hairline },
  attachText: { color: palette.azure, fontSize: 26, lineHeight: 28, fontWeight: '700' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: palette.ink },
  send: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure },
  disabled: { opacity: 0.45 },
  sendText: { color: palette.white, fontSize: 20, fontWeight: '900' },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
