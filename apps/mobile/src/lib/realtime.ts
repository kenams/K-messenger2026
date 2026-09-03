import { io, type Socket } from 'socket.io-client';
import { getBackend } from './backend';

const socketUrl = process.env.EXPO_PUBLIC_KSSENGER_SOCKET_URL?.trim() ?? '';

export const isRealtimeConfigured = socketUrl.startsWith('https://') || socketUrl.startsWith('http://');

let socket: Socket | null = null;

async function getAccessToken(): Promise<string> {
  const { data, error } = await getBackend().auth.getSession();
  if (error) throw error;
  const session = data.session as ({ access_token?: string } | null);
  const token = session?.access_token;
  if (!token) throw new Error('NO_ACCESS_TOKEN');
  return token;
}

export async function getRealtimeSocket(): Promise<Socket> {
  if (!isRealtimeConfigured) throw new Error('REALTIME_NOT_CONFIGURED');
  const accessToken = await getAccessToken();

  if (!socket) {
    socket = io(socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { accessToken },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 700,
      reconnectionDelayMax: 8_000,
      timeout: 10_000,
    });
  } else {
    socket.auth = { accessToken };
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
