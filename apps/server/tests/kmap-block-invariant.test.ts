import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../neon/migrations/0017_block_revokes_kmap_shares.sql', import.meta.url),
  'utf8',
);

describe('K-MAP block invariant', () => {
  it('revokes active location shares in both directions after a block', () => {
    expect(migration).toContain('after insert on public.blocks');
    expect(migration).toContain('user_id = new.blocker_id and visible_to = new.blocked_id');
    expect(migration).toContain('user_id = new.blocked_id and visible_to = new.blocker_id');
  });

  it('keeps the trigger helper non-invokable by public callers', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain('revoke all on function public.revoke_kmap_shares_on_block() from public');
  });
});
