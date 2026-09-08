/**
 * K-ssenger device linking — client state.
 *
 * Two roles, one module:
 *  - `useWebLink()`  : the web session pairs with the phone and relays chat.
 *  - `useDeviceLinkRelay(userId)` : the phone answers relay requests with real
 *    Signal crypto, and mirrors incoming direct messages to the linked web.
 *
 * The K-ssenger server only relays sealed `{ciphertext, nonce}` blobs between
 * the two devices of the same account (`link:envelope`). No tunnel plaintext
 * ever reaches the server.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { Socket } from 'socket.io-client';
import {
  deriveSharedKey,
  generateLinkKeyPair,
  linkConfirmationCode,
  openEnvelope,
  sealEnvelope,
  type RelayChatMessage,
  type RelayMessage,
} from './deviceLink';
import { getBackend } from './backend';
import { emitAck, getRealtimeSocket } from './realtime';
import {
  decryptDirectFromContact,
  encryptDirectForContact,
  newEncryptedMessageId,
} from './signalDevice';
import { parseChatContent, serializeChatContent } from './chatContent';
import { loadLocalMessage, storeLocalMessage } from './localMessageStore';

// ── storage ────────────────────────────────────────────────────────────────
const WEB_KEY = 'kssenger.weblink.v1';

type WebLinkState = { linkId: string; secretKey: string; publicKey: string; shared?: string };

function readWebLink(): WebLinkState | null {
  if (Platform.OS !== 'web') return null;
  try {
    const raw = globalThis.sessionStorage?.getItem(WEB_KEY);
    return raw ? (JSON.parse(raw) as WebLinkState) : null;
  } catch { return null; }
}
function writeWebLink(state: WebLinkState | null) {
  try {
    if (!state) globalThis.sessionStorage?.removeItem(WEB_KEY);
    else globalThis.sessionStorage?.setItem(WEB_KEY, JSON.stringify(state));
  } catch { /* private mode */ }
}
async function readPhoneSecret(linkId: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(`kssenger.phonelink.${linkId}`); } catch { return null; }
}
async function writePhoneSecret(linkId: string, secret: string) {
  try { await SecureStore.setItemAsync(`kssenger.phonelink.${linkId}`, secret); } catch { /* ignore */ }
}
async function dropPhoneSecret(linkId: string) {
  try { await SecureStore.deleteItemAsync(`kssenger.phonelink.${linkId}`); } catch { /* ignore */ }
}

// ── web role ───────────────────────────────────────────────────────────────

export type WebLinkStatus = 'unsupported' | 'idle' | 'pairing' | 'linked';

export type UseWebLink = {
  status: WebLinkStatus;
  code: string | null;
  phoneReachable: boolean;
  error: string | null;
  starting: boolean;
  startPairing: () => Promise<void>;
  cancelPairing: () => void;
  unlink: () => Promise<void>;
  fetchHistory: (contactId: string) => Promise<RelayChatMessage[]>;
  sendText: (contactId: string, text: string) => Promise<RelayChatMessage>;
  onIncoming: (handler: (contactId: string, message: RelayChatMessage) => void) => () => void;
};

