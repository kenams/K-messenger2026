import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const groupStore = readFileSync(
  resolve(process.cwd(), 'src/groupStore.ts'),
  'utf8',
);

describe('group block privacy contract', () => {
  it('rejects a new group when any proposed participant pair is blocked', () => {
    expect(groupStore).toContain('const participantIds = [ownerId, ...memberIds]');
    expect(groupStore).toMatch(/blocker_id = any\(\$1::uuid\[\]\)/);
    expect(groupStore).toMatch(/blocked_id = any\(\$1::uuid\[\]\)/);
    expect(groupStore).toContain("throw new Error('GROUP_MEMBER_BLOCKED')");
  });

  it('keeps post-creation invitations protected against blocks with existing members', () => {
    expect(groupStore).toContain('b.blocker_id = $2');
    expect(groupStore).toContain('b.blocked_id in (select user_id from public.conversation_members where conversation_id = $1)');
    expect(groupStore).toContain('b.blocked_id = $2');
    expect(groupStore).toContain('b.blocker_id in (select user_id from public.conversation_members where conversation_id = $1)');
  });
});
