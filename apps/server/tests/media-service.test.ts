import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  query: mocks.query,
}));

// mediaService.js transitively imports config.js, which parses process.env
// eagerly at module load (schema.parse(process.env)) -- a static top-level
// import here crashed both locally and in CI with zero env vars configured
// (this test job sets none). Other test files avoid this by importing the
// module under test dynamically after presetting the env; mirrored here.
let buildMediaPresignUrl: (objectKey: string) => string;
let prepareMediaDownload: (
  userId: string,
  raw: unknown,
  options?: { apiKey?: string; fetchImpl?: typeof fetch },
) => Promise<unknown>;

beforeAll(async () => {
  process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/db';
  process.env.NEON_AUTH_BASE_URL ??= 'https://example.invalid/auth';
  process.env.NEON_AUTH_JWKS_URL ??= 'https://example.invalid/auth/.well-known/jwks.json';
  process.env.CORS_ORIGIN ??= 'https://example.invalid';
  process.env.NEON_API_KEY ??= 'test-neon-api-key-0000000000';
  ({ buildMediaPresignUrl, prepareMediaDownload } = await import('../src/mediaService.js'));
});

beforeEach(() => {
  mocks.query.mockReset();
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

  it('authorizes avatar download only through the active profile avatar and contact edge', async () => {
    const mediaId = '550e8400-e29b-41d4-a716-446655440030';
    const viewerId = '550e8400-e29b-41d4-a716-446655440031';
    mocks.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(
      prepareMediaDownload(viewerId, { mediaId }),
    ).rejects.toThrow('MEDIA_NOT_AUTHORIZED');

    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("m.purpose='avatar'");
    expect(sql).toContain('p.avatar_media_id=m.id');
    expect(sql).toContain('public.is_contact($2::uuid,p.id)');
    expect(sql).toContain('public.not_blocked($2::uuid,p.id)');
    expect(params).toEqual([mediaId, viewerId]);
  });
});