export function useWebLink(): UseWebLink {
  const supported = Platform.OS === 'web';
  const [status, setStatus] = useState<WebLinkStatus>(supported ? 'idle' : 'unsupported');
  const [code, setCode] = useState<string | null>(null);
  const [phoneReachable, setPhoneReachable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<WebLinkState | null>(supported ? readWebLink() : null);
  const socketRef = useRef<Socket | null>(null);
  const pendingRef = useRef(new Map<string, (m: RelayMessage) => void>());
  const incomingRef = useRef(new Set<(contactId: string, m: RelayChatMessage) => void>());

  const send = useCallback((payload: RelayMessage) => {
    const st = stateRef.current;
    const sock = socketRef.current;
    if (!st?.shared || !sock?.connected) return false;
    const env = sealEnvelope(st.shared, payload);
    sock.emit('link:envelope', { linkId: st.linkId, ...env });
    return true;
  }, []);

  const request = useCallback(<T extends RelayMessage>(payload: RelayMessage, expect: T['t']): Promise<T> => {
    const reqId = Math.random().toString(36).slice(2);
    (payload as unknown as { reqId: string }).reqId = reqId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { pendingRef.current.delete(reqId); reject(new Error('PHONE_UNREACHABLE')); }, 12_000);
      pendingRef.current.set(reqId, (m) => {
        if (m.t !== expect) return;
        clearTimeout(timer);
        pendingRef.current.delete(reqId);
        resolve(m as T);
      });
      if (!send(payload)) { clearTimeout(timer); pendingRef.current.delete(reqId); reject(new Error('LINK_NOT_READY')); }
    });
  }, [send]);

  // socket wiring
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    void getRealtimeSocket().then((sock) => {
      if (!alive) return;
      socketRef.current = sock;

      const onApproved = ({ linkId, phonePublicKey }: { linkId: string; phonePublicKey: string }) => {
        const st = stateRef.current;
        if (!st || st.linkId !== linkId || st.shared) return;
        const shared = deriveSharedKey(phonePublicKey, st.secretKey);
        const next = { ...st, shared };
        stateRef.current = next;
        writeWebLink(next);
        setStatus('linked');
        setCode(null);
        send({ t: 'hello', from: 'web' });
      };

      const onEnvelope = ({ linkId, ciphertext, nonce }: { linkId: string; ciphertext: string; nonce: string }) => {
        const st = stateRef.current;
        if (!st?.shared || st.linkId !== linkId) return;
        const msg = openEnvelope<RelayMessage>(st.shared, ciphertext, nonce);
        if (!msg) return;
        if (msg.t === 'pong') { setPhoneReachable(true); return; }
        if (msg.t === 'hello') { setPhoneReachable(true); return; }
        if (msg.t === 'recv') { incomingRef.current.forEach((h) => h(msg.contactId, msg.message)); return; }
        const reqId = (msg as unknown as { reqId?: string }).reqId;
        if (reqId) pendingRef.current.get(reqId)?.(msg);
      };

      const onRevoked = ({ linkId }: { linkId: string }) => {
        if (stateRef.current?.linkId === linkId) {
          stateRef.current = null; writeWebLink(null);
          setStatus('idle'); setPhoneReachable(false); setCode(null);
        }
      };

      sock.on('link:approved', onApproved);
      sock.on('link:envelope', onEnvelope);
      sock.on('link:revoked', onRevoked);

      if (stateRef.current?.shared) {
        setStatus('linked');
        send({ t: 'hello', from: 'web' });
        pingTimer = setInterval(() => {
          let acked = false;
          const id = Math.random().toString(36).slice(2);
          const to = setTimeout(() => { if (!acked) setPhoneReachable(false); }, 5_000);
          pendingRef.current.set(id, (m) => { if (m.t === 'pong') { acked = true; clearTimeout(to); setPhoneReachable(true); pendingRef.current.delete(id); } });
          send({ t: 'ping', id });
        }, 10_000);
      }
    }).catch(() => setError('Connexion temps réel indisponible.'));

    return () => {
      alive = false;
      if (pingTimer) clearInterval(pingTimer);
      const sock = socketRef.current;
      sock?.off('link:approved');
      sock?.off('link:envelope');
      sock?.off('link:revoked');
    };
  }, [supported, send]);

  const [starting, setStarting] = useState(false);
  const startPairing = useCallback(async () => {
    if (!supported || starting) return;
    setStarting(true);
    setError(null);
    try {
      const sock = await Promise.race([
        getRealtimeSocket(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('SOCKET_TIMEOUT')), 15_000)),
      ]);
      socketRef.current = sock;
      const kp = generateLinkKeyPair();
      const res = await emitAck<{ ok: boolean; linkId?: string; error?: string }>(sock, 'link:init', { webPublicKey: kp.publicKey });
      if (!res || !res.ok || !res.linkId) throw new Error(res?.error ?? 'LINK_INIT_FAILED');
      const st: WebLinkState = { linkId: res.linkId, secretKey: kp.secretKey, publicKey: kp.publicKey };
      stateRef.current = st;
      writeWebLink(st);
      setCode(linkConfirmationCode(res.linkId));
      setStatus('pairing');
    } catch (e) {
      const m = (e as Error).message;
      setError(
        m === 'SOCKET_TIMEOUT'
          ? 'Serveur temps réel injoignable (il se réveille peut-être). Réessaie dans quelques secondes.'
          : m === 'REALTIME_TIMEOUT'
            ? 'Le serveur déployé ne gère pas encore l’appairage web. Déploie la dernière version du serveur, puis réessaie.'
            : 'Impossible de démarrer l’appairage. Réessaie.',
      );
    } finally {
      setStarting(false);
    }
  }, [supported, starting]);

  const cancelPairing = useCallback(() => {
    stateRef.current = null; writeWebLink(null);
    setStatus('idle'); setCode(null);
  }, []);

  const unlink = useCallback(async () => {
    const st = stateRef.current;
    if (st && socketRef.current?.connected) {
      await emitAck(socketRef.current, 'link:revoke', { linkId: st.linkId }).catch(() => undefined);
    }
    stateRef.current = null; writeWebLink(null);
    setStatus('idle'); setPhoneReachable(false); setCode(null);
  }, []);

  const fetchHistory = useCallback(async (contactId: string) => {
    const res = await request<Extract<RelayMessage, { t: 'history:res' }>>({ t: 'history:req', reqId: '', contactId }, 'history:res');
    if (!res.ok) throw new Error(res.error ?? 'HISTORY_FAILED');
    return res.messages;
  }, [request]);

  const sendText = useCallback(async (contactId: string, text: string) => {
    const clientMessageId = await newEncryptedMessageId().catch(() => Math.random().toString(36).slice(2));
    const res = await request<Extract<RelayMessage, { t: 'send:res' }>>(
      { t: 'send:req', reqId: '', contactId, clientMessageId, text }, 'send:res',
    );
    if (!res.ok || !res.id) throw new Error(res.error ?? 'SEND_FAILED');
    return { id: res.id, senderUserId: 'me', createdAt: res.createdAt ?? new Date().toISOString(), text };
  }, [request]);

  const onIncoming = useCallback((handler: (contactId: string, message: RelayChatMessage) => void) => {
    incomingRef.current.add(handler);
    return () => incomingRef.current.delete(handler);
  }, []);

  return useMemo(() => ({
    status, code, phoneReachable, error, starting,
    startPairing, cancelPairing, unlink, fetchHistory, sendText, onIncoming,
  }), [status, code, phoneReachable, error, starting, startPairing, cancelPairing, unlink, fetchHistory, sendText, onIncoming]);
}

