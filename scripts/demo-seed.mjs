// K-ssenger demo seed — idempotent.
//
// Creates 3 fixed-credential demo accounts on the live dedicated backend and
// wires a ready-to-show state: profiles (with "now playing"), mutual contacts,
// one group with all three, a K-Pulse, a text Moment, presence online.
//
// Uses ONLY the three public K-ssenger endpoints (same as the mobile app):
//   KSSENGER_AUTH_URL, KSSENGER_DATA_API_URL, KSSENGER_SOCKET_URL
// No database credential. Run through demo-seed-runner.mjs for cookie handling.
//
//   KSSENGER_AUTH_URL=… KSSENGER_DATA_API_URL=… KSSENGER_SOCKET_URL=… \
//     node scripts/demo-seed-runner.mjs

import crypto from 'node:crypto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { io } from 'socket.io-client';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
const SOCKET_URL = process.env.KSSENGER_SOCKET_URL;
for (const [name, value] of Object.entries({ AUTH_URL, DATA_API_URL, SOCKET_URL })) {
  if (!value) throw new Error(`${name} is required`);
}

// Fixed demo identities. Password is shared for all three to keep the live demo
// frictionless. Change DEMO_PASSWORD via env to rotate.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'KahDemo2026!';
const PEOPLE = [
  { key: 'alice', email: 'demo.alice@kah-digital.ch', username: 'alice_kah', displayName: 'Alice Nguyen', status: 'Dispo pour papoter 💬', music: { title: 'Around the World', artist: 'Daft Punk' } },
  { key: 'bob', email: 'demo.bob@kah-digital.ch', username: 'bob_kah', displayName: 'Bob Traoré', status: 'En télétravail', music: { title: 'Bamako', artist: 'Amadou & Mariam' } },
  { key: 'cara', email: 'demo.cara@kah-digital.ch', username: 'cara_kah', displayName: 'Cara Silva', status: 'Ne pas déranger 🔴', music: { title: 'Tá OK', artist: 'Dennis' } },
];

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
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: person.accessToken }, reconnection: false, timeout: 15_000 });
    const timer = setTimeout(() => { socket.close(); reject(new Error(`${person.key} socket timeout`)); }, 25_000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', (e) => { clearTimeout(timer); reject(new Error(`${person.key} socket connect_error: ${e.message}`)); });
  });
}

async function ensureAccount(spec) {
  globalThis.__resetKssengerSmokeCookies?.();
  const auth = makeAuthClient();
  let session = null;

  const signup = await auth.auth.signUp({
    email: spec.email,
    password: DEMO_PASSWORD,
    options: { data: { username: spec.username, display_name: spec.displayName } },
  });
  if (signup.error) {
    const signin = await auth.auth.signInWithPassword({ email: spec.email, password: DEMO_PASSWORD });
    if (signin.error) throw new Error(`${spec.key} signup+signin failed: ${signup.error.message} / ${signin.error.message}`);
    session = signin.data?.session ?? null;
  } else {
    session = signup.data?.session ?? null;
    if (!session) {
      const signin = await auth.auth.signInWithPassword({ email: spec.email, password: DEMO_PASSWORD });
      if (signin.error) throw new Error(`${spec.key} post-signup signin failed: ${signin.error.message}`);
      session = signin.data?.session ?? null;
    }
  }
  if (!session?.user?.id || !session?.access_token) throw new Error(`${spec.key} session missing`);

  const userId = session.user.id;
  const client = makeDataClient(session.access_token);

  // Profile: use the blessed RPC (same path as ProfileBootstrapScreen), then
  // enrich with status + now-playing. Fail loud on error.
  const rpc = await client.rpc('ensure_my_kssenger_profile', {
    p_username: spec.username,
    p_display_name: spec.displayName,
  });
  if (rpc.error && !/USERNAME_TAKEN/i.test(rpc.error.message)) {
    throw new Error(`${spec.key} ensure_profile: ${rpc.error.message}`);
  }
  const enrich = await client.from('profiles').update({
    display_name: spec.displayName,
    custom_status: spec.status,
    now_playing_title: spec.music.title,
    now_playing_artist: spec.music.artist,
    updated_at: new Date().toISOString(),
  }).eq('id', userId);
  if (enrich.error) throw new Error(`${spec.key} profile enrich: ${enrich.error.message}`);
  const check = await client.from('profiles').select('id').eq('id', userId);
  if (check.error || (check.data?.length ?? 0) === 0) throw new Error(`${spec.key} profile missing after seed`);

  try { await client.from('privacy_settings').insert({ user_id: userId }); } catch { /* already present */ }
  try { await client.from('user_age_profile').insert({ user_id: userId, birth_date: '1994-05-12', age_assurance_level: 'declared' }); } catch { /* already present */ }

  // One device + Signal prekeys (needed for E2EE discovery on the phone).
  let deviceId = null;
  const existingDevice = await client.from('devices').select('id').eq('user_id', userId).limit(1);
  if (!existingDevice.error && existingDevice.data?.[0]?.id) {
    deviceId = existingDevice.data[0].id;
  } else {
    const dev = await client.from('devices').insert({ user_id: userId, name: `${spec.displayName} — démo` }).select('id').single();
    if (dev.error || !dev.data?.id) throw new Error(`${spec.key} device: ${dev.error?.message ?? 'no id'}`);
    deviceId = dev.data.id;
    const bundle = await client.from('device_key_bundles').insert({
      device_id: deviceId, user_id: userId, bundle_version: 1,
      registration_id: 1000 + crypto.randomInt(1, 15000),
      identity_key: signalMaterial(spec.key, 'identity'),
      signed_prekey_id: 11, signed_prekey_public: signalMaterial(spec.key, 'signed'), signed_prekey_signature: signalMaterial(spec.key, 'signed-sig'),
      pq_last_resort_prekey_id: 211, pq_last_resort_prekey_public: signalMaterial(spec.key, 'pq-lr'), pq_last_resort_prekey_signature: signalMaterial(spec.key, 'pq-lr-sig'),
    });
    if (bundle.error) throw new Error(`${spec.key} bundle: ${bundle.error.message}`);
    await client.from('device_one_time_prekeys').insert([31, 32, 33].map((id) => ({ device_id: deviceId, key_id: id, public_key: signalMaterial(spec.key, `ec-${id}`) })));
    await client.from('device_pq_one_time_prekeys').insert([41, 42, 43].map((id) => ({ device_id: deviceId, key_id: id, public_key: signalMaterial(spec.key, `pq-${id}`), signature: signalMaterial(spec.key, `pq-sig-${id}`) })));
  }

  console.log(`  ✓ ${spec.key.padEnd(6)} ${spec.email}  id=${userId}`);
  return { ...spec, auth, client, userId, accessToken: session.access_token, deviceId };
}

