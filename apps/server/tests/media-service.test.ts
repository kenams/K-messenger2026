import { beforeAll, describe, expect, it } from 'vitest';

// mediaService.js transitively imports config.js, which parses process.env
// eagerly at module load (schema.parse(process.env)) -- a static top-level
// import here crashed both locally and in CI with zero env vars configured
// (this test job sets none). Other test files avoid this by importing the
// module under test dynamically after presetting the env; mirrored here.
let buildMediaPresignUrl: (objectKey: string) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/db';
  process.env.NEON_AUTH_BASE_URL ??= 'https://example.invalid/auth';
  process.env.NEON_AUTH_JWKS_URL ??= 'https://example.invalid/auth/.well-known/jwks.json';
  process.env.CORS_ORIGIN ??= 'https://example.invalid';
  ({ buildMediaPresignUrl } = await import('../src/mediaService.js'));
});

describe('media provider URL construction', () => {
  it('encodes the full nested object key as one Neon route segment', () => {
    const url = buildMediaPresignUrl('00000000-0000-4000-8000-000000000001/avatar/00000000-0000-4000-8000-000000000002.jpg');

    expect(url).toContain('/objects/00000000-0000-4000-8000-000000000001%2Favatar%2F00000000-0000-4000-8000-000000000002.jpg/presign');
    expect(url).not.toContain('/objects/00000000-0000-4000-8000-000000000001/avatar/');
  });

  it('rejects malformed or traversal-like keys before calling Neon', () => {
    expect(() => buildMediaPresignUrl('')).toThrow('MEDIA_OBJECT_KEY_INVALID');
    expect(() => buildMediaPresignUrl('/avatar/file.jpg')).toThrow('MEDIA_OBJECT_KEY_INVALID');
    expect(() => buildMediaPresignUrl('user/../secret')).toThrow('MEDIA_OBJECT_KEY_INVALID');
  });
});
