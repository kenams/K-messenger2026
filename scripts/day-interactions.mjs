// QA bots: catch up on recent Kenams messages, then run one rotating social action.
// One-shot cron: DAY_INTERACTIONS_ONCE=1; local polling: DAY_INTERACTIONS_HOURS=10.
import { io } from 'socket.io-client';
import { KENAMS_ID, stableMessageId, testConversation, latestUnanswered, emitAck } from './bot-interactions-core.mjs';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';
const SOCKET_URL = 'https://kssenger-server.onrender.com';
const BOT_PASSWORD = process.env.BOT_PASSWORD || 'KssBot2026!';

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
    method: 'POST', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', Origin: 'https://k-ssenger.expo.app' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) return null;
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie) return null;
  const jwtRes = await fetch(`${AUTH_URL}/token`, { signal: AbortSignal.timeout(20_000), headers: { Origin: 'https://k-ssenger.expo.app', Cookie: cookie } });
  const jwtJson = await jwtRes.json();
  if (!jwtRes.ok || !jwtJson.token) return null;
  return { jwt: jwtJson.token, userId: json.user.id };
}

async function dataApi(token, method, path, body) {
  const res = await fetch(`${DATA_API_URL}${path}`, {
    method, signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Prefer: method === 'POST' ? 'return=representation' : 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
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
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('connection timeout')), 20_000);
      const finish = error => { clearTimeout(timer); socket.off('connect', connected); socket.off('connect_error', failed); error ? reject(error) : resolve(); };
      const connected = () => finish();
      const failed = () => finish(new Error('socket connection failed'));
      socket.once('connect', connected); socket.once('connect_error', failed);
    });
    const { contacts } = await emitAck(socket, 'contacts:list', {});
    const isKenamsContact = contacts.some(c => c.contact_id === KENAMS_ID);
    log(`${slug}: connected; Kenams contact=${isKenamsContact}`);
    return { slug, socket, userId, token, deviceId, isKenamsContact };
  } catch (error) { socket.close(); throw error; }
}

async function sendText(bot, conversationId, text, id) {
  return emitAck(bot.socket, 'message:send', {
    clientMessageId: id, conversationId, senderDeviceId: bot.deviceId,
    algorithm: 'kssenger-plaintext-v1', ciphertext: text, createdAt: new Date().toISOString(),
  });
}

async function catchUp(bot, botIds) {
  const { conversations } = await emitAck(bot.socket, 'conversations:list', {});
  for (const conversation of conversations.filter(c => testConversation(c, botIds)).slice(0,20)) {
    // One test bot replies per group to avoid eight replies to every message.
    const responder = conversation.members.map(m=>m.userId).filter(id=>botIds.has(id)).sort()[0];
    if (conversation.kind === 'group' && responder !== bot.userId) continue;
    await emitAck(bot.socket, 'conversation:join', { conversationId: conversation.id });
    const { messages } = await emitAck(bot.socket, 'conversation:history', { conversationId: conversation.id, limit: 100 });
    const message = latestUnanswered(messages, bot.userId);
    if (!message) continue;
    await emitAck(bot.socket, 'message:receipt', { conversationId: conversation.id, messageId: message.id, state: 'read' });
    await emitAck(bot.socket, 'message:react', { conversationId: conversation.id, messageId: message.id, reaction: '👍' });
    await sendText(bot, conversation.id, pick(REPLIES), stableMessageId(bot.userId, message.id, 'reply'));
    log(`${bot.slug}: replied, read receipt and reaction confirmed (${conversation.kind})`);
  }
  return conversations;
}