// ── phone role ─────────────────────────────────────────────────────────────

type DirectResponse = { ok: boolean; conversationId?: string; error?: string };
type HistoryResponse = { ok: boolean; messages?: Array<{ id: string; senderUserId: string; senderDeviceId: string; algorithm: string; ciphertext: string; createdAt: string }> };
type SendResponse = { ok: boolean; id?: string; error?: string; createdAt?: string };

/**
 * Phone-side relay bridge. Mount once inside the authenticated tree on native.
 * Answers `link:envelope` relay requests from linked web sessions using the
 * real native Signal runtime, and mirrors incoming direct messages to them.
 */
export function useDeviceLinkRelay(userId: string): { linkedCount: number } {
  const [linkedCount, setLinkedCount] = useState(0);
  const sharedByLinkRef = useRef(new Map<string, string>()); // linkId -> shared key
  const convCacheRef = useRef(new Map<string, string>()); // contactId -> conversationId

  useEffect(() => {
    if (Platform.OS === 'web' || !userId) return;
    let alive = true;
    let socket: Socket | null = null;

    const loadLinks = async () => {
      const { data } = await getBackend()
        .from('device_links')
        .select('id,web_public_key,phone_public_key,status')
        .eq('user_id', userId)
        .eq('status', 'approved');
      const rows = ((data ?? []) as unknown) as Array<{ id: string; web_public_key: string }>;
      const map = sharedByLinkRef.current;
      map.clear();
      for (const row of rows) {
        const secret = await readPhoneSecret(row.id);
        if (secret) map.set(row.id, deriveSharedKey(row.web_public_key, secret));
      }
      if (alive) setLinkedCount(map.size);
    };

    const sendTo = (linkId: string, payload: RelayMessage) => {
      const shared = sharedByLinkRef.current.get(linkId);
      if (!shared || !socket?.connected) return;
      socket.emit('link:envelope', { linkId, ...sealEnvelope(shared, payload) });
    };

    const conversationFor = async (contactId: string) => {
      const cached = convCacheRef.current.get(contactId);
      if (cached) return cached;
      const direct = await emitAck<DirectResponse>(socket!, 'conversation:direct', { userId: contactId });
      if (!direct.ok || !direct.conversationId) throw new Error(direct.error ?? 'NO_CONVERSATION');
      await emitAck(socket!, 'conversation:join', { conversationId: direct.conversationId }).catch(() => undefined);
      convCacheRef.current.set(contactId, direct.conversationId);
      return direct.conversationId;
    };

    const handleRelay = async (linkId: string, msg: RelayMessage) => {
      if (msg.t === 'ping') return sendTo(linkId, { t: 'pong', id: msg.id });
      if (msg.t === 'hello') return sendTo(linkId, { t: 'hello', from: 'phone' });

      if (msg.t === 'history:req') {
        try {
          const conversationId = await conversationFor(msg.contactId);
          const res = await emitAck<HistoryResponse>(socket!, 'conversation:history', { conversationId, limit: 50 });
          const out: RelayChatMessage[] = [];
          for (const m of res.messages ?? []) {
            let text = '🔒 message chiffré';
            try {
              if (m.senderUserId !== userId) {
                const plain = await decryptDirectFromContact(userId, m.senderUserId, m.senderDeviceId, m.ciphertext);
                const content = parseChatContent(plain);
                text = content?.type === 'text' ? content.text : '📎 média';
              } else {
                const local = await loadLocalTextSafe(userId, m.id);
                text = local ?? '↩︎ message envoyé';
              }
            } catch { text = '⚠️ non déchiffrable'; }
            out.push({ id: m.id, senderUserId: m.senderUserId, createdAt: m.createdAt, text });
          }
          sendTo(linkId, { t: 'history:res', reqId: msg.reqId, ok: true, messages: out });
        } catch (e) {
          sendTo(linkId, { t: 'history:res', reqId: msg.reqId, ok: false, error: (e as Error).message, messages: [] });
        }
        return;
      }

      if (msg.t === 'send:req') {
        try {
          const conversationId = await conversationFor(msg.contactId);
          const plaintext = serializeChatContent({ v: 1, type: 'text', text: msg.text });
          const encrypted = await encryptDirectForContact(userId, msg.contactId, plaintext);
          const createdAt = new Date().toISOString();
          const res = await emitAck<SendResponse>(socket!, 'message:send', {
            clientMessageId: msg.clientMessageId, conversationId,
            senderDeviceId: encrypted.senderDeviceId, algorithm: encrypted.algorithm,
            ciphertext: encrypted.ciphertext, createdAt,
          });
          if (!res.ok || !res.id) throw new Error(res.error ?? 'MESSAGE_SEND_FAILED');
          await storeLocalMessage(userId, res.id, plaintext).catch(() => undefined);
          sendTo(linkId, { t: 'send:res', reqId: msg.reqId, ok: true, id: res.id, createdAt });
        } catch (e) {
          sendTo(linkId, { t: 'send:res', reqId: msg.reqId, ok: false, error: (e as Error).message });
        }
        return;
      }
    };

    void (async () => {
      try {
        socket = await getRealtimeSocket();
        if (!alive) return;
        await loadLinks();

        const onEnvelope = ({ linkId, ciphertext, nonce }: { linkId: string; ciphertext: string; nonce: string }) => {
          const shared = sharedByLinkRef.current.get(linkId);
          if (!shared) return;
          const msg = openEnvelope<RelayMessage>(shared, ciphertext, nonce);
          if (msg) void handleRelay(linkId, msg);
        };
        const onApproved = () => { void loadLinks(); };
        const onRevoked = ({ linkId }: { linkId: string }) => {
          sharedByLinkRef.current.delete(linkId);
          void dropPhoneSecret(linkId);
          setLinkedCount(sharedByLinkRef.current.size);
        };
        const onMessageNew = async (raw: { conversationId: string; senderUserId: string; senderDeviceId: string; ciphertext: string; id: string; createdAt: string }) => {
          if (!sharedByLinkRef.current.size || raw.senderUserId === userId) return;
          // find the contact whose direct conversation this is
          let contactId: string | null = null;
          for (const [cid, convId] of convCacheRef.current) if (convId === raw.conversationId) contactId = cid;
          if (!contactId) return; // only mirror conversations the web already opened
          try {
            const plain = await decryptDirectFromContact(userId, raw.senderUserId, raw.senderDeviceId, raw.ciphertext);
            const content = parseChatContent(plain);
            const text = content?.type === 'text' ? content.text : '📎 média';
            for (const linkId of sharedByLinkRef.current.keys()) {
              sendTo(linkId, { t: 'recv', contactId, message: { id: raw.id, senderUserId: raw.senderUserId, createdAt: raw.createdAt, text } });
            }
          } catch { /* skip undecryptable */ }
        };

        socket.on('link:envelope', onEnvelope);
        socket.on('link:approved', onApproved);
        socket.on('link:revoked', onRevoked);
        socket.on('message:new', onMessageNew);

        for (const linkId of sharedByLinkRef.current.keys()) sendTo(linkId, { t: 'hello', from: 'phone' });
      } catch { /* offline */ }
    })();

    return () => {
      alive = false;
      socket?.off('link:envelope');
      socket?.off('link:approved');
      socket?.off('link:revoked');
      socket?.off('message:new');
    };
  }, [userId]);

  return { linkedCount };
}

async function loadLocalTextSafe(userId: string, messageId: string): Promise<string | null> {
  try {
    const plain = await loadLocalMessage(userId, messageId);
    if (!plain) return null;
    const content = parseChatContent(plain);
    return content?.type === 'text' ? content.text : '📎 média';
  } catch { return null; }
}

/** Phone-side: approve a pending web link (called from LinkedDevicesScreen). */
export async function approvePendingLink(linkId: string): Promise<void> {
  const socket = await getRealtimeSocket();
  const kp = generateLinkKeyPair();
  const res = await emitAck<{ ok: boolean; error?: string }>(socket, 'link:approve', { linkId, phonePublicKey: kp.publicKey });
  if (!res.ok) throw new Error(res.error ?? 'APPROVE_FAILED');
  await writePhoneSecret(linkId, kp.secretKey);
}

export { linkConfirmationCode };
