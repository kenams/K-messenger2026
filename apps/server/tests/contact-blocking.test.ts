import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  requireNotBlocked: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock('../src/authorization.js', () => ({
  requireNotBlocked: mocks.requireNotBlocked,
}));

import { listBlockedUsers, unblockUser } from '../src/social.js';

const ownerId = '550e8400-e29b-41d4-a716-446655440040';
const blockedId = '550e8400-e29b-41d4-a716-446655440041';

describe('contact block lifecycle', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.transaction.mockReset();
    mocks.requireNotBlocked.mockReset();
  });

  it('lists only rows owned by the authenticated blocker', async () => {
    const rows = [{
      id: blockedId,
      username: 'retrofriend',
      display_name: 'Retro Friend',
      avatar_url: null,
      blocked_at: '2026-09-05T00:00:00.000Z',
    }];
    mocks.query.mockResolvedValueOnce({ rows, rowCount: rows.length });

    await expect(listBlockedUsers(ownerId)).resolves.toEqual(rows);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain('where b.blocker_id = $1');
    expect(sql).toContain('join public.profiles p on p.id = b.blocked_id');
    expect(params).toEqual([ownerId]);
  });

  it('unblocks only the authenticated owner to blocked-user edge', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(unblockUser(ownerId, blockedId)).resolves.toBeUndefined();

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain('delete from public.blocks');
    expect(sql).toContain('where blocker_id = $1');
    expect(sql).toContain('and blocked_id = $2');
    expect(params).toEqual([ownerId, blockedId]);
  });

  it('fails closed when the authenticated owner has no matching block edge', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(unblockUser(ownerId, blockedId)).rejects.toThrow('BLOCK_NOT_FOUND');
  });

  it('rejects self-unblock without touching the database', async () => {
    await expect(unblockUser(ownerId, ownerId)).rejects.toThrow('SELF_BLOCK');
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
