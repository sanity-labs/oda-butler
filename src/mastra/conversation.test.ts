import type { Message, Thread } from "chat";
import { expect, test } from "vitest";
import { buildConversation } from "./conversation.ts";

/**
 * Build a fake chat-sdk Message with just the fields buildConversation
 * reads. Cast through `unknown` since we don't need the full class.
 */
const fakeMessage = (overrides: {
  id: string;
  text?: string;
  isMe?: boolean;
  fullName?: string;
  attachments?: Array<{
    type: "image" | "file" | "video" | "audio";
    mimeType?: string;
    name?: string;
    data?: Buffer;
  }>;
}): Message => {
  return {
    id: overrides.id,
    text: overrides.text ?? "",
    author: {
      isMe: overrides.isMe ?? false,
      fullName: overrides.fullName ?? "Alice",
      userName: overrides.fullName ?? "alice",
    },
    attachments: overrides.attachments ?? [],
  } as unknown as Message;
};

/**
 * Minimal Thread shape with a `messages` async iterable. The chat-sdk
 * yields newest-first from `thread.messages`, so we iterate the history
 * array in reverse here. `history` itself stays in chronological order
 * for test readability.
 */
const fakeThread = (history: Message[]): Thread => {
  return {
    async *[Symbol.asyncIterator]() {
      // not used
    },
    get messages() {
      return (async function* () {
        for (let i = history.length - 1; i >= 0; i--) yield history[i];
      })();
    },
  } as unknown as Thread;
};

test("wraps each turn in a <message> envelope with id and speaker", async () => {
  const current = fakeMessage({
    id: "1700000010.000000",
    text: "hey @Oda",
    fullName: "Rosti",
  });
  const turns = await buildConversation(fakeThread([]), current);
  expect(turns).toHaveLength(1);
  const text = turns[0]?.content.parts[0]?.text ?? "";
  expect(text).toContain('id="1700000010.000000"');
  expect(text).toContain('from="Rosti"');
  expect(text).toContain("hey @Oda");
});

test("excludes history at or after current's timestamp", async () => {
  // Anthropic rejects conversations ending in an assistant turn. A stale bot
  // reply with a later ts could otherwise sort to the end after Mastra's
  // chronological sort, so we filter strictly older.
  const stale = fakeMessage({
    id: "1700000020.000000",
    text: "old reply",
    isMe: true,
  });
  const current = fakeMessage({
    id: "1700000010.000000",
    text: "ping",
  });
  const turns = await buildConversation(fakeThread([stale]), current);
  expect(turns.map((t) => t.id)).toEqual(["1700000010.000000"]);
});

test("skips empty messages but keeps image-only ones", async () => {
  const empty = fakeMessage({ id: "1700000001.000000", text: "" });
  const imageOnly = fakeMessage({
    id: "1700000002.000000",
    text: "",
    attachments: [{ type: "image", mimeType: "image/png" }],
  });
  const current = fakeMessage({ id: "1700000003.000000", text: "now" });
  const turns = await buildConversation(
    fakeThread([empty, imageOnly]),
    current,
  );
  expect(turns.map((t) => t.id)).toEqual([
    "1700000002.000000",
    "1700000003.000000",
  ]);
});

test("inlines image attachments as base64 data URLs on the current message only", async () => {
  // Smallest viable PNG that sharp can actually decode and re-encode.
  // Generated with `sharp({create: {2x2 red}}).png().toBuffer()`.
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02,
    0x08, 0x02, 0x00, 0x00, 0x00, 0xfd, 0xd4, 0x9a, 0x73, 0x00, 0x00, 0x00,
    0x09, 0x70, 0x48, 0x59, 0x73, 0x00, 0x00, 0x03, 0xe8, 0x00, 0x00, 0x03,
    0xe8, 0x01, 0xb5, 0x7b, 0x52, 0x6b, 0x00, 0x00, 0x00, 0x13, 0x49, 0x44,
    0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x9f, 0x01, 0x8c,
    0xff, 0x33, 0x30, 0x00, 0x00, 0x1f, 0xee, 0x03, 0xfd, 0x35, 0x1b, 0x00,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60,
    0x82,
  ]);
  const olderImg = fakeMessage({
    id: "1700000001.000000",
    text: "look",
    attachments: [{ type: "image", mimeType: "image/png", data: png }],
  });
  const current = fakeMessage({
    id: "1700000002.000000",
    text: "current",
    attachments: [
      { type: "image", mimeType: "image/jpeg", data: png, name: "fridge.jpg" },
    ],
  });
  const turns = await buildConversation(fakeThread([olderImg]), current);

  // Older message: no inlined attachments (text only).
  const older = turns.find((t) => t.id === "1700000001.000000");
  expect(older?.content.experimental_attachments).toBeUndefined();

  // Current message: image inlined as data URL.
  const now = turns.find((t) => t.id === "1700000002.000000");
  expect(now?.content.experimental_attachments).toHaveLength(1);
  const att = now?.content.experimental_attachments?.[0];
  // sharp re-encodes everything to JPEG regardless of input mime.
  expect(att?.contentType).toBe("image/jpeg");
  expect(att?.name).toBe("fridge.jpg");
  expect(att?.url).toMatch(/^data:image\/jpeg;base64,/);
});

test("current message createdAt is forced into the future to defeat prefill", async () => {
  // Mastra's memory layer can replay assistant turns whose persisted
  // createdAt is a hair later than the Slack ts of a fresh mention
  // (clock skew, batch persistence delay). Anthropic rejects the
  // resulting conversation with "This model does not support assistant
  // message prefill. The conversation must end with a user message."
  // Defense: stamp the current mention with `Date.now() + 60s` so it
  // sorts last regardless of any persisted assistant turn.
  const current = fakeMessage({ id: "1700000001.000000", text: "now" });
  const turns = await buildConversation(fakeThread([]), current);
  const currentTurn = turns[0];
  expect(currentTurn?.id).toBe("1700000001.000000");
  expect(currentTurn?.createdAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
});

test("escapes special chars in the from= attribute", async () => {
  const current = fakeMessage({
    id: "1700000001.000000",
    text: "hi",
    fullName: 'Quote " & <Test>',
  });
  const turns = await buildConversation(fakeThread([]), current);
  const text = turns[0]?.content.parts[0]?.text ?? "";
  expect(text).toContain('from="Quote &quot; &amp; &lt;Test&gt;"');
});
