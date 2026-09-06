import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../neon/migrations/0017_block_revokes_kmap_shares.sql', import.meta.url),
  'utf8',
);

describe('K-MAP block invariant', () => {
  it('revokes active location shares in both directions after a block', () => {
    expect(migration).toContain('after insert on public.blocks');
    expect(migration).toContain('owner_id = new.blocker_id and recipient_user_id = new.blocked_id');
    expect(migration).toContain('owner_id = new.blocked_id and recipient_user_id = new.blocker_id');
    expect(migration).toContain('set revoked_at = coalesce(revoked_at, now())');
  });

  it('matches the live schema and never hard-deletes historical K-MAP shares', () => {
    expect(migration).not.toMatch(/(^|[^a-z_])user_id\s*=\s*new\.blocker_id/im);
    expect(migration).not.toMatch(/(^|[^a-z_])visible_to\s*=\s*new\.blocked_id/im);
    expect(migration).not.toMatch(/delete\s+from\s+public\.location_shares/i);
  });

  it('keeps the trigger helper non-invokable by public callers', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path = pg_catalog, public');
    expect(migration).toContain('revoke all on function public.revoke_location_shares_on_block() from public');
  });
});
