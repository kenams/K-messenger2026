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
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

async function asRole(role, userId, fn) {
  await client.query('begin');
  await client.query(`set local role ${role}`);
  if (userId) {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role })]);
  }
  try {
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function main() {
  await client.connect();

  // Neon Data API defines `anon`; the local PostgreSQL fixture does not. Create
  // the no-login role before applying the migration so CI also proves the
  // explicit REVOKE path rather than merely exercising the conditional branch.
  await client.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;`);
  await client.query(await fs.readFile('neon/migrations/0009_push_subscriptions.sql', 'utf8'));

  const token = 'ExponentPushToken[kssenger-ci-alice]';
  await client.query('delete from public.push_subscriptions where expo_push_token=$1', [token]);
  await client.query(
    `insert into public.push_subscriptions (user_id, expo_push_token, platform)
     values ($1, $2, 'android')`,
    [ALICE, token],
  );

  await asRole('authenticated', ALICE, async () => {
    const { rows } = await client.query('select expo_push_token from public.push_subscriptions where expo_push_token=$1', [token]);
    check('push owner can read own subscription', rows.length === 1);

    const updated = await client.query(
      'update public.push_subscriptions set enabled=false, updated_at=now() where expo_push_token=$1 returning enabled',
      [token],
    );
    check('push owner can disable own subscription', updated.rows.length === 1 && updated.rows[0].enabled === false);
  });

  await asRole('authenticated', BOB, async () => {
    const { rows } = await client.query('select expo_push_token from public.push_subscriptions where expo_push_token=$1', [token]);
    check('other user cannot read push token', rows.length === 0, `got ${rows.length}`);

    let blocked = false;
    try {
      await client.query(
        `insert into public.push_subscriptions (user_id, expo_push_token, platform)
         values ($1, 'ExponentPushToken[kssenger-ci-forged]', 'android')`,
        [ALICE],
      );
    } catch {
      blocked = true;
    }
    check('other user cannot register a token for owner', blocked);
  });

  await asRole('anon', null, async () => {
    let blocked = false;
    try {
      await client.query('select id from public.push_subscriptions limit 1');
    } catch {
      blocked = true;
    }
    check('anonymous role has no push registry access', blocked);
  });

  await client.query('delete from public.push_subscriptions where expo_push_token=$1', [token]);
  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  if (fail) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  try { await client.end(); } catch {}
  process.exit(1);
});
