/**
 * Read an environment variable, throwing a clear error if it's missing.
 * Use this at module load time for required config so the bot fails fast
 * with a useful message instead of mysteriously misbehaving later.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
