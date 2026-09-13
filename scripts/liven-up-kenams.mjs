// Makes the 8 existing bot contacts interact with Kenams: DMs, a group chat,
// now-playing music, K-Pulse — so the app feels alive when he opens it.
//   node scripts/liven-up-kenams.mjs
//
// Uses raw fetch (not the @neondatabase SDK) for auth/data-api calls: the SDK's
// signInWithPassword does a follow-up session fetch that relies on a cookie
// jar Node's plain fetch doesn't keep, and fails with "session_not_found" even
// though the sign-in itself succeeds and returns a usable token (documented,
// pre-existing — see kpulse-poke.mjs).
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';
const SOCKET_URL = 'https://kssenger-server.onrender.com';
const KENAMS_ID = '85db1ffe-6c17-468f-8aca-aba9987aadef'; // kenams42+app@gmail.com — quick-login account
const BOT_PASSWORD = 'KssBot2026!';

const BOTS = [
  { slug: 'chloe', name: 'Chloé Dubois', lines: ["Salut ! ça faisait longtemps 😊", "Je viens de découvrir un super son"], track: { title: 'Formidable', artist: 'Stromae' } },
  { slug: 'fatou', name: 'Fatou Diallo', lines: ["Yo ! comment tu vas ?", "On se cale un call cette semaine ?"], track: { title: 'Sarabah', artist: 'Sona Jobarteh' } },
  { slug: 'hugo', name: 'Hugo Lefèvre', lines: ["Télétravail aujourd'hui, tranquille", "T'as vu le dernier match ?"], track: { title: 'Get Lucky', artist: 'Daft Punk' } },
  { slug: 'ines', name: 'Inès Moreau', lines: ["De retour, je répondais pas 😅", "J'écoute Piaf en ce moment, ça calme"], track: { title: 'La Vie en rose', artist: 'Édith Piaf' } },
  { slug: 'karim', name: 'Karim Benali', lines: ["En réunion là, je te réponds après", "Ça te dit un débat musique ce soir ?"], track: { title: 'Bamako', artist: 'Amadou & Mariam' } },
  { slug: 'lea', name: 'Léa Martin', lines: ["Dispo pour papoter si tu veux !", "Tu fais quoi de beau en ce moment ?"], track: { title: 'Ne me quitte pas', artist: 'Jacques Brel' } },
  { slug: 'sofia', name: 'Sofia Rossi', lines: ["Dispo pour un call quand tu veux", "On lance le groupe ?"], track: { title: 'Nel blu dipinto di blu', artist: 'Domenico Modugno' } },
  { slug: 'tom', name: 'Tom Bernard', lines: ["De retour de congé, ça fait du bien", "On se motive pour un projet ensemble ?"], track: { title: 'Bamako', artist: 'Amadou & Mariam' } },
];

function log(...args) { console.log(new Date().toISOString().slice(11, 19), ...args); }

async function signIn(bot) {
  const res = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://k-ssenger.expo.app' },
    body: JSON.stringify({ email: `kenams42+kss-${bot.slug}@gmail.com`, password: BOT_PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) { log(`❌ ${bot.name} sign-in failed`, json); return null; }
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0]; // "__Secure-neon-auth.session_token=..."
  if (!cookie) { log(`❌ ${bot.name} no session cookie`); return null; }

  // The Data API (PostgREST) needs a real JWT, not the opaque session token —
  // exchange it via /token using the signed session cookie.
  const jwtRes = await fetch(`${AUTH_URL}/token`, { headers: { Origin: 'https://k-ssenger.expo.app', Cookie: cookie } });
  const jwtJson = await jwtRes.json();
  if (!jwtRes.ok || !jwtJson.token) { log(`❌ ${bot.name} JWT exchange failed`, jwtJson); return null; }

  return { sessionToken: json.token, jwt: jwtJson.token, userId: json.user.id };
}

