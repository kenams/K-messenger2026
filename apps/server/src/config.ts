import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NEON_AUTH_JWKS_URL: z.string().url(),
  NEON_AUTH_ISSUER: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  CORS_ORIGIN: z.string().min(1),
});

export const config = schema.parse(process.env);
