# Database Decision - Superseded 2026-09-03

## Current Decision

K-ssenger targets the dedicated Neon/Lakebase Postgres backend only:

- Neon project: `K-ssenger`
- project id/name in handoff: `late-flower-65059830`
- database: `kssenger`
- auth: Neon Auth / Managed Better Auth
- client direct data path: Neon Data API with RLS
- server runtime path: parameterized Postgres SQL after server-side JWT authentication and authorization checks

No Supabase project, service-role key or runtime client is part of the current target backend.

## Historical Note

An earlier 2026-09-03 decision said to stay on Supabase because no dedicated Neon infrastructure had been found at that time. That finding is no longer current. Later verified project state identified a dedicated K-ssenger Neon backend and the active branch began migrating to it.

The historical Supabase migrations remain in the repository only as legacy implementation history until the team decides whether to archive or remove them.

## Guardrail

Do not reuse or modify any backend from another project. If Neon credentials are unavailable in an execution environment, document that blocker and continue only with local isolated validation or code changes that do not touch remote data.
