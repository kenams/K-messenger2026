import { z } from 'zod';

export const KSSENGER_NEON_AUTH_BASE_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
export const KSSENGER_NEON_AUTH_JWKS_URL = `${KSSENGER_NEON_AUTH_BASE_URL}/.well-known/jwks.json`;

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  // Fail closed if a deployment is accidentally wired to another Neon Auth
  // project/branch. These are public service endpoints, not credentials.
  NEON_AUTH_BASE_URL: z.literal(KSSENGER_NEON_AUTH_BASE_URL),
  NEON_AUTH_JWKS_URL: z.literal(KSSENGER_NEON_AUTH_JWKS_URL),
  NEON_AUTH_AUDIENCE: z.string().min(1).optional(),
  // Server-only Neon Console API token. Never expose this through an EXPO_PUBLIC variable.
  // Account self-delete remains unavailable until this secret is configured on the K-ssenger server.
  NEON_API_KEY: z.string().min(20).optional(),
  CORS_ORIGIN: z.string().min(1),
});

export const config = schema.parse(process.env);
