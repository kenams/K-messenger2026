import { afterEach, describe, expect, it, vi } from 'vitest';

const authBaseUrl = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const authJwksUrl = `${authBaseUrl}/.well-known/jwks.json`;

async function importModule() {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', 'postgresql://user:password@db.example/kssenger?sslmode=require');
  vi.stubEnv('NEON_AUTH_BASE_URL', authBaseUrl);
  vi.stubEnv('NEON_AUTH_JWKS_URL', authJwksUrl);
  vi.stubEnv('CORS_ORIGIN', 'http://localhost:8081');
  return import('../src/accountDeletion.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('K-ssenger Neon account deletion provider scope', () => {
  it('deletes only through the hard-coded K-ssenger project and branch route', async () => {
    const { deleteKssengerAuthUser, KSSENGER_ACCOUNT_DELETE_SCOPE } = await importModule();
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(url).toBe(`https://console.neon.tech/api/v2/projects/${KSSENGER_ACCOUNT_DELETE_SCOPE.projectId}/branches/${KSSENGER_ACCOUNT_DELETE_SCOPE.branchId}/auth/users/${userId}`);
      expect(init?.method).toBe('DELETE');
      expect(init?.headers).toMatchObject({ authorization: 'Bearer kssenger-test-management-key' });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await expect(deleteKssengerAuthUser(userId, {
      apiKey: 'kssenger-test-management-key',
      fetchImpl,
    })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the server management credential is absent', async () => {
    const { deleteKssengerAuthUser } = await importModule();
    await expect(deleteKssengerAuthUser('550e8400-e29b-41d4-a716-446655440000', {
      apiKey: undefined,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })).rejects.toThrow('ACCOUNT_DELETE_PROVIDER_NOT_CONFIGURED');
  });

  it('fails closed on a non-success provider response', async () => {
    const { deleteKssengerAuthUser } = await importModule();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;
    await expect(deleteKssengerAuthUser('550e8400-e29b-41d4-a716-446655440000', {
      apiKey: 'kssenger-test-management-key',
      fetchImpl,
    })).rejects.toThrow('ACCOUNT_DELETE_PROVIDER_403');
  });
});
