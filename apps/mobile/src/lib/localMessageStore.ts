import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeLocalMessageBridge = {
  store: (userId: string, messageId: string, plaintext: string) => Promise<boolean>;
  load: (userId: string, messageId: string) => Promise<string | null>;
  remove: (userId: string, messageId: string) => Promise<boolean>;
};

const bridge = requireOptionalNativeModule<NativeLocalMessageBridge>('KssengerLocalMessageBridge');

function nativeBridge(): NativeLocalMessageBridge {
  if (Platform.OS !== 'android' || !bridge) throw new Error('KSSENGER_LOCAL_MESSAGE_STORE_UNAVAILABLE');
  return bridge;
}

export async function storeLocalMessage(userId: string, messageId: string, plaintext: string) {
  await nativeBridge().store(userId, messageId, plaintext);
}

export async function loadLocalMessage(userId: string, messageId: string): Promise<string | null> {
  return nativeBridge().load(userId, messageId);
}

export async function removeLocalMessage(userId: string, messageId: string) {
  await nativeBridge().remove(userId, messageId);
}
