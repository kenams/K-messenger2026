/**
 * K-Statut: 24h ephemeral, friends-only, end-to-end encrypted status.
 *
 * Crypto shape mirrors groupE2ee.ts exactly: one random NaCl secretbox key
 * encrypts the status text (encryptGroupMessage's own idiom, reused as-is),
 * then that one-time key is wrapped individually via NaCl box for each
 * currently-accepted contact's e2e_public_key (same per-recipient wrap as
 * group_keys/wrapKeyFor). The server only ever stores/relays ciphertext and
 * opaque wrapped-key rows — never plaintext, never the status key itself.
 *
 * Honesty (same bar as group keys, see groupE2ee.ts): a contact added
 * *after* the status was posted cannot read it retroactively — there is no
 * re-wrap-on-new-contact mechanism here, deliberately, matching the
 * project's existing "not a hard delivery guarantee" E2EE bar. This is not
 * a public feed: only contacts the poster wrapped a key for (their current
 * accepted contacts at post time) can ever open it, and it is not wired
 * into K-Feed/Moments or any algorithmic surface.
 */
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { getBackend } from './backend';
import { ensureIdentityKeyPair, fetchPeerPublicKey } from './e2ee';
import { emitAck, getRealtimeSocket } from './realtime';

export const K_STATUS_MAX_CHARS = 200;

export type KStatusWrappedKey = { wrappedKey: string; wrappedNonce: string; wrappedByPublicKey: string };

export type VisibleKStatus = {
  id: string;
  ownerId: string;
  ciphertext: string;
  createdAt: string;
  expiresAt: string;
  myWrappedKey: KStatusWrappedKey | null;
};

export type OpenedKStatus = {
  id: string;
  ownerId: string;
  text: string | null; // null = undecryptable (no wrapped key reached this device, or tampered)
  createdAt: string;
  expiresAt: string;
};

function wrapStatusKeyFor(statusKeyB64: string, peerPublicKeyB64: string, mySecretKeyB64: string, myPublicKeyB64: string) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const sealed = nacl.box(
    naclUtil.decodeBase64(statusKeyB64),
    nonce,
    naclUtil.decodeBase64(peerPublicKeyB64),
    naclUtil.decodeBase64(mySecretKeyB64),
  );
  return {
    wrappedKey: naclUtil.encodeBase64(sealed),
    wrappedNonce: naclUtil.encodeBase64(nonce),
    wrappedByPublicKey: myPublicKeyB64,
  };
}

/**
 * Posts a status visible only to `contactIds` (the caller's current accepted
 * contacts — pass the full contact list; the server independently drops any
 * id that isn't actually a current contact, never trusting this list blind).
 */
export async function postStatus(myUserId: string, text: string, contactIds: string[]): Promise<{ id: string; createdAt: string; expiresAt: string } | null> {
  const trimmed = text.trim().slice(0, K_STATUS_MAX_CHARS);
  if (!trimmed) return null;

  const myKeys = await ensureIdentityKeyPair(myUserId);
  if (!myKeys) return null;

  const statusKey = naclUtil.encodeBase64(nacl.randomBytes(nacl.secretbox.keyLength));
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const sealed = nacl.secretbox(naclUtil.decodeUTF8(trimmed), nonce, naclUtil.decodeBase64(statusKey));
  const ciphertext = JSON.stringify({ c: naclUtil.encodeBase64(sealed), n: naclUtil.encodeBase64(nonce) });

  // Also wrap a copy for myself (self-box with my own public key) so my own
  // posted status can be re-opened from the same "visible statuses" list as
  // everyone else's, without a separate "is this mine" code path client-side.
  const selfWrap = { viewerUserId: myUserId, ...wrapStatusKeyFor(statusKey, myKeys.publicKey, myKeys.secretKey, myKeys.publicKey) };

  const contactWraps = (
    await Promise.all(
      contactIds.filter((id) => id !== myUserId).map(async (viewerUserId) => {
        const peerPublicKey = await fetchPeerPublicKey(viewerUserId);
        if (!peerPublicKey) return null;
        const wrap = wrapStatusKeyFor(statusKey, peerPublicKey, myKeys.secretKey, myKeys.publicKey);
        return { viewerUserId, ...wrap };
      }),
    )
  ).filter((w): w is { viewerUserId: string } & KStatusWrappedKey => w !== null);

  const wrappedKeys = [selfWrap, ...contactWraps];

  const socket = await getRealtimeSocket();
  const res = await emitAck<{ ok: boolean; status?: { id: string; createdAt: string; expiresAt: string }; error?: string }>(
    socket,
    'status:post',
    { ciphertext, wrappedKeys },
  );
  if (!res.ok || !res.status) return null;
  return res.status;
}

