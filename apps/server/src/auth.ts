import type { Socket } from 'socket.io';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';

const neonJwks = createRemoteJWKSet(new URL(config.NEON_AUTH_JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
  timeoutDuration: 5_000,
});

export async function verifyNeonAccessToken(token: string): Promise<string> {
  if (token.length < 20 || token.length > 16_384) throw new Error('UNAUTHENTICATED');

  try {
    const { payload } = await jwtVerify(token, neonJwks, {
      issuer: config.NEON_AUTH_ISSUER,
      algorithms: ['RS256', 'ES256', 'EdDSA'],
      clockTolerance: 5,
    });

    if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 255) {
      throw new Error('UNAUTHENTICATED');
    }

    return payload.sub;
  } catch {
    throw new Error('UNAUTHENTICATED');
  }
}

export async function authenticateSocket(socket: Socket): Promise<string> {
  const token = socket.handshake.auth?.accessToken;
  if (typeof token !== 'string') throw new Error('UNAUTHENTICATED');
  return verifyNeonAccessToken(token);
}
