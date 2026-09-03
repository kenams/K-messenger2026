// Real RLS integration test for the dedicated Neon schema against an isolated
// Postgres database. CI runs this on a disposable local Postgres service.
import fs from 'node:fs/promises';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error('DB_URL is required');
  process.exit(1);
}

const dbUrl = new URL(DB_URL);
const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(dbUrl.hostname);
if (process.env.KSSENGER_RLS_RESET === '1' && !isLocalhost) {
  console.error('KSSENGER_RLS_RESET is allowed only for localhost databases');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DB_URL });

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}  ${detail}`);
  }
}

async function expectRejected(name, fn, pattern = /row-level security|permission denied|violates/i) {
  try {
    await fn();
    check(name, false, 'query unexpectedly succeeded');
  } catch (error) {
    check(name, pattern.test(error.message), error.message);
  }
}

async function asUser(userId, fn) {
  await client.query('begin');
  await client.query('set local role authenticated');
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  try {
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function bootstrapNeonAuthContext() {
  // Sur un projet local jetable, auth.uid()/user_id() n'existent pas encore
  // -> on les crée nous-memes pour simuler Neon Auth. Sur le projet Neon
  // reel (late-flower-65059830), Neon Auth managé possede deja ce schema et
  // notre role n'a pas les privileges CREATE dessus (et n'en a pas besoin) -
  // on detecte sa presence et on saute la creation.
  const { rows } = await client.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'auth' and p.proname = 'uid'`
  );
  if (rows.length > 0) return;

  await client.query(`
    do $$
    begin
      create role authenticated;
    exception when duplicate_object then
      null;
    end $$;

    create schema if not exists neon_auth;
    create table if not exists neon_auth."user" (
      id uuid primary key,
      email text unique not null,
      name text,
      "emailVerified" boolean not null default true,
      image text,
      "createdAt" timestamptz not null default now(),
      "updatedAt" timestamptz not null default now()
    );

    create schema if not exists auth;
    create or replace function auth.user_id()
    returns text
    language sql
    stable
    as $$
      select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
    $$;

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select auth.user_id()::uuid
    $$;
  `);
}

async function resetLocalDatabase() {
  if (process.env.KSSENGER_RLS_RESET !== '1') return;
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    drop schema if exists neon_auth cascade;
    create schema public;
    grant usage on schema public to public;
    grant create on schema public to public;
  `);
}

async function applyNeonMigration() {
  // Idempotence identique a bootstrapNeonAuthContext : sur le projet Neon
  // reel, la migration a deja ete appliquee (voir docs/PROJECT_STATE.md) - la
  // rejouer echoue sur les `create policy` (pas de IF NOT EXISTS pour les
  // policies). On ne l'applique que si les tables core ne sont pas encore la.
  const { rows } = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles'`
  );
  if (rows.length > 0) return;

  const migration = await fs.readFile('neon/migrations/0001_v1_core.sql', 'utf8');
  await client.query(migration);
}

async function makeUser(id, username) {
  await client.query(
    `insert into neon_auth."user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, now(), now())
     on conflict (id) do nothing`,
    [id, `${username}@kssenger.test`, username],
  );
  await client.query(
    `insert into public.profiles (id, username, display_name)
     values ($1, $2, $3)
     on conflict (id) do nothing`,
    [id, username, username],
  );
  await client.query(
    `insert into public.privacy_settings (user_id)
     values ($1)
     on conflict (user_id) do nothing`,
    [id],
  );
}

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CHARLIE = '33333333-3333-4333-8333-333333333333';

