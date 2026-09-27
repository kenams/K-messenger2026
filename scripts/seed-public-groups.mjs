// Seeds one public, join-without-invite group per interest category for the
// "Découvrir" discovery feed (see neon/migrations/0033_public_groups.sql).
// Idempotent: re-running just leaves existing category groups alone (matched
// by category, since only one canonical public group per category is wanted
// here) and only inserts the ones still missing.
//
// Usage:
//   DB_URL=<connection string> node scripts/seed-public-groups.mjs [ownerUserId]
//
// ownerUserId defaults to Kenams's own account (KENAMS_ID below, same id used
// by the other kssenger scripts in this folder) — any existing real account
// works as owner, since public groups are joinable by anyone regardless of
// who created them.
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) throw new Error('DB_URL is required');
const OWNER_ID = process.argv[2] ?? process.env.KENAMS_ID ?? '43247878-5c6a-46bb-a2db-e7b3f6934a03';

const CATEGORIES = [
  { category: 'musique', title: 'Musique — partage & découvertes', description: 'Partage tes découvertes, tes playlists, tes concerts.' },
  { category: 'sport', title: 'Sport — motivation du jour', description: 'Motivation, séances, défis sportifs entre nous.' },
  { category: 'boxe', title: 'Boxe — ring & entraînement', description: 'Technique, entraînement, actu boxe.' },
  { category: 'course_a_pied', title: 'Course à pied — foulées & objectifs', description: 'Sorties running, objectifs, conseils foulée.' },
  { category: 'danse', title: 'Danse — mouvement & style', description: 'Styles, chorégraphies, événements danse.' },
  { category: 'dev', title: 'Dev — code & projets', description: 'Code, projets, entraide entre développeurs.' },
  { category: 'gaming', title: 'Gaming — parties & découvertes', description: 'Sessions de jeu, sorties, découvertes gaming.' },
  { category: 'ia', title: 'IA — actu & bricolage', description: 'Actu IA, outils, projets à base d’IA.' },
  { category: 'foot', title: 'Foot — matchs & débats', description: 'Résultats, débats, matchs entre passionnés.' },
  { category: 'basket', title: 'Basket — terrain & NBA', description: 'Terrain, ligue, NBA, actu basket.' },
  { category: 'droit', title: 'Droit — questions & veille', description: 'Questions de droit, veille juridique, entraide.' },
  { category: 'informatique', title: 'Informatique — support & astuces', description: 'Support, astuces, matériel et logiciels.' },
];

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
const who = await client.query('select current_database() as db, current_user as usr');
console.log(`connected: db=${who.rows[0].db} user=${who.rows[0].usr}`);

const { rows: ownerRows } = await client.query('select id from public.profiles where id = $1', [OWNER_ID]);
if (!ownerRows.length) throw new Error(`owner profile ${OWNER_ID} not found — pass a valid existing user id as argv[2]`);

let created = 0;
let skipped = 0;
for (const { category, title, description } of CATEGORIES) {
  const { rows: existing } = await client.query(
    `select id from public.conversations where kind = 'group' and is_public = true and category = $1 limit 1`,
    [category],
  );
  if (existing.length) {
    console.log(`= ${category}: already seeded (${existing[0].id})`);
    skipped += 1;
    continue;
  }

  await client.query('begin');
  try {
    const { rows: convRows } = await client.query(
      `insert into public.conversations (kind, title, created_by, is_public, category)
       values ('group', $1, $2, true, $3)
       returning id`,
      [title, OWNER_ID, category],
    );
    const conversationId = convRows[0].id;
    await client.query(
      `insert into public.conversation_members (conversation_id, user_id, role) values ($1, $2, 'owner')`,
      [conversationId, OWNER_ID],
    );
    await client.query('commit');
    console.log(`+ ${category}: created ${conversationId} — "${title}" (${description})`);
    created += 1;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    console.error(`FAILED for ${category}: ${error.message}`);
  }
}

await client.end();
console.log(`\nDONE — created ${created}, already present ${skipped}, total categories ${CATEGORIES.length}`);
