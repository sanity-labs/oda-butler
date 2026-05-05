import { StreamingPlan, type StreamChunk } from "chat";
import type { ChunkType } from "@mastra/core/stream";

type AgentStream = AsyncIterable<ChunkType>;

const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  search_products: (a) => `Searching for "${stringArg(a, "query")}"`,
  list_orders: () => "Fetching past orders",
  get_order: (a) => `Reading order ${stringArg(a, "orderNumber")}`,
  get_next_delivery: () => "Checking next delivery",
  get_recurring_order: () => "Reading recurring order",
  update_recurring_item: (a) => {
    const qty = a.quantity;
    return typeof qty === "number"
      ? `Updating recurring (qty ${qty})`
      : "Updating recurring";
  },
  remove_recurring_item: () => "Removing from recurring",
};

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
  for await (const chunk of stream) {
    if (chunk.type === "text-delta" && chunk.payload.text) {
      yield chunk.payload.text;
      continue;
    }

    if (chunk.type === "tool-call") {
      yield {
        type: "task_update",
        id: chunk.payload.toolCallId,
        title: humanize(chunk.payload.toolName, asArgs(chunk.payload.args)),
        status: "in_progress",
      };
      continue;
    }

    if (chunk.type === "tool-result") {
      yield {
        type: "task_update",
        id: chunk.payload.toolCallId,
        title: humanize(chunk.payload.toolName, asArgs(chunk.payload.args)),
        status: chunk.payload.isError ? "error" : "complete",
      };
      continue;
    }
  }
}

function asArgs(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function humanize(toolName: string, args: Record<string, unknown>): string {
  return TOOL_LABELS[toolName]?.(args) ?? toolName;
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : String(v ?? "?");
}
