import { MessageList } from "@mastra/core/agent";
import { expect, test } from "vitest";

const PAST = (s: number) => new Date(s * 1000);

const dbMsg = (
  id: string,
  role: "user" | "assistant",
  text: string,
  ts: number,
) => ({
  id,
  role,
  content: { format: 2 as const, parts: [{ type: "text" as const, text }] },
  createdAt: PAST(ts),
});

const ids = (list: MessageList) => list.get.all.db().map((m) => m.id);

test("MessageList sorts scrambled input by supplied createdAt", () => {
  const list = new MessageList();
  list.add(
    [
      dbMsg("B", "user", "B", 1700000002),
      dbMsg("A", "user", "A", 1700000001),
      dbMsg("D", "assistant", "D", 1700000004),
      dbMsg("C", "user", "C", 1700000003),
    ] as never,
    "input",
  );
  expect(ids(list)).toEqual(["A", "B", "C", "D"]);
});

test("MessageList honors supplied createdAt timestamp (not Date.now)", () => {
  const list = new MessageList();
  list.add([dbMsg("A", "user", "x", 1700000001)] as never, "input");
  const out = list.get.all.db()[0];
  expect(out?.createdAt?.toISOString()).toBe("2023-11-14T22:13:21.000Z");
});

test("MessageList dedupes identical messages by id within a single add", () => {
  const list = new MessageList();
  list.add(
    [
      dbMsg("A", "user", "first", 1700000001),
      dbMsg("A", "user", "first", 1700000001),
      dbMsg("A", "user", "first", 1700000001),
    ] as never,
    "input",
  );
  expect(ids(list)).toEqual(["A"]);
});

test("MessageList ends with whatever has the latest createdAt", () => {
  // Anthropic's newer models reject conversations ending with an assistant
  // turn. We rely on this Mastra behavior: pass an assistant turn with an
  // earlier createdAt than the user's current mention and it lands second-
  // to-last after sorting. buildConversation's `< currentTs` filter is the
  // belt-and-braces guard for cases where the API surprises us.
  const list = new MessageList();
  list.add(
    [
      dbMsg("prior-assistant", "assistant", "old reply", 1700000001),
      dbMsg("current-user", "user", "now", 1700000002),
    ] as never,
    "input",
  );
  const all = list.get.all.db();
  expect(all.at(-1)?.role).toBe("user");
});

test("MessageList dedupes across separate adds (replay safety)", () => {
  const list = new MessageList();
  list.add(
    [
      dbMsg("M1", "user", "first", 1700000001),
      dbMsg("M2", "assistant", "reply", 1700000002),
    ] as never,
    "input",
  );
  list.add(
    [
      dbMsg("M1", "user", "first", 1700000001),
      dbMsg("M2", "assistant", "reply", 1700000002),
      dbMsg("M3", "user", "follow-up", 1700000003),
    ] as never,
    "input",
  );
  expect(ids(list)).toEqual(["M1", "M2", "M3"]);
});
