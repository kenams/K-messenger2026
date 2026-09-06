import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type KssengerE2eeStatus = {
  available: boolean;
  protocol: 'signal-libsignal' | 'unavailable';
  nativeVersion?: string;
  libsignalLoaded: boolean;
  secureStorageReady: boolean;
  sessionStoreReady: boolean;
  deviceKeyStoreReady: boolean;
  selfTestPassed: boolean;
  reason?: string;
};

type NativeSignalBridge = {
  getStatus?: () => Promise<{
    nativeVersion?: string;
    libsignalLoaded?: boolean;
    secureStorageReady?: boolean;
    sessionStoreReady?: boolean;
    deviceKeyStoreReady?: boolean;
    selfTestPassed?: boolean;
  }>;
};

const bridge = requireOptionalNativeModule<NativeSignalBridge>('KssengerSignalBridge');

function unavailable(reason: string): KssengerE2eeStatus {
  return {
    available: false,
    protocol: 'unavailable',
    libsignalLoaded: false,
    secureStorageReady: false,
    sessionStoreReady: false,
    deviceKeyStoreReady: false,
    selfTestPassed: false,
    reason,
  };
}

/**
 * Fail-closed E2EE capability probe.
 *
 * This module never performs cryptography in JavaScript. It only reports whether
 * the vetted native libsignal runtime and secure native stores have proven readiness.
 * Message composition must remain locked unless every readiness bit is true.
 */
export async function getKssengerE2eeStatus(): Promise<KssengerE2eeStatus> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return unavailable('UNSUPPORTED_PLATFORM');

  if (!bridge || typeof bridge.getStatus !== 'function') {
    return unavailable('NATIVE_LIBSIGNAL_BRIDGE_MISSING');
  }

  try {
    const status = await bridge.getStatus();
    const libsignalLoaded = status.libsignalLoaded === true;
    const secureStorageReady = status.secureStorageReady === true;
    const sessionStoreReady = status.sessionStoreReady === true;
    const deviceKeyStoreReady = status.deviceKeyStoreReady === true;
    const selfTestPassed = status.selfTestPassed === true;
    const available = libsignalLoaded && secureStorageReady && sessionStoreReady && deviceKeyStoreReady && selfTestPassed;

    return {
      available,
      protocol: available ? 'signal-libsignal' : 'unavailable',
      nativeVersion: status.nativeVersion,
      libsignalLoaded,
      secureStorageReady,
      sessionStoreReady,
      deviceKeyStoreReady,
      selfTestPassed,
      reason: available ? undefined : 'NATIVE_LIBSIGNAL_NOT_READY',
    };
  } catch {
    return unavailable('NATIVE_LIBSIGNAL_STATUS_FAILED');
  }
}

export function canUnlockPrivateComposer(status: KssengerE2eeStatus) {
  return status.available
    && status.protocol === 'signal-libsignal'
    && status.libsignalLoaded
    && status.secureStorageReady
    && status.sessionStoreReady
    && status.deviceKeyStoreReady
    && status.selfTestPassed;
}
