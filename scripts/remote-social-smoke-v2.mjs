import crypto from 'node:crypto';
import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';
import { io } from 'socket.io-client';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
const SOCKET_URL = process.env.KSSENGER_SOCKET_URL;
if (!AUTH_URL || !DATA_API_URL || !SOCKET_URL) throw new Error('remote URLs missing');
const stamp = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const created = [];
let passes = 0;
const assert = (c, m) => { if (!c) throw new Error(m); };
const pass = (m) => { passes++; console.log(`PASS ${m}`); };

async function actor(label) {
  globalThis.__resetKssengerSmokeCookies?.();
  const auth = createClient({ auth: { adapter: SupabaseAuthAdapter(), url: AUTH_URL }, dataApi: { url: DATA_API_URL } });
  const email = `kssenger-social-${label}-${stamp}@example.com`;
  const password = `Kss!${crypto.randomBytes(18).toString('base64url')}`;
  const username = `social_${label}_${stamp}`.replace(/[^a-z0-9_]/g, '_').slice(0, 32);
  const result = await auth.auth.signUp({ email, password, options: { data: { username, display_name: `Social ${label}` } } });
  if (result.error) throw new Error(`${label} signup: ${result.error.message}`);
  let session = result.data?.session;
  if (!session) {
    const signin = await auth.auth.signInWithPassword({ email, password });
    if (signin.error) throw new Error(`${label} signin: ${signin.error.message}`);
    session = signin.data?.session;
  }
  assert(session?.user?.id && session?.access_token, `${label} session missing`);
  const userId = session.user.id;
  const token = session.access_token;
  created.push(userId);
  const db = createClient({ dataApi: { url: DATA_API_URL, getToken: async () => token } });
  for (const [table, row] of [
    ['profiles', { id: userId, username, display_name: `Social ${label}`, presence: 'offline' }],
    ['privacy_settings', { user_id: userId }],
    ['user_age_profile', { user_id: userId, birth_date: '1990-01-01', age_assurance_level: 'declared' }],
  ]) {
    const r = await db.from(table).insert(row);
    if (r.error) throw new Error(`${label} ${table}: ${r.error.message}`);
  }
  pass(`${label} auth/profile/age`);
  return { label, userId, token, db };
}

function socketFor(a) {
  return new Promise((resolve, reject) => {
    const s = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { accessToken: a.token }, reconnection: false, timeout: 15000 });
    const t = setTimeout(() => { s.close(); reject(new Error(`${a.label} socket timeout`)); }, 20000);
    s.once('connect', () => { clearTimeout(t); resolve(s); });
    s.once('connect_error', e => { clearTimeout(t); reject(new Error(`${a.label} socket: ${e.message}`)); });
  });
}
const ack = (s, event, payload = {}) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`${event} timeout`)), 15000);
  s.emit(event, payload, r => { clearTimeout(t); resolve(r); });
});

async function main() {
  const a = await actor('alice');
  const b = await actor('bob');
  const sa = await socketFor(a);
  const sb = await socketFor(b);
  try {
    const req = await ack(sa, 'contact:request', { userId: b.userId });
    assert(req?.ok && req?.requestId, 'contact request failed');
    const accepted = await ack(sb, 'contact:accept', { requestId: req.requestId });
    assert(accepted?.ok, 'contact accept failed');
    pass('protected contact lifecycle');

    const share = await a.db.from('location_shares').insert({ owner_id: a.userId, recipient_user_id: b.userId, precision: 'approximate', mode: 'one_time', expires_at: new Date(Date.now() + 1800000).toISOString() }).select('id').single();
    if (share.error) throw new Error(`K-MAP share: ${share.error.message}`);
    const pt = await a.db.from('location_points').insert({ share_id: share.data.id, latitude: 43.604652, longitude: 1.444209, accuracy_meters: 12, captured_at: new Date().toISOString() });
    if (pt.error) throw new Error(`K-MAP point: ${pt.error.message}`);
    const safe = await b.db.rpc('location_point_for_viewer', { p_share_id: share.data.id });
    if (safe.error) throw new Error(`K-MAP read: ${safe.error.message}`);
    const p = safe.data?.[0];
    assert(p?.precision_level === 'approximate' && Number(p.accuracy_meters) >= 1000, 'K-MAP precision leak');
    assert(Math.abs(Number(p.latitude) - 43.60) < 0.00001 && Math.abs(Number(p.longitude) - 1.44) < 0.00001, 'K-MAP coordinate leak');
    pass('K-MAP approximate coarsening');

    const rev = await a.db.from('location_shares').update({ revoked_at: new Date().toISOString() }).eq('id', share.data.id);
    if (rev.error) throw new Error(`K-MAP revoke: ${rev.error.message}`);
    const gone = await b.db.rpc('location_point_for_viewer', { p_share_id: share.data.id });
    assert(!gone.error && (gone.data?.length ?? 0) === 0, 'revoked K-MAP readable');
    pass('K-MAP revoke');

    const moment = await a.db.from('moments').insert({ author_id: a.userId, kind: 'text', caption: 'smoke', visibility: 'friends', expires_at: new Date(Date.now() + 86400000).toISOString() }).select('id,moderation_status').single();
    if (moment.error) throw new Error(`Moment: ${moment.error.message}`);
    assert(moment.data.moderation_status === 'pending', 'Moment moderation bypass');
    const hidden = await b.db.from('moments').select('id').eq('id', moment.data.id);
    assert(!hidden.error && hidden.data.length === 0, 'pending Moment leaked');
    pass('Moments pending isolation');

    const reaction = await b.db.from('moment_reactions').insert({ moment_id: moment.data.id, user_id: b.userId, reaction: 'heart' });
    assert(Boolean(reaction.error), 'hidden Moment accepted reaction');
    pass('Moments reaction authorization');

    const video = await a.db.from('public_videos').insert({ owner_id: a.userId, storage_path: `smoke/${stamp}.mp4`, caption: 'smoke', age_rating: 18, violence_level: 'none', visibility: 'public' }).select('id,moderation_status,published_at').single();
    if (video.error) throw new Error(`K-Feed: ${video.error.message}`);
    assert(video.data.moderation_status === 'pending' && video.data.published_at === null, 'K-Feed moderation bypass');
    const invisible = await b.db.from('public_videos').select('id').eq('id', video.data.id);
    assert(!invisible.error && invisible.data.length === 0, 'pending K-Feed leaked');
    pass('K-Feed pending isolation');

    const forgedAge = await a.db.from('user_age_profile').insert({ user_id: b.userId, birth_date: '1980-01-01', age_assurance_level: 'verified' });
    assert(Boolean(forgedAge.error), 'age RLS forgery');
    const forgedShare = await b.db.from('location_shares').insert({ owner_id: a.userId, recipient_user_id: b.userId, precision: 'precise', mode: 'one_time', expires_at: new Date(Date.now() + 1800000).toISOString() });
    assert(Boolean(forgedShare.error), 'K-MAP owner forgery');
    pass('social anti-forgery RLS');

    console.log(`REMOTE_SOCIAL_SMOKE_PASS=${passes}`);
    console.log(`TEST_USER_IDS=${created.join(',')}`);
  } finally { sa.close(); sb.close(); }
}

main().catch(e => { console.error(`REMOTE_SOCIAL_SMOKE_FAILED=${e.message}`); console.log(`TEST_USER_IDS=${created.join(',')}`); process.exit(1); });
