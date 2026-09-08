import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => {
  const rows: Record<string, unknown>[] = [];
  return {
    query: vi.fn(async (_text: string, values: unknown[] = []) => {
      const text = _text as string;
      if (text.includes('insert into public.device_links')) {
        const row = { id: 'link-1', user_id: values[0], status: 'pending', web_public_key: values[1], phone_public_key: null };
        rows.push(row);
        return { rows: [{ id: row.id }], rowCount: 1 };
      }
      if (text.includes("select 1 from public.device_links where user_id")) {
        return { rows: [], rowCount: rows.filter((r) => r.user_id === values[0] && r.status === 'pending').length };
      }
      if (text.includes("set status = 'approved'")) {
        const row = rows.find((r) => r.id === values[0] && r.user_id === values[1] && r.status === 'pending');
        if (!row) return { rows: [], rowCount: 0 };
        row.status = 'approved';
        row.phone_public_key = values[2];
        return { rows: [row], rowCount: 1 };
      }
      if (text.includes("set status = 'revoked'")) {
        const row = rows.find((r) => r.id === values[0] && r.user_id === values[1] && r.status !== 'revoked');
        if (!row) return { rows: [], rowCount: 0 };
        row.status = 'revoked';
        return { rows: [{ id: row.id }], rowCount: 1 };
      }
      if (text.trim().startsWith('select id, user_id, status')) {
        const row = rows.find((r) => r.id === values[0] && r.user_id === values[1] && r.status === 'approved');
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      throw new Error(`unmocked query: ${text}`);
    }),
  };
});

const { initDeviceLink, approveDeviceLink, revokeDeviceLink, requireApprovedLinkOwner } = await import('../src/deviceLinkStore.js');

describe('device link store', () => {
  it('creates a pending link for the initiating user only', async () => {
    const { linkId } = await initDeviceLink('user-a', 'web-pub-key');
    expect(linkId).toBeTruthy();
  });

  it('rejects approving a link that does not belong to the caller', async () => {
    const { linkId } = await initDeviceLink('user-b', 'web-pub-key-2');
    await expect(approveDeviceLink('user-attacker', linkId, 'phone-pub-key')).rejects.toThrow('LINK_NOT_PENDING');
  });

  it('approves a link for its owner and exposes it as approved', async () => {
    const { linkId } = await initDeviceLink('user-c', 'web-pub-key-3');
    const approved = await approveDeviceLink('user-c', linkId, 'phone-pub-key-3');
    expect(approved.status).toBe('approved');
    const owned = await requireApprovedLinkOwner('user-c', linkId);
    expect(owned.id).toBe(linkId);
  });

  it('rejects relaying through a link that was never approved', async () => {
    const { linkId } = await initDeviceLink('user-d', 'web-pub-key-4');
    await expect(requireApprovedLinkOwner('user-d', linkId)).rejects.toThrow('LINK_NOT_APPROVED');
  });

  it('rejects reading an approved link as a different user', async () => {
    const { linkId } = await initDeviceLink('user-e', 'web-pub-key-5');
    await approveDeviceLink('user-e', linkId, 'phone-pub-key-5');
    await expect(requireApprovedLinkOwner('user-attacker', linkId)).rejects.toThrow('LINK_NOT_APPROVED');
  });

  it('revokes a link so it can no longer be used', async () => {
    const { linkId } = await initDeviceLink('user-f', 'web-pub-key-6');
    await approveDeviceLink('user-f', linkId, 'phone-pub-key-6');
    await revokeDeviceLink('user-f', linkId);
    await expect(requireApprovedLinkOwner('user-f', linkId)).rejects.toThrow('LINK_NOT_APPROVED');
  });
});
