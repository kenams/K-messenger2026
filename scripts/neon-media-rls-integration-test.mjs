import fs from 'node:fs/promises';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) throw new Error('DB_URL is required');

const client = new pg.Client({ connectionString: DB_URL });
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
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
  await client.query(await fs.readFile('neon/migrations/0010_media_objects.sql', 'utf8'));

  const aliceKey = `${ALICE}/avatar/ci.jpg`;
  await asUser(ALICE, async () => {
    const inserted = await client.query(
      `insert into public.media_objects (owner_id, object_key, purpose, mime_type, byte_size)
       values ($1,$2,'avatar','image/jpeg',2048) returning status`, [ALICE, aliceKey]);
    check('owner registers own pending media', inserted.rows[0]?.status === 'pending');
    check('owner reads own media metadata', (await client.query('select id from public.media_objects where object_key=$1', [aliceKey])).rows.length === 1);
    check('client cannot promote media to ready', await blocked(() => client.query(`update public.media_objects set status='ready' where object_key=$1`, [aliceKey])));
    check('owner prefix is enforced', await blocked(() => client.query(
      `insert into public.media_objects (owner_id, object_key, purpose, mime_type, byte_size)
       values ($1,$2,'avatar','image/jpeg',2048)`, [ALICE, `${BOB}/avatar/wrong-prefix.jpg`])));
  });

  await client.query(
    `insert into public.media_objects (owner_id, object_key, purpose, mime_type, byte_size)
     values ($1,$2,'avatar','image/jpeg',2048) on conflict (object_key) do nothing`, [ALICE, aliceKey]);

  await asUser(BOB, async () => {
    check('other user cannot read private media metadata', (await client.query('select id from public.media_objects where object_key=$1', [aliceKey])).rows.length === 0);
    check('other user cannot register media as owner', await blocked(() => client.query(
      `insert into public.media_objects (owner_id, object_key, purpose, mime_type, byte_size)
       values ($1,$2,'avatar','image/jpeg',2048)`, [ALICE, `${ALICE}/avatar/other-user.jpg`])));
  });

  await client.query('delete from public.media_objects where object_key=$1', [aliceKey]);
  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  if (fail) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  try { await client.end(); } catch {}
  process.exit(1);
});
