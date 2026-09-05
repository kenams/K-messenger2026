import fs from 'node:fs/promises';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) throw new Error('DB_URL is required');

const client = new pg.Client({ connectionString: DB_URL });
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CHARLIE = '33333333-3333-4333-8333-333333333333';
const ALICE_DEVICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const BOB_DEVICE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
let pass = 0;
let fail = 0;

function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

async function asUser(userId, fn) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
  try { return await fn(); } finally { await client.query('rollback'); }
}

async function blocked(fn) {
  try { await fn(); return false; } catch { return true; }
}

async function main() {
  await client.connect();
  await client.query(await fs.readFile('neon/migrations/0011_signal_prekeys.sql', 'utf8'));
  await client.query(await fs.readFile('neon/migrations/0012_signal_prekey_claim_fix.sql', 'utf8'));

  await client.query(
    `insert into public.devices(id,user_id,name) values
      ($1,$2,'Alice CI device'),($3,$4,'Bob CI device')
     on conflict(id) do update set revoked_at=null`,
    [ALICE_DEVICE, ALICE, BOB_DEVICE, BOB],
  );
  await client.query(
    `insert into public.contacts(owner_id,contact_id) values ($1,$2),($2,$1)
     on conflict(owner_id,contact_id) do nothing`,
    [ALICE, BOB],
  );
  await client.query(
    `insert into public.device_key_bundles
      (device_id,user_id,bundle_version,registration_id,identity_key,signed_prekey_id,signed_prekey_public,signed_prekey_signature,pq_last_resort_prekey_id,pq_last_resort_prekey_public,pq_last_resort_prekey_signature)
     values ($1,$2,1,101,$3,11,$4,$5,21,$6,$7)
     on conflict(device_id) do update set bundle_version=excluded.bundle_version,updated_at=now()`,
    [ALICE_DEVICE, ALICE, 'identity-public-key-alice-xxxxxxxxxxxx', 'signed-curve-prekey-alice-xxxxxxxxx', 'signed-curve-signature-alice-xxxxxxxx', 'pq-last-resort-public-alice-xxxxxxxx', 'pq-last-resort-signature-alice-xxxxxx'],
  );
  await client.query(
    `insert into public.device_one_time_prekeys(device_id,key_id,public_key) values ($1,31,$2)
     on conflict(device_id,key_id) do update set claimed_at=null,claimed_by=null`,
    [ALICE_DEVICE, 'curve-one-time-public-alice-xxxxxxxxx'],
  );
  await client.query(
    `insert into public.device_pq_one_time_prekeys(device_id,key_id,public_key,signature) values ($1,41,$2,$3)
     on conflict(device_id,key_id) do update set claimed_at=null,claimed_by=null`,
    [ALICE_DEVICE, 'pq-one-time-public-alice-xxxxxxxxxxxx', 'pq-one-time-signature-alice-xxxxxxxxxx'],
  );
  await client.query('delete from public.device_prekey_claims where target_device_id=$1', [ALICE_DEVICE]);

  await asUser(BOB, async () => {
    const bundle = await client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE]);
    check('contact can atomically claim target bundle', bundle.rows.length === 1);
    check('claim consumes EC one-time prekey', bundle.rows[0]?.one_time_prekey_id === 31);
    check('claim consumes PQ one-time prekey', bundle.rows[0]?.pq_prekey_id === 41 && bundle.rows[0]?.pq_is_last_resort === false);
  });

  const consumed = await client.query(
    `select
      (select claimed_by from public.device_one_time_prekeys where device_id=$1 and key_id=31) as ec_claimed_by,
      (select claimed_by from public.device_pq_one_time_prekeys where device_id=$1 and key_id=41) as pq_claimed_by`,
    [ALICE_DEVICE],
  );
  check('database records claimant for consumed EC/PQ prekeys', consumed.rows[0]?.ec_claimed_by === BOB && consumed.rows[0]?.pq_claimed_by === BOB);

  await asUser(BOB, async () => {
    check('same contact cannot drain same device bundle twice', await blocked(() => client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE])));
  });
  await asUser(CHARLIE, async () => {
    check('stranger cannot claim a prekey bundle', await blocked(() => client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE])));
  });
  await asUser(ALICE, async () => {
    check('device owner cannot self-claim own bundle', await blocked(() => client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE])));
  });
  await asUser(BOB, async () => {
    const hidden = await client.query('select device_id from public.device_key_bundles where device_id=$1', [ALICE_DEVICE]);
    check('other user cannot directly enumerate target key registry', hidden.rows.length === 0);
  });

  await client.query('delete from public.device_prekey_claims where target_device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.device_pq_one_time_prekeys where device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.device_one_time_prekeys where device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.device_key_bundles where device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.devices where id in ($1,$2)', [ALICE_DEVICE, BOB_DEVICE]);

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  if (fail) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  try { await client.end(); } catch {}
  process.exit(1);
});
