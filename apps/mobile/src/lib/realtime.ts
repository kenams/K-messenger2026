import { io, type Socket } from 'socket.io-client';
import { getBackend } from './backend';

const socketUrl = process.env.EXPO_PUBLIC_KSSENGER_SOCKET_URL?.trim() ?? '';

export const isRealtimeConfigured = socketUrl.startsWith('https://') || socketUrl.startsWith('http://');

/**
 * Resolves a K-ssenger username to the email needed for the real
 * signInWithPassword() call, by having the K-ssenger server verify the
 * password itself first (see POST /auth/login-with-username there for why:
 * it's the only way to avoid turning "username -> email" into a public
 * enumeration oracle). Throws with a generic message on any failure —
 * unknown username, wrong password, or the server being unreachable are
 * deliberately indistinguishable here.
 */
export async function resolveEmailForUsernameLogin(username: string, password: string): Promise<string> {
  if (!isRealtimeConfigured) throw new Error('KSSENGER_SERVER_NOT_CONFIGURED');
  let response: Response;
  try {
    response = await fetch(`${socketUrl}/auth/login-with-username`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('INVALID_CREDENTIALS');
  }
  if (!response.ok) throw new Error('INVALID_CREDENTIALS');
  const body = (await response.json().catch(() => null)) as { ok?: boolean; email?: string } | null;
  if (!body?.ok || typeof body.email !== 'string' || !body.email) throw new Error('INVALID_CREDENTIALS');
  return body.email;
}

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;

async function getSessionIdentity(): Promise<{ accessToken: string; userId: string }> {
  const { data, error } = await getBackend().auth.getSession();
  if (error) throw error;
  const session = data.session as ({ access_token?: string; user?: { id?: string } } | null);
  const accessToken = session?.access_token;
  const userId = session?.user?.id;
  if (!accessToken || !userId) throw new Error('NO_AUTHENTICATED_SESSION');
  return { accessToken, userId };
}

export async function getAuthenticatedUserId(): Promise<string> {
  return (await getSessionIdentity()).userId;
}

function buildRealtimeAuth() {
  return (callback: (auth: { accessToken?: string }) => void) => {
    void getSessionIdentity()
      .then(({ accessToken }) => callback({ accessToken }))
      .catch(() => callback({}));
  };
}

function waitUntilConnected(client: Socket): Promise<Socket> {
  if (client.connected) return Promise.resolve(client);
  if (connecting) return connecting;

  connecting = new Promise<Socket>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('REALTIME_CONNECT_TIMEOUT')), 20_000);
    const onConnect = () => finish();
    const onConnectError = (error: Error) => finish(error);

    const finish = (error?: Error) => {
      clearTimeout(timeout);
      client.off('connect', onConnect);
      client.off('connect_error', onConnectError);
      connecting = null;
      if (error) reject(error);
      else resolve(client);
    };

    client.once('connect', onConnect);
    client.once('connect_error', onConnectError);
    if (!client.connected) client.connect();
  });

  return connecting;
}

function ensureSocketInstance(): Socket {
  if (!socket) {
    socket = io(socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: buildRealtimeAuth(),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 700,
      reconnectionDelayMax: 8_000,
      timeout: 10_000,
    });
  } else {
    socket.auth = buildRealtimeAuth();
  }
  return socket;
}

export async function getRealtimeSocket(): Promise<Socket> {
  if (!isRealtimeConfigured) throw new Error('REALTIME_NOT_CONFIGURED');
  await getSessionIdentity();
  return waitUntilConnected(ensureSocketInstance());
}

/**
 * Synchronous access to the (possibly not-yet-connected) socket instance, for
 * listeners that must be attached on mount rather than after an async
 * connect resolves. Socket.IO listeners are safe to register before the
 * socket connects — they just won't fire until the connection is live —
 * whereas waiting on `getRealtimeSocket()` first leaves a real window where a
 * server-pushed event (e.g. an incoming K-Pulse) arrives before the listener
 * is attached and is silently dropped (reproduced via E2E: ~2/3 failure rate
 * on a fresh page load racing an immediate K-Pulse send).
 */
export function getRealtimeSocketSync(): Socket | null {
  if (!isRealtimeConfigured) return null;
  const client = ensureSocketInstance();
  if (!client.connected) client.connect();
  return client;
}

export function disconnectRealtimeSocket() {
  socket?.disconnect();
  socket = null;
  connecting = null;
}

/**
 * Resolves once the socket is actually connected, or after timeoutMs if it
 * never reconnects in time. Used by callers that retry an emitAck() after a
 * REALTIME_DISCONNECTED rejection: emitAck fails instantly while
 * disconnected rather than waiting, so a blind fixed-delay retry either
 * fires before reconnection finishes or wastes time after it already did.
 * Watching the real 'connect' event lets a retry fire the moment the socket
 * is actually usable again.
 */
export function waitForSocketReady(socketClient: Socket, timeoutMs: number): Promise<boolean> {
  if (socketClient.connected) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { socketClient.off('connect', onConnect); resolve(false); }, timeoutMs);
    const onConnect = () => { clearTimeout(timer); resolve(true); };
    socketClient.once('connect', onConnect);
  });
}

export function emitAck<TResponse>(socketClient: Socket, event: string, payload: unknown = {}): Promise<TResponse> {
  // Socket.IO buffers emits while disconnected. For request/ack commands that is
  // dangerous: the caller can time out, retry with a new id, then have the old
  // buffered command execute later. Fail closed instead; reconnect/resync logic
  // decides when an operation is safe to retry.
  if (!socketClient.connected) return Promise.reject(new Error('REALTIME_DISCONNECTED'));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('REALTIME_TIMEOUT')), 10_000);
    socketClient.emit(event, payload, (response: TResponse) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
