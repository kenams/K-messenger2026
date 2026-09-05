import { NativeModules, Platform } from 'react-native';

export type KssengerE2eeStatus = {
  available: boolean;
  protocol: 'signal-libsignal' | 'unavailable';
  nativeVersion?: string;
  secureStorageReady: boolean;
  sessionStoreReady: boolean;
  deviceKeyStoreReady: boolean;
  selfTestPassed: boolean;
  reason?: string;
};

type NativeSignalBridge = {
  getStatus?: () => Promise<{
    nativeVersion?: string;
    secureStorageReady?: boolean;
    sessionStoreReady?: boolean;
    deviceKeyStoreReady?: boolean;
    selfTestPassed?: boolean;
  }>;
};

const bridge = NativeModules.KssengerSignalBridge as NativeSignalBridge | undefined;

/**
 * Fail-closed E2EE capability probe.
 *
 * This module never performs cryptography in JavaScript. It only reports whether
 * the vetted native libsignal bridge and its secure stores have proven readiness.
 * Message composition must remain locked unless every readiness bit is true.
 */
export async function getKssengerE2eeStatus(): Promise<KssengerE2eeStatus> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return {
      available: false,
      protocol: 'unavailable',
      secureStorageReady: false,
      sessionStoreReady: false,
      deviceKeyStoreReady: false,
      selfTestPassed: false,
      reason: 'UNSUPPORTED_PLATFORM',
    };
  }

  if (!bridge || typeof bridge.getStatus !== 'function') {
    return {
      available: false,
      protocol: 'unavailable',
      secureStorageReady: false,
      sessionStoreReady: false,
      deviceKeyStoreReady: false,
      selfTestPassed: false,
      reason: 'NATIVE_LIBSIGNAL_BRIDGE_MISSING',
    };
  }

  try {
    const status = await bridge.getStatus();
    const secureStorageReady = status.secureStorageReady === true;
    const sessionStoreReady = status.sessionStoreReady === true;
    const deviceKeyStoreReady = status.deviceKeyStoreReady === true;
    const selfTestPassed = status.selfTestPassed === true;
    const available = secureStorageReady && sessionStoreReady && deviceKeyStoreReady && selfTestPassed;

    return {
      available,
      protocol: available ? 'signal-libsignal' : 'unavailable',
      nativeVersion: status.nativeVersion,
      secureStorageReady,
      sessionStoreReady,
      deviceKeyStoreReady,
      selfTestPassed,
      reason: available ? undefined : 'NATIVE_LIBSIGNAL_NOT_READY',
    };
  } catch {
    return {
      available: false,
      protocol: 'unavailable',
      secureStorageReady: false,
      sessionStoreReady: false,
      deviceKeyStoreReady: false,
      selfTestPassed: false,
      reason: 'NATIVE_LIBSIGNAL_STATUS_FAILED',
    };
  }
}

export function canUnlockPrivateComposer(status: KssengerE2eeStatus) {
  return status.available
    && status.protocol === 'signal-libsignal'
    && status.secureStorageReady
    && status.sessionStoreReady
    && status.deviceKeyStoreReady
    && status.selfTestPassed;
}
