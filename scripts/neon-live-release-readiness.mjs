import pg from 'pg';

const DB_URL = process.env.DB_URL;
const PROJECT_ID = process.env.KSSENGER_PROJECT_ID;
const EXPECTED_PROJECT_ID = 'late-flower-65059830';

if (!DB_URL) throw new Error('DB_URL is required');
if (PROJECT_ID !== EXPECTED_PROJECT_ID) {
  throw new Error('KSSENGER_RELEASE_READINESS_WRONG_PROJECT');
}

const client = new pg.Client({ connectionString: DB_URL });
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

try {
  await client.connect();

  const db = await client.query('select current_database() as name');
  check('dedicated database name is kssenger', db.rows[0]?.name === 'kssenger', String(db.rows[0]?.name ?? 'missing'));

  const rls = await client.query(`
    select count(*)::int as total,
           count(*) filter (where relrowsecurity)::int as enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  `);
  check('all public tables have RLS enabled', rls.rows[0]?.total > 0 && rls.rows[0]?.total === rls.rows[0]?.enabled,
    JSON.stringify(rls.rows[0] ?? {}));

  const forceRls = await client.query(`
    select relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any($1::text[])
       and c.relforcerowsecurity
     order by relname
  `, [[
    'device_key_bundles',
    'device_one_time_prekeys',
    'device_pq_one_time_prekeys',
    'device_prekey_claims',
    'media_objects',
    'push_subscriptions',
  ]]);
  check('security-sensitive tables keep FORCE RLS', forceRls.rows.length === 6, forceRls.rows.map((row) => row.relname).join(','));

  const triggers = await client.query(`
    select tgname
      from pg_trigger
     where not tgisinternal
       and tgname = any($1::text[])
  `, [['revoke_location_on_block', 'revoke_location_on_contact_removal']]);
  check('K-MAP revocation triggers are installed', new Set(triggers.rows.map((row) => row.tgname)).size === 2,
    triggers.rows.map((row) => row.tgname).join(','));

  const triggerAcl = await client.query(`
    select has_function_privilege('authenticated', 'public.revoke_location_shares_on_contact_removal()', 'EXECUTE') as authenticated_can_execute
  `);
  check('contact-removal SECURITY DEFINER is not executable by authenticated', triggerAcl.rows[0]?.authenticated_can_execute === false);

  const fks = await client.query(`
    select c.conname,
           c.confdeltype,
           n.nspname as table_schema,
           r.relname as table_name
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
     where c.contype = 'f'
       and c.confrelid = 'neon_auth."user"'::regclass
       and n.nspname = 'public'
     order by r.relname, c.conname
  `);
  check('public account-deletion FK surface is present', fks.rows.length > 0, `count=${fks.rows.length}`);

  const blockingFks = fks.rows.filter((row) => row.confdeltype !== 'c' && row.confdeltype !== 'n');
  check(
    'all public references to Neon Auth users are deletion-safe',
    blockingFks.length === 0,
    blockingFks.map((row) => `${row.table_name}.${row.conname}:${row.confdeltype}`).join(','),
  );

  const fkMap = new Map(fks.rows.map((row) => [row.conname, row.confdeltype]));
  check('conversation creator is anonymized on account deletion', fkMap.get('conversations_created_by_fkey') === 'n', String(fkMap.get('conversations_created_by_fkey') ?? 'missing'));
  check('deleted user encrypted messages cascade away', fkMap.get('messages_sender_user_id_fkey') === 'c', String(fkMap.get('messages_sender_user_id_fkey') ?? 'missing'));
  check('group moderation actor is anonymized on account deletion', fkMap.get('group_bans_banned_by_fkey') === 'n', String(fkMap.get('group_bans_banned_by_fkey') ?? 'missing'));

  if (failed) {
    throw new Error(`KSSENGER_LIVE_RELEASE_READINESS_FAILED:${failed}`);
  }
  console.log('KSSENGER_LIVE_RELEASE_READINESS_PASS=true');
} finally {
  await client.end().catch(() => undefined);
}
