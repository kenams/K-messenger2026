import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSource = readFileSync(
  resolve(process.cwd(), '../../neon/migrations/0018_contact_removal_revokes_kmap_shares.sql'),
  'utf8',
);

describe('K-MAP contact-removal trigger privilege contract', () => {
  it('keeps the SECURITY DEFINER trigger function unavailable to API roles', () => {
    expect(migrationSource).toContain('security definer');
    expect(migrationSource).toContain(
      'revoke all on function public.revoke_location_shares_on_contact_removal() from public;',
    );
    expect(migrationSource).toContain(
      'revoke all on function public.revoke_location_shares_on_contact_removal() from authenticated;',
    );
  });
});
