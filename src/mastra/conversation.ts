import type { Message, Thread } from "chat";
import { slackTsToDate, stripMentions } from "../lib/slack.ts";
import { HISTORY_LIMIT } from "./constants.ts";
import type { Turn } from "./types.ts";

/**
 * Map a Slack thread to a list of conversation turns Mastra can pass to the
 * agent. Each turn carries Slack's message `ts` as both `id` and `createdAt`,
 * which lets Mastra:
 *   - dedupe automatically against memory (matches by id)
 *   - order chronologically by createdAt regardless of input order
 *
 * Bot replies become `assistant` turns; everyone else's messages become
 * `user` turns prefixed with the speaker's name so the agent can tell
 * speakers apart in multi-person threads.
 *
 * We only include history strictly older than `current` so that after
 * Mastra's chronological sort the conversation always ends with the user's
 * mention. Anthropic's newer models reject conversations ending with an
 * assistant turn ("prefill mode not supported"), and a stale bot apology
 * with a later ts is exactly the kind of thing that would otherwise sneak
 * in at the end.
 */
export async function buildConversation(
  thread: Thread,
  current: Message,
): Promise<Turn[]> {
  const currentTs = slackTsToDate(current.id).getTime();
  const collected: Message[] = [];
  for await (const msg of thread.allMessages) {
    if (collected.length >= HISTORY_LIMIT) break;
    if (msg.id === current.id) continue;
    if (slackTsToDate(msg.id).getTime() >= currentTs) continue;
    if (!stripMentions(msg.text).trim()) continue;
    collected.push(msg);
  }
  collected.push(current);

  return collected.map(toModelMessage);
}

function toModelMessage(msg: Message): Turn {
  const text = stripMentions(msg.text).trim();
  const createdAt = slackTsToDate(msg.id);
  const role = msg.author.isMe ? "assistant" : "user";
  const speaker = msg.author.isMe
    ? null
    : msg.author.fullName || msg.author.userName;
  const display = speaker ? `${speaker}: ${text}` : text;
  return {
    id: msg.id,
    role,
    createdAt,
    content: { format: 2, parts: [{ type: "text", text: display }] },
  };
}
