export class OdaSessionExpiredError extends Error {
  constructor() {
    super("Oda session expired. Run `bun run oda:login` to re-authenticate.");
    this.name = "OdaSessionExpiredError";
  }
}

export class OdaTooEarlyError extends Error {
  constructor() {
    super("Oda returned 425 Too Early. Try again in a moment.");
    this.name = "OdaTooEarlyError";
  }
}

/**
 * Ensure a response succeeded. Session/rate-limit errors are already thrown
 * upstream by the transport, so callers only need this for "did the action
 * I requested actually go through" checks (e.g. cart writes).
 */
export async function ensureOk(
  response: Response,
  action: string,
): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => "");
  const detail = body ? `: ${body.slice(0, 500)}` : "";
  throw new Error(`${action} failed (HTTP ${response.status})${detail}`);
}
