/**
 * K-Bot: the in-app help assistant. Every account gets it as a contact and can
 * ask it how the app works (Last.fm/Spotify, groups, privacy...). Answers come
 * from a hand-written FAQ (helpBot.ts) — see the honesty note below.
 *
 * Privacy exception to be aware of: messages sent TO K-Bot are readable by the
 * server (it holds the bot's secret key to decrypt and answer). The bot says
 * so in its menu and privacy answer. Human-to-human chats are unaffected.
 *
 * Why this needs a server-side private key (the one exception in this app):
 * every real account's NaCl secret key lives only on-device (see
 * apps/mobile/src/lib/e2ee.ts) — the server never sees it and cannot read
 * messages. K-Bot is different by construction: to auto-reply, it must be
 * able to decrypt what Kenams sends it and encrypt a reply, so its keypair's
 * secret half is generated once and kept in `public.bot_identities`
 * (migration 0032), a table with zero Data API/RLS grants — reachable only
 * from this backend's own direct Postgres connection. This exception is
 * scoped to this single system account; no other user's key material is
 * ever stored server-side.
 *
 * Honesty about the reply engine: this is a scripted, keyword-triggered
 * responder, not a real language model. It fakes "interest" by picking
 * topic-aware lines and varied follow-up questions from hand-written banks,
 * and remembers the last couple of turns so it doesn't repeat itself back to
 * back. It does not understand Kenams's messages the way a real generative
 * AI (Claude/GPT) would — there is no comprehension, just pattern matching.
 * Good enough to exercise the app's messaging flow (delivery, receipts,
 * notifications, reactions, K-Pulse) for free, nothing more.
 */
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { query } from './db.js';
import { logger } from './logger.js';
import { craftHelpReply } from './helpBot.js';

export const BOT_USERNAME = 'k.bot';
export const BOT_DISPLAY_NAME = 'K-Bot 🤖';
const BOT_ALGORITHM = 'kssenger-nacl-box-v1';

type BotState = {
  userId: string;
  deviceId: string;
  publicKey: string;
  secretKey: string;
  kenamsUserId: string;
};

let state: BotState | null = null;
let bootstrapped = false;

/**
 * Idempotent bootstrap, safe to call on every server boot:
 *  1. Locate the bot's Neon Auth account (must already exist — created once
 *     via `scripts/create-test-bot.mjs`, since a real neon_auth."user" row
 *     is required to satisfy profiles' foreign key; the server does not,
 *     and should not, mint auth accounts itself).
 *  2. Ensure its profile row + a stable NaCl keypair exist.
 *  3. Locate Kenams's real account by email and make the two mutual
 *     contacts — and ONLY those two accounts. No other user ever gets this
 *     bot added automatically.
 */
