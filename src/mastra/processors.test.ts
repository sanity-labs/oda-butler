import type { ProcessInputArgs } from "@mastra/core/processors";
import { expect, test } from "vitest";
import { ensureUserLast } from "./processors.ts";

type Msg = { id: string; role: "user" | "assistant" };

const run = (messages: Msg[]): Msg[] => {
  const args = {
    messages,
    systemMessages: [],
    state: {},
  } as unknown as ProcessInputArgs;
  // The InputProcessor type is a union; runtime processInput is always defined here.
  const result = ensureUserLast.processInput?.(args);
  return result as unknown as Msg[];
};

test("leaves a user-tail conversation untouched", () => {
  const out = run([
    { id: "a", role: "user" },
    { id: "b", role: "assistant" },
    { id: "c", role: "user" },
  ]);
  expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
});

test("drops a single trailing assistant turn", () => {
  const out = run([
    { id: "a", role: "user" },
    { id: "b", role: "assistant" },
    { id: "c", role: "user" },
    { id: "d", role: "assistant" },
  ]);
  expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
});

test("drops multiple contiguous trailing non-user turns", () => {
  const out = run([
    { id: "a", role: "user" },
    { id: "b", role: "assistant" },
    { id: "c", role: "assistant" },
  ]);
  expect(out.map((m) => m.id)).toEqual(["a"]);
});

test("empty input is a no-op", () => {
  const out = run([]);
  expect(out).toEqual([]);
});
