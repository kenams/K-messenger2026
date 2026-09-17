// One-time kickoff: wires all 20 bots as contacts of "Kah", sends a first
// varied DM from each, creates 3 groups, posts a couple of Moments and sets
// varied statuses/now-playing — so the app already feels alive tonight.
// Safe to re-run (checks existing state before creating anything twice).
//   node scripts/kah-life-kickoff.mjs
import { io } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { KAH_ID, emitAck } from './kah-interactions-core.mjs';

const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';
const SOCKET_URL = 'https://kssenger-server.onrender.com';
const BOT_PASSWORD = process.env.BOT_PASSWORD;
const KAH_PASSWORD = process.env.KAH_PASSWORD;
if (!BOT_PASSWORD || !KAH_PASSWORD) throw new Error('BOT_PASSWORD and KAH_PASSWORD env vars are required');

const BOTS = [
  { slug: 'lea', name: 'Léa Martin', line: "Salut Kah ! Bienvenue sur ton compte tout propre 🎉", track: { title: 'Ne me quitte pas', artist: 'Jacques Brel' } },
  { slug: 'karim', name: 'Karim Benali', line: "Yo, ça fait plaisir de te voir ici 👋 t'as fait quoi de ta journée ?", track: { title: 'Bamako', artist: 'Amadou & Mariam' } },
  { slug: 'chloe', name: 'Chloé Dubois', line: "Coucou ! Je viens de découvrir un super son, je te le partage bientôt", track: { title: 'Formidable', artist: 'Stromae' } },
  { slug: 'yanis', name: 'Yanis Cohen', line: "Salut, dispo si tu veux tester un truc sur l'appli ce soir", track: { title: 'Alors on danse', artist: 'Stromae' } },
  { slug: 'fatou', name: 'Fatou Diallo', line: "Hello ! On se fait un call cette semaine pour papoter ?", track: { title: 'Sarabah', artist: 'Sona Jobarteh' } },
  { slug: 'hugo', name: 'Hugo Lefèvre', line: "Salut Kah, télétravail ici. Toi t'en es où niveau taf ?", track: { title: 'Get Lucky', artist: 'Daft Punk' } },
  { slug: 'ines', name: 'Inès Moreau', line: "Hey, contente de te retrouver par ici 😊", track: { title: 'La Vie en rose', artist: 'Édith Piaf' } },
  { slug: 'malik', name: 'Malik Traoré', line: "Yo Kah, mode focus activé aujourd'hui. Et toi, ta journée ?", track: { title: 'Ma direction', artist: 'Rohff' } },
  { slug: 'sofia', name: 'Sofia Rossi', line: "Ciao ! On lance un groupe entre nous ?", track: { title: 'Nel blu dipinto di blu', artist: 'Domenico Modugno' } },
  { slug: 'tom', name: 'Tom Bernard', line: "Salut, de retour de congé, ça fait du bien. Toi, ça va ?", track: { title: 'Island in the Sun', artist: 'Weezer' } },
  { slug: 'nadia', name: 'Nadia Belkacem', line: "Debout depuis les aurores ce matin ☀️ et toi, t'es du matin ou du soir ?", track: { title: 'Aicha', artist: 'Khaled' } },
  { slug: 'julien', name: 'Julien Petit', line: "Je bosse sur un petit projet perso, tu bosses sur quoi en ce moment ?", track: { title: 'Djadja', artist: 'Aya Nakamura' } },
  { slug: 'amine', name: 'Amine Ziani', line: "Sortie salle de sport, ça fait du bien. Toi tu fais du sport ?", track: { title: 'Dernière danse', artist: 'Indila' } },
  { slug: 'camille', name: 'Camille Roux', line: "Petit café ce matin ☕ toujours aussi indispensable non ?", track: { title: 'Tourner dans le vide', artist: 'Indila' } },
  { slug: 'youssef', name: 'Youssef Amrani', line: "Toujours un peu en retard moi 😅 mais dispo pour papoter", track: { title: 'Comme d\'hab', artist: 'Claude François' } },
  { slug: 'manon', name: 'Manon Laurent', line: "Journée hyper chargée, mais je prends 5 min pour te dire salut", track: { title: 'Balance ton quoi', artist: 'Angèle' } },
  { slug: 'bilal', name: 'Bilal Haddad', line: "Salut Kah, dispo si t'as besoin de tester un truc avec moi", track: { title: 'PNL', artist: 'Au DD' } },
  { slug: 'charlotte', name: 'Charlotte Menard', line: "En balade là, il fait super beau. Toi t'es plutôt intérieur ou dehors ?", track: { title: 'Je te promets', artist: 'Johnny Hallyday' } },
  { slug: 'adama', name: 'Adama Koné', line: "Tranquille à la maison ce soir, et toi, soirée calme ou ça bouge ?", track: { title: 'La Dalle', artist: 'Gazo' } },
  { slug: 'emma', name: 'Emma Bernard', line: "Mode weekend activé même si on n'y est pas encore 🎉", track: { title: 'Anti-love', artist: 'Angèle' } },
];

