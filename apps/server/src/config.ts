import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  NEON_AUTH_BASE_URL: z.string().url(),
  NEON_AUTH_JWKS_URL: z.string().url(),
  NEON_AUTH_AUDIENCE: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().min(1),
});

export const config = schema.parse(process.env);
