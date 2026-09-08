// K-ssenger web test populate — idempotent.
//
// Creates 10 "bot" accounts + 1 account for Kenams on the live dedicated
// backend, then wires a lively social state so the web app can be tested:
//   - every bot is a mutual contact of every other bot and of Kenams
//   - two groups that include Kenams
//   - a burst of K-Pulses (wizz) between bots and toward Kenams
//   - stored presence + custom status + "now playing" on every bot
//   - best-effort approved Moments
//
// Chat itself stays E2EE and cannot be exercised from here or on web
// (libsignal native = Android only). This only populates the social shell.
//
//   KSSENGER_AUTH_URL=… KSSENGER_DATA_API_URL=… KSSENGER_SOCKET_URL=… \
//     [KENAMS_EMAIL=…] [KENAMS_PASSWORD=…] [BOT_PASSWORD=…] [KEEPALIVE=1] \
//     node scripts/web-test-populate-runner.mjs

import crypto from 'node:crypto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { io } from 'socket.io-client';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
const SOCKET_URL = process.env.KSSENGER_SOCKET_URL;
for (const [name, value] of Object.entries({ AUTH_URL, DATA_API_URL, SOCKET_URL })) {
  if (!value) throw new Error(`${name} is required`);
}

const BOT_PASSWORD = process.env.BOT_PASSWORD || 'KssBot2026!';
const KENAMS_EMAIL = process.env.KENAMS_EMAIL || 'kenams42+kssenger@gmail.com';
const KENAMS_PASSWORD = process.env.KENAMS_PASSWORD || `Kss-${crypto.randomBytes(6).toString('base64url')}-26`;

const BOTS = [
  { key: 'lea', email: 'kenams42+kss-lea@gmail.com', username: 'lea_m', displayName: 'Léa Martin', status: 'Dispo pour papoter 💬', presence: 'online', music: { title: 'Ne me quitte pas', artist: 'Jacques Brel' } },
  { key: 'karim', email: 'kenams42+kss-karim@gmail.com', username: 'karim_b', displayName: 'Karim Benali', status: 'En réunion 📞', presence: 'busy', music: { title: 'Bamako', artist: 'Amadou & Mariam' } },
  { key: 'chloe', email: 'kenams42+kss-chloe@gmail.com', username: 'chloe_d', displayName: 'Chloé Dubois', status: '☕ petite pause', presence: 'away', music: { title: 'Formidable', artist: 'Stromae' } },
  { key: 'yanis', email: 'kenams42+kss-yanis@gmail.com', username: 'yanis_c', displayName: 'Yanis Cohen', status: 'Ne pas déranger 🔴', presence: 'busy', music: { title: 'Alors on danse', artist: 'Stromae' } },
  { key: 'fatou', email: 'kenams42+kss-fatou@gmail.com', username: 'fatou_d', displayName: 'Fatou Diallo', status: 'Au taquet 🚀', presence: 'online', music: { title: 'Sarabah', artist: 'Sona Jobarteh' } },
  { key: 'hugo', email: 'kenams42+kss-hugo@gmail.com', username: 'hugo_l', displayName: 'Hugo Lefèvre', status: 'En télétravail 🏠', presence: 'online', music: { title: 'Get Lucky', artist: 'Daft Punk' } },
  { key: 'ines', email: 'kenams42+kss-ines@gmail.com', username: 'ines_m', displayName: 'Inès Moreau', status: 'De retour à 14h', presence: 'away', music: { title: 'La Vie en rose', artist: 'Édith Piaf' } },
  { key: 'malik', email: 'kenams42+kss-malik@gmail.com', username: 'malik_t', displayName: 'Malik Traoré', status: '🎧 mode focus', presence: 'busy', music: { title: 'Ma direction', artist: 'Rohff' } },
  { key: 'sofia', email: 'kenams42+kss-sofia@gmail.com', username: 'sofia_r', displayName: 'Sofia Rossi', status: 'Dispo pour un call', presence: 'online', music: { title: 'Nel blu dipinto di blu', artist: 'Domenico Modugno' } },
  { key: 'tom', email: 'kenams42+kss-tom@gmail.com', username: 'tom_b', displayName: 'Tom Bernard', status: '🌴 en congé, revient bientôt', presence: 'invisible', music: { title: 'Island in the Sun', artist: 'Weezer' } },
];

