/**
 * K-Bot: a personal test contact, visible and usable by Kenams's own account
 * only — never a contact suggested to, or added for, any other user.
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
    const kenamsUserId = kenamsRows[0]?.id;
    if (!kenamsUserId) {
      logger.warn('test_bot_bootstrap_failed', { reason: 'owner account not found', kenamsEmail });
      return;
    }

    await query(
      `insert into public.profiles (id, username, display_name, nickname, bio, presence)
       values ($1, $2, $3, $3, 'Contact de test — répond automatiquement, uniquement à toi.', 'online')
       on conflict (id) do update set display_name = excluded.display_name, presence = 'online'`,
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

    // Mutual contact — this exact pair only. Never touched for any other user.
    await query(
      `insert into public.contacts (owner_id, contact_id, list_name)
       values ($1, $2, 'Amis'), ($2, $1, 'Amis')
       on conflict do nothing`,
      [botUserId, kenamsUserId],
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

/** True only for the exact (Kenams -> bot) direction this bot is scoped to. */
export function isMessageToBot(senderUserId: string, recipientMemberIds: string[]): boolean {
  if (!state) return false;
  return senderUserId === state.kenamsUserId && recipientMemberIds.includes(state.userId);
}

/** Whether this conversation is Kenams <-> K-Bot's direct chat and this send came from Kenams. */
export async function isBotConversationFromKenams(conversationId: string, senderUserId: string): Promise<boolean> {
  if (!state || senderUserId !== state.kenamsUserId) return false;
  const { rows } = await query<{ user_id: string }>(
    `select user_id from public.conversation_members where conversation_id = $1`,
    [conversationId],
  );
  const memberIds = rows.map((row) => row.user_id);
  return memberIds.length === 2 && memberIds.includes(state.userId) && memberIds.includes(state.kenamsUserId);
}

export function isBotUser(userId: string): boolean {
  return state?.userId === userId;
}

async function fetchKenamsPublicKey(): Promise<string | null> {
  if (!state) return null;
  const { rows } = await query<{ e2e_public_key: string | null }>(
    `select e2e_public_key from public.profiles where id = $1 limit 1`,
    [state.kenamsUserId],
  );
  return rows[0]?.e2e_public_key ?? null;
}

export function decryptFromKenams(ciphertextJson: string, kenamsPublicKeyB64: string): string | null {
  if (!state) return null;
  try {
    const { c, n } = JSON.parse(ciphertextJson) as { c: string; n: string };
    const opened = nacl.box.open(
      naclUtil.decodeBase64(c),
      naclUtil.decodeBase64(n),
      naclUtil.decodeBase64(kenamsPublicKeyB64),
      naclUtil.decodeBase64(state.secretKey),
    );
    if (!opened) return null;
    return naclUtil.encodeUTF8(opened);
  } catch {
    return null;
  }
}