const ACTIONS = ['dm','kpulse','status','music','group','moment','moment-reaction','presence'];
async function proactivePing(bot, bots, slot, action) {
  if (!ACTIONS.includes(action)) throw new Error('Unknown DAY_INTERACTIONS_ACTION');
  const botIds = new Set(bots.map(b=>b.userId));
  if (action === 'dm') {
    const existing = bot.conversations?.find(c => c.kind === 'direct' && testConversation(c, botIds));
    const conversationId = existing?.id ?? (await emitAck(bot.socket, 'conversation:direct', { userId: KENAMS_ID })).conversationId;
    await emitAck(bot.socket, 'conversation:join', { conversationId });
    await sendText(bot, conversationId, pick(PROACTIVE), stableMessageId(bot.userId, slot, 'proactive-dm'));
  } else if (action === 'kpulse') {
    await emitAck(bot.socket, 'kpulse:send', { recipientId: KENAMS_ID, variant: 'classic' });
  } else if (action === 'status' || action === 'music') {
    const track = pick(TRACKS);
    await dataApi(bot.token, 'PATCH', `/profiles?id=eq.${bot.userId}`, {
      ...(action === 'status' ? { custom_status: pick(STATUSES) } : { now_playing_title: track.title, now_playing_artist: track.artist }),
      updated_at: new Date().toISOString(),
    });
  } else if (action === 'presence') {
    await emitAck(bot.socket, 'presence:update', { status: 'away' });
  } else if (action === 'group') {
    // Stable creator and title: reuse one group instead of creating a group every tick.
    const creator = bots[0];
    const { conversations } = await emitAck(creator.socket, 'conversations:list', {});
    let group = conversations.find(c=>c.kind==='group' && c.title==='K-ssenger — Bots QA' && testConversation(c, botIds));
    if (!group) {
      const result = await emitAck(creator.socket, 'group:create', { title:'K-ssenger — Bots QA', memberIds:[KENAMS_ID,...bots.slice(1).map(b=>b.userId)] });
      group = { id:result.conversationId };
    }
    await emitAck(creator.socket, 'conversation:join', { conversationId:group.id });
    await sendText(creator, group.id, '🧪 Test de groupe : réponds ici pour tester la lecture et les réactions.', stableMessageId(creator.userId, slot, 'group'));
  } else if (action === 'moment') {
    // At most one active QA text Moment per bot; no media uploads or public posts.
    const active = await dataApi(bot.token, 'GET', `/moments?author_id=eq.${bot.userId}&kind=eq.text&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&limit=1`);
    if (!active?.length) await dataApi(bot.token, 'POST', '/moments', {
      author_id:bot.userId, kind:'text', caption:'🧪 Moment de test — tu peux réagir ici !', visibility:'friends',
      moderation_status:'pending', expires_at:new Date(Date.now()+86400_000).toISOString(),
    });
  } else if (action === 'moment-reaction') {
    const moments = await dataApi(bot.token, 'GET', `/moments?author_id=eq.${KENAMS_ID}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&select=id&limit=1`);
    if (!moments?.length) { log(`${bot.slug}: no visible Kenams Moment to react to`); return; }
    const momentId = moments[0].id;
    const existing = await dataApi(bot.token, 'GET', `/moment_reactions?moment_id=eq.${momentId}&user_id=eq.${bot.userId}&select=reaction`);
    if (!existing?.length) await dataApi(bot.token, 'POST', '/moment_reactions', { moment_id:momentId, user_id:bot.userId, reaction:'❤️' });
  }
  log(`${bot.slug}: ${action} confirmed`);
}

async function tick(proactive) {
  const bots = [];
  const failures = [];
  try {
    for (const { slug } of BOTS) {
      try { bots.push(await connectBot(slug)); } catch(error) { failures.push(error.message); log(error.message); }
    }
    if (!bots.length) throw new Error('No bot connected');
    const botIds = new Set(bots.map(b=>b.userId));
    for (const bot of bots) {
      try { bot.conversations = await catchUp(bot, botIds); } catch(error) { failures.push(`${bot.slug}: ${error.message}`); log(`${bot.slug}: ${error.message}`); }
    }
    if (proactive) {
      const slot = Math.floor(Date.now()/1800_000);
      const eligible = bots.filter(b => b.isKenamsContact);
      if (!eligible.length) throw new Error('No bot has Kenams as an accepted contact');
      const requested = process.env.DAY_INTERACTIONS_ACTION || 'rotate';
      const actions = requested === 'all' ? ACTIONS : [requested === 'rotate' ? ACTIONS[slot % ACTIONS.length] : requested];
      for (const action of actions) await proactivePing(eligible[slot % eligible.length], eligible, slot, action);
    }
    if (failures.length) throw new Error(`${failures.length} bot operation(s) failed; see action names above`);
    log('Tick complete: acknowledgements checked, sockets closing.');
  } finally { for (const bot of bots) bot.socket.close(); }
}

async function main() {
  if (process.env.DAY_INTERACTIONS_ONCE === '1') return tick(true);
  const hours = Number(process.env.DAY_INTERACTIONS_HOURS ?? 10);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error('DAY_INTERACTIONS_HOURS must be between 0 and 24');
  const endAt = Date.now() + hours*3600_000;
  let lastSlot = -1;
  while (Date.now() < endAt) {
    const slot = Math.floor(Date.now()/1800_000);
    await tick(slot !== lastSlot);
    lastSlot = slot;
    await sleep(Math.min(30_000, Math.max(0,endAt-Date.now())));
  }
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
