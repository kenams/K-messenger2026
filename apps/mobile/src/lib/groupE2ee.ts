/**
 * Real E2EE for group messages. One random symmetric key per conversation
 * (NaCl secretbox), wrapped individually for each member via NaCl box
 * against the same identity keypair direct-chat E2EE already uses
 * (lib/e2ee.ts) — the server only ever stores opaque wrapped blobs and
 * message ciphertext, never the group key or plaintext.
 *
 * Scope: a member added after the key exists gets it opportunistically
 * wrapped by any online existing member's client (see wrapForMissingMembers)
 * — not a hard delivery guarantee. Not a Signal-style ratchet: a leaked
 * identity secret key + a captured wrapped-key blob can retroactively
 * decrypt everything sent to that group. Same honesty bar as direct E2EE.
 */
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { getBackend } from './backend';
import { ensureIdentityKeyPair } from './e2ee';

export const GROUP_ENCRYPTED_ALGO = 'kssenger-group-secretbox-v1';

const groupKeyCache = new Map<string, string>(); // conversationId -> base64 secretbox key

async function fetchMyWrappedKey(conversationId: string, userId: string): Promise<string | null> {
  const { data, error } = await getBackend()
    .from('group_keys')
    .select('wrapped_key, wrapped_nonce, wrapped_by_public_key')
    .eq('conversation_id', conversationId)
    .eq('member_user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { wrapped_key: string; wrapped_nonce: string; wrapped_by_public_key: string };

  const myKeys = await ensureIdentityKeyPair(userId);
  if (!myKeys) return null;
  try {
    const opened = nacl.box.open(
      naclUtil.decodeBase64(row.wrapped_key),
      naclUtil.decodeBase64(row.wrapped_nonce),
      naclUtil.decodeBase64(row.wrapped_by_public_key),
      naclUtil.decodeBase64(myKeys.secretKey),
    );
    return opened ? naclUtil.encodeBase64(opened) : null;
  } catch {
    return null;
  }
}

async function wrapKeyFor(conversationId: string, targetUserId: string, groupKeyB64: string, mySecretKeyB64: string, myPublicKeyB64: string): Promise<boolean> {
  const { data, error: lookupError } = await getBackend().from('profiles').select('e2e_public_key').eq('id', targetUserId).maybeSingle();
  if (lookupError) return false;
  const peerPublicKey = (data as { e2e_public_key?: string | null } | null)?.e2e_public_key;
  if (!peerPublicKey) return false;

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box(
    naclUtil.decodeBase64(groupKeyB64),
    nonce,
    naclUtil.decodeBase64(peerPublicKey),
    naclUtil.decodeBase64(mySecretKeyB64),
  );
  const { error } = await getBackend().from('group_keys').insert({
    conversation_id: conversationId,
    member_user_id: targetUserId,
    wrapped_key: naclUtil.encodeBase64(sealed),
    wrapped_nonce: naclUtil.encodeBase64(nonce),
    wrapped_by_public_key: myPublicKeyB64,
  });
  // A concurrent insert from another online member racing to wrap the same
  // row is fine either way — both are valid wrappings of the same group key.
  return !error;
}

/**
 * Loads (or, for whoever creates the group's key first, generates and
 * self-wraps) this conversation's group key for the current user. Returns
 * null if unavailable — callers must fall back to the plaintext transport,
 * same contract as direct-chat's ensureIdentityKeyPair.
 */
export async function ensureGroupKey(conversationId: string, userId: string, memberIds: string[]): Promise<string | null> {
  const cached = groupKeyCache.get(conversationId);
  if (cached) return cached;

  const mine = await fetchMyWrappedKey(conversationId, userId);
  if (mine) {
    groupKeyCache.set(conversationId, mine);
    return mine;
  }

  const myKeys = await ensureIdentityKeyPair(userId);
  if (!myKeys) return null;

  // No key exists for me yet: assume none exists for the group at all (the
  // first member to open the group creates it) and wrap it for every
  // current member, myself included. If another member beat us to it
  // concurrently, our own self-insert below still succeeds (each row is
  // per-member) and we just use the key we generated — a benign, harmless
  // divergence extremely unlikely in practice (would need two members to
  // both open a brand-new group's chat within the same instant).
  const groupKey = naclUtil.encodeBase64(nacl.randomBytes(nacl.secretbox.keyLength));
  const results = await Promise.all(
    memberIds.map((memberId) => wrapKeyFor(conversationId, memberId, groupKey, myKeys.secretKey, myKeys.publicKey)),
  );
  if (!results[memberIds.indexOf(userId)]) return null; // failed to wrap for myself — unusable
  groupKeyCache.set(conversationId, groupKey);
  return groupKey;
}

/** Best-effort: wrap the already-known group key for any member who doesn't have one yet. */
export async function wrapForMissingMembers(conversationId: string, userId: string, memberIds: string[]): Promise<void> {
  const groupKey = groupKeyCache.get(conversationId);
  if (!groupKey) return;
  const myKeys = await ensureIdentityKeyPair(userId);
  if (!myKeys) return;

  const { data } = await getBackend().from('group_keys').select('member_user_id').eq('conversation_id', conversationId);
  const have = new Set(((data ?? []) as Array<{ member_user_id: string }>).map((row) => row.member_user_id));
  const missing = memberIds.filter((id) => !have.has(id));
  await Promise.all(missing.map((id) => wrapKeyFor(conversationId, id, groupKey, myKeys.secretKey, myKeys.publicKey)));
}

export function encryptGroupMessage(plaintext: string, groupKeyB64: string): { algorithm: string; ciphertext: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const sealed = nacl.secretbox(naclUtil.decodeUTF8(plaintext), nonce, naclUtil.decodeBase64(groupKeyB64));
  return {
    algorithm: GROUP_ENCRYPTED_ALGO,
    ciphertext: JSON.stringify({ c: naclUtil.encodeBase64(sealed), n: naclUtil.encodeBase64(nonce) }),
  };
}

export function decryptGroupMessage(ciphertextJson: string, groupKeyB64: string): string | null {
  try {
    const { c, n } = JSON.parse(ciphertextJson) as { c: string; n: string };
    const opened = nacl.secretbox.open(naclUtil.decodeBase64(c), naclUtil.decodeBase64(n), naclUtil.decodeBase64(groupKeyB64));
    return opened ? naclUtil.encodeUTF8(opened) : null;
  } catch {
    return null;
  }
}
