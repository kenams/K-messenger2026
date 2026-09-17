// Recurring "Kah feels alive" tick: a rotating subset of the 20 bots catch up
// on anything Kah sent them, then do 1-2 low-volume proactive actions
// (DM / status / music / presence / kpulse / group message / moment).
// Run by .github/workflows/kah-life-interactions.yml every ~2h — never floods
// everything at once, and never repeats the exact same lines back to back.
//   DAY_INTERACTIONS_ONCE=1 node scripts/kah-life-interactions.mjs
import { io } from 'socket.io-client';
import { KAH_ID, stableMessageId, testConversation, latestUnanswered, emitAck } from './kah-interactions-core.mjs';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';
const SOCKET_URL = 'https://kssenger-server.onrender.com';
const BOT_PASSWORD = process.env.BOT_PASSWORD || 'KssBot2026!';

const ALL_SLUGS = [
  'lea', 'karim', 'chloe', 'yanis', 'fatou', 'hugo', 'ines', 'malik', 'sofia', 'tom',
  'nadia', 'julien', 'amine', 'camille', 'youssef', 'manon', 'bilal', 'charlotte', 'adama', 'emma',
];
// Only these 10 are mutually meshed contacts of each other -> only they can post in the 3 groups.
const MESHED_SLUGS = new Set(['lea', 'karim', 'chloe', 'yanis', 'fatou', 'hugo', 'ines', 'malik', 'sofia', 'tom']);
const GROUPS = ['Kah — La Bande 🎧', 'Kah — KAH Digital 🌍', 'Kah — Weekend Vibes ✨'];

const REPLIES = [
  "Haha carrément 😂", "Grave, je vois ce que tu veux dire", "Ça a l'air pas mal ça !",
  "Content de te lire, dis-m'en plus", "Ah ouais ? raconte", "Je suis dispo si tu veux papoter",
  "😊", "Trop bien !", "Petit rire ici mdr", "On se fait un truc cette semaine du coup ?",
  "Pas faux 👀", "Bien vu", "Ça me parle grave",
];
const PROACTIVE = [
  "Alors, ta journée s'est passée comment ?", "Yo, toujours là 👋", "T'as fait quoi de beau aujourd'hui ?",
  "Petit coucou du jour ☀️", "J'écoute un truc de fou là, je te dis si c'est bien",
  "Dispo si tu veux tester un truc avec moi", "Ça avance le taf/les projets ?",
  "T'as vu qu'on a un petit groupe maintenant ? viens papoter dedans", "Tu dors bien en ce moment ?",
  "Petite question du soir : plutôt thé ou café ?", "Journée productive ou tranquille aujourd'hui ?",
  "Ça fait plaisir de discuter comme ça", "J'ai croisé un truc marrant aujourd'hui, je te raconte à l'occasion",
  "T'as des plans pour le weekend ?", "Comment tu gères le rythme en ce moment ?",
];
const GROUP_LINES = [
  "Quelqu'un a des nouvelles ? 👀", "Journée tranquille pour tout le monde ?", "On se motive pour un truc cette semaine ?",
  "Petit up du groupe, tout le monde va bien ?", "Musique du jour : je partage un truc plus tard 🎶",
];
const TRACKS = [
  { title: 'Formidable', artist: 'Stromae' }, { title: 'Get Lucky', artist: 'Daft Punk' },
  { title: 'La Vie en rose', artist: 'Édith Piaf' }, { title: 'Bamako', artist: 'Amadou & Mariam' },
  { title: 'Sarabah', artist: 'Sona Jobarteh' }, { title: 'Ne me quitte pas', artist: 'Jacques Brel' },
  { title: 'Aicha', artist: 'Khaled' }, { title: 'Djadja', artist: 'Aya Nakamura' },
  { title: 'Dernière danse', artist: 'Indila' }, { title: 'Balance ton quoi', artist: 'Angèle' },
];
const STATUSES = ['Dispo 👋', 'En pause café ☕', 'Sur l\'appli', 'Dans le coin', 'Au taquet 🚀', 'Petit creux, à plus tard', 'Journée tranquille'];

