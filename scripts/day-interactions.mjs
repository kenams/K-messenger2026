// Keeps the bot contacts alive and interacting with Kenams all day: they
// reply when he messages them, and every 20-40 min one of them proactively
// pings him (DM, K-Pulse, or a status/now-playing update) so the app feels
// like a real, active buddy list during a long test session.
//   KENAMS_QUICKLOGIN_PASSWORD=... node scripts/day-interactions.mjs
//
// Same auth dance as liven-up-kenams.mjs (raw fetch, not the SDK — see that
// file's header comment for why).
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';
const SOCKET_URL = 'https://kssenger-server.onrender.com';
const KENAMS_ID = '85db1ffe-6c17-468f-8aca-aba9987aadef';
const BOT_PASSWORD = 'KssBot2026!';

const REPLIES = [
  "Haha carrément 😂", "Grave !", "Tu fais quoi de beau aujourd'hui ?", "Ça marche, on se dit ça",
  "Content de te lire !", "Ah ouais ? raconte", "Je suis dispo si tu veux papoter", "😊", "Trop bien !",
  "Je viens de voir ton message, pardon", "On se fait un truc cette semaine ?",
];
const PROACTIVE = [
  "Alors cette journée de test, ça donne quoi ?", "Yo, toujours là 👋", "J'écoute un truc de fou là",
  "Tu testes quoi en ce moment sur l'appli ?", "Ça avance le taf ?", "Petit coucou du jour ☀️",
  "T'as 5 min pour un débat musique ?", "Dispo si besoin de tester un truc avec moi",
];
const TRACKS = [
  { title: 'Formidable', artist: 'Stromae' }, { title: 'Get Lucky', artist: 'Daft Punk' },
  { title: 'La Vie en rose', artist: 'Édith Piaf' }, { title: 'Bamako', artist: 'Amadou & Mariam' },
  { title: 'Sarabah', artist: 'Sona Jobarteh' }, { title: 'Ne me quitte pas', artist: 'Jacques Brel' },
];
const STATUSES = ['Dispo 👋', 'En pause café ☕', 'Sur l\'appli', 'Dans le coin', 'Au taquet 🚀'];

const BOTS = ['chloe', 'fatou', 'hugo', 'ines', 'karim', 'lea', 'sofia', 'tom'].map((slug) => ({ slug }));

function log(...args) { console.log(new Date().toISOString().slice(11, 19), ...args); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function signIn(email, password) {
  const res = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://k-ssenger.expo.app' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) return null;
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie) return null;
  const jwtRes = await fetch(`${AUTH_URL}/token`, { headers: { Origin: 'https://k-ssenger.expo.app', Cookie: cookie } });
  const jwtJson = await jwtRes.json();
  if (!jwtRes.ok || !jwtJson.token) return null;
  return { jwt: jwtJson.token, userId: json.user.id };
}

async function dataApi(token, method, path, body) {
  const res = await fetch(`${DATA_API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Prefer: method === 'POST' ? 'return=representation' : 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function connectBot(slug) {
  const session = await signIn(`kenams42+kss-${slug}@gmail.com`, BOT_PASSWORD);
  if (!session) { log(`❌ ${slug} sign-in failed`); return null; }
  const { jwt: token, userId } = session;

  const deviceName = `K-ssenger Bot ${slug}`;
  const existing = await dataApi(token, 'GET', `/devices?user_id=eq.${userId}&name=eq.${encodeURIComponent(deviceName)}&revoked_at=is.null&select=id&limit=1`);
  const deviceId = existing?.[0]?.id ?? (await dataApi(token, 'POST', '/devices', { user_id: userId, name: deviceName }))?.[0]?.id;
  if (!deviceId) { log(`❌ ${slug} no device id`); return null; }

  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: token }, reconnection: true, reconnectionDelay: 5000 });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('timeout')), 15000);
  });

  let directConversationId = null;
  socket.on('message:new', async (msg) => {
    if (msg?.senderId !== KENAMS_ID) return;
    directConversationId = directConversationId ?? msg.conversationId;
    const delay = 20_000 + Math.random() * 100_000; // feels human: 20s-2min
    await sleep(delay);
    await emitAck(socket, 'message:send', {
      clientMessageId: randomUUID(),
      conversationId: msg.conversationId,
      senderDeviceId: deviceId,
      algorithm: 'kssenger-plaintext-v1',
      ciphertext: pick(REPLIES),
      createdAt: new Date().toISOString(),
    });
    log(`  ${slug} replied to Kenams`);
  });

  log(`✅ ${slug} online`);
  return { slug, socket, userId, token, deviceId, getDirectConversationId: () => directConversationId, setDirectConversationId: (id) => { directConversationId = id; } };
}

async function proactivePing(bot) {
  const action = pick(['dm', 'kpulse', 'status', 'music']);
  try {
    if (action === 'dm') {
      let conversationId = bot.getDirectConversationId();
      if (!conversationId) {
        const direct = await emitAck(bot.socket, 'conversation:direct', { userId: KENAMS_ID });
        if (!direct?.ok) return log(`  ${bot.slug} dm setup failed`, direct);
        conversationId = direct.conversationId;
        bot.setDirectConversationId(conversationId);
      }
      const text = pick(PROACTIVE);
      await emitAck(bot.socket, 'message:send', {
        clientMessageId: randomUUID(), conversationId, senderDeviceId: bot.deviceId,
        algorithm: 'kssenger-plaintext-v1', ciphertext: text, createdAt: new Date().toISOString(),
      });
      log(`  ${bot.slug} → "${text}"`);
    } else if (action === 'kpulse') {
      await emitAck(bot.socket, 'kpulse:send', { recipientId: KENAMS_ID, variant: 'classic' });
      log(`  ${bot.slug} sent a K-Pulse`);
    } else if (action === 'status') {
      await dataApi(bot.token, 'PATCH', `/profiles?id=eq.${bot.userId}`, { custom_status: pick(STATUSES), updated_at: new Date().toISOString() });
      log(`  ${bot.slug} updated status`);
    } else {
      const t = pick(TRACKS);
      await dataApi(bot.token, 'PATCH', `/profiles?id=eq.${bot.userId}`, { now_playing_title: t.title, now_playing_artist: t.artist, updated_at: new Date().toISOString() });
      log(`  ${bot.slug} now playing ${t.title} — ${t.artist}`);
    }
  } catch (e) {
    log(`  ${bot.slug} action failed`, e.message);
  }
}

async function main() {
  const bots = [];
  for (const { slug } of BOTS) {
    const b = await connectBot(slug);
    if (b) bots.push(b);
    await sleep(500);
  }
  if (!bots.length) { log('No bot connected, aborting.'); process.exit(1); }
  log(`\n${bots.length} bots online and listening. Ctrl+C to stop.\n`);

  // Kick things off soon after start, then keep going all day.
  const HOURS = Number(process.env.DAY_INTERACTIONS_HOURS ?? 10);
  const endAt = Date.now() + HOURS * 3600_000;
  while (Date.now() < endAt) {
    await sleep(5_000 + Math.random() * 15_000);
    await proactivePing(pick(bots));
    await sleep(20 * 60_000 + Math.random() * 20 * 60_000); // next ping in 20-40 min
  }
  log('Day-interactions window elapsed, exiting.');
  for (const b of bots) b.socket.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
