// One-time setup for K-Bot, Kenams's personal test contact (see
// apps/server/src/botStore.ts for the full design and security rationale).
//
// Why this script exists at all: profiles.id has a foreign key to
// neon_auth."user"(id), so K-Bot needs a real Neon Auth (better-auth)
// account before the server can create its profile/keys/friendship. The
// server intentionally does NOT mint auth accounts itself — only this
// explicit, one-time script does, exactly like the existing test-bot
// accounts created for scripts/kah-life-kickoff.mjs.
//
// Usage:
//   BOT_PASSWORD='<choose a strong password>' node scripts/create-test-bot.mjs
//
// Then copy the printed "TEST_BOT_USER_ID=..." value into the Render service
// env vars (kssenger-server) as TEST_BOT_USER_ID, and redeploy. The server's
// own bootstrap (botStore.ts) takes it from there on next boot: profile,
// NaCl keypair, device row, and the Kenams<->K-Bot mutual contact.
const AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const ORIGIN = 'https://k-ssenger.expo.app';
const BOT_EMAIL = process.env.BOT_EMAIL ?? 'k.bot@kah-digital.ch';
const BOT_PASSWORD = process.env.BOT_PASSWORD;
if (!BOT_PASSWORD) throw new Error('BOT_PASSWORD env var is required');

async function signUp() {
  const res = await fetch(`${AUTH_URL}/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD, name: 'K-Bot' }),
  });
  const json = await res.json().catch(() => null);
  if (res.ok && json?.user?.id) return json.user.id;
  // Already exists from a previous run: fall back to signing in to recover the id.
  if (res.status === 422 || /already exists|USER_ALREADY_EXISTS/i.test(JSON.stringify(json ?? {}))) {
    return signIn();
  }
  throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(json)}`);
}

async function signIn() {
  const res = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email: BOT_EMAIL, password: BOT_PASSWORD }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.user?.id) throw new Error(`sign-in failed: ${res.status} ${JSON.stringify(json)}`);
  return json.user.id;
}

const botUserId = await signUp();
console.log(`K-Bot Neon Auth account ready.`);
console.log(`TEST_BOT_USER_ID=${botUserId}`);
console.log(`\nNext: set TEST_BOT_USER_ID (and optionally TEST_BOT_OWNER_EMAIL, default kenams42@gmail.com) on the Render kssenger-server service, then redeploy.`);
