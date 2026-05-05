import { existsSync, readFileSync, writeFileSync } from "node:fs";

export class CookieJar {
  #cookies: Record<string, string> = {};
  readonly #path: string;

  constructor(path: string) {
    this.#path = path;
    this.#load();
  }

  header(): string {
    return Object.entries(this.#cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  csrfToken(): string | null {
    return this.#cookies["csrftoken"] ?? null;
  }

  ingest(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";")[0];
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.#cookies[pair.substring(0, eq).trim()] = pair
        .substring(eq + 1)
        .trim();
    }
  }

  save(): void {
    writeFileSync(this.#path, JSON.stringify(this.#cookies, null, 2));
  }

  #load(): void {
    if (!existsSync(this.#path)) return;
    try {
      const raw: unknown = JSON.parse(readFileSync(this.#path, "utf-8"));
      if (Array.isArray(raw)) {
        this.#ingestPlaywrightFormat(raw);
      } else if (typeof raw === "object" && raw !== null) {
        for (const [k, v] of Object.entries(raw)) {
          this.#cookies[k] = String(v);
        }
      }
    } catch {
      // Corrupt cookie file, ignore.
    }
  }

  #ingestPlaywrightFormat(entries: unknown[]): void {
    for (const entry of entries) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        "name" in entry &&
        "value" in entry &&
        typeof entry.name === "string"
      ) {
        this.#cookies[entry.name] = String(entry.value);
      }
    }
  }
}
