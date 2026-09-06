import crypto from 'node:crypto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
if (!AUTH_URL || !DATA_API_URL) throw new Error('K-ssenger Neon URLs are required');

const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const createdUsers = [];
let passes = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name) {
  passes += 1;
  console.log(`PASS ${name}`);
}

function authClient() {
  return createClient({
    auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL },
    dataApi: { url: DATA_API_URL },
  });
}

function dataClient(accessToken) {
  return createClient({
    dataApi: {
      url: DATA_API_URL,
      getToken: async () => accessToken,
    },
  });
}

async function createActor(label) {
  globalThis.__resetKssengerSmokeCookies?.();
  const auth = authClient();
  const username = `social_${label}_${stamp}`.replace(/[^a-z0-9._]/g, '_').slice(0, 32);
  const email = `kssenger-social-${label}-${stamp}@example.com`;
  const password = `Kss!${crypto.randomBytes(18).toString('base64url')}`;
  const signup = await auth.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: `Social ${label}` } },
  });
  if (signup.error) throw new Error(`${label} signup failed: ${signup.error.message}`);
  let session = signup.data?.session ?? null;
  if (!session) {
    const signin = await auth.auth.signInWithPassword({ email, password });
    if (signin.error) throw new Error(`${label} signin failed: ${signin.error.message}`);
    session = signin.data?.session ?? null;
  }
  assert(session?.user?.id && session?.access_token, `${label} missing session`);
  const userId = session.user.id;
  createdUsers.push(userId);
  const db = dataClient(session.access_token);

  const profile = await db.from('profiles').insert({
    id: userId,
    username,
    display_name: `Social ${label}`,
    custom_status: 'social smoke',
    presence: 'offline',
  });
  if (profile.error) throw new Error(`${label} profile failed: ${profile.error.message}`);
  const privacy = await db.from('privacy_settings').insert({ user_id: userId });
  if (privacy.error) throw new Error(`${label} privacy failed: ${privacy.error.message}`);
  const age = await db.from('user_age_profile').insert({
    user_id: userId,
    birth_date: '1990-01-01',
    age_assurance_level: 'declared',
  });
  if (age.error) throw new Error(`${label} age failed: ${age.error.message}`);
  pass(`${label} isolated auth + profile + age`);
  return { label, userId, db };
}

