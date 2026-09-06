import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../neon/migrations/0019_account_delete_fk_semantics.sql'),
  'utf8',
);

const liveGate = readFileSync(
  resolve(process.cwd(), '../../scripts/neon-live-release-readiness.mjs'),
  'utf8',
);

function foreignKeyStatement(constraintName: string) {
  const escaped = constraintName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = migration.match(new RegExp(`add constraint ${escaped}[\\s\\S]*?;`, 'i'));
  if (!match) throw new Error(`MISSING_FK_STATEMENT:${constraintName}`);
  return match[0];
}

describe('account deletion migration contract', () => {
  it('anonymizes shared conversation and moderation actor references', () => {
    expect(migration).toContain('alter table public.conversations\n  alter column created_by drop not null');
    expect(foreignKeyStatement('conversations_created_by_fkey')).toMatch(/on delete set null/i);
    expect(migration).toContain('alter table public.group_bans\n  alter column banned_by drop not null');
    expect(foreignKeyStatement('group_bans_banned_by_fkey')).toMatch(/on delete set null/i);
  });

  it('removes deleted-user encrypted messages instead of orphaning identity', () => {
    const statement = foreignKeyStatement('messages_sender_user_id_fkey');
    expect(statement).toMatch(/on delete cascade/i);
    expect(statement).not.toMatch(/on delete set null/i);
  });

  it('keeps the live release gate aligned with every required deletion action', () => {
    expect(liveGate).toContain("fkMap.get('conversations_created_by_fkey') === 'n'");
    expect(liveGate).toContain("fkMap.get('messages_sender_user_id_fkey') === 'c'");
    expect(liveGate).toContain("fkMap.get('group_bans_banned_by_fkey') === 'n'");
    expect(liveGate).toContain('all public references to Neon Auth users are deletion-safe');
  });
});
