// Apply one or more SQL migration files to a Postgres database.
//   DB_URL=… node scripts/apply-migration.mjs neon/migrations/0019_*.sql neon/migrations/0020_*.sql
// Each file is run inside its own transaction; ON_ERROR_STOP semantics.
import fs from 'node:fs';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) throw new Error('DB_URL is required');
const files = process.argv.slice(2);
if (!files.length) throw new Error('pass one or more .sql paths');

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
const who = await client.query('select current_database() as db, current_user as usr');
console.log(`connected: db=${who.rows[0].db} user=${who.rows[0].usr}`);

for (const file of files) {
  const sql = fs.readFileSync(file, 'utf8');
  process.stdout.write(`\n=== ${file} ===\n`);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('  applied ✓');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error(`  FAILED: ${error.message}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('\nALL_MIGRATIONS_APPLIED');
