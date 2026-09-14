import { z } from 'zod';

export const KSSENGER_NEON_AUTH_BASE_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
export const KSSENGER_NEON_AUTH_JWKS_URL = `${KSSENGER_NEON_AUTH_BASE_URL}/.well-known/jwks.json`;
export const KSSENGER_NEON_AUTH_AUDIENCE = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().positive().max(50).default(10),
  // Fail closed if a deployment is accidentally wired to another Neon Auth
  // project/branch. These are public service endpoints, not credentials.
  NEON_AUTH_BASE_URL: z.literal(KSSENGER_NEON_AUTH_BASE_URL),
  NEON_AUTH_JWKS_URL: z.literal(KSSENGER_NEON_AUTH_JWKS_URL),
  NEON_AUTH_AUDIENCE: z.literal(KSSENGER_NEON_AUTH_AUDIENCE).default(KSSENGER_NEON_AUTH_AUDIENCE),
  // Server-only Neon Console API token. Never expose this through an EXPO_PUBLIC variable.
  // Account self-delete remains unavailable until this secret is configured on the K-ssenger server.
  NEON_API_KEY: z.string().min(20).optional(),
  // K-Live (LiveKit Cloud, free tier). Optional: absent in dev/preview envs,
  // live:* socket handlers fail closed with LIVE_NOT_CONFIGURED rather than
  // crashing boot.
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  // Firebase service account (raw JSON), used to mint FCM HTTP v1 access
  // tokens directly — avoids depending on Expo's hosted push relay and its
  // interactive-only EAS credential upload. Optional: push sending fails
  // closed (logs a warning, never breaks messaging/realtime) without it.
  FCM_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
  // Comma-separated allowlist of exact https origins. Rejects "*" (which the
  // cors package would otherwise happily echo back even with credentials:
  // true, defeating same-origin protection for cookie/credentialed requests)
  // and any plain-http origin.
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(
      z
        .array(
          z
            .string()
            .url()
            .refine((origin) => origin !== '*', 'CORS_ORIGIN_WILDCARD_NOT_ALLOWED')
            .refine((origin) => new URL(origin).protocol === 'https:', 'CORS_ORIGIN_MUST_BE_HTTPS'),
        )
        .min(1),
    ),
});

export const config = schema.parse(process.env);
