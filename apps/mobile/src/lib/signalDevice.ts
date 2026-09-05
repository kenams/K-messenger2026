import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { getBackend } from './backend';

export type LocalSignalDevice = { deviceId: string; userId: string; signalDeviceId: number };
type ProvisionedBundle = {
  bundleVersion: number; registrationId: number; identityKey: string;
  signedPreKeyId: number; signedPreKeyPublic: string; signedPreKeySignature: string;
  pqLastResortPreKeyId: number; pqLastResortPreKeyPublic: string; pqLastResortPreKeySignature: string;
  oneTimePreKeys: Array<{ keyId: number; publicKey: string }>;
  pqOneTimePreKeys: Array<{ keyId: number; publicKey: string; signature: string }>;
};
type NativeEncrypted = { kind: 'prekey' | 'signal'; ciphertext: string; algorithm: string };
type NativeSignalBridge = {
  randomUuid: () => Promise<string>;
  getInstallationId: () => Promise<string>;
  provisionDevice: (deviceUuid: string, count: number) => Promise<ProvisionedBundle>;
  hasSession: (deviceUuid: string, remoteUserId: string, remoteSignalDeviceId: number) => Promise<boolean>;
  processRemoteBundle: (payloadJson: string) => Promise<boolean>;
  encrypt: (
    deviceUuid: string, localUserId: string, localSignalDeviceId: number,
    remoteUserId: string, remoteSignalDeviceId: number, plaintext: string,
  ) => Promise<NativeEncrypted>;
  decrypt: (
    deviceUuid: string, localUserId: string, localSignalDeviceId: number,
    remoteUserId: string, remoteSignalDeviceId: number, kind: string, ciphertext: string,
  ) => Promise<string>;
};
type RemoteDeviceRow = { id: string; user_id: string; name: string };
type ClaimedBundle = {
  device_id: string; user_id: string; registration_id: number; identity_key: string;
  signed_prekey_id: number; signed_prekey_public: string; signed_prekey_signature: string;
  one_time_prekey_id: number | null; one_time_prekey_public: string | null;
  pq_prekey_id: number; pq_prekey_public: string; pq_prekey_signature: string;
  pq_is_last_resort: boolean; bundle_version: number;
};
type MultiDeviceEnvelope = {
  v: 1;
  scheme: 'signal-libsignal';
  recipients: Record<string, { kind: 'prekey' | 'signal'; ciphertext: string }>;
};

const bridge = requireOptionalNativeModule<NativeSignalBridge>('KssengerSignalBridge');
function nativeBridge(): NativeSignalBridge {
  if (Platform.OS !== 'android' || !bridge) throw new Error('KSSENGER_SIGNAL_ANDROID_UNAVAILABLE');
  return bridge;
}

export function signalDeviceNumber(deviceUuid: string): number {
  const normalized = deviceUuid.replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) throw new Error('INVALID_DEVICE_UUID');
  return (Number.parseInt(normalized.slice(0, 8), 16) % 127) + 1;
}

export async function newEncryptedMessageId(): Promise<string> { return nativeBridge().randomUuid(); }

export async function ensureLocalSignalDevice(userId: string): Promise<LocalSignalDevice> {
  const native = nativeBridge();
  const installationId = await native.getInstallationId();
  const deviceName = `K-ssenger Android ${installationId.slice(0, 8)}`;
  const lookup = await getBackend().from('devices').select('id,user_id,name,revoked_at')
    .eq('user_id', userId).eq('name', deviceName).is('revoked_at', null).limit(1);
  if (lookup.error) throw lookup.error;
  let deviceId = String(((lookup.data ?? []) as unknown as Array<{ id?: string }>)[0]?.id ?? '');
  if (!deviceId) {
    const inserted = await getBackend().from('devices').insert({ user_id: userId, name: deviceName }).select('id').single();
    if (inserted.error || !inserted.data?.id) throw inserted.error ?? new Error('DEVICE_CREATE_FAILED');
    deviceId = String(inserted.data.id);
  }

  const existingBundle = await getBackend().from('device_key_bundles').select('device_id,bundle_version')
    .eq('device_id', deviceId).maybeSingle();
  if (existingBundle.error) throw existingBundle.error;
  if (!existingBundle.data) {
    const provisioned = await native.provisionDevice(deviceId, 20);
    try {
      const bundleInsert = await getBackend().from('device_key_bundles').insert({
        device_id: deviceId, user_id: userId, bundle_version: provisioned.bundleVersion,
        registration_id: provisioned.registrationId, identity_key: provisioned.identityKey,
        signed_prekey_id: provisioned.signedPreKeyId, signed_prekey_public: provisioned.signedPreKeyPublic,
        signed_prekey_signature: provisioned.signedPreKeySignature,
        pq_last_resort_prekey_id: provisioned.pqLastResortPreKeyId,
        pq_last_resort_prekey_public: provisioned.pqLastResortPreKeyPublic,
        pq_last_resort_prekey_signature: provisioned.pqLastResortPreKeySignature,
      });
      if (bundleInsert.error) throw bundleInsert.error;
      const ecInsert = await getBackend().from('device_one_time_prekeys').insert(provisioned.oneTimePreKeys.map((key) => ({
        device_id: deviceId, key_id: key.keyId, public_key: key.publicKey,
      })));
      if (ecInsert.error) throw ecInsert.error;
      const pqInsert = await getBackend().from('device_pq_one_time_prekeys').insert(provisioned.pqOneTimePreKeys.map((key) => ({
        device_id: deviceId, key_id: key.keyId, public_key: key.publicKey, signature: key.signature,
      })));
      if (pqInsert.error) throw pqInsert.error;
    } catch (error) {
      await Promise.allSettled([
        getBackend().from('device_one_time_prekeys').delete().eq('device_id', deviceId),
        getBackend().from('device_pq_one_time_prekeys').delete().eq('device_id', deviceId),
        getBackend().from('device_key_bundles').delete().eq('device_id', deviceId),
      ]);
      throw error;
    }
  }
  return { deviceId, userId, signalDeviceId: signalDeviceNumber(deviceId) };
}

