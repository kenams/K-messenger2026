import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { query } from './db.js';
import { requireConversationMember, requireConversationNotBlocked } from './authorization.js';

const KSSENGER_NEON_PROJECT_ID = 'late-flower-65059830';
const KSSENGER_NEON_BRANCH_ID = 'br-falling-sea-b1k36u32';
const KSSENGER_MEDIA_BUCKET = 'kssenger-media';
const NEON_API_BASE = 'https://console.neon.tech/api/v2';
const MAX_MEDIA_BYTES = 104_857_600;

const mimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']);
const purposeSchema = z.enum(['avatar', 'chat', 'kfeed', 'moment']);

export const mediaPrepareSchema = z.object({
  purpose: purposeSchema,
  mimeType: mimeSchema,
  byteSize: z.number().int().positive().max(MAX_MEDIA_BYTES),
  conversationId: z.string().uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.purpose === 'chat' && !value.conversationId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversationId'], message: 'CHAT_CONVERSATION_REQUIRED' });
  if (value.purpose !== 'chat' && value.conversationId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conversationId'], message: 'CONVERSATION_NOT_ALLOWED' });
});
export const mediaCompleteSchema = z.object({ mediaId: z.string().uuid() }).strict();

const extensionByMime: Record<z.infer<typeof mimeSchema>, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
};
type FetchLike = typeof fetch;
type MediaRow = { id: string; owner_id: string; object_key: string; purpose: z.infer<typeof purposeSchema>; conversation_id: string | null; mime_type: z.infer<typeof mimeSchema>; byte_size: string | number; status: 'pending' | 'ready' | 'quarantined' | 'deleted' };

function requireManagementKey(apiKey?: string) {
  const key = apiKey ?? config.NEON_API_KEY;
  if (!key) throw new Error('MEDIA_PROVIDER_NOT_CONFIGURED');
  return key;
}

async function presignObject(objectKey: string, operation: 'upload' | 'download', contentType: string | undefined, apiKey?: string, fetchImpl: FetchLike = fetch) {
  const key = requireManagementKey(apiKey);
  const url = `${NEON_API_BASE}/projects/${KSSENGER_NEON_PROJECT_ID}/branches/${KSSENGER_NEON_BRANCH_ID}/buckets/${KSSENGER_MEDIA_BUCKET}/objects/${objectKey.split('/').map(encodeURIComponent).join('/')}/presign`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ operation, ...(contentType ? { content_type: contentType } : {}), expires_in_seconds: operation === 'upload' ? 300 : 60 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`MEDIA_PRESIGN_PROVIDER_${response.status}`);
  const parsed = z.object({ url: z.string().url(), method: z.string().min(1), headers: z.record(z.string(), z.string()).default({}), expires_at: z.string().min(1) }).parse(await response.json());
  if (operation === 'upload' && parsed.method.toUpperCase() !== 'PUT') throw new Error('MEDIA_UPLOAD_METHOD_UNEXPECTED');
  return parsed;
}

async function authorizePurpose(userId: string, purpose: z.infer<typeof purposeSchema>, conversationId?: string | null) {
  if (purpose !== 'chat') return;
  if (!conversationId) throw new Error('CHAT_CONVERSATION_REQUIRED');
  await requireConversationMember(userId, conversationId);
  await requireConversationNotBlocked(userId, conversationId);
}

export async function prepareMediaUpload(userId: string, raw: unknown, options: { apiKey?: string; fetchImpl?: FetchLike } = {}) {
  const request = mediaPrepareSchema.parse(raw);
  await authorizePurpose(userId, request.purpose, request.conversationId);
  requireManagementKey(options.apiKey);
  const mediaId = randomUUID();
  const objectKey = `${userId}/${request.purpose}/${mediaId}.${extensionByMime[request.mimeType]}`;
  await query(`insert into public.media_objects (id,owner_id,object_key,purpose,conversation_id,mime_type,byte_size,status) values ($1,$2,$3,$4,$5,$6,$7,'pending')`, [mediaId,userId,objectKey,request.purpose,request.conversationId ?? null,request.mimeType,request.byteSize]);
  try {
    const signed = await presignObject(objectKey, 'upload', request.mimeType, options.apiKey, options.fetchImpl);
    return { mediaId, objectKey, upload: { url: signed.url, method: 'PUT' as const, headers: signed.headers, expiresAt: signed.expires_at } };
  } catch (error) {
    await query(`update public.media_objects set status='quarantined',updated_at=now() where id=$1 and owner_id=$2 and status='pending'`, [mediaId,userId]);
    throw error;
  }
}

