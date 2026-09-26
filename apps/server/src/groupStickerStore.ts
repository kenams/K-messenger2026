import { transaction } from './db.js';

export type GroupSticker = {
  id: string;
  conversationId: string;
  uploaderId: string;
  mediaId: string;
  createdAt: string;
};

const MAX_STICKERS_PER_GROUP = 8;

async function requireMember(client: import('pg').PoolClient, userId: string, conversationId: string) {
  const { rowCount } = await client.query(
    `select 1 from public.conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
    [conversationId, userId],
  );
  if (rowCount !== 1) throw new Error('FORBIDDEN');
}

async function requireModeratorOrOwner(client: import('pg').PoolClient, userId: string, conversationId: string) {
  const { rows } = await client.query<{ role: string }>(
    `select role from public.conversation_members where conversation_id = $1 and user_id = $2`,
    [conversationId, userId],
  );
  const role = rows[0]?.role;
  if (role !== 'owner' && role !== 'admin') throw new Error('GROUP_ADMIN_REQUIRED');
}

export async function listGroupStickers(userId: string, conversationId: string): Promise<GroupSticker[]> {
  return transaction(async (client) => {
    await requireMember(client, userId, conversationId);
    const { rows } = await client.query<{
      id: string; conversation_id: string; uploader_id: string; media_id: string; created_at: Date;
    }>(
      `select id, conversation_id, uploader_id, media_id, created_at
         from public.group_stickers
        where conversation_id = $1
        order by created_at asc
        limit 200`,
      [conversationId],
    );
    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      uploaderId: row.uploader_id,
      mediaId: row.media_id,
      createdAt: row.created_at.toISOString(),
    }));
  });
}

export async function addGroupSticker(userId: string, conversationId: string, mediaId: string): Promise<GroupSticker> {
  return transaction(async (client) => {
    await requireMember(client, userId, conversationId);

    // The media object must itself belong to this user, this conversation,
    // and already be a ready 'chat'-purpose object — same authorization
    // check the existing media pipeline already performs for chat sends, so
    // stickers cannot smuggle in someone else's or an unrelated group's media.
    const { rows: mediaRows } = await client.query<{ status: string }>(
      `select status from public.media_objects
        where id = $1 and owner_id = $2 and conversation_id = $3 and purpose = 'chat'`,
      [mediaId, userId, conversationId],
    );
    if (mediaRows[0]?.status !== 'ready') throw new Error('GROUP_STICKER_MEDIA_INVALID');

    const { rows: countRows } = await client.query<{ count: string }>(
      `select count(*)::text as count from public.group_stickers where conversation_id = $1`,
      [conversationId],
    );
    if (Number(countRows[0]?.count ?? '0') >= MAX_STICKERS_PER_GROUP) throw new Error('GROUP_STICKER_PACK_FULL');

    const { rows } = await client.query<{
      id: string; conversation_id: string; uploader_id: string; media_id: string; created_at: Date;
    }>(
      `insert into public.group_stickers (conversation_id, uploader_id, media_id)
       values ($1, $2, $3)
       returning id, conversation_id, uploader_id, media_id, created_at`,
      [conversationId, userId, mediaId],
    );
    const row = rows[0];
    return {
      id: row.id,
      conversationId: row.conversation_id,
      uploaderId: row.uploader_id,
      mediaId: row.media_id,
      createdAt: row.created_at.toISOString(),
    };
  });
}

export async function removeGroupSticker(userId: string, conversationId: string, stickerId: string): Promise<void> {
  await transaction(async (client) => {
    await requireMember(client, userId, conversationId);
    const { rows } = await client.query<{ uploader_id: string }>(
      `select uploader_id from public.group_stickers where id = $1 and conversation_id = $2`,
      [stickerId, conversationId],
    );
    const stickerUploaderId = rows[0]?.uploader_id;
    if (!stickerUploaderId) throw new Error('GROUP_STICKER_NOT_FOUND');
    if (stickerUploaderId !== userId) {
      await requireModeratorOrOwner(client, userId, conversationId);
    }
    const removed = await client.query(
      `delete from public.group_stickers where id = $1 and conversation_id = $2`,
      [stickerId, conversationId],
    );
    if ((removed.rowCount ?? 0) !== 1) throw new Error('GROUP_STICKER_NOT_FOUND');
  });
}

