import crypto from 'node:crypto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { io } from 'socket.io-client';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
const SOCKET_URL = process.env.KSSENGER_SOCKET_URL;

for (const [name, value] of Object.entries({ AUTH_URL, DATA_API_URL, SOCKET_URL })) {
  if (!value) throw new Error(`${name} is required`);
}

const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const createdUsers = [];
let passes = 0;

function ok(name, detail = '') {
  passes += 1;
  console.log(`PASS ${name}${detail ? ` :: ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeClient() {
  return createClient({
    auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL },
    dataApi: { url: DATA_API_URL },
  });
}

async function signUp(label) {
  const client = makeClient();
  const username = `smoke_${label}_${stamp}`.replace(/[^a-z0-9._]/g, '_').slice(0, 32);
  const email = `kssenger-v1-${label}-${stamp}@example.com`;
  const password = `Kss!${crypto.randomBytes(18).toString('base64url')}`;
  const displayName = `Smoke ${label}`;

  const signup = await client.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: displayName } },
  });
  if (signup.error) throw new Error(`${label} signup failed: ${signup.error.message}`);

  let session = signup.data?.session ?? null;
  if (!session) {
    const signin = await client.auth.signInWithPassword({ email, password });
    if (signin.error) throw new Error(`${label} signin failed: ${signin.error.message}`);
    session = signin.data?.session ?? null;
  }
  assert(session?.user?.id && session?.access_token, `${label} session missing`);
  const userId = session.user.id;
  const accessToken = session.access_token;
  createdUsers.push(userId);

  const profile = await client.from('profiles').insert({
    id: userId,
    username,
    display_name: displayName,
    custom_status: 'V1 remote smoke',
    presence: 'offline',
  });
  if (profile.error) throw new Error(`${label} profile failed: ${profile.error.message}`);

  const privacy = await client.from('privacy_settings').insert({ user_id: userId });
  if (privacy.error) throw new Error(`${label} privacy failed: ${privacy.error.message}`);

  const age = await client.from('user_age_profile').insert({
    user_id: userId,
    birth_date: '1990-01-01',
    age_assurance_level: 'declared',
  });
  if (age.error) throw new Error(`${label} age profile failed: ${age.error.message}`);

  const deviceResult = await client
    .from('devices')
    .insert({ user_id: userId, name: `Smoke ${label} device` })
    .select('id')
    .single();
  if (deviceResult.error || !deviceResult.data?.id) {
    throw new Error(`${label} device failed: ${deviceResult.error?.message ?? 'missing id'}`);
  }

  ok(`${label} signup/login/profile/device`);
  return { label, client, userId, accessToken, username, deviceId: deviceResult.data.id };
}

function connectSocket(actor) {
  return new Promise((resolve, reject) => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: { accessToken: actor.accessToken },
      reconnection: false,
      timeout: 15_000,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${actor.label} socket timeout`));
    }, 20_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(new Error(`${actor.label} socket connect_error: ${error.message}`));
    });
  });
}

function ack(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), 15_000);
    socket.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function waitEvent(socket, event, predicate = () => true, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} event timeout`));
    }, timeout);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

async function uploadSmokeMedia(socket, purpose, mimeType, conversationId = undefined) {
  const body = Buffer.concat([
    Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex'),
    crypto.randomBytes(256),
  ]);
  const prepared = await ack(socket, 'media:prepare-upload', {
    purpose,
    mimeType,
    byteSize: body.length,
    ...(conversationId ? { conversationId } : {}),
  });
  assert(prepared?.ok && prepared?.mediaId && prepared?.upload?.url, `${purpose} media prepare failed`);
  const headers = { ...(prepared.upload.headers ?? {}) };
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) headers['content-type'] = mimeType;
  const uploaded = await fetch(prepared.upload.url, {
    method: prepared.upload.method ?? 'PUT',
    headers,
    body,
  });
  if (!uploaded.ok) throw new Error(`${purpose} media upload failed: ${uploaded.status}`);
  const completed = await ack(socket, 'media:complete-upload', { mediaId: prepared.mediaId });
  assert(completed?.ok && completed?.status === 'ready', `${purpose} media complete failed`);
  return prepared.mediaId;
}

