# Database decision — 2026-09-03

## Finding: no dedicated Neon/raw-Postgres K-ssenger infra exists
Searched the full repo (all files, all git history) for `NEON`, `DATABASE_URL`, `PGHOST`, `PGDATABASE`, `POSTGRES` — zero matches anywhere. `apps/server/src/config.ts` requires exactly two DB-related env vars: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The entire platform (auth, RLS, schema, K-MAP, K-Feed) is built Supabase-native from commit 1.

**dedicated K-ssenger DB not found** (Neon or otherwise) — nothing to connect to, nothing to migrate away from. No existing infra was touched or repurposed.

## A vs B vs C
| | A. Supabase | B. Neon + separate auth/storage | C. Hybrid |
|---|---|---|---|
| Mobile auth | built-in, already coded (`auth.ts`) | build from scratch | partial rebuild |
| RLS | built-in, already coded (11 migrations) | Neon has no RLS/auth layer — reimplement authz in app code | mixed authz model, more surface for bugs |
| Realtime | built-in (used for presence/contacts) | not available, need a separate service | mixed |
| Storage (K-Feed video/images) | built-in | separate service (S3-compatible) needed | mixed |
| Cost/complexity for a beta | low — one provider | higher — Postgres + auth + storage + realtime as separate pieces | highest — worst of both |
| Time to working beta | fastest (already built) | slowest (rebuild auth+RLS+realtime+storage) | slow |

## Decision
**Stay on Supabase.** There is no existing Neon deployment to justify a switch, and moving now would mean re-implementing auth, 11 migrations' worth of RLS, realtime presence, and storage from scratch for zero found benefit. Revisit only if a concrete Supabase limitation blocks the beta (none identified so far).
