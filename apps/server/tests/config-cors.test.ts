import { afterEach, describe, expect, it, vi } from 'vitest';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:password@db.example/kssenger?sslmode=require',
  NEON_AUTH_BASE_URL: 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth',
  NEON_AUTH_JWKS_URL:
    'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth/.well-known/jwks.json',
};

async function loadConfig(corsOrigin: string) {
  vi.resetModules();
  for (const [key, value] of Object.entries(baseEnv)) vi.stubEnv(key, value);
  vi.stubEnv('CORS_ORIGIN', corsOrigin);
  return import('../src/config.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CORS_ORIGIN configuration', () => {
  it('accepts a single https origin', async () => {
    const { config } = await loadConfig('https://kssenger.example.com');
    expect(config.CORS_ORIGIN).toEqual(['https://kssenger.example.com']);
  });

  it('accepts a comma-separated allowlist of https origins', async () => {
    const { config } = await loadConfig('https://a.example.com, https://b.example.com');
    expect(config.CORS_ORIGIN).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('rejects a wildcard origin', async () => {
    await expect(loadConfig('*')).rejects.toThrow();
  });

  it('rejects a plain-http origin', async () => {
    await expect(loadConfig('http://kssenger.example.com')).rejects.toThrow();
  });

  it('rejects a malformed origin', async () => {
    await expect(loadConfig('not-a-url')).rejects.toThrow();
  });
});
