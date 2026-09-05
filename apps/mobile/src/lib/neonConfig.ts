const authUrl = process.env.EXPO_PUBLIC_NEON_AUTH_URL?.trim() ?? '';
const dataApiUrl = process.env.EXPO_PUBLIC_NEON_DATA_API_URL?.trim() ?? '';

const KSSENGER_AUTH_URL = 'https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth';
const KSSENGER_DATA_API_URL = 'https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1';

function normalizePublicEndpoint(value: string) {
  return value.replace(/\/+$/, '');
}

/**
 * Public K-ssenger Neon endpoints only. These values identify the dedicated
 * backend; they are not database credentials. Fail closed if configuration is
 * absent or points at any other Neon project/database instead of silently
 * falling back to a foreign backend.
 */
export const neonConfig = Object.freeze({
  authUrl: normalizePublicEndpoint(authUrl),
  dataApiUrl: normalizePublicEndpoint(dataApiUrl),
});

export const isNeonBackendConfigured =
  neonConfig.authUrl === KSSENGER_AUTH_URL &&
  neonConfig.dataApiUrl === KSSENGER_DATA_API_URL;

export function requireNeonBackend() {
  if (!isNeonBackendConfigured) {
    throw new Error('KSSENGER_NEON_BACKEND_NOT_CONFIGURED');
  }
  return neonConfig;
}