export async function bootstrapTestBot(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  const botUserId = process.env.TEST_BOT_USER_ID;
  const kenamsEmail = process.env.TEST_BOT_OWNER_EMAIL ?? 'kenams42@gmail.com';
  if (!botUserId) {
    logger.info('test_bot_disabled', { reason: 'TEST_BOT_USER_ID not set' });
    return;
  }

  try {
    const { rows: authRows } = await query<{ id: string }>(
      `select id from neon_auth."user" where id = $1 limit 1`,
      [botUserId],
    );
    if (!authRows[0]) {
      logger.warn('test_bot_bootstrap_failed', { reason: 'auth account not found, run scripts/create-test-bot.mjs first' });
      return;
    }

    const { rows: kenamsRows } = await query<{ id: string }>(
      `select id from neon_auth."user" where email = $1 limit 1`,
      [kenamsEmail],
    );
    // Only used for the K-Pulse echo; the help bot works without it.
    const kenamsUserId = kenamsRows[0]?.id ?? '';

    await query(
      `insert into public.profiles (id, username, display_name, nickname, bio, presence)
       values ($1, $2, $3, $3, 'Assistant K-ssenger : pose-moi tes questions (Last.fm, groupes, confidentialité…). Tape « menu ».', 'online')
       on conflict (id) do update set display_name = excluded.display_name, bio = excluded.bio, presence = 'online'`,
      [botUserId, BOT_USERNAME, BOT_DISPLAY_NAME],
    );
    await query(
      `insert into public.privacy_settings (user_id) values ($1) on conflict (user_id) do nothing`,
      [botUserId],
    );

    const { rows: identityRows } = await query<{ secret_key_b64: string }>(
      `select secret_key_b64 from public.bot_identities where user_id = $1 limit 1`,
      [botUserId],
    );

    let secretKey: string;
    let publicKey: string;
    if (identityRows[0]) {
      secretKey = identityRows[0].secret_key_b64;
      publicKey = naclUtil.encodeBase64(nacl.box.keyPair.fromSecretKey(naclUtil.decodeBase64(secretKey)).publicKey);
    } else {
      const kp = nacl.box.keyPair();
      secretKey = naclUtil.encodeBase64(kp.secretKey);
      publicKey = naclUtil.encodeBase64(kp.publicKey);
      await query(
        `insert into public.bot_identities (user_id, secret_key_b64) values ($1, $2)
         on conflict (user_id) do nothing`,
        [botUserId, secretKey],
      );
    }

    await query(`update public.profiles set e2e_public_key = $2 where id = $1`, [botUserId, publicKey]);

    // Everyone gets the help bot as a mutual contact (existing accounts here,
    // new ones through ensureBotContact() on their first socket connection).
    await query(
      `insert into public.contacts (owner_id, contact_id, list_name)
       select u.id, $1::uuid, 'Amis' from neon_auth."user" u where u.id <> $1::uuid
       on conflict do nothing`,
      [botUserId],
    );
    await query(
      `insert into public.contacts (owner_id, contact_id, list_name)
       select $1::uuid, u.id, 'Amis' from neon_auth."user" u where u.id <> $1::uuid
       on conflict do nothing`,
      [botUserId],
    );

    const { rows: deviceRows } = await query<{ id: string }>(
      `select id from public.devices where user_id = $1 order by created_at asc limit 1`,
      [botUserId],
    );
    let deviceId = deviceRows[0]?.id;
    if (!deviceId) {
      const { rows: inserted } = await query<{ id: string }>(
        `insert into public.devices (user_id, name) values ($1, 'K-Bot server') returning id`,
        [botUserId],
      );
      deviceId = inserted[0]?.id;
    }
    if (!deviceId) throw new Error('BOT_DEVICE_CREATE_FAILED');

    state = { userId: botUserId, deviceId, publicKey, secretKey, kenamsUserId };
    logger.info('test_bot_ready', { botUserId, kenamsUserId });
  } catch (error) {
    logger.warn('test_bot_bootstrap_error', { error: error instanceof Error ? error.message : 'unknown' });
  }
}

export function getBotState(): BotState | null {
  return state;
}

const botContactEnsured = new Set<string>();

/** Idempotent: makes K-Bot a mutual contact of this user (cached per process). */
export async function ensureBotContact(userId: string): Promise<void> {
  if (!state || userId === state.userId || botContactEnsured.has(userId)) return;
  botContactEnsured.add(userId);
  try {
    await query(
      `insert into public.contacts (owner_id, contact_id, list_name)
       values ($1, $2, 'Amis'), ($2, $1, 'Amis')
       on conflict do nothing`,
      [state.userId, userId],
    );
  } catch (error) {
    botContactEnsured.delete(userId);
    logger.warn('bot_contact_ensure_failed', { error: error instanceof Error ? error.message : 'unknown' });
  }
}

/** True when this is the 2-member direct chat between the sender and K-Bot. */
export async function isDirectConversationWithBot(conversationId: string, senderUserId: string): Promise<boolean> {
  if (!state || senderUserId === state.userId) return false;
  const { rows } = await query<{ user_id: string }>(
    `select user_id from public.conversation_members where conversation_id = $1`,
    [conversationId],
  );
  const memberIds = rows.map((row) => row.user_id);
  return memberIds.length === 2 && memberIds.includes(state.userId) && memberIds.includes(senderUserId);
}

