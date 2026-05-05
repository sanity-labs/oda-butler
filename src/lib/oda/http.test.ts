import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CookieJar } from "./cookie-jar.ts";
import { OdaSessionExpiredError } from "./errors.ts";
import { OdaTransport } from "./http.ts";

type FetchMock = ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let mockFetch: FetchMock;

function makeJar(): CookieJar {
  // CookieJar refuses to load from non-existent paths gracefully, so /tmp is fine.
  return new CookieJar(`/tmp/test-cookies-${Date.now()}-${Math.random()}.json`);
}

const ok = (status = 200) =>
  new Response(JSON.stringify({ ok: true }), { status });
const expired = () => new Response("nope", { status: 401 });

beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("throws OdaSessionExpiredError on 401 without a relogin hook", async () => {
  mockFetch.mockResolvedValueOnce(expired());
  const transport = new OdaTransport(makeJar());
  await expect(transport.request("https://oda.com/x")).rejects.toBeInstanceOf(
    OdaSessionExpiredError,
  );
});

test("retries after successful relogin", async () => {
  mockFetch
    .mockResolvedValueOnce(expired()) // initial request
    .mockResolvedValueOnce(ok()); // retry succeeds

  const transport = new OdaTransport(makeJar());
  const relogin = vi.fn().mockResolvedValue(true);
  transport.setReloginHook(relogin);

  const response = await transport.request("https://oda.com/x");
  expect(response.status).toBe(200);
  expect(relogin).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("gives up if relogin returns false", async () => {
  mockFetch.mockResolvedValueOnce(expired());
  const transport = new OdaTransport(makeJar());
  transport.setReloginHook(async () => false);

  await expect(transport.request("https://oda.com/x")).rejects.toBeInstanceOf(
    OdaSessionExpiredError,
  );
});

test("gives up if retry also fails with 401", async () => {
  mockFetch.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired());
  const transport = new OdaTransport(makeJar());
  transport.setReloginHook(async () => true);

  await expect(transport.request("https://oda.com/x")).rejects.toBeInstanceOf(
    OdaSessionExpiredError,
  );
  expect(mockFetch).toHaveBeenCalledTimes(2);
});

test("dedupes concurrent expired requests into one relogin", async () => {
  // 3 parallel requests, all hit 401, then all retry successfully.
  mockFetch
    .mockResolvedValueOnce(expired())
    .mockResolvedValueOnce(expired())
    .mockResolvedValueOnce(expired())
    .mockResolvedValueOnce(ok())
    .mockResolvedValueOnce(ok())
    .mockResolvedValueOnce(ok());

  const transport = new OdaTransport(makeJar());
  let reloginCalls = 0;
  transport.setReloginHook(async () => {
    reloginCalls += 1;
    // Yield so other callers can join the in-flight promise.
    await Promise.resolve();
    return true;
  });

  await Promise.all([
    transport.request("https://oda.com/a"),
    transport.request("https://oda.com/b"),
    transport.request("https://oda.com/c"),
  ]);
  expect(reloginCalls).toBe(1);
});

test("skipRelogin requests bail immediately on 401 without invoking the hook", async () => {
  mockFetch.mockResolvedValueOnce(expired());
  const transport = new OdaTransport(makeJar());
  const relogin = vi.fn().mockResolvedValue(true);
  transport.setReloginHook(relogin);

  await expect(
    transport.request("https://oda.com/x", { skipRelogin: true }),
  ).rejects.toBeInstanceOf(OdaSessionExpiredError);
  expect(relogin).not.toHaveBeenCalled();
});
