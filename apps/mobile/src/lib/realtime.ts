import { io, type Socket } from 'socket.io-client';
import { getBackend } from './backend';

const socketUrl = process.env.EXPO_PUBLIC_KSSENGER_SOCKET_URL?.trim() ?? '';

export const isRealtimeConfigured = socketUrl.startsWith('https://') || socketUrl.startsWith('http://');

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

export async function getRealtimeSocket(): Promise<Socket> {
  if (!isRealtimeConfigured) throw new Error('REALTIME_NOT_CONFIGURED');
  await getSessionIdentity();

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

  return waitUntilConnected(socket);
}

export function disconnectRealtimeSocket() {
  socket?.disconnect();
  socket = null;
  connecting = null;
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
