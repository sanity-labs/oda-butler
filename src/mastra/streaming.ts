import type { ChunkType } from "@mastra/core/stream";
import { type StreamChunk, StreamingPlan } from "chat";

type AgentStream = AsyncIterable<ChunkType>;

type LabelFn = (
  args: Record<string, unknown>,
  names: ReadonlyMap<number, string>,
) => string;

const TOOL_LABELS: Record<string, LabelFn> = {
  search_products: (a) => `Searching for “${stringArg(a, "query")}”`,
  get_product: (a, names) => {
    const name = productName(a, names);
    return name ? `Looking up ${name}` : "Looking up product details";
  },
  get_recurring_order: () => "Checking the recurring order",
  update_recurring_item: (a, names) => {
    const name = productName(a, names);
    const target = name ? ` ${name}` : "";
    const qty = a.quantity;
    if (typeof qty !== "number")
      return `Updating${target || " the recurring order"}`;
    if (qty === 1) return `Adding${target || " to the recurring order"}`;
    return name ? `Setting ${name} to ${qty}` : `Setting quantity to ${qty}`;
  },
  remove_recurring_item: (a, names) => {
    const name = productName(a, names);
    return name ? `Removing ${name}` : "Removing from the recurring order";
  },
};

function productName(
  args: Record<string, unknown>,
  names: ReadonlyMap<number, string>,
): string | null {
  const id = args.productId;
  return typeof id === "number" ? (names.get(id) ?? null) : null;
}

/**
 * Wrap an agent's `fullStream` so chat-sdk renders tool calls as inline
 * `task_update` cards (the native Slack timeline UI) instead of separate
 * Block Kit messages per tool.
 */
export function asStreamingPlan(stream: AgentStream): StreamingPlan {
  return new StreamingPlan(toChatChunks(stream), { groupTasks: "timeline" });
}

async function* toChatChunks(
  stream: AgentStream,
): AsyncIterable<string | StreamChunk> {
  // The agent often emits text in segments interleaved with tool calls
  // ("On it!" → tool → "Done!"). Slack's stream API concatenates raw text
  // chunks without preserving paragraph breaks, so without an explicit
  // separator the segments collide ("On it!Done!"). We track when we've
  // crossed a non-text chunk and prepend a blank line before the next
  // text segment so paragraphs survive.
  let needsSeparator = false;
  let hasEmittedText = false;

  // Build up an id → name map as products flow through tool results so
  // later tool-call cards can render "Looking up Tine Lettmelk" instead of
  // a stack of identical "Looking up product details" rows. Scoped to this
  // generator invocation — one map per agent turn, GC'd when the stream
  // finishes. Don't hoist to module scope: that would accumulate every
  // product anyone ever mentions for the lifetime of the process.
  const productNames = new Map<number, string>();

  for await (const chunk of stream) {
    if (chunk.type === "text-delta" && chunk.payload.text) {
      if (needsSeparator && hasEmittedText) {
        yield "\n\n";
      }
      needsSeparator = false;
      hasEmittedText = true;
      yield chunk.payload.text;
      continue;
    }

    if (chunk.type === "tool-call") {
      needsSeparator = true;
      yield {
        type: "task_update",
        id: chunk.payload.toolCallId,
        title: humanize(
          chunk.payload.toolName,
          asArgs(chunk.payload.args),
          productNames,
        ),
        status: "in_progress",
      };
      continue;
    }

    if (chunk.type === "tool-result") {
      needsSeparator = true;
      harvestProductNames(chunk.payload.result, productNames);
      yield {
        type: "task_update",
        id: chunk.payload.toolCallId,
        title: humanize(
          chunk.payload.toolName,
          asArgs(chunk.payload.args),
          productNames,
        ),
        status: chunk.payload.isError ? "error" : "complete",
      };
    }
  }
}

/**
 * Walk a tool result and remember any `{ id, name }` pairs we find. Covers
 * search_products (`{ items: Product[] }`), get_product (a single product),
 * get_recurring_order (a list with `items: CartItem[]`), and the change
 * summaries returned by update/remove_recurring_item.
 */
function harvestProductNames(
  result: unknown,
  names: Map<number, string>,
): void {
  if (!result || typeof result !== "object") return;
  const r = result as Record<string, unknown>;

  rememberPair(r.id, r.name, names);
  rememberPair(r.productId, r.name, names);

  for (const key of ["items"]) {
    const list = r[key];
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          rememberPair(e.id, e.name, names);
        }
      }
    }
  }
}

function rememberPair(
  id: unknown,
  name: unknown,
  names: Map<number, string>,
): void {
  if (typeof id === "number" && typeof name === "string" && name) {
    names.set(id, name);
  }
}

function asArgs(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function humanize(
  toolName: string,
  args: Record<string, unknown>,
  names: ReadonlyMap<number, string>,
): string {
  return TOOL_LABELS[toolName]?.(args, names) ?? toolName;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : String(v ?? "?");
}