async function main() {
  const alice = await createActor('alice');
  const bob = await createActor('bob');

  const contact = await alice.db.from('contacts').insert({
    owner_id: alice.userId,
    contact_id: bob.userId,
    favorite: true,
  });
  if (contact.error) throw new Error(`contact seed failed: ${contact.error.message}`);
  const reciprocal = await bob.db.from('contacts').insert({
    owner_id: bob.userId,
    contact_id: alice.userId,
    favorite: true,
  });
  if (reciprocal.error) throw new Error(`reciprocal contact seed failed: ${reciprocal.error.message}`);
  pass('contact-scoped social relationship');

  const share = await alice.db.from('location_shares').insert({
    owner_id: alice.userId,
    recipient_user_id: bob.userId,
    conversation_id: null,
    precision: 'approximate',
    mode: 'one_time',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select('id').single();
  if (share.error || !share.data?.id) throw new Error(`K-MAP share failed: ${share.error?.message ?? 'missing id'}`);

  const point = await alice.db.from('location_points').insert({
    share_id: share.data.id,
    latitude: 43.604652,
    longitude: 1.444209,
    accuracy_meters: 12,
    captured_at: new Date().toISOString(),
  });
  if (point.error) throw new Error(`K-MAP point failed: ${point.error.message}`);

  const safePoint = await bob.db.rpc('location_point_for_viewer', { p_share_id: share.data.id });
  if (safePoint.error) throw new Error(`K-MAP recipient RPC failed: ${safePoint.error.message}`);
  const viewed = safePoint.data?.[0];
  assert(viewed?.precision_level === 'approximate', 'K-MAP precision level mismatch');
  assert(Number(viewed?.accuracy_meters) >= 1000, 'K-MAP approximate accuracy leaked');
  assert(Math.abs(Number(viewed?.latitude) - 43.60) < 0.00001, 'K-MAP latitude not coarsened');
  assert(Math.abs(Number(viewed?.longitude) - 1.44) < 0.00001, 'K-MAP longitude not coarsened');
  pass('K-MAP approximate recipient-safe coordinates');

  const revoke = await alice.db.from('location_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', share.data.id);
  if (revoke.error) throw new Error(`K-MAP revoke failed: ${revoke.error.message}`);
  const afterRevoke = await bob.db.rpc('location_point_for_viewer', { p_share_id: share.data.id });
  assert(!afterRevoke.error && (afterRevoke.data?.length ?? 0) === 0, 'revoked K-MAP share still readable');
  pass('K-MAP revoke / ghost privacy');

  const moment = await alice.db.from('moments').insert({
    author_id: alice.userId,
    kind: 'text',
    caption: 'remote social smoke moment',
    media_url: null,
    visibility: 'friends',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).select('id,moderation_status,expires_at').single();
  if (moment.error || !moment.data?.id) throw new Error(`Moment insert failed: ${moment.error?.message ?? 'missing id'}`);
  assert(moment.data.moderation_status === 'pending', 'Moment did not default to pending moderation');
  const bobPendingMoment = await bob.db.from('moments').select('id').eq('id', moment.data.id);
  assert(!bobPendingMoment.error && (bobPendingMoment.data?.length ?? 0) === 0, 'pending Moment leaked to Bob');
  pass('Moments 24h + pending moderation isolation');

  const reactionDenied = await bob.db.from('moment_reactions').insert({
    moment_id: moment.data.id,
    user_id: bob.userId,
    reaction: '❤️',
  });
  assert(Boolean(reactionDenied.error), 'Bob reacted to a Moment he cannot read');
  pass('Moments hidden-content reaction isolation');

  const video = await alice.db.from('public_videos').insert({
    owner_id: alice.userId,
    storage_path: `smoke/${stamp}/clip.mp4`,
    thumbnail_path: null,
    caption: 'remote K-Feed smoke',
    age_rating: 18,
    violence_level: 'none',
    visibility: 'public',
  }).select('id,moderation_status,published_at').single();
  if (video.error || !video.data?.id) throw new Error(`K-Feed metadata insert failed: ${video.error?.message ?? 'missing id'}`);
  assert(video.data.moderation_status === 'pending' && video.data.published_at === null, 'K-Feed owner bypassed pending moderation');
  const bobPendingVideo = await bob.db.from('public_videos').select('id').eq('id', video.data.id);
  assert(!bobPendingVideo.error && (bobPendingVideo.data?.length ?? 0) === 0, 'pending K-Feed video leaked');
  pass('K-Feed pending moderation isolation');

  const forgedAge = await alice.db.from('user_age_profile').insert({
    user_id: bob.userId,
    birth_date: '1980-01-01',
    age_assurance_level: 'verified',
  });
  assert(Boolean(forgedAge.error), 'Alice modified Bob age assurance');
  pass('age profile self-only RLS');

  const forgedShare = await bob.db.from('location_shares').insert({
    owner_id: alice.userId,
    recipient_user_id: bob.userId,
    conversation_id: null,
    precision: 'precise',
    mode: 'one_time',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  assert(Boolean(forgedShare.error), 'Bob forged a K-MAP share as Alice');
  pass('K-MAP owner anti-forgery RLS');

  console.log(`REMOTE_SOCIAL_SMOKE_PASS=${passes}`);
  console.log(`TEST_USER_IDS=${createdUsers.join(',')}`);
}

main().catch((error) => {
  console.error(`REMOTE_SOCIAL_SMOKE_FAILED=${error.message}`);
  console.log(`TEST_USER_IDS=${createdUsers.join(',')}`);
  process.exit(1);
});
