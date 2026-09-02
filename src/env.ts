import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().default("3000").transform(Number),
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = EnvSchema.parse(process.env);

export const supabaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
if (!supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[env] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — running in-memory only, no offline persistence."
  );
}