async function listRemoteDevices(userIds: string[]): Promise<RemoteDeviceRow[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const response = await getBackend().from('devices').select('id,user_id,name')
    .in('user_id', uniqueIds).is('revoked_at', null).limit(Math.min(50, uniqueIds.length * 10));
  if (response.error) throw response.error;
  return ((response.data ?? []) as unknown) as RemoteDeviceRow[];
}

async function ensureRemoteSession(local: LocalSignalDevice, remote: RemoteDeviceRow) {
  const native = nativeBridge();
  const remoteSignalDeviceId = signalDeviceNumber(remote.id);
  if (await native.hasSession(local.deviceId, remote.user_id, remoteSignalDeviceId)) return;
  const claim = await getBackend().rpc('claim_signal_prekey_bundle', { p_device_id: remote.id });
  if (claim.error) throw claim.error;
  const bundle = ((((claim.data ?? []) as unknown) as ClaimedBundle[])[0]);
  if (!bundle || bundle.device_id !== remote.id || bundle.user_id !== remote.user_id) throw new Error('REMOTE_PREKEY_BUNDLE_INVALID');
  await native.processRemoteBundle(JSON.stringify({
    deviceUuid: local.deviceId,
    localUserId: local.userId,
    localSignalDeviceId: local.signalDeviceId,
    remoteUserId: remote.user_id,
    remoteSignalDeviceId,
    registrationId: bundle.registration_id,
    identityKey: bundle.identity_key,
    signedPreKeyId: bundle.signed_prekey_id,
    signedPreKeyPublic: bundle.signed_prekey_public,
    signedPreKeySignature: bundle.signed_prekey_signature,
    oneTimePreKeyId: bundle.one_time_prekey_id,
    oneTimePreKeyPublic: bundle.one_time_prekey_public,
    pqPreKeyId: bundle.pq_prekey_id,
    pqPreKeyPublic: bundle.pq_prekey_public,
    pqPreKeySignature: bundle.pq_prekey_signature,
  }));
}

export async function encryptForUsers(userId: string, recipientUserIds: string[], plaintext: string) {
  const local = await ensureLocalSignalDevice(userId);
  const remotes = await listRemoteDevices(recipientUserIds.filter((id) => id !== userId));
  const expectedUsers = new Set(recipientUserIds.filter((id) => id !== userId));
  const availableUsers = new Set(remotes.map((device) => device.user_id));
  for (const expected of expectedUsers) {
    if (!availableUsers.has(expected)) throw new Error('RECIPIENT_HAS_NO_SIGNAL_DEVICE');
  }
  if (!remotes.length) throw new Error('NO_REMOTE_SIGNAL_DEVICES');

  const recipients: MultiDeviceEnvelope['recipients'] = {};
  for (const remote of remotes) {
    await ensureRemoteSession(local, remote);
    const encrypted = await nativeBridge().encrypt(
      local.deviceId, local.userId, local.signalDeviceId,
      remote.user_id, signalDeviceNumber(remote.id), plaintext,
    );
    recipients[remote.id] = { kind: encrypted.kind, ciphertext: encrypted.ciphertext };
  }
  const envelope: MultiDeviceEnvelope = { v: 1, scheme: 'signal-libsignal', recipients };
  return { senderDeviceId: local.deviceId, algorithm: 'signal-libsignal-multidevice-v1', ciphertext: JSON.stringify(envelope) };
}

export async function encryptDirectForContact(userId: string, contactId: string, plaintext: string) {
  return encryptForUsers(userId, [contactId], plaintext);
}

export async function decryptSignalEnvelope(
  userId: string, senderUserId: string, senderDeviceId: string, ciphertext: string,
): Promise<string> {
  const local = await ensureLocalSignalDevice(userId);
  const envelope = JSON.parse(ciphertext) as Partial<MultiDeviceEnvelope>;
  if (envelope.v !== 1 || envelope.scheme !== 'signal-libsignal' || !envelope.recipients) throw new Error('INVALID_SIGNAL_ENVELOPE');
  const recipient = envelope.recipients[local.deviceId];
  if (!recipient || (recipient.kind !== 'prekey' && recipient.kind !== 'signal')) throw new Error('SIGNAL_ENVELOPE_NOT_FOR_THIS_DEVICE');
  return nativeBridge().decrypt(
    local.deviceId, userId, local.signalDeviceId, senderUserId,
    signalDeviceNumber(senderDeviceId), recipient.kind, recipient.ciphertext,
  );
}

export const decryptDirectFromContact = decryptSignalEnvelope;