const KENAMS = { key: 'kenams', email: KENAMS_EMAIL, username: 'kenams', displayName: 'Kenams', status: 'Je teste K-ssenger 👀', presence: 'online', music: { title: 'Simple comme MSN', artist: 'KAH' } };

function makeAuthClient() {
  return createClient({ auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL }, dataApi: { url: DATA_API_URL } });
}
function makeDataClient(accessToken) {
  return createClient({ dataApi: { url: DATA_API_URL, getToken: async () => accessToken } });
}
function signalMaterial(label, purpose) {
  return `${label}-${purpose}-${crypto.randomBytes(48).toString('base64url')}`;
}
function ack(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 15_000);
    socket.emit(event, payload, (response) => { clearTimeout(timer); resolve(response); });
  });
}
function connectSocket(person) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: person.accessToken }, reconnection: false, timeout: 20_000 });
    const timer = setTimeout(() => { socket.close(); reject(new Error(`${person.key} socket timeout`)); }, 30_000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', (e) => { clearTimeout(timer); reject(new Error(`${person.key} socket connect_error: ${e.message}`)); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureAccount(spec, password) {
  globalThis.__resetKssengerSmokeCookies?.();
  const auth = makeAuthClient();
  let session = null;

  let signup;
  for (let attempt = 0; attempt < 5; attempt++) {
    signup = await auth.auth.signUp({
      email: spec.email,
      password,
      options: { data: { username: spec.username, display_name: spec.displayName } },
    });
    if (!signup.error || !/too many requests|rate/i.test(signup.error.message)) break;
    const wait = 8000 * (attempt + 1);
    console.log(`  … ${spec.key} rate-limited, pause ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (signup.error) {
    const signin = await auth.auth.signInWithPassword({ email: spec.email, password });
    if (signin.error) throw new Error(`${spec.key}: signup(${signup.error.message}) + signin(${signin.error.message}) failed`);
    session = signin.data?.session ?? null;
  } else {
    session = signup.data?.session ?? null;
    if (!session) {
      const signin = await auth.auth.signInWithPassword({ email: spec.email, password });
      if (signin.error) throw new Error(`${spec.key} post-signup signin failed: ${signin.error.message}`);
      session = signin.data?.session ?? null;
    }
  }
  if (!session?.user?.id || !session?.access_token) throw new Error(`${spec.key} session missing`);

  const userId = session.user.id;
  const client = makeDataClient(session.access_token);

  const rpc = await client.rpc('ensure_my_kssenger_profile', { p_username: spec.username, p_display_name: spec.displayName });
  if (rpc.error && !/USERNAME_TAKEN/i.test(rpc.error.message)) throw new Error(`${spec.key} ensure_profile: ${rpc.error.message}`);

  const enrich = await client.from('profiles').update({
    display_name: spec.displayName,
    custom_status: spec.status,
    presence: spec.presence,
    now_playing_title: spec.music.title,
    now_playing_artist: spec.music.artist,
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
  if (enrich.error) throw new Error(`${spec.key} profile enrich: ${enrich.error.message}`);

  try { await client.from('privacy_settings').insert({ user_id: userId }); } catch { /* present */ }
  try { await client.from('user_age_profile').insert({ user_id: userId, birth_date: '1993-04-18', age_assurance_level: 'declared' }); } catch { /* present */ }

  // one device + placeholder Signal prekeys so discovery has something to show
  const existingDevice = await client.from('devices').select('id').eq('user_id', userId).limit(1);
  if (existingDevice.error || !existingDevice.data?.[0]?.id) {
    const dev = await client.from('devices').insert({ user_id: userId, name: `${spec.displayName} — web test` }).select('id').single();
    if (!dev.error && dev.data?.id) {
      const deviceId = dev.data.id;
      const bundle = await client.from('device_key_bundles').insert({
        device_id: deviceId, user_id: userId, bundle_version: 1,
        registration_id: 1000 + crypto.randomInt(1, 15000),
        identity_key: signalMaterial(spec.key, 'identity'),
        signed_prekey_id: 11, signed_prekey_public: signalMaterial(spec.key, 'signed'), signed_prekey_signature: signalMaterial(spec.key, 'signed-sig'),
        pq_last_resort_prekey_id: 211, pq_last_resort_prekey_public: signalMaterial(spec.key, 'pq-lr'), pq_last_resort_prekey_signature: signalMaterial(spec.key, 'pq-lr-sig'),
      });
      if (bundle.error) console.log(`  ~ ${spec.key} bundle skipped (${bundle.error.message})`);
      try { await client.from('device_one_time_prekeys').insert([31, 32, 33].map((id) => ({ device_id: deviceId, key_id: id, public_key: signalMaterial(spec.key, `ec-${id}`) }))); } catch { /* ignore */ }
      try { await client.from('device_pq_one_time_prekeys').insert([41, 42, 43].map((id) => ({ device_id: deviceId, key_id: id, public_key: signalMaterial(spec.key, `pq-${id}`), signature: signalMaterial(spec.key, `pq-sig-${id}`) }))); } catch { /* ignore */ }
    }
  }

  console.log(`  ✓ ${spec.key.padEnd(7)} ${spec.email.padEnd(28)} id=${userId}`);
  return { ...spec, auth, client, userId, accessToken: session.access_token };
}

async function areContacts(a, b) {
  const r = await a.client.from('contacts').select('contact_id').eq('owner_id', a.userId).eq('contact_id', b.userId).limit(1);
  return !r.error && (r.data?.length ?? 0) > 0;
}

async function linkContacts(a, aSock, b, bSock) {
  if (await areContacts(a, b)) return 'skip';
  const req = await ack(aSock, 'contact:request', { userId: b.userId }).catch((e) => ({ error: e.message }));
  if (!req?.ok || !req?.requestId) {
    if (/exist|already/i.test(req?.error ?? '')) return 'existing';
    console.log(`  ~ ${a.key}→${b.key} request: ${req?.error ?? 'refusé'}`);
    return 'fail';
  }
  const acc = await ack(bSock, 'contact:accept', { requestId: req.requestId }).catch((e) => ({ error: e.message }));
  if (!acc?.ok) { console.log(`  ~ ${b.key} accept: ${acc?.error ?? 'refusé'}`); return 'fail'; }
  return 'ok';
}

async function main() {
  console.log('K-ssenger — populate test web\n');
  console.log('Comptes :');
  const bots = [];
  for (const spec of BOTS) { bots.push(await ensureAccount(spec, BOT_PASSWORD)); await sleep(2500); }
  const kenams = await ensureAccount(KENAMS, KENAMS_PASSWORD);
  const everyone = [...bots, kenams];

  console.log('\nSockets temps réel :');
  const sockets = {};
  for (const p of everyone) {
    try { sockets[p.key] = await connectSocket(p); }
    catch (e) { console.log(`  ! ${p.key} socket: ${e.message}`); }
  }
  console.log(`  ✓ ${Object.keys(sockets).length}/${everyone.length} connectées`);

  console.log('\nContacts (maillage complet, via demande/acceptation) :');
  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < everyone.length; i++) {
    for (let j = i + 1; j < everyone.length; j++) {
      const a = everyone[i], b = everyone[j];
      if (!sockets[a.key] || !sockets[b.key]) { fail++; continue; }
      const res = await linkContacts(a, sockets[a.key], b, sockets[b.key]);
      if (res === 'ok' || res === 'existing') ok++;
      else if (res === 'skip') skip++;
      else fail++;
      await sleep(180);
    }
  }
  console.log(`  ✓ ${ok} liées · ${skip} déjà en place · ${fail} échecs`);

  console.log('\nGroupes :');
  async function ensureGroup(owner, title, memberKeys) {
    const list = await ack(sockets[owner.key], 'conversations:list').catch(() => ({}));
    const existing = (list?.conversations ?? []).find((c) => c.kind === 'group' && c.title === title);
    if (existing) { console.log(`  = "${title}" déjà présent`); return; }
    const memberIds = memberKeys.map((k) => (k === 'kenams' ? kenams.userId : bots.find((b) => b.key === k).userId));
    const g = await ack(sockets[owner.key], 'group:create', { title, memberIds }).catch((e) => ({ error: e.message }));
    if (!g?.ok || !g?.conversationId) { console.log(`  ! "${title}" création: ${g?.error ?? 'refusé'}`); return; }
    for (const k of [...memberKeys]) {
      if (sockets[k]) await ack(sockets[k], 'conversation:join', { conversationId: g.conversationId }).catch(() => {});
    }
    console.log(`  ✓ "${title}" (${owner.displayName} + ${memberKeys.length} membres)`);
  }
  await ensureGroup(bots[0], 'K-ssenger — Test 🧪', ['karim', 'chloe', 'fatou', 'hugo', 'kenams']);
  await ensureGroup(bots[5], 'KAH Digital 🌍', ['ines', 'malik', 'sofia', 'kenams']);

  console.log('\nWizz / K-Pulse :');
  const pulses = [
    ['lea', 'kenams'], ['karim', 'kenams'], ['fatou', 'lea'], ['hugo', 'sofia'], ['malik', 'karim'], ['sofia', 'kenams'],
  ];
  for (const [from, to] of pulses) {
    if (!sockets[from]) continue;
    const toId = to === 'kenams' ? kenams.userId : bots.find((b) => b.key === to).userId;
    const r = await ack(sockets[from], 'kpulse:send', { recipientId: toId, variant: 'classic' }).catch((e) => ({ error: e.message }));
    console.log(r?.ok ? `  ✓ ${from} → ${to}` : `  ~ ${from} → ${to} (${r?.error ?? 'refusé'})`);
    await sleep(250);
  }

  console.log('\nMoments (best effort) :');
  for (const b of [bots[0], bots[4], bots[5]]) {
    const m = await b.client.from('moments').insert({
      author_id: b.userId, kind: 'text',
      caption: `${b.displayName.split(' ')[0]} teste K-ssenger 🚀`,
      visibility: 'friends',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select('id').single();
    if (m.error || !m.data?.id) { console.log(`  ~ ${b.key} moment ignoré (${m.error?.message ?? 'no id'})`); continue; }
    const approve = await b.client.from('moments').update({ moderation_status: 'approved' }).eq('id', m.data.id);
    console.log(approve.error ? `  ~ ${b.key} moment en modération (${approve.error.message})` : `  ✓ ${b.key} moment publié`);
  }

  console.log('\nPrésence :');
  for (const p of everyone) {
    if (!sockets[p.key]) continue;
    const s = p.presence === 'invisible' ? 'invisible' : p.presence;
    await ack(sockets[p.key], 'presence:update', { status: s }).catch(() => {});
  }
  console.log('  ✓ présence poussée');

  const keepalive = process.env.KEEPALIVE === '1';
  if (!keepalive) {
    for (const s of Object.values(sockets)) s.close();
  }

  console.log('\n──────────── ACCÈS TEST WEB ────────────');
  console.log('Lien   : https://k-ssenger.expo.app');
  console.log('');
  console.log(`TON COMPTE  →  ${KENAMS_EMAIL}`);
  console.log(`            →  ${KENAMS_PASSWORD}`);
  console.log('');
  console.log(`Bots (mot de passe commun : ${BOT_PASSWORD}) :`);
  for (const b of BOTS) console.log(`  ${b.displayName.padEnd(16)} ${b.email}`);
  console.log('');
  console.log('Déjà en place : 10 bots en contacts, 2 groupes avec toi, wizz reçus,');
  console.log('statuts + "écoute en ce moment", présence. Le chat E2EE reste');
  console.log('verrouillé sur le web (libsignal natif Android uniquement).');
  if (keepalive) console.log('\nKEEPALIVE actif — Ctrl+C pour arrêter les sockets bots.');
}

main().then(() => { if (process.env.KEEPALIVE !== '1') process.exit(0); }).catch((error) => {
  console.error('WEB_TEST_POPULATE_FAILED:', error.message);
  process.exit(1);
});
