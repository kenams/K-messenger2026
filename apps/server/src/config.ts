import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  NEON_AUTH_BASE_URL: z.string().url(),
  NEON_AUTH_JWKS_URL: z.string().url(),
  NEON_AUTH_AUDIENCE: z.string().min(1).optional(),
  // Server-only Neon Console API token. Never expose this through an EXPO_PUBLIC variable.
  // Account self-delete remains unavailable until this secret is configured on the K-ssenger server.
  NEON_API_KEY: z.string().min(20).optional(),
  CORS_ORIGIN: z.string().min(1),
});

export const config = schema.parse(process.env);
