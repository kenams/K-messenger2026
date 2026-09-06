import type { Socket } from 'socket.io';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from 'jose';

const baseUrl = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const issuer = new URL(baseUrl).origin;
const jwksUrl = `${baseUrl}/.well-known/jwks.json`;
const userId = '550e8400-e29b-41d4-a716-446655440000';
const otherUserId = '550e8400-e29b-41d4-a716-446655440001';

type TokenOptions = {
  issuer?: string;
  audience?: string;
  sub?: string;
};

async function signedToken(options: TokenOptions = {}): Promise<{ token: string; jwks: JWTVerifyGetKey }> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'kssenger-test-key';
  publicJwk.alg = 'EdDSA';

  const token = await new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'EdDSA', kid: publicJwk.kid })
    .setSubject(options.sub ?? userId)
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? issuer)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(privateKey);

  return {
    token,
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
  };
}

async function importAuthModule() {
  vi.resetModules();
  vi.stubEnv('NEON_AUTH_BASE_URL', baseUrl);
  vi.stubEnv('NEON_AUTH_JWKS_URL', jwksUrl);
  vi.stubEnv('DATABASE_URL', 'postgresql://user:password@db.example/kssenger?sslmode=require');
  vi.stubEnv('CORS_ORIGIN', 'http://localhost:8081');
  return import('../src/auth.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Neon socket JWT authentication', () => {
  it('extracts the socket identity from a verified Neon Auth token', async () => {
    const { token, jwks } = await signedToken();
    const { createNeonJwtVerifier } = await importAuthModule();

    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, jwks);

    await expect(verifier(token)).resolves.toBe(userId);
  });

  it('ignores a client-provided userId during socket authentication', async () => {
    const { token, jwks } = await signedToken();
    const { authenticateSocket, createNeonJwtVerifier } = await importAuthModule();
    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, jwks);
    const socket = {
      handshake: { auth: { accessToken: token, userId: otherUserId } },
    } as unknown as Socket;

    await expect(authenticateSocket(socket, verifier)).resolves.toBe(userId);
  });

  it('rejects malformed tokens', async () => {
    const { jwks } = await signedToken();
    const { createNeonJwtVerifier } = await importAuthModule();
    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, jwks);

    await expect(verifier('not-a-valid-jwt')).rejects.toThrow();
  });

  it('rejects tokens with an invalid signature', async () => {
    const { token } = await signedToken();
    const { jwks: unrelatedJwks } = await signedToken({ sub: otherUserId });
    const { createNeonJwtVerifier } = await importAuthModule();
    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, unrelatedJwks);

    await expect(verifier(token)).rejects.toThrow();
  });

  it('rejects tokens from the wrong issuer', async () => {
    const { token, jwks } = await signedToken({ issuer: 'https://attacker.example' });
    const { createNeonJwtVerifier } = await importAuthModule();
    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, jwks);

    await expect(verifier(token)).rejects.toThrow();
  });

  it('rejects tokens for the wrong audience', async () => {
    const { token, jwks } = await signedToken({ audience: 'https://attacker.example' });
    const { createNeonJwtVerifier } = await importAuthModule();
    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, jwks);

    await expect(verifier(token)).rejects.toThrow();
  });

  it('rejects non-UUID subjects before assigning a socket identity', async () => {
    const { token, jwks } = await signedToken({ sub: 'not-a-uuid' });
    const { createNeonJwtVerifier } = await importAuthModule();
    const verifier = createNeonJwtVerifier({ baseUrl, jwksUrl }, jwks);

    await expect(verifier(token)).rejects.toThrow('UNAUTHENTICATED');
  });

  it('fails closed when Neon Auth URLs are not HTTPS', async () => {
    const { createNeonJwtVerifier } = await importAuthModule();

    expect(() => createNeonJwtVerifier({ baseUrl: 'http://auth.example', jwksUrl })).toThrow(
      'INVALID_NEON_AUTH_BASE_URL',
    );
    expect(() => createNeonJwtVerifier({ baseUrl, jwksUrl: 'http://auth.example/jwks.json' })).toThrow(
      'INVALID_NEON_AUTH_JWKS_URL',
    );
  });
});