async function main() {
  await client.connect();
  await resetLocalDatabase();
  await bootstrapNeonAuthContext();
  await applyNeonMigration();

  await makeUser(ALICE, 'alice_rls_neon');
  await makeUser(BOB, 'bob_rls_neon');
  await makeUser(CHARLIE, 'charlie_rls_neon');

  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select id from public.profiles where id = $1', [BOB]);
    check('stranger cannot read another user profile', rows.length === 0, `got ${rows.length}`);
  });

  await asUser(ALICE, async () => {
    await expectRejected('authenticated user cannot directly insert contacts', () =>
      client.query('insert into public.contacts (owner_id, contact_id) values ($1, $2)', [ALICE, BOB]),
    );
  });

  await asUser(ALICE, async () => {
    const { rows } = await client.query(
      `insert into public.contact_requests (sender_id, recipient_id)
       values ($1, $2)
       returning id`,
      [ALICE, BOB],
    );
    check('user can create their own outgoing contact request', rows.length === 1);
  });

  await asUser(ALICE, async () => {
    await expectRejected('user cannot forge another sender on contact request', () =>
      client.query('insert into public.contact_requests (sender_id, recipient_id) values ($1, $2)', [BOB, CHARLIE]),
    );
  });

  await asUser(ALICE, async () => {
    await expectRejected('authenticated user cannot directly mutate contact request status', () =>
      client.query(
        `update public.contact_requests
            set status = 'accepted'
          where sender_id = $1 and recipient_id = $2`,
        [ALICE, BOB],
      ),
      /permission denied/i,
    );
  });

  await client.query(
    `insert into public.contacts (owner_id, contact_id)
     values ($1, $2), ($2, $1)
     on conflict do nothing`,
    [ALICE, BOB],
  );

  await asUser(ALICE, async () => {
    const { rows } = await client.query('select id from public.profiles where id = $1', [BOB]);
    check('contact can read contact profile', rows.length === 1);
  });

  await asUser(ALICE, async () => {
    await client.query(`update public.profiles set display_name = 'Mallory' where id = $1`, [BOB]);
  });
  const { rows: bobProfileRows } = await client.query('select display_name from public.profiles where id = $1', [BOB]);
  check('user cannot update another user profile through RLS', bobProfileRows[0]?.display_name === 'bob_rls_neon');

  await asUser(ALICE, async () => {
    const { rows } = await client.query('select user_id from public.privacy_settings where user_id = $1', [BOB]);
    check('user cannot read another user privacy settings', rows.length === 0, `got ${rows.length}`);
  });

  await asUser(ALICE, async () => {
    await client.query(`update public.privacy_settings set allow_wizz = 'everyone' where user_id = $1`, [BOB]);
  });
  const { rows: bobPrivacyRows } = await client.query('select allow_wizz from public.privacy_settings where user_id = $1', [BOB]);
  check('user cannot update another user privacy settings', bobPrivacyRows[0]?.allow_wizz === 'contacts');

  await asUser(ALICE, async () => {
    await expectRejected('user cannot register a device for another account', () =>
      client.query(`insert into public.devices (user_id, name) values ($1, 'forged-device')`, [BOB]),
    );
  });

  const { rows: conversationRows } = await client.query(
    `insert into public.conversations (kind, created_by)
     values ('direct', $1)
     returning id`,
    [ALICE],
  );
  const conversationId = conversationRows[0].id;
  await client.query(
    `insert into public.conversation_members (conversation_id, user_id)
     values ($1, $2), ($1, $3)`,
    [conversationId, ALICE, BOB],
  );
  const { rows: deviceRows } = await client.query(
    `insert into public.devices (user_id, name)
     values ($1, 'alice-device')
     returning id`,
    [ALICE],
  );
  const { rows: messageRows } = await client.query(
    `insert into public.messages
       (client_message_id, conversation_id, sender_user_id, sender_device_id, algorithm, ciphertext)
     values (gen_random_uuid(), $1, $2, $3, 'test-envelope', 'opaque-ciphertext')
     returning id`,
    [conversationId, ALICE, deviceRows[0].id],
  );
  const messageId = messageRows[0].id;

  await asUser(BOB, async () => {
    const { rows } = await client.query('select id from public.messages where id = $1', [messageId]);
    check('conversation member can read encrypted message row', rows.length === 1);
  });

  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select id from public.messages where id = $1', [messageId]);
    check('outsider cannot read private conversation message', rows.length === 0, `got ${rows.length}`);
  });

  await asUser(ALICE, async () => {
    await expectRejected('authenticated client cannot directly insert messages', () =>
      client.query(
        `insert into public.messages
           (client_message_id, conversation_id, sender_user_id, sender_device_id, algorithm, ciphertext)
         values (gen_random_uuid(), $1, $2, $3, 'test-envelope', 'forged')`,
        [conversationId, ALICE, deviceRows[0].id],
      ),
      /permission denied/i,
    );
  });

  await client.query(
    `insert into public.message_receipts (message_id, user_id, delivered_at)
     values ($1, $2, now())`,
    [messageId, BOB],
  );

  await asUser(ALICE, async () => {
    const { rows } = await client.query('select message_id from public.message_receipts where message_id = $1', [messageId]);
    check('message sender can read delivered receipt for their conversation', rows.length === 1);
  });

  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select message_id from public.message_receipts where message_id = $1', [messageId]);
    check('outsider cannot read another conversation receipt', rows.length === 0, `got ${rows.length}`);
  });

  await asUser(BOB, async () => {
    await expectRejected('authenticated client cannot directly insert receipt rows', () =>
      client.query(
        `insert into public.message_receipts (message_id, user_id, delivered_at)
         values ($1, $2, now())`,
        [messageId, BOB],
      ),
      /permission denied/i,
    );
  });

  const { rows: groupRows } = await client.query(
    `insert into public.conversations (kind, title, created_by)
     values ('group', 'RLS Group', $1)
     returning id`,
    [ALICE],
  );
  const groupId = groupRows[0].id;
  await client.query(
    `insert into public.conversation_members (conversation_id, user_id, role)
     values ($1, $2, 'owner'), ($1, $3, 'member')`,
    [groupId, ALICE, BOB],
  );

  await asUser(BOB, async () => {
    const { rows } = await client.query('select id from public.conversations where id = $1', [groupId]);
    check('group member can read group conversation', rows.length === 1);
  });

  await asUser(CHARLIE, async () => {
    const { rows } = await client.query('select id from public.conversations where id = $1', [groupId]);
    check('non-member cannot read group conversation', rows.length === 0, `got ${rows.length}`);
  });

  await asUser(ALICE, async () => {
    await expectRejected('user cannot forge a block owned by another account', () =>
      client.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [BOB, CHARLIE]),
    );
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
