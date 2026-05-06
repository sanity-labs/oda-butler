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

/** Minimal Thread shape with an `allMessages` async iterable. */
const fakeThread = (history: Message[]): Thread => {
  return {
    async *[Symbol.asyncIterator]() {
      // not used
    },
    get allMessages() {
      return (async function* () {
        for (const m of history) yield m;
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
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
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
  expect(att?.contentType).toBe("image/jpeg");
  expect(att?.name).toBe("fridge.jpg");
  expect(att?.url).toMatch(/^data:image\/jpeg;base64,/);
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
