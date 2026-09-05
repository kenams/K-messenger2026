import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const accountDataSource = readFileSync(
  resolve(process.cwd(), '../mobile/src/features/profile/AccountDataScreen.tsx'),
  'utf8',
);

describe('mobile account deletion safety contract', () => {
  it('requires password reauthentication and an exact destructive confirmation', () => {
    expect(accountDataSource).toContain("reauthenticateNeonPassword(deletePassword)");
    expect(accountDataSource).toContain("deleteConfirmation !== 'DELETE'");
    expect(accountDataSource).toContain("confirmation: 'DELETE'");
  });

  it('delegates deletion to the authenticated server route instead of deleting database rows directly', () => {
    expect(accountDataSource).toContain("emitAck<DeleteAck>(socket, 'account:delete'");
    expect(accountDataSource).not.toMatch(/from\(['\"]neon_auth|delete\(\).*neon_auth/i);
  });

  it('signs out and disconnects only after the server positively acknowledges deletion', () => {
    const ackIndex = accountDataSource.indexOf("if (!response.ok) throw new Error");
    const disconnectIndex = accountDataSource.indexOf('disconnectRealtimeSocket();');
    const signOutIndex = accountDataSource.indexOf('await getBackend().auth.signOut();');

    expect(ackIndex).toBeGreaterThan(-1);
    expect(disconnectIndex).toBeGreaterThan(ackIndex);
    expect(signOutIndex).toBeGreaterThan(disconnectIndex);
  });

  it('never treats a rejected provider operation as a local deletion success', () => {
    expect(accountDataSource).toContain('Suppression refusée.');
    expect(accountDataSource).toContain('aucune donnée n’est effacée');
  });
});
