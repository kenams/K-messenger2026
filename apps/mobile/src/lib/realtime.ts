import { io, type Socket } from 'socket.io-client';
import { getBackend } from './backend';

const socketUrl = process.env.EXPO_PUBLIC_KSSENGER_SOCKET_URL?.trim() ?? '';

export const isRealtimeConfigured = socketUrl.startsWith('https://') || socketUrl.startsWith('http://');

let socket: Socket | null = null;

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

  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectRealtimeSocket() {
  socket?.disconnect();
  socket = null;
}

export function emitAck<TResponse>(socketClient: Socket, event: string, payload: unknown = {}): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('REALTIME_TIMEOUT')), 10_000);
    socketClient.emit(event, payload, (response: TResponse) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}