function log(...args) { console.log(new Date().toISOString().slice(11, 19), ...args); }

async function signIn(email, password, attempt = 0) {
  const res = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://k-ssenger.expo.app' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.token) {
    if (/too many requests|rate/i.test(json?.message ?? '') && attempt < 5) {
      const wait = 8000 * (attempt + 1);
      log(`  … ${email} rate-limited, pause ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return signIn(email, password, attempt + 1);
    }
    log(`❌ sign-in failed for ${email}`, json);
    return null;
  }
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  if (!cookie) { log(`❌ no session cookie for ${email}`); return null; }
  const jwtRes = await fetch(`${AUTH_URL}/token`, { headers: { Origin: 'https://k-ssenger.expo.app', Cookie: cookie } });
  const jwtJson = await jwtRes.json();
  if (!jwtRes.ok || !jwtJson.token) { log(`❌ JWT exchange failed for ${email}`, jwtJson); return null; }
  return { jwt: jwtJson.token, userId: json.user.id };
}

async function dataApi(token, method, path, body) {
  const res = await fetch(`${DATA_API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Prefer: method === 'POST' ? 'return=representation' : 'return=minimal' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return json;
}

async function connectSocket(token) {
  const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: token }, reconnection: false, timeout: 20000 });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket timeout')), 20000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (e) => { clearTimeout(timer); reject(e); });
  });
  return socket;
}

async function ensureDevice(token, userId, name) {
  const existing = await dataApi(token, 'GET', `/devices?user_id=eq.${userId}&name=eq.${encodeURIComponent(name)}&revoked_at=is.null&select=id&limit=1`);
  if (existing?.[0]?.id) return existing[0].id;
  const inserted = await dataApi(token, 'POST', '/devices', { user_id: userId, name });
  return inserted?.[0]?.id;
}

async function connectBot(bot) {
  const session = await signIn(`kenams42+kss-${bot.slug}@gmail.com`, BOT_PASSWORD);
  if (!session) throw new Error(`${bot.slug}: sign-in failed`);
  const { jwt: token, userId } = session;
  await dataApi(token, 'PATCH', `/profiles?id=eq.${userId}`, {
    now_playing_title: bot.track.title, now_playing_artist: bot.track.artist, updated_at: new Date().toISOString(),
  }).catch((e) => log(`  (now-playing skipped for ${bot.slug}: ${e.message})`));
  const deviceId = await ensureDevice(token, userId, `K-ssenger Bot ${bot.slug}`);
  if (!deviceId) throw new Error(`${bot.slug}: no device`);
  const socket = await connectSocket(token);
  log(`✅ ${bot.name} connected`);
  return { socket, userId, deviceId, token, bot };
}

