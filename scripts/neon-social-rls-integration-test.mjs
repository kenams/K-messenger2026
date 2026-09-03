import fs from 'node:fs/promises';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error('DB_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DB_URL });
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CHARLIE = '33333333-3333-4333-8333-333333333333';
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

async function asUser(userId, fn) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  try {
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function apply(path) {
  await client.query(await fs.readFile(path, 'utf8'));
}

async function main() {
  await client.connect();
  await apply('neon/migrations/0002_social_content_location.sql');
  await apply('neon/migrations/0003_social_content_grants.sql');
  await apply('neon/migrations/0004_kmap_owner_revoke_policy.sql');

  await client.query(
    `insert into public.user_age_profile (user_id, birth_date)
     values ($1, date '2000-01-01'), ($2, date '2012-01-01'), ($3, date '2000-01-01')
     on conflict (user_id) do update set birth_date = excluded.birth_date`,
    [ALICE, BOB, CHARLIE],
  );

  const { rows: videoRows } = await client.query(
    `insert into public.public_videos
       (owner_id, storage_path, caption, age_rating, violence_level, visibility, moderation_status, published_at)
     values ($1, 'test/alice/18.mp4', '18+ test', 18, 'graphic', 'public', 'approved', now())
     returning id`,
    [ALICE],
  );
  const videoId = videoRows[0].id;

  await asUser(BOB, async () => {
    const { rows } = await client.query('select id from public.public_videos where id=$1', [videoId]);
    check('under-18 user cannot read 18+ K-Feed video', rows.length === 0, `got ${rows.length}`);
  });
  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select id from public.public_videos where id=$1', [videoId]);
    check('adult user can read approved age-eligible K-Feed video', rows.length === 1, `got ${rows.length}`);
  });

  const { rows: momentRows } = await client.query(
    `insert into public.moments (author_id, kind, caption, visibility, moderation_status)
     values ($1, 'text', 'friends-only test', 'friends', 'approved') returning id`,
    [ALICE],
  );
  const momentId = momentRows[0].id;
  await asUser(BOB, async () => {
    const { rows } = await client.query('select id from public.moments where id=$1', [momentId]);
    check('contact can read active friends-only Moment', rows.length === 1, `got ${rows.length}`);
  });
  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select id from public.moments where id=$1', [momentId]);
    check('stranger cannot read friends-only Moment', rows.length === 0, `got ${rows.length}`);
  });

  const { rows: shareRows } = await client.query(
    `insert into public.location_shares (owner_id, recipient_user_id, precision, mode, expires_at)
     values ($1, $2, 'approximate', 'live', now() + interval '1 hour') returning id`,
    [ALICE, BOB],
  );
  const shareId = shareRows[0].id;
  await client.query(
    `insert into public.location_points (share_id, latitude, longitude, accuracy_meters, captured_at)
     values ($1, 48.856613, 2.352222, 5, now())`,
    [shareId],
  );

  await asUser(BOB, async () => {
    const direct = await client.query('select latitude, longitude from public.location_points where share_id=$1', [shareId]);
    check('K-MAP recipient cannot directly read raw exact point', direct.rows.length === 0, `got ${direct.rows.length}`);
    const safe = await client.query('select * from public.location_point_for_viewer($1)', [shareId]);
    check('K-MAP approximate recipient gets one safe point', safe.rows.length === 1, `got ${safe.rows.length}`);
    check('K-MAP approximate point is server-coarsened', safe.rows[0]?.latitude === 48.86 && safe.rows[0]?.longitude === 2.35, JSON.stringify(safe.rows[0]));
    check('K-MAP approximate accuracy is at least 1km', Number(safe.rows[0]?.accuracy_meters) >= 1000, JSON.stringify(safe.rows[0]));
  });

  await asUser(CHARLIE, async () => {
    const safe = await client.query('select * from public.location_point_for_viewer($1)', [shareId]);
    check('K-MAP stranger gets no location point', safe.rows.length === 0, `got ${safe.rows.length}`);
  });

  await asUser(ALICE, async () => {
    const result = await client.query('update public.location_shares set revoked_at=now() where id=$1 returning id', [shareId]);
    check('K-MAP owner can explicitly revoke a share', result.rows.length === 1);
  });

  const { rows: share2Rows } = await client.query(
    `insert into public.location_shares (owner_id, recipient_user_id, precision, mode, expires_at)
     values ($1, $2, 'precise', 'one_time', now() + interval '1 hour') returning id`,
    [ALICE, BOB],
  );
  const share2Id = share2Rows[0].id;
  await asUser(ALICE, async () => {
    await client.query('insert into public.blocks (blocker_id, blocked_id) values ($1,$2) on conflict do nothing', [ALICE, BOB]);
    const { rows } = await client.query('select revoked_at from public.location_shares where id=$1', [share2Id]);
    check('blocking a user auto-revokes active direct K-MAP shares', !!rows[0]?.revoked_at);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('SCRIPT ERROR', error.message);
  await client.end().catch(() => undefined);
  process.exit(1);
});