export function encryptToKenams(plaintext: string, kenamsPublicKeyB64: string): { algorithm: string; ciphertext: string } {
  if (!state) throw new Error('BOT_NOT_READY');
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box(
    naclUtil.decodeUTF8(plaintext),
    nonce,
    naclUtil.decodeBase64(kenamsPublicKeyB64),
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

// ---- Scripted "feels attentive" reply engine (no paid AI, no real NLU) ----

const KEYWORD_BANKS: { keywords: RegExp; lines: string[] }[] = [
  {
    keywords: /\b(taf|travail|boulot|projet|code|deploy|bug|client)\b/i,
    lines: [
      "Ah, ça sent le taf ! Ça avance comment de ton côté ?",
      "Toujours à fond sur tes projets à ce que je vois. C'est quoi le morceau le plus chiant en ce moment ?",
      "Un projet de plus sur la pile 😄 t'en es où concrètement ?",
      "Ça bosse dur ! Qu'est-ce qui te prend le plus de temps là-dessus ?",
    ],
  },
  {
    keywords: /\b(fatigu|dodo|dormi|nuit|épuisé|crevé)\b/i,
    lines: [
      "Repose-toi un peu, sérieux. T'as dormi combien d'heures cette nuit ?",
      "Ça se sent que t'es fatigué là. Journée chargée ?",
      "Prends 5 minutes pour souffler, on n'est pas à ça près 😉",
    ],
  },
  {
    keywords: /\b(content|heureux|cool|nickel|génial|super|top)\b/i,
    lines: [
      "Ça fait plaisir de te lire comme ça ! Qu'est-ce qui t'a mis de bonne humeur ?",
      "J'aime bien ce ton-là 😄 raconte-moi.",
      "Content pour toi ! C'est quoi le déclic ?",
    ],
  },
  {
    keywords: /\b(énervé|colère|marre|chiant|galère|problème|souci)\b/i,
    lines: [
      "Ah ça, ça n'a pas l'air simple. Qu'est-ce qui s'est passé exactement ?",
      "Je sens que ça t'agace. Raconte, qu'est-ce qui coince ?",
      "Pas cool ça. T'as déjà une piste pour régler le souci ?",
    ],
  },
  {
    keywords: /\?\s*$/,
    lines: [
      "Bonne question ! Franchement je botte en touche, je suis juste un bot de test 😄 mais toi, t'en penses quoi ?",
      "Haha, je suis pas assez futé pour ça — je suis un simple bot scripté. Mais dis-m'en plus, ça m'intéresse.",
    ],
  },
];

const FALLBACK_LINES = [
  "Reçu 👍 Raconte-moi en plus, qu'est-ce qui t'a fait dire ça ?",
  "Ok je vois. Et ça avance comment de ton côté en ce moment ?",
  "Intéressant ! Tu peux développer un peu ?",
  "Je note 📝 Et à part ça, quoi de neuf ?",
  "Ha, dis m'en plus !",
  "Je t'écoute, continue.",
  "Ça me parle. Qu'est-ce qui t'amène à penser ça ?",
  "D'accord, et sinon comment se passe ta journée ?",
];

const FOLLOWUPS = [
  "Ça avance comment de ton côté ?",
  "Qu'est-ce qui t'a fait dire ça ?",
  "Raconte-moi en plus.",
  "Et sinon, quoi de neuf ?",
  "Tu en penses quoi, toi ?",
  "Ça te fait quoi, tout ça ?",
];

// Short-term memory — last few turns, so the bot doesn't repeat the same
// follow-up back to back or reply out of nowhere. Kept in-memory only
// (not persisted): a restart just means the bot "forgets" mid-conversation,
// same honesty limit as everything else about this being a script, not a mind.
const recentReplies: string[] = [];
const recentFollowups: string[] = [];

function pick<T>(items: T[], exclude: T[] = []): T {
  const pool = items.filter((item) => !exclude.includes(item));
  const from = pool.length > 0 ? pool : items;
  return from[Math.floor(Math.random() * from.length)];
}

function remember(list: string[], value: string, max = 3) {
  list.push(value);
  while (list.length > max) list.shift();
}

function craftTextReply(incoming: string): string {
  const bank = KEYWORD_BANKS.find((entry) => entry.keywords.test(incoming));
  const base = bank ? pick(bank.lines, recentReplies) : pick(FALLBACK_LINES, recentReplies);
  remember(recentReplies, base);

  // Avoid a double question mark when the picked line is already a question.
  if (/\?\s*$/.test(base)) return base;

  const followup = pick(FOLLOWUPS, recentFollowups);
  remember(recentFollowups, followup);
  return `${base} ${followup}`;
}

/** Builds the plaintext reply to persist/encrypt for a decrypted incoming message. */
export function craftReply(decryptedPlaintext: string): string {
  const content = parseChatContent(decryptedPlaintext);
  if (content.type === 'voice') {
    return serializeText(pick([
      "Message vocal bien reçu 🎧 (je ne peux pas encore répondre en vocal, je suis juste un bot scripté — mais je t'écoute en texte).",
      "J'ai bien reçu ton vocal ! Je ne sais pas encore répondre en audio, mais raconte-moi la même chose à l'écrit si tu veux.",
    ]));
  }
  if (content.type === 'media') {
    return serializeText(pick([
      "Jolie image/vidéo, bien reçue 📎 Raconte-moi le contexte !",
      "Media bien reçu 👍 c'est quoi l'histoire derrière ?",
    ]));
  }
  return serializeText(craftTextReply(content.text));
}

export async function buildBotReplyEnvelope(decryptedPlaintext: string): Promise<{ algorithm: string; ciphertext: string } | null> {
  const kenamsPublicKey = await fetchKenamsPublicKey();
  if (!kenamsPublicKey) return null;
  const replyPlaintext = craftReply(decryptedPlaintext);
  return encryptToKenams(replyPlaintext, kenamsPublicKey);
}

export function randomReplyDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 3000); // 1-4s, feels natural without being instant/robotic.
}

export function getBotDeviceId(): string | null {
  return state?.deviceId ?? null;
}
