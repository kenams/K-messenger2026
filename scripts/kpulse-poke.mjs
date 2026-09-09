// Fires a K-Pulse from bot Léa to Kenams every few seconds — QA helper for the burst.
//   KSSENGER_AUTH_URL=… KSSENGER_DATA_API_URL=… KSSENGER_SOCKET_URL=… node scripts/kpulse-poke.mjs
import { io } from 'socket.io-client';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

// Neon Auth now requires an Origin header on password sign-in.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Origin', 'https://k-ssenger.expo.app');
  return realFetch(url, { ...init, headers });
};

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
const SOCKET_URL = process.env.KSSENGER_SOCKET_URL;
const KENAMS_ID = process.env.KENAMS_ID ?? '43247878-5c6a-46bb-a2db-e7b3f6934a03';
const N = Number(process.env.PULSES ?? 4);

const auth = createClient({ auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL }, dataApi: { url: DATA_API_URL } });
const { data, error } = await auth.auth.signInWithPassword({
  email: 'kenams42+kss-lea@gmail.com',
  password: 'KssBot2026!',
});
if (error) throw error;
const token = data.session.access_token;

const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: token }, reconnection: false, timeout: 20000 });
await new Promise((res, rej) => { socket.on('connect', res); socket.on('connect_error', rej); });
console.log('connected as Léa');

for (let i = 0; i < N; i++) {
  const ok = await new Promise((res) => socket.emit('kpulse:send', { recipientId: KENAMS_ID, variant: 'classic' }, res));
  console.log(`pulse ${i + 1}`, ok);
  await new Promise((r) => setTimeout(r, 9000));
}
socket.close();
