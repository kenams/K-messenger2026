import fs from 'node:fs/promises';
import pg from 'pg';

const DB_URL = process.env.DB_URL;
if (!DB_URL) throw new Error('DB_URL is required');

const client = new pg.Client({ connectionString: DB_URL });
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
let pass = 0;
let fail = 0;
function check(name, ok) { if (ok) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }
async function asUser(userId, fn) { await client.query('begin'); await client.query('set local role authenticated'); await client.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub:userId, role:'authenticated' })]); try { return await fn(); } finally { await client.query('rollback'); } }
async function blocked(fn) { try { await fn(); return false; } catch { return true; } }

async function main() {
  await client.connect();
  await client.query(await fs.readFile('neon/migrations/0010_media_objects.sql','utf8'));
  await client.query(await fs.readFile('neon/migrations/0013_media_content_bindings.sql','utf8'));

  const aliceAvatarKey = `${ALICE}/avatar/ci.jpg`;
  await asUser(ALICE, async () => {
    const inserted = await client.query(`insert into public.media_objects(owner_id,object_key,purpose,mime_type,byte_size) values($1,$2,'avatar','image/jpeg',2048) returning status`, [ALICE,aliceAvatarKey]);
    check('owner registers own pending media', inserted.rows[0]?.status === 'pending');
    check('owner reads own media metadata', (await client.query('select id from public.media_objects where object_key=$1',[aliceAvatarKey])).rows.length === 1);
    check('client cannot promote media to ready', await blocked(() => client.query(`update public.media_objects set status='ready' where object_key=$1`,[aliceAvatarKey])));
    check('owner prefix is enforced', await blocked(() => client.query(`insert into public.media_objects(owner_id,object_key,purpose,mime_type,byte_size) values($1,$2,'avatar','image/jpeg',2048)`,[ALICE,`${BOB}/avatar/wrong-prefix.jpg`])));
  });

  await client.query(`insert into public.media_objects(owner_id,object_key,purpose,mime_type,byte_size,status) values($1,$2,'avatar','image/jpeg',2048,'ready') on conflict(object_key) do update set status='ready'`, [ALICE,aliceAvatarKey]);
  const avatarId = (await client.query('select id from public.media_objects where object_key=$1',[aliceAvatarKey])).rows[0].id;
  await asUser(ALICE, async () => {
    check('profile can bind own ready avatar', !(await blocked(() => client.query('update public.profiles set avatar_media_id=$1 where id=$2',[avatarId,ALICE]))));
  });
  await asUser(BOB, async () => {
    check('other user cannot read private media metadata', (await client.query('select id from public.media_objects where object_key=$1',[aliceAvatarKey])).rows.length === 0);
    check('other user cannot register media as owner', await blocked(() => client.query(`insert into public.media_objects(owner_id,object_key,purpose,mime_type,byte_size) values($1,$2,'avatar','image/jpeg',2048)`,[ALICE,`${ALICE}/avatar/other-user.jpg`])));
    check('profile cannot bind another owner avatar', await blocked(() => client.query('update public.profiles set avatar_media_id=$1 where id=$2',[avatarId,BOB])));
  });

  const aliceClipKey = `${ALICE}/kfeed/ci.mp4`;
  const bobClipKey = `${BOB}/kfeed/ci.mp4`;
  const aliceMomentKey = `${ALICE}/moment/ci.jpg`;
  await client.query(`insert into public.media_objects(owner_id,object_key,purpose,mime_type,byte_size,status) values
    ($1,$2,'kfeed','video/mp4',4096,'ready'),($3,$4,'kfeed','video/mp4',4096,'ready'),($1,$5,'moment','image/jpeg',2048,'ready')
    on conflict(object_key) do update set status='ready'`, [ALICE,aliceClipKey,BOB,bobClipKey,aliceMomentKey]);
  const ids = await client.query('select object_key,id from public.media_objects where object_key=any($1::text[])', [[aliceClipKey,bobClipKey,aliceMomentKey]]);
  const byKey = new Map(ids.rows.map((row) => [row.object_key,row.id]));

  await asUser(ALICE, async () => {
    const clipId = byKey.get(aliceClipKey);
    const ownClip = await client.query(`insert into public.public_videos(owner_id,storage_path,media_object_id,caption) values($1,'https://attacker.invalid/raw.mp4',$2,'ci') returning storage_path`, [ALICE,clipId]);
    check('K-Feed accepts own ready kfeed object', ownClip.rows[0]?.storage_path === `media:${clipId}`);
    check('K-Feed rejects another owner media object', await blocked(() => client.query(`insert into public.public_videos(owner_id,storage_path,media_object_id,caption) values($1,'raw',$2,'ci')`,[ALICE,byKey.get(bobClipKey)])));
    check('K-Feed rejects arbitrary path without verified media', await blocked(() => client.query(`insert into public.public_videos(owner_id,storage_path,caption) values($1,'https://attacker.invalid/raw.mp4','ci')`,[ALICE])));

    const momentId = byKey.get(aliceMomentKey);
    const ownMoment = await client.query(`insert into public.moments(author_id,kind,caption,media_url,media_object_id,visibility) values($1,'photo','ci','https://attacker.invalid/raw.jpg',$2,'friends') returning media_url`,[ALICE,momentId]);
    check('Moment rewrites arbitrary URL to verified media reference', ownMoment.rows[0]?.media_url === `media:${momentId}`);
    check('text Moment forbids attached media object', await blocked(() => client.query(`insert into public.moments(author_id,kind,caption,media_object_id,visibility) values($1,'text','ci',$2,'friends')`,[ALICE,momentId])));
  });

  await client.query('update public.profiles set avatar_media_id=null where id in ($1,$2)', [ALICE,BOB]);
  await client.query(`delete from public.public_videos where caption='ci' and owner_id=$1`,[ALICE]);
  await client.query(`delete from public.moments where caption='ci' and author_id=$1`,[ALICE]);
  await client.query('delete from public.media_objects where object_key=any($1::text[])', [[aliceAvatarKey,aliceClipKey,bobClipKey,aliceMomentKey]]);
  console.log(`\n${pass} passed, ${fail} failed`);
  await client.end();
  if (fail) process.exit(1);
}

main().catch(async (error) => { console.error(error); try { await client.end(); } catch {} process.exit(1); });
