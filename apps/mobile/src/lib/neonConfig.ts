const authUrl = process.env.EXPO_PUBLIC_NEON_AUTH_URL?.trim() ?? '';
const dataApiUrl = process.env.EXPO_PUBLIC_NEON_DATA_API_URL?.trim() ?? '';

/**
 * Public K-ssenger Neon endpoints only. These values identify the dedicated
 * backend; they are not database credentials and must never be replaced with
 * another project's endpoints as a fallback.
 */
export const neonConfig = Object.freeze({
  authUrl: authUrl.replace(/\/$/, ''),
  dataApiUrl: dataApiUrl.replace(/\/$/, ''),
});

export const isNeonBackendConfigured = Boolean(neonConfig.authUrl && neonConfig.dataApiUrl);

export function requireNeonBackend() {
  if (!isNeonBackendConfigured) {
    throw new Error('KSSENGER_NEON_BACKEND_NOT_CONFIGURED');
  }
  return neonConfig;
}
