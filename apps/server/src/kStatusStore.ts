import { query, transaction } from './db.js';
import { getContactAudience } from './social.js';

export type WrappedKeyInput = {
  viewerUserId: string;
  wrappedKey: string;
  wrappedNonce: string;
  wrappedByPublicKey: string;
};

export type PostedStatus = {
  id: string;
  ownerId: string;
  createdAt: string;
  expiresAt: string;
};

export type VisibleStatus = {
  id: string;
  ownerId: string;
  ciphertext: string;
  createdAt: string;
  expiresAt: string;
  myWrappedKey: { wrappedKey: string; wrappedNonce: string; wrappedByPublicKey: string } | null;
};

const MAX_STATUS_CHARS = 200;

/**
 * Posts an encrypted status. `wrappedKeys` must only address the caller's
 * *current* accepted contacts — anyone else (a former contact, a blocked
 * user, a stranger) is silently dropped here rather than trusted from the
 * client, mirroring how group key wraps are never trusted blind either.
 */
export async function postStatus(ownerId: string, ciphertext: string, wrappedKeys: WrappedKeyInput[]): Promise<PostedStatus> {
  if (ciphertext.length > 20_000) throw new Error('K_STATUS_TOO_LARGE');
  const audience = new Set(await getContactAudience(ownerId));
  audience.add(ownerId); // the owner may always self-wrap a copy to re-open their own status later
  const validWraps = wrappedKeys.filter((w) => audience.has(w.viewerUserId));

  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string; created_at: Date; expires_at: Date }>(
      `insert into public.k_status (owner_id, ciphertext)
       values ($1, $2)
       returning id, created_at, expires_at`,
      [ownerId, ciphertext],
    );
    const status = rows[0];
    if (!status) throw new Error('K_STATUS_INSERT_FAILED');

    for (const wrap of validWraps) {
      await client.query(
        `insert into public.k_status_keys (status_id, viewer_user_id, wrapped_key, wrapped_nonce, wrapped_by_public_key)
         values ($1, $2, $3, $4, $5)
         on conflict (status_id, viewer_user_id) do nothing`,
        [status.id, wrap.viewerUserId, wrap.wrappedKey, wrap.wrappedNonce, wrap.wrappedByPublicKey],
      );
    }

    return {
      id: status.id,
      ownerId,
      createdAt: status.created_at.toISOString(),
      expiresAt: status.expires_at.toISOString(),
    };
  });
}

/**
 * Lists non-expired statuses visible to `viewerId`: their own statuses, plus
 * any status a current contact wrapped a key for them on. Returns opaque
 * ciphertext + the viewer's own wrapped-key row; decryption happens
 * entirely client-side.
 */
export async function listVisibleStatuses(viewerId: string): Promise<VisibleStatus[]> {
  const { rows } = await query<{
    id: string;
    owner_id: string;
    ciphertext: string;
    created_at: Date;
    expires_at: Date;
    wrapped_key: string | null;
    wrapped_nonce: string | null;
    wrapped_by_public_key: string | null;
  }>(
    `select ks.id, ks.owner_id, ks.ciphertext, ks.created_at, ks.expires_at,
            ksk.wrapped_key, ksk.wrapped_nonce, ksk.wrapped_by_public_key
       from public.k_status ks
       left join public.k_status_keys ksk
              on ksk.status_id = ks.id and ksk.viewer_user_id = $1
      where ks.expires_at > now()
        and (ks.owner_id = $1 or ksk.viewer_user_id = $1)
      order by ks.created_at desc
      limit 500`,
    [viewerId],
  );
  return rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ciphertext: row.ciphertext,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    myWrappedKey: row.wrapped_key && row.wrapped_nonce && row.wrapped_by_public_key
      ? { wrappedKey: row.wrapped_key, wrappedNonce: row.wrapped_nonce, wrappedByPublicKey: row.wrapped_by_public_key }
      : null,
  }));
}

export async function deleteStatus(ownerId: string, statusId: string): Promise<void> {
  const result = await query(
    `delete from public.k_status where id = $1 and owner_id = $2`,
    [statusId, ownerId],
  );
  if ((result.rowCount ?? 0) !== 1) throw new Error('K_STATUS_NOT_FOUND');
}

/** Hard-deletes rows past expiry — "expired" is a real deletion, not a filtered read. */
export async function purgeExpiredKStatuses(): Promise<number> {
  const result = await query(`delete from public.k_status where expires_at <= now()`);
  return result.rowCount ?? 0;
}

export const K_STATUS_MAX_TEXT_LENGTH = MAX_STATUS_CHARS;