function totalBytesFromResponse(response: Response): number | null {
  const contentRange = response.headers.get('content-range');
  if (contentRange) { const match = contentRange.match(/\/(\d+)$/); if (match) return Number(match[1]); }
  const contentLength = response.headers.get('content-length');
  return contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : null;
}

export async function completeMediaUpload(userId: string, raw: unknown, options: { apiKey?: string; fetchImpl?: FetchLike } = {}) {
  const { mediaId } = mediaCompleteSchema.parse(raw);
  const result = await query<MediaRow>(`select id,owner_id,object_key,purpose,conversation_id,mime_type,byte_size,status from public.media_objects where id=$1 and owner_id=$2 limit 1`, [mediaId,userId]);
  const media = result.rows[0];
  if (!media || media.status !== 'pending') throw new Error('MEDIA_NOT_PENDING');
  await authorizePurpose(userId, media.purpose, media.conversation_id);
  const signed = await presignObject(media.object_key, 'download', undefined, options.apiKey, options.fetchImpl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const probe = await fetchImpl(signed.url, { method: 'GET', headers: { ...signed.headers, range: 'bytes=0-0' }, signal: AbortSignal.timeout(10_000) });
  if (!(probe.status === 200 || probe.status === 206)) throw new Error(`MEDIA_UPLOAD_NOT_VISIBLE_${probe.status}`);
  const actualType = probe.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
  if (actualType && actualType !== media.mime_type) throw new Error('MEDIA_MIME_MISMATCH');
  const actualBytes = totalBytesFromResponse(probe);
  const expectedBytes = Number(media.byte_size);
  if (actualBytes == null || !Number.isSafeInteger(actualBytes) || actualBytes <= 0 || actualBytes > MAX_MEDIA_BYTES) throw new Error('MEDIA_SIZE_UNVERIFIED');
  if (actualBytes !== expectedBytes) throw new Error('MEDIA_SIZE_MISMATCH');
  const promoted = await query<{ id: string }>(`update public.media_objects set status='ready',updated_at=now() where id=$1 and owner_id=$2 and status='pending' returning id`, [mediaId,userId]);
  if (promoted.rows.length !== 1) throw new Error('MEDIA_PROMOTION_RACE');
  return { mediaId, status: 'ready' as const };
}

export async function prepareMediaDownload(userId: string, raw: unknown, options: { apiKey?: string; fetchImpl?: FetchLike } = {}) {
  const { mediaId } = mediaCompleteSchema.parse(raw);
  const result = await query<MediaRow>(
    `select m.id,m.owner_id,m.object_key,m.purpose,m.conversation_id,m.mime_type,m.byte_size,m.status
       from public.media_objects m
      where m.id=$1 and m.status='ready' and (
        m.owner_id=$2::uuid
        or (m.purpose='chat' and m.conversation_id is not null and public.is_conversation_member(m.conversation_id,$2::uuid) and public.not_blocked($2::uuid,m.owner_id))
        or (m.purpose='kfeed' and exists(
          select 1 from public.public_videos v where (v.media_object_id=m.id or v.thumbnail_media_id=m.id)
            and v.visibility='public' and v.moderation_status in ('approved','limited') and v.published_at is not null and v.published_at<=now()
            and public.not_blocked($2::uuid,v.owner_id)
            and coalesce(public.viewer_age_years($2::uuid),0)>=v.age_rating
            and (v.violence_level<>'graphic' or coalesce(public.viewer_age_years($2::uuid),0)>=18)
        ))
        or (m.purpose='moment' and exists(
          select 1 from public.moments mo where mo.media_object_id=m.id and mo.expires_at>now() and mo.moderation_status in ('approved','limited')
            and public.not_blocked($2::uuid,mo.author_id) and (
              mo.visibility='public'
              or (mo.visibility='friends' and public.is_contact($2::uuid,mo.author_id))
              or (mo.visibility='close_friends' and exists(select 1 from public.contacts c where c.owner_id=mo.author_id and c.contact_id=$2::uuid and c.favorite))
            )
        ))
      ) limit 1`,
    [mediaId,userId],
  );
  const media = result.rows[0];
  if (!media) throw new Error('MEDIA_NOT_AUTHORIZED');
  if (media.purpose === 'chat') await authorizePurpose(userId, media.purpose, media.conversation_id);
  const signed = await presignObject(media.object_key, 'download', undefined, options.apiKey, options.fetchImpl);
  return { mediaId, download: { url: signed.url, method: signed.method, headers: signed.headers, expiresAt: signed.expires_at } };
}

export const KSSENGER_MEDIA_PROVIDER_SCOPE = Object.freeze({ projectId: KSSENGER_NEON_PROJECT_ID, branchId: KSSENGER_NEON_BRANCH_ID, bucket: KSSENGER_MEDIA_BUCKET, maxBytes: MAX_MEDIA_BYTES });
