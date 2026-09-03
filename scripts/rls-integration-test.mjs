// Real RLS integration test against the local Supabase Postgres started by
// `supabase start`. Not a vitest suite (needs a live DB) — a standalone
// script, run manually / in CI after `supabase start`.
//
// Technique: connect as postgres, create 3 real auth.users (Alice/Bob/
// Charlie), then for each scenario `set local role authenticated;` +
// `set local request.jwt.claims` to simulate that user's auth.uid() and
// run the exact query a client would run through PostgREST/RLS.
import pg from 'pg';

const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55322/postgres';
const client = new pg.Client({ connectionString: DB_URL });

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  ${detail}`); }
}

async function asUser(userId, fn) {
  await client.query('begin');
  await client.query(`set local role authenticated`);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  try {
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function makeUser(id, username) {
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
       email_change, email_change_token_current, phone_change, phone_change_token,
       reauthentication_token, raw_app_meta_data, raw_user_meta_data)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       $2, crypt('password123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '',
       '{"provider":"email"}', '{}')
     on conflict (id) do nothing`,
    [id, `${username}@test.local`]
  );
  await client.query(
    `insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid, $1::text, jsonb_build_object('sub', $1::text, 'email', $2::text), 'email', now(), now(), now())
     on conflict do nothing`,
    [id, `${username}@test.local`]
  );
  await client.query(
    `insert into public.profiles (id, username, display_name)
     values ($1, $2, $2) on conflict (id) do nothing`,
    [id, username]
  );
}

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const CHARLIE = '33333333-3333-3333-3333-333333333333';

async function main() {
  await client.connect();
  await makeUser(ALICE, 'alice_rls_test');
  await makeUser(BOB, 'bob_rls_test');
  await makeUser(CHARLIE, 'charlie_rls_test');

  // ---- Profiles / presence privacy ----
  // Charlie is a stranger to Bob (no contact row). Direct SELECT of Bob's
  // profile must return 0 rows for Charlie (fixed in 0012).
  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select id from public.profiles where id = $1', [BOB]);
    check('stranger cannot SELECT another user profile row', rows.length === 0, `got ${rows.length} rows`);
  });

  // Make Alice/Bob contacts, then Alice should be able to read Bob's row.
  await client.query(
    `insert into public.contacts (owner_id, contact_id) values ($1,$2),($2,$1) on conflict do nothing`,
    [ALICE, BOB]
  );
  await asUser(ALICE, async () => {
    const { rows } = await client.query('select id from public.profiles where id = $1', [BOB]);
    check('contact CAN SELECT profile row', rows.length === 1);
  });

  // presence column must not be directly selectable by the authenticated role.
  await asUser(ALICE, async () => {
    try {
      await client.query('select presence from public.profiles where id = $1', [BOB]);
      check('direct SELECT of presence column is rejected', false, 'query unexpectedly succeeded');
    } catch (e) {
      check('direct SELECT of presence column is rejected', /permission denied/i.test(e.message), e.message);
    }
  });

  // invisible must resolve to offline via presence_for(), even for a contact.
  await client.query(`update public.profiles set presence = 'invisible' where id = $1`, [BOB]);
  await asUser(ALICE, async () => {
    const { rows } = await client.query('select public.presence_for($1) as presence', [BOB]);
    check('presence_for() masks invisible -> offline for a contact', rows[0]?.presence === 'offline', JSON.stringify(rows));
  });

  // ---- accept_contact_request must be service_role only ----
  const { rows: reqRows } = await client.query(
    `insert into public.contact_requests (sender_id, recipient_id) values ($1,$2) returning id`,
    [CHARLIE, BOB]
  );
  const requestId = reqRows[0].id;
  await asUser(CHARLIE, async () => {
    try {
      await client.query('select public.accept_contact_request($1, $2)', [CHARLIE, requestId]);
      check('accept_contact_request is blocked for the authenticated role', false, 'call unexpectedly succeeded');
    } catch (e) {
      check('accept_contact_request is blocked for the authenticated role', /permission denied/i.test(e.message), e.message);
    }
  });

  // ---- K-Feed age gate ----
  const { rows: vidRows } = await client.query(
    `insert into public.public_videos (owner_id, storage_path, age_rating, moderation_status, visibility, published_at)
     values ($1, 'x', 18, 'approved', 'public', now()) returning id`,
    [BOB]
  );
  const videoId = vidRows[0].id;
  await asUser(CHARLIE, async () => {
    // No age profile for Charlie -> defaults to 13, must not see an 18-rated video.
    const { rows } = await client.query('select id from public.public_videos where id = $1', [videoId]);
    check('viewer with no age profile (defaults to 13) cannot see 18-rated video', rows.length === 0, `got ${rows.length}`);
  });
  await client.query(
    `insert into public.user_age_profile (user_id, birth_date) values ($1, current_date - interval '20 years')
     on conflict (user_id) do update set birth_date = excluded.birth_date`,
    [ALICE]
  );
  await asUser(ALICE, async () => {
    const { rows } = await client.query('select id from public.public_videos where id = $1', [videoId]);
    check('20yo viewer with declared age CAN see 18-rated approved video', rows.length === 1, `got ${rows.length}`);
  });
  await asUser(BOB, async () => {
    const { rows } = await client.query('select id from public.public_videos where id = $1', [videoId]);
    check('owner always sees their own video regardless of age gate', rows.length === 1, `got ${rows.length}`);
  });

  // ---- K-MAP precision ----
  const { rows: shareRows } = await client.query(
    `insert into public.location_shares (owner_id, recipient_user_id, precision, mode, expires_at)
     values ($1, $2, 'approximate', 'live', now() + interval '1 hour') returning id`,
    [BOB, ALICE]
  );
  const shareId = shareRows[0].id;
  await client.query(
    `insert into public.location_points (share_id, latitude, longitude, captured_at)
     values ($1, 48.858370, 2.294481, now())`,
    [shareId]
  );
  await asUser(ALICE, async () => {
    const { rows: direct } = await client.query('select latitude from public.location_points where share_id = $1', [shareId]);
    check('non-owner recipient gets 0 rows from direct location_points SELECT', direct.length === 0, `got ${direct.length}`);

    const { rows: viaRpc } = await client.query('select * from public.location_point_for_viewer($1)', [shareId]);
    const exact = 48.858370;
    check(
      'approximate share returns rounded coords via RPC, not exact',
      viaRpc.length === 1 && Math.abs(viaRpc[0].latitude - exact) >= 0.001,
      JSON.stringify(viaRpc)
    );
  });
  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select * from public.location_point_for_viewer($1)', [shareId]);
    check('unauthorized user gets nothing from location_point_for_viewer', rows.length === 0, `got ${rows.length}`);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
