import { Agent } from "@mastra/core/agent";
import { createSlackAdapter, type SlackAdapter } from "@chat-adapter/slack";
import type { Message, Thread } from "chat";
import { ODA_SYSTEM_PROMPT } from "./instructions.ts";
import { asStreamingPlan } from "./streaming.ts";
import { memory } from "./memory.ts";
import { getNextDelivery, getOrder, listOrders } from "./tools/orders.ts";
import { getProduct, searchProducts } from "./tools/products.ts";
import {
  getRecurringOrder,
  removeRecurringItem,
  updateRecurringItem,
} from "./tools/recurring.ts";

/**
 * Mastra DB-shape message. Required for Mastra to honor our supplied `id`
 * (for dedupe) and `createdAt` (for ordering). Other shapes look like they
 * accept those fields but silently overwrite `createdAt` with `Date.now()`.
 * Verified empirically; see `agent.test.ts` for the regression locks.
 */
type Turn = {
  id: string;
  role: "user" | "assistant";
  content: { format: 2; parts: Array<{ type: "text"; text: string }> };
  createdAt: Date;
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

const ALLOWED_CHANNELS = new Set([
  "oslo-office-internal",
  "test-content-agent",
]);

const HISTORY_LIMIT = 20;
const MENTION_PATTERN = /<@[A-Z0-9]+>/g;

/**
 * Loading messages Slack rotates through under the bot's thinking indicator.
 * Max 10 entries (Slack hard cap). Keep them on-brand: dry, food-adjacent,
 * a little snarky. Slack auto-clears when we post the reply.
 */
const LOADING_MESSAGES = [
  "Squeezing the oranges…",
  "Asking the cheese for an opinion…",
  "Counting the bananas…",
  "Stirring the gryte…",
  "Bribing the office goldfish for a tip…",
  "Checking the fridge twice…",
  "Finding the good kaffe…",
  "Comparing kr per liter…",
  "Negotiating with the bakery…",
  "Reading the back of the box…",
];

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
}

/**
 * Map the Slack thread to a list of conversation turns. Each turn carries
 * Slack's message `ts` as both `id` and `createdAt`, which lets Mastra:
 *   - dedupe automatically against memory (matches by id)
 *   - order chronologically by createdAt regardless of input order
 * Bot replies become `assistant` turns; everyone else's messages become
 * `user` turns prefixed with the speaker's name so the agent can tell
 * speakers apart in multi-person threads.
 */
async function buildConversation(
  thread: Thread,
  current: Message,
): Promise<Turn[]> {
  const collected: Message[] = [];
  for await (const msg of thread.allMessages) {
    if (collected.length >= HISTORY_LIMIT) break;
    if (msg.id === current.id) continue;
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
 * agent works. Auto-clears when chat-adapter posts the reply. Best-effort:
 * failures (rate limits, transient errors) shouldn't block the response.
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
  } catch {
    // Non-critical; if Slack rejects we still continue.
  }
}

export const odaAgent = new Agent({
  id: "oda",
  name: "Oda",
  instructions: ODA_SYSTEM_PROMPT,
  model: "anthropic/claude-opus-4-6",
  memory,
  tools: {
    search_products: searchProducts,
    get_product: getProduct,
    list_orders: listOrders,
    get_order: getOrder,
    get_next_delivery: getNextDelivery,
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
