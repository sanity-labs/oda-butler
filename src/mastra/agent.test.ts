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
