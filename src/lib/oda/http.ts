import type { CookieJar } from "./cookie-jar.ts";
import { OdaSessionExpiredError, OdaTooEarlyError } from "./errors.ts";
import { extractNextData } from "./next-data.ts";

export const ODA_BASE_URL = "https://oda.com/no";
export const ODA_API_BASE = "https://oda.com";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "no,nb;q=0.9,en;q=0.8",
};

const HTML_ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

type FetchInit = RequestInit & { accept?: string; skipRelogin?: boolean };

export type ReloginHook = () => Promise<boolean>;

export class OdaTransport {
  readonly #cookies: CookieJar;
  #relogin: ReloginHook | null = null;
  #reloginInFlight: Promise<boolean> | null = null;

  constructor(cookies: CookieJar) {
    this.#cookies = cookies;
  }

  /** Wire an optional re-auth callback. Called once per expired session. */
  setReloginHook(hook: ReloginHook | null): void {
    this.#relogin = hook;
  }

  /**
   * All requests go through here. Throws on rate-limiting; on session expiry,
   * tries the re-login hook (if set) and retries the request once before
   * giving up. Pass `init.skipRelogin = true` for requests that ARE the
   * relogin (login flow itself) to avoid recursion.
   */
  async request(url: string, init: FetchInit = {}): Promise<Response> {
    const { skipRelogin, ...rest } = init;
    const response = await this.#dispatch(url, rest);
    if (response.status === 425) throw new OdaTooEarlyError();
    if (response.status !== 401 && response.status !== 403) return response;
    if (skipRelogin) throw new OdaSessionExpiredError();

    const recovered = await this.#tryRelogin();
    if (!recovered) throw new OdaSessionExpiredError();

    const retry = await this.#dispatch(url, rest);
    if (retry.status === 401 || retry.status === 403) {
      throw new OdaSessionExpiredError();
    }
    if (retry.status === 425) throw new OdaTooEarlyError();
    return retry;
  }

  async #dispatch(url: string, init: FetchInit): Promise<Response> {
    const { accept, headers: extra, ...rest } = init;
    const csrf = this.#cookies.csrfToken();
    const response = await fetch(url, {
      ...rest,
      headers: {
        ...DEFAULT_HEADERS,
        Accept: accept ?? "application/json",
        Cookie: this.#cookies.header(),
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
        ...extra,
      },
    });
    this.#cookies.ingest(response);
    return response;
  }

  /**
   * Run the relogin hook, deduplicating concurrent calls so a burst of
   * expired requests only triggers one login round-trip.
   */
  async #tryRelogin(): Promise<boolean> {
    if (!this.#relogin) return false;
    if (this.#reloginInFlight) return this.#reloginInFlight;
    const hook = this.#relogin;
    this.#reloginInFlight = (async () => {
      try {
        return await hook();
      } finally {
        this.#reloginInFlight = null;
      }
    })();
    return this.#reloginInFlight;
  }

  async getHtml(url: string, follow = true): Promise<Response> {
    return this.request(url, {
      accept: HTML_ACCEPT,
      redirect: follow ? "follow" : "manual",
    });
  }

  async getJson(url: string, referer = `${ODA_BASE_URL}/`): Promise<Response> {
    return this.request(url, {
      headers: { Origin: ODA_API_BASE, Referer: referer },
      redirect: "follow",
    });
  }

  async postJson(
    url: string,
    body: unknown,
    referer = `${ODA_BASE_URL}/`,
  ): Promise<Response> {
    return this.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ODA_API_BASE,
        Referer: referer,
      },
      body: JSON.stringify(body),
      redirect: "manual",
    });
  }

  async fetchNextData(url: string): Promise<unknown> {
    const response = await this.getHtml(url);
    return extractNextData(await response.text());
  }
}