async function dataApi(token, method, path, body) {
  const res = await fetch(`${DATA_API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

async function connectBot(bot) {
  const session = await signIn(bot);
  if (!session) return null;
  const { jwt: token, userId } = session;

  await dataApi(token, 'PATCH', `/profiles?id=eq.${userId}`, {
    now_playing_title: bot.track.title,
    now_playing_artist: bot.track.artist,
    updated_at: new Date().toISOString(),
  }).catch((e) => log(`  (now-playing update skipped: ${e.message})`));

  const deviceName = `K-ssenger Bot ${bot.slug}`;
  let deviceId;
  const existing = await dataApi(token, 'GET', `/devices?user_id=eq.${userId}&name=eq.${encodeURIComponent(deviceName)}&revoked_at=is.null&select=id&limit=1`);
  if (existing?.[0]?.id) deviceId = existing[0].id;
  else {
    const inserted = await dataApi(token, 'POST', '/devices', { user_id: userId, name: deviceName });
    deviceId = inserted?.[0]?.id;
  }
  if (!deviceId) { log(`❌ ${bot.name} no device id`); return null; }

  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: token }, reconnection: false, timeout: 20000 });
  await new Promise((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', rej);
    setTimeout(() => rej(new Error('timeout')), 15000);
  });
  log(`✅ ${bot.name} connected`);
  return { socket, userId, deviceId, bot };
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

async function sendDm({ socket, deviceId }, text) {
  const direct = await emitAck(socket, 'conversation:direct', { userId: KENAMS_ID });
  if (!direct?.ok) { log('  conversation:direct failed', direct); return; }
  const result = await emitAck(socket, 'message:send', {
    clientMessageId: randomUUID(),
    conversationId: direct.conversationId,
    senderDeviceId: deviceId,
    algorithm: 'kssenger-plaintext-v1',
    ciphertext: text,
    createdAt: new Date().toISOString(),
  });
  log(`  → "${text}"`, result?.ok ? 'sent' : result);
  return direct.conversationId;
}

async function connectKenams() {
  const res = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://k-ssenger.expo.app' },
    body: JSON.stringify({ email: 'kenams42+app@gmail.com', password: 'KenamsKAH2026' }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) { log('❌ Kenams sign-in failed', json); return null; }
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0];
  const jwtRes = await fetch(`${AUTH_URL}/token`, { headers: { Origin: 'https://k-ssenger.expo.app', Cookie: cookie } });
  const jwtJson = await jwtRes.json();
  if (!jwtRes.ok || !jwtJson.token) { log('❌ Kenams JWT exchange failed', jwtJson); return null; }
  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: jwtJson.token }, reconnection: false, timeout: 20000 });
  await new Promise((res2, rej) => {
    socket.on('connect', res2);
    socket.on('connect_error', rej);
    setTimeout(() => rej(new Error('timeout')), 15000);
  });
  log('✅ Kenams connected');
  return socket;
}

async function ensureContacts(bots, kenamsSocket) {
  log('\nMaking sure Kenams is contacts with all bots...');
  for (const b of bots) {
    const req = await emitAck(b.socket, 'contact:request', { userId: KENAMS_ID });
    if (!req?.ok && req?.error && req.error !== 'ALREADY_CONTACT' && req.error !== 'REQUEST_EXISTS') {
      log(`  contact:request ${b.bot.name} -> Kenams`, req);
    }
    const requestId = req?.requestId ?? req?.id;
    if (requestId) {
      const accept = await emitAck(kenamsSocket, 'contact:accept', { requestId });
      if (!accept?.ok) log(`  contact:accept ${b.bot.name} failed`, accept);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  const bots = [];
  for (const bot of BOTS) {
    const connected = await connectBot(bot);
    if (connected) bots.push(connected);
    await new Promise((r) => setTimeout(r, 500));
  }
  if (bots.length === 0) { log('No bot connected, aborting.'); process.exit(1); }

  const kenamsSocket = await connectKenams();
  if (kenamsSocket) await ensureContacts(bots, kenamsSocket);

  log(`\n${bots.length} bots online. Sending DMs to Kenams...`);
  for (const b of bots) {
    for (const line of b.bot.lines) {
      await sendDm(b, line);
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  log('\nCreating group with Kenams + all bots...');
  const creator = bots[0];
  const memberIds = [KENAMS_ID, ...bots.slice(1).map((b) => b.userId)];
  const group = await emitAck(creator.socket, 'group:create', { title: 'La Bande 🎧', memberIds });
  if (group?.ok) {
    log(`✅ Group created: ${group.conversationId}`);
    const groupLines = [
      [creator, 'Bienvenue dans le groupe ! 🎉'],
      [bots[1], 'Salut tout le monde 👋'],
      [bots[2], 'On débat de quoi ce soir ?'],
      [bots[3], 'Musique vs cinéma, allez !'],
      [bots[4], 'Musique, sans hésiter 🎶'],
      [bots[5], "Carrément d'accord"],
    ];
    for (const [b, text] of groupLines) {
      if (!b) continue;
      await emitAck(b.socket, 'conversation:join', { conversationId: group.conversationId });
      await new Promise((r) => setTimeout(r, 300));
      const result = await emitAck(b.socket, 'message:send', {
        clientMessageId: randomUUID(),
        conversationId: group.conversationId,
        senderDeviceId: b.deviceId,
        algorithm: 'kssenger-plaintext-v1',
        ciphertext: text,
        createdAt: new Date().toISOString(),
      });
      log(`  [groupe] ${b.bot.name}: "${text}"`, result?.ok ? 'sent' : result);
      await new Promise((r) => setTimeout(r, 1200));
    }
  } else {
    log('❌ group:create failed', group);
  }

  log('\nSending K-Pulses...');
  for (const b of bots.slice(0, 3)) {
    const ok = await emitAck(b.socket, 'kpulse:send', { recipientId: KENAMS_ID, variant: 'classic' });
    log(`  ⚡ ${b.bot.name}`, ok);
    await new Promise((r) => setTimeout(r, 1500));
  }

  for (const b of bots) b.socket.close();
  if (kenamsSocket) kenamsSocket.close();
  log('\nDone.');
}

main().catch((error) => { console.error(error); process.exit(1); });