async function main() {
  const kahSession = await signIn('kahdigital42@gmail.com', KAH_PASSWORD);
  if (!kahSession) throw new Error('Cannot sign in as Kah — aborting');
  const kahSocket = await connectSocket(kahSession.jwt);
  log('✅ Kah connected');

  const bots = [];
  for (const bot of BOTS) {
    try { bots.push(await connectBot(bot)); } catch (e) { log(`❌ ${bot.slug}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  log(`\n${bots.length}/${BOTS.length} bots online.`);

  log('\nEnsuring contacts with Kah...');
  for (const b of bots) {
    const req = await emitAck(b.socket, 'contact:request', { userId: KAH_ID }).catch((e) => ({ error: e.message }));
    const requestId = req?.requestId;
    if (requestId) {
      await emitAck(kahSocket, 'contact:accept', { requestId }).catch((e) => log(`  accept ${b.bot.slug} failed: ${e.message}`));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  log('  ✓ contacts synced');

  log('\nSending opening DMs...');
  for (const b of bots) {
    const direct = await emitAck(b.socket, 'conversation:direct', { userId: KAH_ID }).catch((e) => ({ error: e.message }));
    if (!direct?.conversationId) { log(`  ~ ${b.bot.slug} direct conv failed`); continue; }
    const { messages } = await emitAck(b.socket, 'conversation:history', { conversationId: direct.conversationId, limit: 20 }).catch(() => ({ messages: [] }));
    if ((messages ?? []).some((m) => m.senderUserId === b.userId)) { log(`  = ${b.bot.slug} already sent an opening DM`); continue; }
    await emitAck(b.socket, 'message:send', {
      clientMessageId: randomUUID(), conversationId: direct.conversationId, senderDeviceId: b.deviceId,
      algorithm: 'kssenger-plaintext-v1', ciphertext: b.bot.line, createdAt: new Date().toISOString(),
    }).then(() => log(`  → ${b.bot.name}: "${b.bot.line}"`)).catch((e) => log(`  ~ ${b.bot.slug} send failed: ${e.message}`));
    await new Promise((r) => setTimeout(r, 900));
  }

  log('\nCreating groups...');
  const byKey = (k) => bots.find((b) => b.bot.slug === k);
  async function ensureGroup(preferredCreator, title, members) {
    const creator = preferredCreator ?? members[0];
    if (!creator) { log(`  ~ "${title}" skipped: no bot connected for it`); return null; }
    const { conversations } = await emitAck(creator.socket, 'conversations:list', {}).catch(() => ({ conversations: [] }));
    const existing = (conversations ?? []).find((c) => c.kind === 'group' && c.title === title && c.members?.some((m) => m.userId === KAH_ID));
    if (existing) { log(`  = "${title}" already exists`); return existing.id; }
    const memberIds = [KAH_ID, ...members.map((m) => m.userId)];
    const result = await emitAck(creator.socket, 'group:create', { title, memberIds }).catch((e) => ({ error: e.message }));
    if (!result?.conversationId) { log(`  ~ "${title}" creation failed: ${result?.error}`); return null; }
    for (const m of members) await emitAck(m.socket, 'conversation:join', { conversationId: result.conversationId }).catch(() => {});
    log(`  ✓ "${title}" created`);
    return result.conversationId;
  }
  // NOTE: group members must already be mutual contacts of the creator
  // (createGroup rejects otherwise) — the 10 original bots are fully meshed
  // with each other (web-test-populate.mjs), the 10 new ones are not, so
  // groups are built from the original 10 for now.
  const g1 = await ensureGroup(byKey('lea'), 'Kah — La Bande 🎧', [byKey('karim'), byKey('chloe'), byKey('fatou'), byKey('hugo')].filter(Boolean));
  const g2 = await ensureGroup(byKey('sofia'), 'Kah — KAH Digital 🌍', [byKey('ines'), byKey('malik'), byKey('tom')].filter(Boolean));
  const g3 = await ensureGroup(byKey('yanis'), 'Kah — Weekend Vibes ✨', [byKey('ines'), byKey('tom'), byKey('fatou')].filter(Boolean));

  async function chat(groupId, entries) {
    if (!groupId) return;
    for (const [key, text] of entries) {
      const b = byKey(key);
      if (!b) continue;
      await emitAck(b.socket, 'message:send', {
        clientMessageId: randomUUID(), conversationId: groupId, senderDeviceId: b.deviceId,
        algorithm: 'kssenger-plaintext-v1', ciphertext: text, createdAt: new Date().toISOString(),
      }).then(() => log(`  [groupe] ${b.bot.name}: "${text}"`)).catch((e) => log(`  ~ ${key} group msg failed: ${e.message}`));
      await new Promise((r) => setTimeout(r, 900));
    }
  }
  await chat(g1, [['lea', 'Bienvenue Kah dans La Bande 🎉'], ['karim', 'Salut tout le monde 👋'], ['chloe', 'On débat de quoi ce soir ?'], ['hugo', 'Musique vs cinéma, allez !'], ['fatou', 'Musique direct 🎶']]);
  await chat(g2, [['sofia', 'Groupe KAH Digital, dispo pour un brainstorm 💡'], ['ines', 'Carrément dispo'], ['malik', 'On se cale ça cette semaine ?'], ['tom', "Ça marche pour moi"]]);
  await chat(g3, [['yanis', 'Bienvenue dans Weekend Vibes ✨'], ['ines', 'Ça sent le bon plan ce groupe'], ['tom', "J'apporte de la musique 🎧"], ['fatou', 'Carrément partante !']]);

  log('\nMoments...');
  for (const b of [byKey('chloe'), byKey('malik'), byKey('sofia'), byKey('nadia')].filter(Boolean)) {
    const active = await dataApi(b.token, 'GET', `/moments?author_id=eq.${b.userId}&kind=eq.text&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id&limit=1`);
    if (active?.length) { log(`  = ${b.bot.slug} already has a moment`); continue; }
    await dataApi(b.token, 'POST', '/moments', {
      author_id: b.userId, kind: 'text', caption: `${b.bot.name.split(' ')[0]} vit sa vie sur K-ssenger 🚀`, visibility: 'friends',
      moderation_status: 'approved', expires_at: new Date(Date.now() + 24 * 3600_000).toISOString(),
    }).then(() => log(`  ✓ ${b.bot.slug} moment posted`)).catch((e) => log(`  ~ ${b.bot.slug} moment failed: ${e.message}`));
  }

  log('\nK-Pulses...');
  for (const key of ['lea', 'karim', 'sofia']) {
    const b = byKey(key);
    if (!b) continue;
    await emitAck(b.socket, 'kpulse:send', { recipientId: KAH_ID, variant: 'classic' }).then(() => log(`  ⚡ ${b.bot.name}`)).catch((e) => log(`  ~ ${key} kpulse failed: ${e.message}`));
    await new Promise((r) => setTimeout(r, 1000));
  }

  for (const b of bots) b.socket.close();
  kahSocket.close();
  log('\nDone. Kah account is now alive: 20 bots in contact, 3 groups, opening DMs, moments, K-Pulses.');
}

main().catch((e) => { console.error('KAH_LIFE_KICKOFF_FAILED:', e.message); process.exit(1); });
