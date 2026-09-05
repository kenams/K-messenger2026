import crypto from 'node:crypto';
import { createAuthClient } from '@neondatabase/neon-js/auth';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
if (!AUTH_URL) throw new Error('KSSENGER_AUTH_URL is required');

const stamp = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const email = `kssenger-delete-${stamp}@example.com`;
const password = `Kss!${crypto.randomBytes(18).toString('base64url')}`;
const auth = createAuthClient(AUTH_URL);

async function main() {
  const signup = await auth.signUp.email({
    email,
    password,
    name: 'K-ssenger Delete Smoke',
  });
  if (signup.error) throw new Error(`signup failed: ${signup.error.message}`);

  const session = await auth.getSession();
  if (session.error || !session.data?.user?.id) {
    throw new Error(`session failed: ${session.error?.message ?? 'missing user'}`);
  }
  const userId = session.data.user.id;
  console.log(`DELETE_SMOKE_USER_ID=${userId}`);

  const deletion = await auth.deleteUser({ password });
  if (deletion.error) throw new Error(`delete failed: ${deletion.error.message}`);

  const signin = await auth.signIn.email({ email, password });
  if (!signin.error) throw new Error('deleted user could still sign in');

  console.log('REMOTE_AUTH_DELETE_PASS=1');
}

main().catch((error) => {
  console.error(`REMOTE_AUTH_DELETE_FAILED=${error.message}`);
  process.exit(1);
});
