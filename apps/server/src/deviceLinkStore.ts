import { z } from 'zod';
import { query } from './db.js';

const MAX_PUBLIC_KEY_LENGTH = 2048;

export const linkInitSchema = z.object({
  webPublicKey: z.string().min(1).max(MAX_PUBLIC_KEY_LENGTH),
}).strict();

export const linkApproveSchema = z.object({
  linkId: z.string().uuid(),
  phonePublicKey: z.string().min(1).max(MAX_PUBLIC_KEY_LENGTH),
}).strict();

export const linkTargetSchema = z.object({
  linkId: z.string().uuid(),
}).strict();

export const linkEnvelopeSchema = z.object({
  linkId: z.string().uuid(),
  ciphertext: z.string().min(1).max(2_000_000),
  nonce: z.string().min(1).max(512),
}).strict();

type DeviceLinkRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'revoked';
  web_public_key: string;
  phone_public_key: string | null;
};

const MAX_PENDING_LINKS_PER_USER = 5;

export async function initDeviceLink(userId: string, webPublicKey: string) {
  const { rowCount } = await query(
    `select 1 from public.device_links where user_id = $1 and status = 'pending'`,
    [userId],
  );
  if ((rowCount ?? 0) >= MAX_PENDING_LINKS_PER_USER) throw new Error('TOO_MANY_PENDING_LINKS');

  const { rows } = await query<{ id: string }>(
    `insert into public.device_links (user_id, status, web_public_key)
     values ($1, 'pending', $2)
     returning id`,
    [userId, webPublicKey],
  );
  const linkId = rows[0]?.id;
  if (!linkId) throw new Error('LINK_INIT_FAILED');
  return { linkId };
}

export async function approveDeviceLink(userId: string, linkId: string, phonePublicKey: string) {
  const { rows } = await query<DeviceLinkRow>(
    `update public.device_links
        set status = 'approved',
            phone_public_key = $3,
            approved_at = now()
      where id = $1
        and user_id = $2
        and status = 'pending'
      returning id, user_id, status, web_public_key, phone_public_key`,
    [linkId, userId, phonePublicKey],
  );
  const link = rows[0];
  if (!link) throw new Error('LINK_NOT_PENDING');
  return link;
}

export async function revokeDeviceLink(userId: string, linkId: string) {
  const { rows } = await query<{ id: string }>(
    `update public.device_links
        set status = 'revoked',
            revoked_at = now()
      where id = $1
        and user_id = $2
        and status != 'revoked'
      returning id`,
    [linkId, userId],
  );
  if (!rows[0]) throw new Error('LINK_NOT_FOUND');
  return { linkId };
}

export async function requireApprovedLinkOwner(userId: string, linkId: string) {
  const { rows } = await query<DeviceLinkRow>(
    `select id, user_id, status, web_public_key, phone_public_key
       from public.device_links
      where id = $1
        and user_id = $2
        and status = 'approved'
      limit 1`,
    [linkId, userId],
  );
  const link = rows[0];
  if (!link) throw new Error('LINK_NOT_APPROVED');
  return link;
}