async function areContacts(a, b) {
  const r = await a.client.from('contacts').select('contact_id').eq('owner_id', a.userId).eq('contact_id', b.userId).limit(1);
  return !r.error && (r.data?.length ?? 0) > 0;
}

async function link(a, aSock, b, bSock) {
  if (await areContacts(a, b)) { console.log(`  = ${a.key} ↔ ${b.key} déjà contacts`); return; }
  const req = await ack(aSock, 'contact:request', { userId: b.userId });
  if (!req?.ok || !req?.requestId) {
    if (/exist|already/i.test(req?.error ?? '')) { console.log(`  = ${a.key} ↔ ${b.key} (demande existante)`); return; }
    throw new Error(`${a.key}->${b.key} contact request: ${req?.error ?? 'rejected'}`);
  }
  const acc = await ack(bSock, 'contact:accept', { requestId: req.requestId });
  if (!acc?.ok) throw new Error(`${b.key} accept: ${acc?.error ?? 'rejected'}`);
  console.log(`  ✓ ${a.key} ↔ ${b.key} contacts`);
}

async function main() {
  console.log('K-ssenger demo seed');
  console.log('Comptes :');
  const people = {};
  for (const spec of PEOPLE) people[spec.key] = await ensureAccount(spec);

  const sockets = {};
  for (const key of Object.keys(people)) sockets[key] = await connectSocket(people[key]);
  console.log('  ✓ 3 sockets temps réel connectées');

  console.log('Contacts :');
  await link(people.alice, sockets.alice, people.bob, sockets.bob);
  await link(people.alice, sockets.alice, people.cara, sockets.cara);
  await link(people.bob, sockets.bob, people.cara, sockets.cara);

  console.log('Groupe :');
  const groups = await ack(sockets.alice, 'conversations:list');
  const existing = (groups?.conversations ?? []).find((c) => c.kind === 'group' && c.title === 'KAH Digital — Démo');
  if (existing) {
    console.log('  = groupe "KAH Digital — Démo" déjà présent');
  } else {
    const g = await ack(sockets.alice, 'group:create', { title: 'KAH Digital — Démo', memberIds: [people.bob.userId, people.cara.userId] });
    if (!g?.ok || !g?.conversationId) throw new Error(`group create: ${g?.error ?? 'rejected'}`);
    await ack(sockets.bob, 'conversation:join', { conversationId: g.conversationId });
    await ack(sockets.cara, 'conversation:join', { conversationId: g.conversationId });
    console.log('  ✓ groupe "KAH Digital — Démo" (Alice owner, Bob + Cara)');
  }

  console.log('K-Pulse :');
  const pulse = await ack(sockets.bob, 'kpulse:send', { recipientId: people.alice.userId, variant: 'classic' });
  console.log(pulse?.ok ? '  ✓ Bob → Alice' : `  ! ${pulse?.error ?? 'refusé'}`);

  console.log('Moment :');
  const mom = await people.alice.client.from('moments').insert({
    author_id: people.alice.userId, kind: 'text',
    caption: 'On teste K-ssenger en vrai 🚀 buddy list, groupes, wizz — tout y est.',
    visibility: 'friends',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  console.log(mom.error ? `  ! Moment ignoré (${mom.error.message})` : '  ✓ Moment texte d\'Alice (24 h)');

  console.log('Présence :');
  for (const key of ['alice', 'bob']) {
    await ack(sockets[key], 'presence:update', { status: 'online' });
  }
  await ack(sockets.cara, 'presence:update', { status: 'busy' });
  console.log('  ✓ Alice/Bob en ligne, Cara occupé');

  for (const s of Object.values(sockets)) s.close();

  console.log('\n──────────── PRÊT POUR LA DÉMO ────────────');
  console.log(`Mot de passe (les 3) : ${DEMO_PASSWORD}`);
  for (const spec of PEOPLE) console.log(`  ${spec.displayName.padEnd(14)} ${spec.email}`);
  console.log('Connexion : ouvre l\'app → "Se connecter" → email + mot de passe.');
  console.log('Contacts, groupe, wizz et Moment sont déjà en place. Le chat E2EE se');
  console.log('démontre en direct entre deux appareils connectés à deux comptes.');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('DEMO_SEED_FAILED:', error.message);
  process.exit(1);
});
