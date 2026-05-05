export type Credentials = { email: string; password: string };

/**
 * Optional credentials for automatic re-login. If both env vars are present,
 * the OdaClient will silently re-authenticate when Oda's session expires.
 * Otherwise an `OdaSessionExpiredError` surfaces and the user has to run
 * `bun run oda:login` manually.
 */
export function loadCredentials(): Credentials | null {
  const email = process.env.ODA_EMAIL;
  const password = process.env.ODA_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