export async function listStatuses(): Promise<VisibleKStatus[]> {
  const socket = await getRealtimeSocket();
  const res = await emitAck<{ ok: boolean; statuses?: VisibleKStatus[] }>(socket, 'status:list', {});
  return res.ok && res.statuses ? res.statuses : [];
}

export async function deleteStatus(statusId: string): Promise<boolean> {
  const socket = await getRealtimeSocket();
  const res = await emitAck<{ ok: boolean }>(socket, 'status:delete', { statusId });
  return res.ok;
}

/**
 * Opens a status for display: my own statuses decrypt with my own identity
 * secret key wrapped-for-self at post time (I'm in my own contact list's
 * wrap target set only if I wrapped for myself — see openStatus contract
 * below, which instead recognizes "my own status" by ownerId and opens it
 * using the same wrapped-key row if present, or shows it in plaintext-known
 * form to its own author via the composer's local draft instead).
 */
export function openStatus(status: VisibleKStatus, myUserId: string): OpenedKStatus {
  if (!status.myWrappedKey) {
    return { id: status.id, ownerId: status.ownerId, text: null, createdAt: status.createdAt, expiresAt: status.expiresAt };
  }
  try {
    const cached = statusKeyCache.get(myUserId + ':' + status.id);
    let statusKeyB64 = cached ?? null;
    if (!statusKeyB64) return { id: status.id, ownerId: status.ownerId, text: null, createdAt: status.createdAt, expiresAt: status.expiresAt };
    const { c, n } = JSON.parse(status.ciphertext) as { c: string; n: string };
    const opened = nacl.secretbox.open(naclUtil.decodeBase64(c), naclUtil.decodeBase64(n), naclUtil.decodeBase64(statusKeyB64));
    return {
      id: status.id,
      ownerId: status.ownerId,
      text: opened ? naclUtil.encodeUTF8(opened) : null,
      createdAt: status.createdAt,
      expiresAt: status.expiresAt,
    };
  } catch {
    return { id: status.id, ownerId: status.ownerId, text: null, createdAt: status.createdAt, expiresAt: status.expiresAt };
  }
}

// A status's one-time secretbox key must be unwrapped once (async, needs my
// secret key + the wrapper's public key) before openStatus can decrypt
// synchronously. openAllStatuses does that unwrap step up front.
const statusKeyCache = new Map<string, string>(); // `${myUserId}:${statusId}` -> statusKeyB64

export async function unwrapAllStatusKeys(statuses: VisibleKStatus[], myUserId: string): Promise<void> {
  const myKeys = await ensureIdentityKeyPair(myUserId);
  if (!myKeys) return;
  for (const status of statuses) {
    if (!status.myWrappedKey) continue;
    const cacheKey = `${myUserId}:${status.id}`;
    if (statusKeyCache.has(cacheKey)) continue;
    try {
      const opened = nacl.box.open(
        naclUtil.decodeBase64(status.myWrappedKey.wrappedKey),
        naclUtil.decodeBase64(status.myWrappedKey.wrappedNonce),
        naclUtil.decodeBase64(status.myWrappedKey.wrappedByPublicKey),
        naclUtil.decodeBase64(myKeys.secretKey),
      );
      if (opened) statusKeyCache.set(cacheKey, naclUtil.encodeBase64(opened));
    } catch {
      // leave unresolved — openStatus reports it as undecryptable
    }
  }
}

/** All of my current accepted contacts' ids, used as the default audience when posting. */
export async function fetchCurrentContactIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await getBackend().from('contacts').select('contact_id').eq('owner_id', userId);
    if (error || !data) return [];
    return (data as { contact_id: string }[]).map((row) => row.contact_id);
  } catch {
    return [];
  }
}
