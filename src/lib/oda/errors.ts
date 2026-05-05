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

/**
 * Pull a human-readable error out of a product-list 4xx response. The endpoint
 * returns `{ errors: [...], field_errors: {...} }`. Falls back to the status
 * code when the body is empty or unparseable.
 */
export function extractListError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: unknown;
      field_errors?: Record<string, { message?: unknown }>;
    };
    const errors = Array.isArray(parsed.errors)
      ? parsed.errors.filter((e): e is string => typeof e === "string")
      : [];
    if (errors.length > 0) return errors.join("; ");
    const fieldMessages = Object.values(parsed.field_errors ?? {})
      .map((entry) =>
        typeof entry?.message === "string" ? entry.message : null,
      )
      .filter((msg): msg is string => msg !== null);
    if (fieldMessages.length > 0) return fieldMessages.join("; ");
  } catch {
    // fall through
  }
  return `HTTP ${status}`;
}
