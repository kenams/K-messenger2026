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
const CHARLIE_DEVICE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
let pass = 0;
let fail = 0;

function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}
async function setAuthenticatedUser(userId) {
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
}
async function asUser(userId, fn) {
  await client.query('begin');
  await setAuthenticatedUser(userId);
  try { return await fn(); } finally { await client.query('rollback'); }
}
async function asUserCommit(userId, fn) {
  await client.query('begin');
  await setAuthenticatedUser(userId);
  try { const result = await fn(); await client.query('commit'); return result; }
  catch (error) { await client.query('rollback'); throw error; }
}
async function blocked(fn) { try { await fn(); return false; } catch { return true; } }

async function seedBundle() {
  await client.query(
    `insert into public.device_key_bundles
      (device_id,user_id,bundle_version,registration_id,identity_key,signed_prekey_id,signed_prekey_public,signed_prekey_signature,pq_last_resort_prekey_id,pq_last_resort_prekey_public,pq_last_resort_prekey_signature)
     values ($1,$2,1,101,$3,11,$4,$5,21,$6,$7)
     on conflict(device_id) do update set bundle_version=excluded.bundle_version,updated_at=now()`,
    [ALICE_DEVICE, ALICE, 'identity-public-key-alice-xxxxxxxxxxxx', 'signed-curve-prekey-alice-xxxxxxxxx', 'signed-curve-signature-alice-xxxxxxxx', 'pq-last-resort-public-alice-xxxxxxxx', 'pq-last-resort-signature-alice-xxxxxx'],
  );
  await client.query(
    `insert into public.device_one_time_prekeys(device_id,key_id,public_key) values ($1,31,$2),($1,32,$3)
     on conflict(device_id,key_id) do update set claimed_at=null,claimed_by=null`,
    [ALICE_DEVICE, 'curve-one-time-public-alice-xxxxxxxxx', 'curve-one-time-public-alice-yyyyyyyyy'],
  );
  await client.query(
    `insert into public.device_pq_one_time_prekeys(device_id,key_id,public_key,signature) values ($1,41,$2,$3),($1,42,$4,$5)
     on conflict(device_id,key_id) do update set claimed_at=null,claimed_by=null`,
    [ALICE_DEVICE, 'pq-one-time-public-alice-xxxxxxxxxxxx', 'pq-one-time-signature-alice-xxxxxxxxxx', 'pq-one-time-public-alice-yyyyyyyyyyyy', 'pq-one-time-signature-alice-yyyyyyyyyy'],
  );
  await client.query('delete from public.device_prekey_claims where target_device_id=$1', [ALICE_DEVICE]);
}

async function main() {
  await client.connect();
  for (const migration of [
    '0011_signal_prekeys.sql',
    '0012_signal_prekey_claim_fix.sql',
    '0014_contact_signal_device_discovery.sql',
    '0015_group_signal_device_discovery.sql',
    '0016_signal_group_prekey_claim.sql',
  ]) await client.query(await fs.readFile(`neon/migrations/${migration}`, 'utf8'));

  await client.query(
    `insert into public.devices(id,user_id,name) values
      ($1,$2,'Alice CI device'),($3,$4,'Bob CI device'),($5,$6,'Charlie CI device')
     on conflict(id) do update set revoked_at=null`,
    [ALICE_DEVICE, ALICE, BOB_DEVICE, BOB, CHARLIE_DEVICE, CHARLIE],
  );
  await client.query(
    `insert into public.contacts(owner_id,contact_id) values ($1,$2),($2,$1)
     on conflict(owner_id,contact_id) do nothing`, [ALICE, BOB],
  );

  await asUser(ALICE, async () => {
    const visible = await client.query('select id from public.devices where id in ($1,$2,$3)', [ALICE_DEVICE, BOB_DEVICE, CHARLIE_DEVICE]);
    check('owner sees own and contact device', visible.rows.some((row) => row.id === ALICE_DEVICE) && visible.rows.some((row) => row.id === BOB_DEVICE));
    check('stranger device hidden from contact discovery', !visible.rows.some((row) => row.id === CHARLIE_DEVICE));
  });

  const group = await client.query(`insert into public.conversations(kind,title,created_by) values ('group','Signal CI group',$1) returning id`, [ALICE]);
  const groupId = group.rows[0].id;
  await client.query(
    `insert into public.conversation_members(conversation_id,user_id,role) values
      ($1,$2,'owner'),($1,$3,'member'),($1,$4,'member')`, [groupId, ALICE, BOB, CHARLIE],
  );

  await asUser(CHARLIE, async () => {
    const visible = await client.query('select id from public.devices where id in ($1,$2)', [ALICE_DEVICE, BOB_DEVICE]);
    check('group member discovers peer devices without contact relation', visible.rows.length === 2);
  });

  await seedBundle();
  await asUserCommit(BOB, async () => {
    const bundle = await client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE]);
    check('contact atomically claims target bundle', bundle.rows.length === 1);
    check('contact consumes first EC/PQ keys', bundle.rows[0]?.one_time_prekey_id === 31 && bundle.rows[0]?.pq_prekey_id === 41);
  });
  await asUserCommit(CHARLIE, async () => {
    const bundle = await client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE]);
    check('shared-group non-contact can claim bundle', bundle.rows.length === 1);
    check('group peer consumes distinct EC/PQ keys', bundle.rows[0]?.one_time_prekey_id === 32 && bundle.rows[0]?.pq_prekey_id === 42);
  });

  await asUser(BOB, async () => {
    check('same peer cannot drain same device version twice', await blocked(() => client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE])));
  });

  await client.query('insert into public.blocks(blocker_id,blocked_id) values($1,$2) on conflict do nothing', [ALICE, CHARLIE]);
  await asUser(CHARLIE, async () => {
    const hidden = await client.query('select id from public.devices where id=$1', [ALICE_DEVICE]);
    check('block hides device despite shared group', hidden.rows.length === 0);
  });
  await client.query('delete from public.blocks where blocker_id=$1 and blocked_id=$2', [ALICE, CHARLIE]);

  await client.query('delete from public.conversation_members where conversation_id=$1 and user_id=$2', [groupId, CHARLIE]);
  await asUser(CHARLIE, async () => {
    const hidden = await client.query('select id from public.devices where id=$1', [ALICE_DEVICE]);
    check('former group member loses discovery immediately', hidden.rows.length === 0);
  });
  await asUser(ALICE, async () => {
    check('owner cannot self-claim own bundle', await blocked(() => client.query('select * from public.claim_signal_prekey_bundle($1)', [ALICE_DEVICE])));
  });
  await asUser(BOB, async () => {
    const hidden = await client.query('select device_id from public.device_key_bundles where device_id=$1', [ALICE_DEVICE]);
    check('peer cannot enumerate target key registry directly', hidden.rows.length === 0);
  });

  await client.query('delete from public.device_prekey_claims where target_device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.device_pq_one_time_prekeys where device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.device_one_time_prekeys where device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.device_key_bundles where device_id=$1', [ALICE_DEVICE]);
  await client.query('delete from public.conversation_members where conversation_id=$1', [groupId]);
  await client.query('delete from public.conversations where id=$1', [groupId]);
  await client.query('delete from public.devices where id in ($1,$2,$3)', [ALICE_DEVICE, BOB_DEVICE, CHARLIE_DEVICE]);

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  if (fail) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  try { await client.end(); } catch {}
  process.exit(1);
});
