import { StreamingPlan, type StreamChunk } from "chat";
import type { ChunkType } from "@mastra/core/stream";

type AgentStream = AsyncIterable<ChunkType>;

const TOOL_LABELS: Record<string, (args: Record<string, unknown>) => string> = {
  products_search: (a) => `Searching for "${stringArg(a, "query")}"`,
  orders_list: () => "Fetching past orders",
  order_get_details: (a) => `Reading order ${stringArg(a, "orderNumber")}`,
  next_delivery_get: () => "Checking next delivery",
  recurring_get: () => "Reading recurring order",
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