function log(...args) { console.log(new Date().toISOString().slice(11, 19), ...args); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function signIn(email, password, attempt = 0) {
  const res = await fetch(`${AUTH_URL}/sign-in/email`, { method: 'POST', signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', Origin: 'https://k-ssenger.expo.app' }, body: JSON.stringify({ email, password }) });
  const json = await res.json();
  if (!res.ok || !json.token) {
    if (/too many requests|rate/i.test(json?.message ?? '') && attempt < 4) { const wait = 6000 * (attempt + 1); await sleep(wait); return signIn(email, password, attempt + 1); }
    return null;
  }
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie) return null;
  const jwtRes = await fetch(`${AUTH_URL}/token`, { signal: AbortSignal.timeout(20_000), headers: { Origin: 'https://k-ssenger.expo.app', Cookie: cookie } });
  const jwtJson = await jwtRes.json();
  if (!jwtRes.ok || !jwtJson.token) return null;
  return { jwt: jwtJson.token, userId: json.user.id };
}
async function dataApi(token, method, path, body) {
  const res = await fetch(`${DATA_API_URL}${path}`, { method, signal: AbortSignal.timeout(20_000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Prefer: method === 'POST' ? 'return=representation' : 'return=minimal' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  return text ? JSON.parse(text) : null;
}
async function connectBot(slug) {
  const session = await signIn(`kenams42+kss-${slug}@gmail.com`, BOT_PASSWORD);
  if (!session) throw new Error(`${slug}: authentication failed`);
  const { jwt: token, userId } = session;
  const name = `K-ssenger Bot ${slug}`;
  const existing = await dataApi(token, 'GET', `/devices?user_id=eq.${userId}&name=eq.${encodeURIComponent(name)}&revoked_at=is.null&select=id&limit=1`);
  const deviceId = existing?.[0]?.id ?? (await dataApi(token, 'POST', '/devices', { user_id: userId, name }))?.[0]?.id;
  if (!deviceId) throw new Error(`${slug}: no device`);
  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: token }, reconnection: false });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('connection timeout')), 20_000);
    const finish = (error) => { clearTimeout(timer); socket.off('connect', ok); socket.off('connect_error', ko); error ? reject(error) : resolve(); };
    const ok = () => finish();
    const ko = () => finish(new Error('socket connection failed'));
    socket.once('connect', ok); socket.once('connect_error', ko);
  });
  log(`${slug}: connected`);
  return { slug, socket, userId, token, deviceId };
}
async function sendText(bot, conversationId, text, id) {
  return emitAck(bot.socket, 'message:send', { clientMessageId: id, conversationId, senderDeviceId: bot.deviceId, algorithm: 'kssenger-plaintext-v1', ciphertext: text, createdAt: new Date().toISOString() });
}

async function catchUp(bot) {
  const { conversations } = await emitAck(bot.socket, 'conversations:list', {});
  const direct = (conversations ?? []).find((c) => c.kind === 'direct' && testConversation(c, new Set([bot.userId])));
  if (!direct) return;
  await emitAck(bot.socket, 'conversation:join', { conversationId: direct.id });
  const { messages } = await emitAck(bot.socket, 'conversation:history', { conversationId: direct.id, limit: 50 });
  const message = latestUnanswered(messages, bot.userId);
  if (!message) return;
  await emitAck(bot.socket, 'message:receipt', { conversationId: direct.id, messageId: message.id, state: 'read' }).catch(() => {});
  await emitAck(bot.socket, 'message:react', { conversationId: direct.id, messageId: message.id, reaction: '👍' }).catch(() => {});
  await sendText(bot, direct.id, pick(REPLIES), stableMessageId(bot.userId, message.id, 'reply'));
  log(`${bot.slug}: replied to Kah`);
}