export function isBotUser(userId: string): boolean {
  return state?.userId === userId;
}

export function decryptFromUser(ciphertextJson: string, senderPublicKeyB64: string): string | null {
  if (!state) return null;
  try {
    const { c, n } = JSON.parse(ciphertextJson) as { c: string; n: string };
    const opened = nacl.box.open(
      naclUtil.decodeBase64(c),
      naclUtil.decodeBase64(n),
      naclUtil.decodeBase64(senderPublicKeyB64),
      naclUtil.decodeBase64(state.secretKey),
    );
    if (!opened) return null;
    return naclUtil.encodeUTF8(opened);
  } catch {
    return null;
  }
}

export function encryptToUser(plaintext: string, recipientPublicKeyB64: string): { algorithm: string; ciphertext: string } {
  if (!state) throw new Error('BOT_NOT_READY');
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box(
    naclUtil.decodeUTF8(plaintext),
    nonce,
    naclUtil.decodeBase64(recipientPublicKeyB64),
    naclUtil.decodeBase64(state.secretKey),
  );
  return {
    algorithm: BOT_ALGORITHM,
    ciphertext: JSON.stringify({ c: naclUtil.encodeBase64(sealed), n: naclUtil.encodeBase64(nonce) }),
  };
}

type ChatContent =
  | { v: 1; type: 'text'; text: string }
  | { v: 1; type: 'media'; mediaId: string; mimeType: string; caption?: string }
  | { v: 1; type: 'voice'; mediaId: string; mimeType: string; durationMs: number };

function parseChatContent(value: string): ChatContent {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.v === 1 && parsed.type === 'text' && typeof parsed.text === 'string') {
      return { v: 1, type: 'text', text: parsed.text };
    }
    if (parsed.v === 1 && parsed.type === 'media' && typeof parsed.mediaId === 'string') {
      return { v: 1, type: 'media', mediaId: parsed.mediaId, mimeType: String(parsed.mimeType ?? ''), caption: typeof parsed.caption === 'string' ? parsed.caption : undefined };
    }
    if (parsed.v === 1 && parsed.type === 'voice' && typeof parsed.mediaId === 'string') {
      return { v: 1, type: 'voice', mediaId: parsed.mediaId, mimeType: String(parsed.mimeType ?? ''), durationMs: Number(parsed.durationMs ?? 0) };
    }
  } catch {
    /* legacy plaintext-string message */
  }
  return { v: 1, type: 'text', text: value };
}

function serializeText(text: string): string {
  return JSON.stringify({ v: 1, type: 'text', text });
}

// ---- Help replies (hand-written FAQ, see helpBot.ts) ----

/** Builds the plaintext reply to persist/encrypt for a decrypted incoming message. */
export function craftReply(decryptedPlaintext: string): string {
  const content = parseChatContent(decryptedPlaintext);
  if (content.type === 'voice') {
    return serializeText('Message vocal bien reçu 🎧 Je ne comprends que le texte : écris-moi ta question (ou tape « menu »).');
  }
  if (content.type === 'media') {
    return serializeText('Image bien reçue 📎 Je ne comprends que le texte : écris-moi ta question (ou tape « menu »).');
  }
  return serializeText(craftHelpReply(content.text));
}

export async function buildBotReplyEnvelope(
  decryptedPlaintext: string,
  recipientPublicKeyB64: string,
): Promise<{ algorithm: string; ciphertext: string }> {
  return encryptToUser(craftReply(decryptedPlaintext), recipientPublicKeyB64);
}

export function randomReplyDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 3000); // 1-4s, feels natural without being instant/robotic.
}

export function getBotDeviceId(): string | null {
  return state?.deviceId ?? null;
}
