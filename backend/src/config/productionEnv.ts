/** Fail closed when production is missing the public browser origin. */
export function assertProductionConfig(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.NODE_ENV !== 'production') return;
  const origin = (env.CORS_ORIGIN || '').trim();
  if (!origin) {
    throw new Error('FATAL: CORS_ORIGIN must be set in production');
  }
}
