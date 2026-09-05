import crypto from 'node:crypto';
import { BetterAuthVanillaAdapter, createClient } from '@neondatabase/neon-js';

const AUTH_URL = process.env.KSSENGER_AUTH_URL;
const DATA_API_URL = process.env.KSSENGER_DATA_API_URL;
if (!AUTH_URL || !DATA_API_URL) throw new Error('KSSENGER_AUTH_URL and KSSENGER_DATA_API_URL are required');

const auth = createClient({
  auth: { adapter: BetterAuthVanillaAdapter(), url: AUTH_URL },
  dataApi: { url: DATA_API_URL },
});

const stamp = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const email = `kssenger-self-delete-${stamp}@example.com`;
const password = `Kss!${crypto.randomBytes(20).toString('base64url')}`;

const signup = await auth.auth.signUp.email({
  email,
  password,
  name: 'K-ssenger Self Delete Probe',
});
if (signup.error) throw new Error(`SELF_DELETE_SIGNUP_FAILED:${signup.error.message}`);

const session = await auth.auth.getSession();
const userId = session.data?.user?.id ?? signup.data?.user?.id;
if (!userId) throw new Error('SELF_DELETE_USER_ID_MISSING');
console.log(`SELF_DELETE_PROBE_USER=${userId}`);

const deleted = await auth.auth.deleteUser({ password });
if (deleted.error) throw new Error(`SELF_DELETE_FAILED:${deleted.error.message}`);

const signinAfterDelete = await auth.auth.signIn.email({ email, password });
if (!signinAfterDelete.error) throw new Error('SELF_DELETE_ACCOUNT_STILL_AUTHENTICATES');

console.log('NEON_AUTH_SELF_DELETE_PASS=true');
