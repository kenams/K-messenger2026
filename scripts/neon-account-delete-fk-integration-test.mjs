import fs from 'node:fs/promises';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error('DB_URL is required');
  process.exit(1);
}

const dbUrl = new URL(DB_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(dbUrl.hostname)) {
  console.error('Account-delete FK integration test is restricted to localhost databases');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DB_URL });
const DELETE_ME = '44444444-4444-4444-8444-444444444444';
const PEER = '55555555-5555-4555-8555-555555555555';
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

async function apply(path) {
  await client.query(await fs.readFile(path, 'utf8'));
}

async function ensureUser(id, name) {
  await client.query(
    `insert into neon_auth."user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     values ($1, $2, $3, true, now(), now())
     on conflict (id) do nothing`,
    [id, `${name}@kssenger.test`, name],
  );
  await client.query(
    `insert into public.profiles (id, username, display_name)
     values ($1, $2, $3)
     on conflict (id) do nothing`,
    [id, name, name],
  );
  await client.query(
    `insert into public.privacy_settings (user_id)
     values ($1)
     on conflict (user_id) do nothing`,
    [id],
  );
}

async function main() {
  await client.connect();

  // The core schema is created by the preceding CI RLS job step. Group
  // moderation is applied here because account deletion must also tolerate
  // historical moderator actions.
  await apply('neon/migrations/0006_group_moderation.sql');
  await apply('neon/migrations/0019_account_delete_fk_semantics.sql');

  await ensureUser(DELETE_ME, 'delete_me_v1');
  await ensureUser(PEER, 'delete_peer_v1');

  const { rows: conversationRows } = await client.query(
    `insert into public.conversations (kind, created_by)
     values ('direct', $1)
     returning id`,
    [DELETE_ME],
  );
  const conversationId = conversationRows[0].id;

  await client.query(
    `insert into public.conversation_members (conversation_id, user_id)
     values ($1, $2), ($1, $3)`,
    [conversationId, DELETE_ME, PEER],
  );

  const { rows: deviceRows } = await client.query(
    `insert into public.devices (user_id, name)
     values ($1, 'delete-me-device')
     returning id`,
    [DELETE_ME],
  );

  const { rows: messageRows } = await client.query(
    `insert into public.messages
       (client_message_id, conversation_id, sender_user_id, sender_device_id, algorithm, ciphertext)
     values (gen_random_uuid(), $1, $2, $3, 'signal-libsignal-multidevice-v1', 'opaque-delete-test')
     returning id`,
    [conversationId, DELETE_ME, deviceRows[0].id],
  );
  const messageId = messageRows[0].id;

  await client.query(
    `insert into public.group_bans (conversation_id, user_id, banned_by, reason)
     values ($1, $2, $3, 'account-delete-fk-test')`,
    [conversationId, PEER, DELETE_ME],
  );

  await client.query('delete from neon_auth."user" where id = $1', [DELETE_ME]);

  const authUser = await client.query('select id from neon_auth."user" where id=$1', [DELETE_ME]);
  check('deleted auth identity is removed', authUser.rows.length === 0);

  const profile = await client.query('select id from public.profiles where id=$1', [DELETE_ME]);
  check('profile cascades with deleted identity', profile.rows.length === 0);

  const membership = await client.query(
    'select user_id from public.conversation_members where conversation_id=$1 and user_id=$2',
    [conversationId, DELETE_ME],
  );
  check('conversation membership cascades with deleted identity', membership.rows.length === 0);

  const conversation = await client.query('select created_by from public.conversations where id=$1', [conversationId]);
  check('shared conversation survives with anonymized creator', conversation.rows.length === 1 && conversation.rows[0].created_by === null);

  const message = await client.query('select id from public.messages where id=$1', [messageId]);
  check('deleted account messages are removed', message.rows.length === 0);

  const moderation = await client.query(
    'select banned_by from public.group_bans where conversation_id=$1 and user_id=$2',
    [conversationId, PEER],
  );
  check('moderation record survives with anonymized moderator', moderation.rows.length === 1 && moderation.rows[0].banned_by === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (error) => {
  console.error('SCRIPT ERROR', error.message);
  await client.end().catch(() => undefined);
  process.exit(1);
});
