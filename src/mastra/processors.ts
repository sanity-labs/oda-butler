import type { InputProcessor } from "@mastra/core/processors";
import { logger } from "../lib/logger.ts";

/**
 * Mastra runs `processInput` after merging the messages we hand to
 * `agent.stream()` with anything pulled from memory. This is the only
 * place we can inspect the *actual* messages array that's about to
 * hit Anthropic, after memory replay has its say.
 *
 * What it does:
 *
 * 1. Logs the final role sequence and a small fingerprint of the last
 *    message's id/role. We can grep this in the err log to confirm
 *    whether prefill rejections correlate with assistant turns landing
 *    last.
 *
 * 2. If the last message is an assistant turn, drops it (and any
 *    contiguous trailing non-user turns). Anthropic rejects requests
 *    that end with assistant; better to silently send a slightly
 *    truncated history than to fail the whole turn.
 *
 * The conversation rebuild in `buildConversation` already filters
 * Slack-rebuilt history to be strictly older than the current
 * mention, but that's blind to memory replay. This processor is the
 * belt-and-braces defense.
 */
export const ensureUserLast: InputProcessor = {
  id: "ensure-user-last",
  processInput({ messages }) {
    if (messages.length === 0) return messages;

    const tailRoles = messages.slice(-3).map((m) => m.role);
    const last = messages.at(-1);

    if (last?.role !== "user") {
      // Drop trailing non-user messages until the last one is a user turn.
      let dropped = 0;
      const trimmed = [...messages];
      while (trimmed.length > 0 && trimmed.at(-1)?.role !== "user") {
        trimmed.pop();
        dropped += 1;
      }
      logger.warn("dropped trailing non-user messages before LLM call", {
        droppedCount: dropped,
        tailRolesBefore: tailRoles,
        remainingCount: trimmed.length,
        finalRole: trimmed.at(-1)?.role ?? "(empty)",
      });
      return trimmed;
    }

    // Healthy path: log at debug so we have a paper trail without
    // spamming info-level logs on every turn.
    logger.debug("input messages end in user (healthy)", {
      messageCount: messages.length,
      tailRoles,
    });
    return messages;
  },
};