async function proactive(bot, slot) {
  const action = ['dm', 'dm', 'status', 'music', 'presence', 'kpulse', 'group', 'moment'][slot % 8];
  if (action === 'dm') {
    const { conversations } = await emitAck(bot.socket, 'conversations:list', {});
    const existing = (conversations ?? []).find((c) => c.kind === 'direct' && testConversation(c, new Set([bot.userId])));
    const conversationId = existing?.id ?? (await emitAck(bot.socket, 'conversation:direct', { userId: KAH_ID })).conversationId;
    await emitAck(bot.socket, 'conversation:join', { conversationId });
    await sendText(bot, conversationId, pick(PROACTIVE), stableMessageId(bot.userId, slot, 'proactive-dm'));
  } else if (action === 'status') {
    await dataApi(bot.token, 'PATCH', `/profiles?id=eq.${bot.userId}`, { custom_status: pick(STATUSES), updated_at: new Date().toISOString() });
  } else if (action === 'music') {
    const track = pick(TRACKS);
    await dataApi(bot.token, 'PATCH', `/profiles?id=eq.${bot.userId}`, { now_playing_title: track.title, now_playing_artist: track.artist, updated_at: new Date().toISOString() });
  } else if (action === 'presence') {
    await emitAck(bot.socket, 'presence:update', { status: pick(['online', 'away', 'busy']) });
  } else if (action === 'kpulse') {
    await emitAck(bot.socket, 'kpulse:send', { recipientId: KAH_ID, variant: 'classic' }).catch((e) => log(`${bot.slug}: kpulse skipped (${e.message})`));
  } else if (action === 'group' && MESHED_SLUGS.has(bot.slug)) {
    const { conversations } = await emitAck(bot.socket, 'conversations:list', {});
    const group = (conversations ?? []).find((c) => c.kind === 'group' && GROUPS.includes(c.title));
    if (group) {
      await emitAck(bot.socket, 'conversation:join', { conversationId: group.id });
      await sendText(bot, group.id, pick(GROUP_LINES), stableMessageId(bot.userId, slot, 'group'));
    }
  } else if (action === 'moment') {
    const active = await dataApi(bot.token, 'GET', `/moments?author_id=eq.${bot.userId}&kind=eq.text&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&limit=1`);
    if (!active?.length) {
      await dataApi(bot.token, 'POST', '/moments', { author_id: bot.userId, kind: 'text', caption: pick(["Petite pause 🌤️", "Journée productive aujourd'hui", "Ambiance chill ce soir", "Nouvelle sortie musicale à découvrir 🎧"]), visibility: 'friends', moderation_status: 'approved', expires_at: new Date(Date.now() + 86400_000).toISOString() });
    }
  }
  log(`${bot.slug}: ${action} done`);
}

async function tick() {
  const slot = Math.floor(Date.now() / 3600_000);
  // Rotate through 4-5 bots per tick instead of connecting all 20 every time.
  const count = 5;
  const start = (slot * 7) % ALL_SLUGS.length;
  const chosen = Array.from({ length: count }, (_, i) => ALL_SLUGS[(start + i) % ALL_SLUGS.length]);
  const bots = [];
  const failures = [];
  try {
    for (const slug of chosen) {
      try { bots.push(await connectBot(slug)); } catch (error) { failures.push(`${slug}: ${error.message}`); log(`${slug}: ${error.message}`); }
      await sleep(1500);
    }
    if (!bots.length) throw new Error('No bot connected this tick');
    for (const bot of bots) {
      try { await catchUp(bot); } catch (error) { failures.push(`${bot.slug} catchUp: ${error.message}`); log(`${bot.slug}: catchUp failed (${error.message})`); }
    }
    const activeCount = Math.min(2, bots.length);
    for (let i = 0; i < activeCount; i++) {
      const bot = bots[(slot + i) % bots.length];
      try { await proactive(bot, slot + i); } catch (error) { failures.push(`${bot.slug} proactive: ${error.message}`); log(`${bot.slug}: proactive failed (${error.message})`); }
      await sleep(800);
    }
    log(`Tick complete: ${bots.length}/${chosen.length} bots, ${failures.length} soft failure(s).`);
  } finally { for (const bot of bots) bot.socket.close(); }
}

tick().catch((error) => { console.error(error.message); process.exitCode = 1; });
