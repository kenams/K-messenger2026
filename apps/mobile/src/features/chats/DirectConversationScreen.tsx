import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { launchImageLibrarySafe } from '../../lib/pickMedia';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import type { Socket } from 'socket.io-client';
import type { Contact } from '../contacts/MsnContactsScreen';
import { elevation, layout, presenceLabel, radius, spacing, type Palette, type TypeTokens } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { accentOf } from '../../theme/accent';
import { getBackend } from '../../lib/backend';
import { getMediaDownload, uploadLocalMedia, type SupportedMediaMime } from '../../lib/media';
import { ensureChatDevice, encodePlaintext, readMessageText } from '../../lib/chatTransport';
import { ensureIdentityKeyPair, fetchPeerPublicKey, encryptDirectMessage, decryptDirectMessage, ENCRYPTED_ALGO } from '../../lib/e2ee';
import {
  QUICK_REACTIONS,
  isBigEmoji,
  isSendKey,
  myReaction,
  summarizeReactions,
  type MessageReaction,
} from '../../lib/chatExtras';
import { EmojiPanel } from './EmojiPanel';
import { ComposerResizeHandle } from './ComposerResizeHandle';
import { useResizableComposerHeight } from '../../lib/composerResize';
import { VoiceComposerButton } from './VoiceComposerButton';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VOICE_MIME, type VoiceRecordingResult } from '../../lib/voiceRecording';
import { emitAck, getAuthenticatedUserId, getRealtimeSocket, waitForSocketReady } from '../../lib/realtime';
import { onMessageReceivedFrom, onMessageSent } from '../../lib/soundKit';

type ReceiptState = 'delivered' | 'read';
type DirectResponse = { ok: boolean; conversationId?: string; error?: string };
type ChatContent =
  | { v: 1; type: 'text'; text: string }
  | { v: 1; type: 'media'; mediaId: string; mimeType: SupportedMediaMime; caption?: string }
  | { v: 1; type: 'voice'; mediaId: string; mimeType: SupportedMediaMime; durationMs: number };
type ChatMessage = {
  id: string;
  clientMessageId?: string;
  senderUserId: string;
  senderDeviceId?: string | null;
  createdAt: string;
  algorithm: string;
  ciphertext?: string;
  conversationId: string;
  receiptState?: ReceiptState;
  readAt?: string | null;
  content?: ChatContent;
  reactions?: MessageReaction[];
  deletedAt?: string | null;
};
type HistoryResponse = { ok: boolean; messages?: ChatMessage[]; error?: string };
type SendResponse = { ok: boolean; id?: string; duplicate?: boolean; error?: string };

const CHAT_MIMES = new Set<SupportedMediaMime>(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
const VOICE_MIMES = new Set<SupportedMediaMime>(['audio/m4a', 'audio/webm']);
const CHAT_MAX_BYTES = 100 * 1024 * 1024;
const MAX_VOICE_DURATION_MS = 600_000;

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
    if (
      parsed.v === 1 && parsed.type === 'voice' && typeof parsed.mediaId === 'string'
      && typeof parsed.mimeType === 'string' && VOICE_MIMES.has(parsed.mimeType as SupportedMediaMime)
      && typeof parsed.durationMs === 'number' && Number.isInteger(parsed.durationMs)
      && parsed.durationMs > 0 && parsed.durationMs <= MAX_VOICE_DURATION_MS
    ) {
      return { v: 1, type: 'voice', mediaId: parsed.mediaId, mimeType: parsed.mimeType as SupportedMediaMime, durationMs: parsed.durationMs };
    }
  } catch {
    // Plain string message — show it as text.
  }
  return { v: 1, type: 'text', text: value };
}

function serializeChatContent(content: ChatContent) {
  return JSON.stringify(content);
}

type DirectKeys = { mySecretKey: string; peerPublicKey: string };

const UNDECRYPTABLE_TEXT = '🔒 Message chiffré (clé indisponible sur cet appareil)';

function hydrate(message: ChatMessage, keys: DirectKeys | null): ChatMessage {
  if (message.deletedAt) {
    return { ...message, content: { v: 1, type: 'text', text: '' }, reactions: message.reactions ?? [] };
  }
  let text: string;
  if (message.algorithm === ENCRYPTED_ALGO) {
    const opened = keys ? decryptDirectMessage(message.ciphertext ?? '', keys.mySecretKey, keys.peerPublicKey) : null;
    text = opened ?? UNDECRYPTABLE_TEXT;
  } else {
    text = readMessageText(message);
  }
  return { ...message, content: parseChatContent(text), reactions: message.reactions ?? [] };
}

