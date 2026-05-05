import { createSlackAdapter, type SlackAdapter } from "@chat-adapter/slack";
import { Agent } from "@mastra/core/agent";
import type { Message, Thread } from "chat";
import { requireEnv } from "../lib/env.ts";
import { logger } from "../lib/logger.ts";
import {
  ALLOWED_CHANNELS,
  HISTORY_LIMIT,
  LOADING_MESSAGES,
  MENTION_PATTERN,
} from "./constants.ts";
import { ODA_SYSTEM_PROMPT } from "./instructions.ts";
import { memory } from "./memory.ts";
import { asStreamingPlan } from "./streaming.ts";
import { getProduct, searchProducts } from "./tools/products.ts";
import {
  getRecurringOrder,
  removeRecurringItem,
  updateRecurringItem,
} from "./tools/recurring.ts";
import type { Turn } from "./types.ts";

async function isAllowedChannel(thread: Thread): Promise<boolean> {
  const info = await thread.channel.fetchMetadata();
  if (info.isDM) return false;
  const name = thread.channel.name?.replace(/^#/, "");
  return Boolean(name && ALLOWED_CHANNELS.has(name));
}

async function rejectChannel(thread: Thread): Promise<void> {
  const channelList = [...ALLOWED_CHANNELS].map((c) => `#${c}`).join(" or ");
  await thread.post(`Sorry, I can only be used in ${channelList}.`);
}

/**
 * Mention-only handler. We never auto-reply to subscribed threads (Slack's
 * dual-event quirk made that fragile). When the user @-mentions us we
 * reconstruct the thread as a proper user/assistant conversation so the
 * agent has full context, including earlier messages from anyone.
 */
async function handleMention(thread: Thread, message: Message): Promise<void> {
  try {
    if (!(await isAllowedChannel(thread))) {
      await rejectChannel(thread);
      return;
    }

    const messages = await buildConversation(thread, message);
    if (messages.length === 0) {
      await thread.post("You rang? Tell me what you need.");
      return;
    }

    await setLoadingStatus(thread);

    const stream = await odaAgent.stream(messages, {
      memory: {
        thread: { id: thread.id, resourceId: `slack:${thread.channelId}` },
        resource: `slack:${thread.channelId}`,
      },
    });
    await thread.post(asStreamingPlan(stream.fullStream));
  } catch (err) {
    logger.error("mention handler failed", {
      channelId: thread.channelId,
      threadId: thread.id,
      messageId: message.id,
      error: err,
    });
    await thread
      .post("Something broke on my end. Try again in a sec, or check the logs.")
      .catch(() => {
        // Posting the apology might fail too (transport down). Nothing more to do.
      });
  }
}

/**
 * Map the Slack thread to a list of conversation turns. Each turn carries
 * Slack's message `ts` as both `id` and `createdAt`, which lets Mastra:
 *   - dedupe automatically against memory (matches by id)
 *   - order chronologically by createdAt regardless of input order
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
async function buildConversation(
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

/** Slack message IDs are `"<seconds>.<microseconds>"` since epoch. */
function slackTsToDate(ts: string): Date {
  const seconds = Number.parseFloat(ts);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

function stripMentions(text: string): string {
  return text.replace(MENTION_PATTERN, "");
}

/**
 * Show a Slack thinking indicator with rotating loading messages while the
 * agent works. Auto-clears as soon as anything lands in the thread, including
 * the empty placeholder message that `chat.startStream` posts when the agent
 * begins streaming — so the rotating messages are only visible for the brief
 * window before the first stream chunk. After that Slack shows its built-in
 * "Thinking..." placeholder until our first text chunk arrives.
 *
 * Best-effort: failures (rate limits, transient errors) shouldn't block the
 * response.
 */
async function setLoadingStatus(thread: Thread): Promise<void> {
  const adapter = thread.adapter as SlackAdapter;
  if (typeof adapter.setAssistantStatus !== "function") return;
  try {
    await adapter.setAssistantStatus(
      thread.channelId,
      thread.id,
      "is shopping…",
      LOADING_MESSAGES,
    );
  } catch (err) {
    logger.warn("failed to set loading status", {
      channelId: thread.channelId,
      threadId: thread.id,
      error: err,
    });
  }
}

export const odaAgent = new Agent({
  id: "oda",
  name: "Oda",
  instructions: ODA_SYSTEM_PROMPT,
  model: "anthropic/claude-sonnet-4-6",
  memory,
  tools: {
    search_products: searchProducts,
    get_product: getProduct,
    get_recurring_order: getRecurringOrder,
    update_recurring_item: updateRecurringItem,
    remove_recurring_item: removeRecurringItem,
  },
  channels: {
    adapters: {
      slack: createSlackAdapter({
        mode: "socket",
        appToken: requireEnv("SLACK_APP_TOKEN"),
        botToken: requireEnv("SLACK_BOT_TOKEN"),
      }),
    },
    inlineMedia: ["image/*"],
    handlers: {
      onMention: handleMention,
      onSubscribedMessage: false,
    },
  },
});
