import type { Socket } from 'socket.io';
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { config } from './config.js';

type AccessTokenVerifier = (token: string) => Promise<string>;

export type NeonJwtAuthConfig = {
  baseUrl: string;
  jwksUrl: string;
  audience?: string;
};

const userIdSchema = z.string().uuid();

function issuerFromBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') throw new Error('INVALID_NEON_AUTH_BASE_URL');
  return url.origin;
}

function remoteJwks(jwksUrl: string): JWTVerifyGetKey {
  const url = new URL(jwksUrl);
  if (url.protocol !== 'https:') throw new Error('INVALID_NEON_AUTH_JWKS_URL');
  return createRemoteJWKSet(url);
}

export function createNeonJwtVerifier(
  authConfig: NeonJwtAuthConfig,
  keyResolver: JWTVerifyGetKey = remoteJwks(authConfig.jwksUrl),
): AccessTokenVerifier {
  const issuer = issuerFromBaseUrl(authConfig.baseUrl);
  const audience = authConfig.audience?.trim() || issuer;

  return async (token: string) => {
    if (token.length < 20 || token.length > 16_384) throw new Error('UNAUTHENTICATED');

    const { payload } = await jwtVerify(token, keyResolver, {
      issuer,
      audience,
      algorithms: ['EdDSA'],
      clockTolerance: 5,
    });

    if (payload.banned === true) throw new Error('UNAUTHENTICATED');

    const parsedUserId = userIdSchema.safeParse(payload.sub);
    if (!parsedUserId.success) throw new Error('UNAUTHENTICATED');
    return parsedUserId.data;
  };
}

let defaultVerifier: AccessTokenVerifier | undefined;

function getDefaultVerifier(): AccessTokenVerifier {
  defaultVerifier ??= createNeonJwtVerifier({
    baseUrl: config.NEON_AUTH_BASE_URL,
    jwksUrl: config.NEON_AUTH_JWKS_URL,
    audience: config.NEON_AUTH_AUDIENCE,
  });
  return defaultVerifier;
}

export async function authenticateFreshAccessToken(
  token: string,
  maxAgeSeconds = 300,
  verifyToken: AccessTokenVerifier = getDefaultVerifier(),
): Promise<string> {
  const userId = await verifyToken(token);
  const payload = decodeJwt(token);
  if (typeof payload.iat !== 'number') throw new Error('FRESH_AUTH_REQUIRED');
  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSeconds < -10 || ageSeconds > maxAgeSeconds) throw new Error('FRESH_AUTH_REQUIRED');
  return userId;
}

export async function authenticateSocket(
  socket: Socket,
  verifyToken: AccessTokenVerifier = getDefaultVerifier(),
): Promise<string> {
  const token = socket.handshake.auth?.accessToken;
  if (typeof token !== 'string') throw new Error('UNAUTHENTICATED');
  return verifyToken(token);
}