function hasUndecryptable(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.algorithm === ENCRYPTED_ALGO && m.content?.type === 'text' && m.content.text === UNDECRYPTABLE_TEXT);
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
  const { styles } = useThemedStyles();
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; });
  return <VideoView player={player} style={styles.mediaPreview} nativeControls contentFit="contain" />;
}

function ChatMedia({ content }: { content: Extract<ChatContent, { type: 'media' }> }) {
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
        : <ChatVideo uri={uri} />}
      {!!content.caption && <Text style={styles.bodyText}>{content.caption}</Text>}
    </View>
  );
}

function VoiceMessageBubbleThemed({ content, mine }: { content: Extract<ChatContent, { type: 'voice' }>; mine: boolean }) {
  const { colors } = useTheme();
  return <VoiceMessageBubble mediaId={content.mediaId} durationMs={content.durationMs} mine={mine} colors={colors} />;
}

function MessageRow({ message, mine, currentUserId, reactingOpen, onToggleReacting, onReact, onDelete }: {
  message: ChatMessage;
  mine: boolean;
  currentUserId: string;
  reactingOpen: boolean;
  onToggleReacting: () => void;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const { styles } = useThemedStyles();
  const [showReadTime, setShowReadTime] = useState(false);

  if (message.deletedAt) {
    return (
      <View testID={`message-${message.id}`} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
        <View style={[styles.bubble, styles.bubbleDeleted]}>
          <Text style={styles.bodyTextDeleted}>{mine ? 'Tu as supprimé ce message' : 'Ce message a été supprimé'}</Text>
        </View>
      </View>
    );
  }

  const content = message.content ?? parseChatContent(readMessageText(message));
  const summary = summarizeReactions(message.reactions, currentUserId);
  const mineReaction = myReaction(message.reactions, currentUserId);
  const big = content.type === 'text' && isBigEmoji(content.text);

  return (
    <View testID={`message-${message.id}`} style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable onPress={onToggleReacting} style={[styles.bubble, mine ? styles.mine : styles.theirs, big && styles.bubbleBig, content.type === 'voice' && styles.bubbleVoice]}>
        {content.type === 'media' ? <ChatMedia content={content} />
          : content.type === 'voice' ? <VoiceMessageBubbleThemed content={content} mine={mine} />
          : <Text style={[big ? styles.bigEmoji : styles.bodyText, !big && mine && styles.bodyTextMine]}>{content.text}</Text>}
        <Pressable
          disabled={!(mine && message.receiptState === 'read' && message.readAt)}
          onPress={() => setShowReadTime((v) => !v)}
          accessibilityRole={mine && message.receiptState === 'read' && message.readAt ? 'button' : undefined}
          accessibilityLabel={mine && message.readAt ? `Vu à ${new Date(message.readAt).toLocaleTimeString()}` : undefined}
        >
          <Text style={[styles.messageMeta, mine && styles.messageMetaMine]}>
            {new Date(message.createdAt).toLocaleTimeString()}
            {' '}
            {mine && message.receiptState
              ? (message.receiptState === 'read'
                ? (showReadTime && message.readAt ? ` · Vu à ${new Date(message.readAt).toLocaleTimeString()}` : ' · ✓✓ Lu')
                : ' · ✓ Reçu')
              : ''}
          </Text>
        </Pressable>
      </Pressable>

      {summary.length > 0 && (
        <View style={[styles.chips, mine ? styles.chipsMine : styles.chipsTheirs]}>
          {summary.map((s) => (
            <TouchableOpacity key={s.emoji} onPress={() => onReact(s.emoji)} style={[styles.chip, s.mine && styles.chipMine]}>
              <Text style={styles.chipText}>{s.emoji}{s.count > 1 ? ` ${s.count}` : ''}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {reactingOpen && (
        <View style={[styles.reactBar, mine ? styles.chipsMine : styles.chipsTheirs]}>
          {QUICK_REACTIONS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => onReact(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`Réagir ${emoji}`}
              style={[styles.reactBtn, mineReaction === emoji && styles.reactBtnActive]}
            >
              <Text style={styles.reactBtnText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {reactingOpen && mine && (
        <TouchableOpacity
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Supprimer ce message"
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteBtnText}>🗑️ Supprimer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function DirectConversationScreen({ contact, onBack }: { contact: Contact; onBack: () => void; onLinkPhone?: () => void }) {
  const { styles, colors, scheme } = useThemedStyles();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const deviceIdRef = useRef('');
  const conversationIdRef = useRef('');
  const keysRef = useRef<DirectKeys | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingSentRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerTypingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [e2eeActive, setE2eeActive] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { height: composerHeight, handleResize: handleComposerResize, handleResizeEnd: handleComposerResizeEnd } = useResizableComposerHeight();
  const canSend = useMemo(
    () => !!socket && !!conversationId && !!currentUserId && !!deviceIdRef.current && !sending,
    [socket, conversationId, currentUserId, sending],
  );

  useEffect(() => {
    let active = true;
    let clientRef: Socket | null = null;
    let messageHandler: ((message: ChatMessage) => void) | null = null;
    let receiptHandler: ((receipt: { messageId?: string; state?: ReceiptState; readAt?: string | null }) => void) | null = null;
    let reactionHandler: ((payload: { messageId?: string; reactions?: MessageReaction[] }) => void) | null = null;
    let deletedHandler: ((payload: { messageId?: string }) => void) | null = null;
    let typingHandler: ((payload: { conversationId?: string; userId?: string; isTyping?: boolean }) => void) | null = null;
    let connectHandler: (() => void) | null = null;
    let disconnectHandler: (() => void) | null = null;

    void Promise.all([getRealtimeSocket(), getAuthenticatedUserId()]).then(async ([client, userId]) => {
      if (!active) return;
      clientRef = client;
      socketRef.current = client;
      setSocket(client);
      setCurrentUserId(userId);
      deviceIdRef.current = await ensureChatDevice(userId);

      // Run the key exchange concurrently with everything else below instead
      // of blocking the conversation from opening — hydrate() only needs
      // keysRef by the time history/messages actually arrive, not before.
      const keysReady = (async () => {
        const myKeys = await ensureIdentityKeyPair(userId);
        const peerPublicKey = myKeys ? await fetchPeerPublicKey(contact.id) : null;
        if (myKeys && peerPublicKey) {
          keysRef.current = { mySecretKey: myKeys.secretKey, peerPublicKey };
          if (active) setE2eeActive(true);
        }
      })();

      const { data: privacy } = await getBackend().from('privacy_settings').select('read_receipts').eq('user_id', userId).maybeSingle();
      const receiptState: ReceiptState = (privacy as { read_receipts?: boolean } | null)?.read_receipts === false ? 'delivered' : 'read';
      const direct = await emitAck<DirectResponse>(client, 'conversation:direct', { userId: contact.id });
      if (!direct.ok || !direct.conversationId) throw new Error(direct.error ?? 'DIRECT_CONVERSATION_FAILED');
      const id = direct.conversationId;
      setConversationId(id);
      conversationIdRef.current = id;

      const acknowledge = async (messages: ChatMessage[]) => {
        await Promise.allSettled(messages.filter((message) => message.senderUserId !== userId).map((message) => emitAck(client, 'message:receipt', {
          conversationId: id, messageId: message.id, state: receiptState,
        })));
      };

      // History is fetched AFTER the socket is already in the conversation's
      // room (join below), so a message can legitimately arrive live via
      // messageHandler in the gap between joining and the history response
      // landing. Merge into whatever's already in state instead of
      // overwriting it outright, so that live arrival is never clobbered by
      // a history snapshot taken a moment earlier.
      const mergeHistory = (loaded: ChatMessage[]) => {
        if (!active) return;
        setHistory((prev) => {
          const byId = new Map(prev.map((message) => [message.id, message]));
          for (const message of loaded) byId.set(message.id, message);
          return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
      };

      const syncConversation = async (join: boolean) => {
        if (join) {
          const joined = await emitAck<{ ok: boolean }>(client, 'conversation:join', { conversationId: id });
          if (!joined.ok) throw new Error('DIRECT_JOIN_FAILED');
        }
        const response = await emitAck<HistoryResponse>(client, 'conversation:history', { conversationId: id, limit: 50 });
        if (!response.ok) throw new Error(response.error ?? 'HISTORY_FAILED');
        const rawMessages = response.messages ?? [];
        // Show plaintext (and already-known-key) messages the instant history
        // arrives — don't make the whole thread wait on the E2EE key
        // round-trip. Encrypted messages render the "clé indisponible"
        // placeholder for a moment and get upgraded below once keys resolve.
        mergeHistory(rawMessages.map((message) => hydrate(message, keysRef.current)));

        await keysReady;
        let loaded = rawMessages.map((message) => hydrate(message, keysRef.current));
        // The very first time two devices open a brand-new conversation
        // within moments of each other, one side can fetch the other's
        // public key before it's finished uploading (see lib/e2ee.ts) and
        // cache a stale/absent one for the whole session. Re-fetch once and
        // retry rather than leaving messages permanently unreadable.
        if (hasUndecryptable(loaded)) {
          const myKeysRetry = await ensureIdentityKeyPair(userId);
          const freshPeerKey = myKeysRetry ? await fetchPeerPublicKey(contact.id) : null;
          if (myKeysRetry && freshPeerKey && freshPeerKey !== keysRef.current?.peerPublicKey) {
            keysRef.current = { mySecretKey: myKeysRetry.secretKey, peerPublicKey: freshPeerKey };
            loaded = rawMessages.map((message) => hydrate(message, keysRef.current));
          }
        }
        mergeHistory(loaded);
        await acknowledge(loaded);
      };

      // Join and attach listeners FIRST — before fetching history — so
      // nothing sent between joining the room and the history snapshot
      // arriving can be missed.
      const joined = await emitAck<{ ok: boolean }>(client, 'conversation:join', { conversationId: id });
      if (!joined.ok) throw new Error('DIRECT_JOIN_FAILED');

      messageHandler = (message) => {
        if (message.conversationId !== id) return;
        void keysReady.then(async () => {
        let resolved = hydrate(message, keysRef.current);
        // Same first-contact key race as syncConversation above: retry once
        // against a freshly-fetched peer key before giving up on this message.
        if (hasUndecryptable([resolved])) {
          const myKeysRetry = await ensureIdentityKeyPair(userId);
          const freshPeerKey = myKeysRetry ? await fetchPeerPublicKey(contact.id) : null;
          if (myKeysRetry && freshPeerKey && freshPeerKey !== keysRef.current?.peerPublicKey) {
            keysRef.current = { mySecretKey: myKeysRetry.secretKey, peerPublicKey: freshPeerKey };
            resolved = hydrate(message, keysRef.current);
          }
        }
        if (!active) return;
        setHistory((items) => {
          if (items.some((item) => item.id === resolved.id)) return items;
          if (resolved.senderUserId !== userId) onMessageReceivedFrom(userId, contact.id);
          return [...items, resolved];
        });
        if (resolved.senderUserId !== userId) {
          void emitAck(client, 'message:receipt', { conversationId: id, messageId: resolved.id, state: receiptState }).catch(() => undefined);
        }
        });
      };
      receiptHandler = (receipt) => {
        if (!receipt.messageId || !receipt.state) return;
        setHistory((items) => items.map((message) => message.id === receipt.messageId ? { ...message, receiptState: receipt.state, readAt: receipt.readAt ?? message.readAt } : message));
      };
      reactionHandler = (payload) => {
        if (!payload.messageId) return;
        setHistory((items) => items.map((message) => message.id === payload.messageId ? { ...message, reactions: payload.reactions ?? [] } : message));
      };
      deletedHandler = (payload) => {
        if (!payload.messageId) return;
        setHistory((items) => items.map((message) => message.id === payload.messageId
          ? { ...message, deletedAt: new Date().toISOString(), content: { v: 1, type: 'text', text: '' }, reactions: [] }
          : message));
      };
      typingHandler = (payload) => {
        if (payload.conversationId !== id || payload.userId !== contact.id) return;
        if (peerTypingClearRef.current) { clearTimeout(peerTypingClearRef.current); peerTypingClearRef.current = null; }
        setPeerTyping(!!payload.isTyping);
        // Safety net: if a "stopped typing" ping is lost (backgrounded app,
        // dropped packet), the indicator self-clears instead of sticking forever.
        if (payload.isTyping) {
          peerTypingClearRef.current = setTimeout(() => setPeerTyping(false), 8000);
        }
      };
      connectHandler = () => {
        if (!active) return;
        setNotice('Connexion rétablie · resynchronisation…');
        void syncConversation(true).then(() => { if (active) setNotice(''); }).catch(() => { if (active) setNotice('Connexion rétablie, resynchronisation à retenter.'); });
      };
      disconnectHandler = () => { if (active) { setNotice('Hors ligne · les messages partiront à la reconnexion.'); setPeerTyping(false); } };
      client.on('message:new', messageHandler);
      client.on('message:receipt', receiptHandler);
      client.on('message:reaction', reactionHandler);
      client.on('message:deleted', deletedHandler);
      client.on('typing:update', typingHandler);
      client.on('connect', connectHandler);
      client.on('disconnect', disconnectHandler);

      await syncConversation(false);
    }).catch(() => { if (active) setNotice('Impossible d’ouvrir cette conversation pour le moment.'); }).finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      if (clientRef && messageHandler) clientRef.off('message:new', messageHandler);
      if (clientRef && receiptHandler) clientRef.off('message:receipt', receiptHandler);
      if (clientRef && reactionHandler) clientRef.off('message:reaction', reactionHandler);
      if (clientRef && deletedHandler) clientRef.off('message:deleted', deletedHandler);
      if (clientRef && typingHandler) clientRef.off('typing:update', typingHandler);
      if (clientRef && connectHandler) clientRef.off('connect', connectHandler);
      if (clientRef && disconnectHandler) clientRef.off('disconnect', disconnectHandler);
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (peerTypingClearRef.current) clearTimeout(peerTypingClearRef.current);
      if (clientRef && typingSentRef.current && conversationIdRef.current) {
        clientRef.emit('typing:update', { conversationId: conversationIdRef.current, isTyping: false });
      }
    };
  }, [contact.id]);

  const notifyTyping = (isTyping: boolean) => {
    const client = socketRef.current;
    const id = conversationIdRef.current;
    if (!client || !id) return;
    if (isTyping === typingSentRef.current) return;
    typingSentRef.current = isTyping;
    client.emit('typing:update', { conversationId: id, isTyping });
  };

  const handleComposerChange = (text: string) => {
    setComposer(text);
    if (typingStopTimerRef.current) { clearTimeout(typingStopTimerRef.current); typingStopTimerRef.current = null; }
    if (text.trim()) {
      notifyTyping(true);
      typingStopTimerRef.current = setTimeout(() => notifyTyping(false), 3000);
    } else {
      notifyTyping(false);
    }
  };

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
    setNotice('');
    setShowEmoji(false);
    try {
      const payload = serializeChatContent(content);
      const keys = keysRef.current;
      const { algorithm, ciphertext } = keys
        ? encryptDirectMessage(payload, keys.mySecretKey, keys.peerPublicKey)
        : encodePlaintext(payload);
      const clientMessageId = Crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const attemptSend = () => emitAck<SendResponse>(socket, 'message:send', {
        clientMessageId, conversationId, senderDeviceId: deviceIdRef.current, algorithm, ciphertext, createdAt,
      });
      // Same disconnect-window issue as deleteMessageAction: emitAck rejects
      // instantly if the socket is mid-reconnect. Retry against the real
      // 'connect' event — a blind delay either fires too early or wastes time.
      let response: SendResponse | undefined;
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) await waitForSocketReady(socket, 2500);
        try {
          response = await attemptSend();
          break;
        } catch {
          if (attempt === maxAttempts - 1) throw new Error('SEND_ACK_UNAVAILABLE');
        }
      }
      if (!response!.ok || !response!.id) throw new Error(response!.error ?? 'MESSAGE_SEND_FAILED');
      setComposer('');
      if (typingStopTimerRef.current) { clearTimeout(typingStopTimerRef.current); typingStopTimerRef.current = null; }
      notifyTyping(false);
      setHistory((items) => items.some((item) => item.id === response!.id) ? items : [...items, {
        id: response!.id!, clientMessageId, senderUserId: currentUserId, senderDeviceId: deviceIdRef.current,
        createdAt, algorithm, ciphertext, conversationId, content, reactions: [],
      }]);
      onMessageSent();
    } catch {
      setNotice('Message non envoyé. Réessaie.');
    } finally { setSending(false); }
  };

  const sendMessage = async () => {
    const text = composer.trim();
    if (!text) return;
    await sendContent({ v: 1, type: 'text', text });
  };

  const sendQuick = async (emoji: string) => {
    if (!canSend) return;
    await sendContent({ v: 1, type: 'text', text: emoji });
  };

  const react = async (messageId: string, emoji: string) => {
    if (!socket || !conversationIdRef.current) return;
    const target = history.find((m) => m.id === messageId);
    const mine = myReaction(target?.reactions, currentUserId);
    const nextReaction = mine === emoji ? null : emoji;
    setReactingId(null);
    // optimistic
    setHistory((items) => items.map((m) => {
      if (m.id !== messageId) return m;
      const without = (m.reactions ?? []).filter((r) => r.userId !== currentUserId);
      return { ...m, reactions: nextReaction ? [...without, { userId: currentUserId, reaction: nextReaction }] : without };
    }));
    try {
      const res = await emitAck<{ ok: boolean; reactions?: MessageReaction[] }>(socket, 'message:react', {
        conversationId: conversationIdRef.current, messageId, reaction: nextReaction,
      });
      if (res.ok && res.reactions) {
        setHistory((items) => items.map((m) => m.id === messageId ? { ...m, reactions: res.reactions } : m));
      }
    } catch {
      setNotice('Réaction non enregistrée.');
    }
  };

  const deleteMessageAction = async (messageId: string) => {
    if (!socket || !conversationIdRef.current) return;
    setReactingId(null);
    const previous = history.find((m) => m.id === messageId);
    if (!previous) return;
    // Optimistic — matches the server, which also clears content rather than just flagging it.
    setHistory((items) => items.map((m) => m.id === messageId
      ? { ...m, deletedAt: new Date().toISOString(), content: { v: 1, type: 'text', text: '' }, reactions: [] }
      : m));

    const attemptDelete = () => emitAck<{ ok: boolean }>(socket, 'message:delete', {
      conversationId: conversationIdRef.current, messageId,
    });

    try {
      let res: { ok: boolean } | undefined;
      // The realtime connection on this app cycles under load; a request in
      // flight exactly during a reconnect is silently dropped rather than
      // acked either way (emitAck rejects instantly while disconnected — see
      // realtime.ts). A blind fixed-delay retry either fires before
      // reconnection finishes or wastes time after it already did — wait for
      // the actual 'connect' event between attempts instead.
      const maxAttempts = 4;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (attempt > 0) await waitForSocketReady(socket, 2500);
        try {
          res = await attemptDelete();
          break;
        } catch {
          if (attempt === maxAttempts - 1) throw new Error('DELETE_ACK_UNAVAILABLE');
        }
      }
      if (!res!.ok) {
        // Never leave a message showing "deleted" when the server never
        // actually deleted it — that's a worse lie than showing nothing happened.
        setHistory((items) => items.map((m) => m.id === messageId ? previous : m));
        setNotice('Suppression impossible.');
      }
    } catch {
      setHistory((items) => items.map((m) => m.id === messageId ? previous : m));
      setNotice('Suppression impossible hors ligne.');
    }
  };

  const pickAndSendMedia = async () => {
    if (!canSend || !conversationId) return;
    setSending(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setNotice('Autorise l’accès aux photos et vidéos pour envoyer un média.'); return; }
      const picked = await launchImageLibrarySafe({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 120 });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const mimeType = asset ? inferChatMime(asset) : null;
      if (!asset?.uri || !mimeType || (asset.fileSize !== undefined && asset.fileSize > CHAT_MAX_BYTES)) throw new Error('CHAT_MEDIA_UNSUPPORTED');
      setNotice('Envoi du média…');
      const { mediaId } = await uploadLocalMedia({ uri: asset.uri, mimeType, byteSize: asset.fileSize ?? undefined, purpose: 'chat', conversationId });
      setSending(false);
      await sendContent({ v: 1, type: 'media', mediaId, mimeType, ...(composer.trim() ? { caption: composer.trim().slice(0, 500) } : {}) });
    } catch {
      setNotice('Média non envoyé. Formats acceptés : JPG, PNG, WebP, MP4/MOV · 100 Mo max.');
    } finally { setSending(false); }
  };

  const sendVoiceNote = async (recording: VoiceRecordingResult) => {
    if (!canSend || !conversationId) return;
    setSending(true);
    try {
      setNotice('Envoi du message vocal…');
      const { mediaId } = await uploadLocalMedia({ uri: recording.uri, mimeType: VOICE_MIME, purpose: 'chat', conversationId });
      setSending(false);
      await sendContent({ v: 1, type: 'voice', mediaId, mimeType: VOICE_MIME, durationMs: recording.durationMs });
    } catch {
      setNotice('Message vocal non envoyé.');
    } finally { setSending(false); }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View style={[styles.header, contact.accentColor ? { borderBottomColor: accentOf(contact.accentColor), borderBottomWidth: 2 } : null]}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button"><Text style={styles.back}>‹</Text></TouchableOpacity>
        <View style={[styles.avatar, contact.accentColor ? { backgroundColor: accentOf(contact.accentColor) } : null]}><Text style={styles.avatarText}>{contact.displayName[0] ?? '?'}</Text></View>
        <View style={styles.flex}>
          <Text style={[styles.name, contact.accentColor ? { color: accentOf(contact.accentColor) } : null]}>{contact.nickname}</Text>
          {peerTyping
            ? <Text style={[styles.sub, styles.typingSub]}>écrit…</Text>
            : <Text style={styles.sub}>{contact.handle} · {presenceLabel[contact.presence] ?? contact.presence}</Text>}
        </View>
        <TouchableOpacity style={styles.pulse} onPress={() => void sendKPulse()} accessibilityRole="button" accessibilityLabel={`Envoyer un K-Pulse à ${contact.displayName}`}><Text style={styles.pulseText}>⚡</Text></TouchableOpacity>
      </View>
      <View style={styles.security}><Text style={styles.securityText}>{e2eeActive ? '🔒 Chiffré de bout en bout — même K-ssenger ne peut pas lire ces messages.' : '🔒 Connexion sécurisée (TLS). Le chiffrement de bout en bout s’active dès que les deux appareils l’ont initialisé.'}</Text></View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
      >
      {loading ? <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Ouverture de la conversation…</Text></View> : (
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!!notice && <Text style={styles.notice}>{notice}</Text>}
          {!history.length ? <View style={styles.empty}><Text style={styles.emptyIcon}>💬</Text><Text style={styles.emptyTitle}>Conversation prête</Text><Text style={styles.muted}>Envoie ton premier message ou média.</Text></View> : history.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              mine={message.senderUserId === currentUserId}
              currentUserId={currentUserId}
              reactingOpen={reactingId === message.id}
              onToggleReacting={() => setReactingId((id) => id === message.id ? null : message.id)}
              onReact={(emoji) => void react(message.id, emoji)}
              onDelete={() => void deleteMessageAction(message.id)}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.quickRow}>
        {QUICK_REACTIONS.map((emoji) => (
          <TouchableOpacity key={emoji} disabled={!canSend} onPress={() => void sendQuick(emoji)} accessibilityRole="button" accessibilityLabel={`Envoyer ${emoji}`} style={[styles.quickBtn, !canSend && styles.disabled]}>
            <Text style={styles.quickEmoji}>{emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {showEmoji && <EmojiPanel onPick={(emoji) => setComposer((c) => (c + emoji).slice(0, 12000))} />}

      <View style={styles.composerWrap}>
        {Platform.OS === 'web' && !recordingVoice && (
          <ComposerResizeHandle
            onResize={handleComposerResize}
            onResizeEnd={handleComposerResizeEnd}
            accentColor={colors.azure}
            gripColor={colors.hairlineStrong}
          />
        )}
      <View style={styles.composer}>
        {!recordingVoice && <TouchableOpacity disabled={!canSend} onPress={() => void pickAndSendMedia()} style={[styles.attach, !canSend && styles.disabled]} accessibilityLabel="Envoyer une photo ou une vidéo"><Text style={styles.attachText}>＋</Text></TouchableOpacity>}
        {!recordingVoice && <TouchableOpacity onPress={() => setShowEmoji((v) => !v)} accessibilityRole="button" accessibilityLabel="Ouvrir les emojis" style={[styles.attach, showEmoji && styles.attachActive]}><Text style={styles.attachText}>😊</Text></TouchableOpacity>}
        {!composer.trim() && (
          <VoiceComposerButton
            colors={colors}
            disabled={!canSend}
            onRecorded={(r) => void sendVoiceNote(r)}
            onRecordingStateChange={setRecordingVoice}
          />
        )}
        {!recordingVoice && (
          <>
            <TextInput
              style={[styles.input, Platform.OS === 'web' ? { height: composerHeight, maxHeight: composerHeight } : null]}
              value={composer}
              onChangeText={handleComposerChange}
              placeholder="Écrire un message…"
              placeholderTextColor={colors.inkFaint}
              maxLength={12000}
              multiline
              editable={!sending}
              onFocus={() => setShowEmoji(false)}
              onKeyPress={(e) => {
                if (isSendKey(e.nativeEvent as unknown as { key?: string; shiftKey?: boolean })) {
                  (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                  void sendMessage();
                }
              }}
            />
            <TouchableOpacity disabled={!composer.trim() || sending || !canSend} onPress={() => void sendMessage()} accessibilityRole="button" accessibilityLabel="Envoyer le message" style={[styles.send, (!composer.trim() || sending || !canSend) && styles.disabled]}>{sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>➤</Text>}</TouchableOpacity>
          </>
        )}
      </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(palette: Palette, typo: TypeTokens) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.sky }, flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.hairline },
  back: { fontSize: 30, lineHeight: 30, color: palette.azureDeep, fontWeight: '900', width: 30, textAlign: 'center' },
  avatar: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: palette.azureSoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: palette.azureDeep, fontSize: 17, fontWeight: '900' },
  name: { ...typo.name }, sub: { ...typo.micro, color: palette.inkSoft, marginTop: 2 },
  typingSub: { color: palette.azureDeep, fontWeight: '700' },
  pulse: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: palette.wizzSoft, borderWidth: 1, borderColor: palette.wizz, alignItems: 'center', justifyContent: 'center' }, pulseText: { fontSize: 20 },
  security: { backgroundColor: palette.surfaceSunken, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.hairline }, securityText: { ...typo.micro, color: palette.inkSoft, textAlign: 'center', lineHeight: 14 },
  body: { flex: 1 }, content: { padding: spacing.lg, paddingBottom: spacing.xl, maxWidth: layout.maxReading, alignSelf: 'center', width: '100%' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, notice: { color: palette.azureDeep, fontWeight: '800', marginBottom: spacing.sm, textAlign: 'center', fontSize: 12 },
  empty: { alignItems: 'center', marginTop: 70, gap: spacing.xs }, emptyIcon: { fontSize: 40 }, emptyTitle: { ...typo.heading }, muted: { ...typo.meta, color: palette.inkFaint },
  row: { marginBottom: spacing.sm, maxWidth: '86%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bubbleBig: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 2, paddingVertical: 0, shadowOpacity: 0, elevation: 0 },
  bubbleVoice: { minWidth: 190 },
  mine: { backgroundColor: palette.azure, borderBottomRightRadius: 6, ...elevation.hairline },
  theirs: { backgroundColor: palette.surface, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: palette.hairline, ...elevation.hairline },
  bodyText: { ...typo.body },
  bodyTextMine: { color: palette.inkOnAzure },
  bubbleDeleted: { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.hairline, borderStyle: 'dashed' },
  bodyTextDeleted: { ...typo.body, color: palette.inkFaint, fontStyle: 'italic' },
  bigEmoji: { fontSize: 44, lineHeight: 52 },
  messageMeta: { fontSize: 9.5, marginTop: 5, textAlign: 'right', color: palette.inkFaint, fontWeight: '600' },
  messageMetaMine: { color: 'rgba(244,248,255,0.75)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chipsMine: { justifyContent: 'flex-end' },
  chipsTheirs: { justifyContent: 'flex-start' },
  chip: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  chipMine: { backgroundColor: palette.azureSoft, borderColor: palette.azure },
  chipText: { fontSize: 12, fontWeight: '700', color: palette.inkSoft },
  reactBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 4, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline, borderRadius: radius.pill, padding: 3, ...elevation.hairline },
  reactBtn: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { marginTop: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.hairline },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: palette.inkFaint },
  reactBtnActive: { backgroundColor: palette.azureSoft },
  reactBtnText: { fontSize: 17 },
  mediaPreview: { width: 230, height: 230, borderRadius: radius.sm, backgroundColor: palette.surfaceSunken, marginBottom: 6 }, mediaError: { color: palette.danger, fontSize: 12, fontWeight: '700' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: spacing.sm, paddingVertical: 6, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.hairline },
  quickBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  quickEmoji: { fontSize: 20 },
  composerWrap: { backgroundColor: palette.surface },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm + 2, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.hairline },
  input: { flex: 1, maxHeight: 120, minHeight: 46, backgroundColor: palette.surfaceSunken, borderWidth: 1.5, borderColor: palette.hairline, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: palette.ink, fontSize: 15, fontWeight: '500', ...(Platform.OS === 'web' ? { outlineStyle: 'none' as never } : null) },
  send: { width: 46, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azure, ...elevation.hairline },
  attach: { width: 46, height: 46, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceSunken, borderWidth: 1, borderColor: palette.hairline },
  attachActive: { backgroundColor: palette.azureSoft, borderColor: palette.azure },
  attachText: { color: palette.azureDeep, fontSize: 22, lineHeight: 26, fontWeight: '700' },
  disabled: { opacity: 0.4 }, sendText: { color: palette.white, fontWeight: '900', fontSize: 18 },
  });
}

/** Pulls this screen's styles from the active theme, memoized. */
function useThemedStyles() {
  const { colors, type: typo, scheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, typo), [colors, typo]);
  return { styles, colors, typo, scheme };
}