async function makeContacts(sender, senderSocket, recipient, recipientSocket) {
  const incoming = waitEvent(recipientSocket, 'contact:request', (payload) => payload?.senderId === sender.userId);
  const request = await ack(senderSocket, 'contact:request', { userId: recipient.userId });
  assert(request?.ok && request?.requestId, `${sender.label}->${recipient.label} contact request rejected`);
  const event = await incoming;
  assert(event.requestId === request.requestId, 'contact request event id mismatch');
  const acceptedSender = waitEvent(senderSocket, 'contact:accepted', (payload) => payload?.userId === recipient.userId);
  const acceptedRecipient = waitEvent(recipientSocket, 'contact:accepted', (payload) => payload?.userId === sender.userId);
  const accept = await ack(recipientSocket, 'contact:accept', { requestId: request.requestId });
  assert(accept?.ok, `${recipient.label} contact accept rejected`);
  await Promise.all([acceptedSender, acceptedRecipient]);
  ok(`${sender.label}<->${recipient.label} contact lifecycle`);
}

async function main() {
  const actors = [];
  const sockets = [];
  try {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    const charlie = await signUp('charlie');
    actors.push(alice, bob, charlie);

    const aliceSocket = await connectSocket(alice);
    const bobSocket = await connectSocket(bob);
    const charlieSocket = await connectSocket(charlie);
    sockets.push(aliceSocket, bobSocket, charlieSocket);
    ok('three authenticated realtime sockets');

    await makeContacts(alice, aliceSocket, bob, bobSocket);
    await makeContacts(alice, aliceSocket, charlie, charlieSocket);

    const presenceEvent = waitEvent(bobSocket, 'presence:changed', (payload) => payload?.userId === alice.userId && payload?.status === 'online');
    const presence = await ack(aliceSocket, 'presence:update', { status: 'online' });
    assert(presence?.ok, 'Alice presence update rejected');
    await presenceEvent;
    ok('contact presence propagation');

    const pulseEvent = waitEvent(bobSocket, 'kpulse:receive', (payload) => payload?.senderId === alice.userId);
    const pulse = await ack(aliceSocket, 'kpulse:send', { recipientId: bob.userId, variant: 'classic' });
    assert(pulse?.ok, 'K-Pulse rejected');
    await pulseEvent;
    ok('K-Pulse realtime delivery');

    const direct = await ack(aliceSocket, 'conversation:direct', { userId: bob.userId });
    assert(direct?.ok && direct?.conversationId, 'direct conversation creation failed');
    const directId = direct.conversationId;
    assert((await ack(aliceSocket, 'conversation:join', { conversationId: directId }))?.ok, 'Alice direct join failed');
    assert((await ack(bobSocket, 'conversation:join', { conversationId: directId }))?.ok, 'Bob direct join failed');
    const outsiderJoin = await ack(charlieSocket, 'conversation:join', { conversationId: directId });
    assert(outsiderJoin?.ok === false, 'outsider joined private direct conversation');
    ok('direct conversation membership isolation');

    const directCiphertext = crypto.randomBytes(48).toString('base64url');
    const directMessageEvent = waitEvent(bobSocket, 'message:new', (payload) => payload?.conversationId === directId);
    const directSend = await ack(aliceSocket, 'message:send', {
      clientMessageId: crypto.randomUUID(),
      conversationId: directId,
      senderDeviceId: alice.deviceId,
      algorithm: 'smoke-opaque-envelope-v1',
      ciphertext: directCiphertext,
      createdAt: new Date().toISOString(),
    });
    assert(directSend?.ok && directSend?.id, 'direct encrypted envelope send failed');
    const directEvent = await directMessageEvent;
    assert(directEvent.ciphertext === directCiphertext, 'direct ciphertext changed in transit');
    const receiptEvent = waitEvent(aliceSocket, 'message:receipt', (payload) => payload?.messageId === directSend.id && payload?.state === 'read');
    const receipt = await ack(bobSocket, 'message:receipt', { conversationId: directId, messageId: directSend.id, state: 'read' });
    assert(receipt?.ok, 'direct read receipt failed');
    await receiptEvent;
    const history = await ack(bobSocket, 'conversation:history', { conversationId: directId, limit: 20 });
    assert(history?.ok && history.messages?.some((message) => message.id === directSend.id && message.ciphertext === directCiphertext), 'direct history missing ciphertext');
    ok('direct ciphertext exchange + read receipt + history');

    const group = await ack(aliceSocket, 'group:create', {
      title: `V1 Smoke ${stamp}`.slice(0, 80),
      memberIds: [bob.userId, charlie.userId],
    });
    assert(group?.ok && group?.conversationId, 'group create failed');
    const groupId = group.conversationId;
    assert((await ack(bobSocket, 'conversation:join', { conversationId: groupId }))?.ok, 'Bob group join failed');
    assert((await ack(charlieSocket, 'conversation:join', { conversationId: groupId }))?.ok, 'Charlie group join failed');
    ok('group create + member joins');

    const promote = await ack(aliceSocket, 'group:role-set', { conversationId: groupId, userId: bob.userId, role: 'admin' });
    assert(promote?.ok, 'Bob admin promotion failed');
    const mutedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const mute = await ack(bobSocket, 'group:mute', { conversationId: groupId, userId: charlie.userId, mutedUntil });
    assert(mute?.ok, 'Charlie mute failed');
    const mutedSend = await ack(charlieSocket, 'message:send', {
      clientMessageId: crypto.randomUUID(),
      conversationId: groupId,
      senderDeviceId: charlie.deviceId,
      algorithm: 'smoke-opaque-envelope-v1',
      ciphertext: crypto.randomBytes(32).toString('base64url'),
      createdAt: new Date().toISOString(),
    });
    assert(mutedSend?.ok === false, 'muted group member could still send');
    const unmute = await ack(bobSocket, 'group:mute', { conversationId: groupId, userId: charlie.userId, mutedUntil: null });
    assert(unmute?.ok, 'Charlie unmute failed');
    const groupSend = await ack(charlieSocket, 'message:send', {
      clientMessageId: crypto.randomUUID(),
      conversationId: groupId,
      senderDeviceId: charlie.deviceId,
      algorithm: 'smoke-opaque-envelope-v1',
      ciphertext: crypto.randomBytes(32).toString('base64url'),
      createdAt: new Date().toISOString(),
    });
    assert(groupSend?.ok, 'unmuted group member send failed');
    ok('group role + mute enforcement + unmute exchange');

    const ban = await ack(aliceSocket, 'group:ban', { conversationId: groupId, userId: charlie.userId, reason: 'remote-v1-smoke' });
    assert(ban?.ok, 'Charlie ban failed');
    const bannedJoin = await ack(charlieSocket, 'conversation:join', { conversationId: groupId });
    assert(bannedJoin?.ok === false, 'banned user rejoined group');
    const banList = await ack(aliceSocket, 'group:bans-list', { conversationId: groupId });
    assert(banList?.ok && Array.isArray(banList.bans) && banList.bans.some((entry) => entry.userId === charlie.userId), 'moderator ban list missing Charlie');
    const unban = await ack(aliceSocket, 'group:unban', { conversationId: groupId, userId: charlie.userId });
    assert(unban?.ok, 'Charlie unban failed');
    const readd = await ack(aliceSocket, 'group:member-add', { conversationId: groupId, userId: charlie.userId });
    assert(readd?.ok, 'Charlie re-invite after unban failed');
    assert((await ack(charlieSocket, 'conversation:join', { conversationId: groupId }))?.ok, 'Charlie rejoin after unban failed');
    ok('group ban/list/unban/reinvite lifecycle');

    const transfer = await ack(aliceSocket, 'group:role-set', { conversationId: groupId, userId: bob.userId, role: 'owner' });
    assert(transfer?.ok, 'group ownership transfer failed');
    const leave = await ack(aliceSocket, 'group:leave', { conversationId: groupId });
    assert(leave?.ok, 'previous owner could not leave after transfer');
    ok('single-owner transfer + previous owner leave');

    const mapShare = await alice.client.from('location_shares').insert({
      owner_id: alice.userId,
      recipient_user_id: bob.userId,
      conversation_id: null,
      precision: 'approximate',
      mode: 'one_time',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }).select('id').single();
    if (mapShare.error || !mapShare.data?.id) throw new Error(`K-MAP share failed: ${mapShare.error?.message ?? 'missing id'}`);
    const point = await alice.client.from('location_points').insert({
      share_id: mapShare.data.id,
      latitude: 43.604652,
      longitude: 1.444209,
      accuracy_meters: 12,
      captured_at: new Date().toISOString(),
    });
    if (point.error) throw new Error(`K-MAP point failed: ${point.error.message}`);
    const safePoint = await bob.client.rpc('location_point_for_viewer', { p_share_id: mapShare.data.id });
    if (safePoint.error) throw new Error(`K-MAP recipient read failed: ${safePoint.error.message}`);
    const p = safePoint.data?.[0];
    assert(p && p.precision_level === 'approximate' && p.accuracy_meters >= 1000, 'K-MAP approximate share leaked precise accuracy');
    assert(Math.abs(Number(p.latitude) - 43.60) < 0.00001 && Math.abs(Number(p.longitude) - 1.44) < 0.00001, 'K-MAP coordinates were not coarsened');
    const revoke = await alice.client.from('location_shares').update({ revoked_at: new Date().toISOString() }).eq('id', mapShare.data.id);
    if (revoke.error) throw new Error(`K-MAP revoke failed: ${revoke.error.message}`);
    const afterRevoke = await bob.client.rpc('location_point_for_viewer', { p_share_id: mapShare.data.id });
    assert(!afterRevoke.error && (afterRevoke.data?.length ?? 0) === 0, 'revoked K-MAP share remained readable');
    ok('K-MAP approximate privacy + revoke');

    const moment = await alice.client.from('moments').insert({
      author_id: alice.userId,
      kind: 'text',
      caption: 'remote smoke moment',
      media_url: null,
      visibility: 'friends',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select('id').single();
    if (moment.error || !moment.data?.id) throw new Error(`Moment create failed: ${moment.error?.message ?? 'missing id'}`);
    const bobPendingMoment = await bob.client.from('moments').select('id').eq('id', moment.data.id);
    assert(!bobPendingMoment.error && (bobPendingMoment.data?.length ?? 0) === 0, 'pending Moment leaked to contact');
    ok('Moments RLS pending isolation');

    const videoMediaId = await uploadSmokeMedia(aliceSocket, 'kfeed', 'video/mp4');
    const video = await alice.client.from('public_videos').insert({
      owner_id: alice.userId,
      media_object_id: videoMediaId,
      storage_path: `media:${videoMediaId}`,
      thumbnail_path: null,
      caption: 'remote smoke K-Feed',
      age_rating: 18,
      violence_level: 'none',
      visibility: 'public',
    }).select('id,media_object_id,storage_path').single();
    if (video.error || !video.data?.id) throw new Error(`K-Feed metadata create failed: ${video.error?.message ?? 'missing id'}`);
    assert(video.data.media_object_id === videoMediaId && video.data.storage_path === `media:${videoMediaId}`, 'K-Feed media binding mismatch');
    const bobPendingVideo = await bob.client.from('public_videos').select('id').eq('id', video.data.id);
    assert(!bobPendingVideo.error && (bobPendingVideo.data?.length ?? 0) === 0, 'pending K-Feed video leaked before moderation');
    ok('K-Feed age/moderation RLS pending isolation');

    bobSocket.close();
    const bobReconnected = await connectSocket(bob);
    sockets.push(bobReconnected);
    const listAfterReconnect = await ack(bobReconnected, 'conversations:list', {});
    assert(listAfterReconnect?.ok && Array.isArray(listAfterReconnect.conversations) && listAfterReconnect.conversations.length >= 2, 'reconnect did not restore conversation access');
    ok('authenticated reconnect + conversation recovery');

    console.log(`REMOTE_V1_SMOKE_PASS=${passes}`);
    console.log(`TEST_USER_IDS=${createdUsers.join(',')}`);
  } finally {
    for (const socket of sockets) {
      try { socket.close(); } catch {}
    }
    for (const actor of actors) {
      try { await actor.client.auth.signOut(); } catch {}
    }
  }
}

main().catch((error) => {
  console.error(`REMOTE_V1_SMOKE_FAILED=${error.message}`);
  console.log(`TEST_USER_IDS=${createdUsers.join(',')}`);
  process.exit(1);
});
