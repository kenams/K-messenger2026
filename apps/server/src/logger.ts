type LogContext = Record<string, unknown>;

const REDACT_KEYS = new Set([
  'accessToken', 'authorization', 'password', 'token', 'jwt', 'privateKey',
  'recoveryKey', 'ciphertext', 'plaintext', 'message', 'latitude', 'longitude'
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(key) ? '[REDACTED]' : sanitize(val);
  }
  return out;
}

export const logger = {
  info(event: string, context: LogContext = {}) {
    console.info(JSON.stringify({ level: 'info', event, ...sanitize(context) as object }));
  },
  warn(event: string, context: LogContext = {}) {
    console.warn(JSON.stringify({ level: 'warn', event, ...sanitize(context) as object }));
  },
  error(event: string, context: LogContext = {}) {
    console.error(JSON.stringify({ level: 'error', event, ...sanitize(context) as object }));
  },
};

export { sanitize as sanitizeLogContext };
