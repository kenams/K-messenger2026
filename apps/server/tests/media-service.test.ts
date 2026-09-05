import { describe, expect, it } from 'vitest';
import { buildMediaPresignUrl } from '../src/mediaService.js';

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
