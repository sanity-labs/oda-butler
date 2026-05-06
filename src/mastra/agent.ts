import { createSlackAdapter, type SlackAdapter } from "@chat-adapter/slack";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Message, Thread } from "chat";
import { sampleSize } from "es-toolkit";
import { requireEnv } from "../lib/env.ts";
import { logger } from "../lib/logger.ts";
import { decodeSlackThreadId } from "../lib/slack.ts";
import {
  ALLOWED_CHANNELS,
  LOADING_MESSAGE_LIMIT,
  LOADING_MESSAGE_POOL,
} from "./constants.ts";
import { buildConversation } from "./conversation.ts";
import { buildOdaSystemPrompt } from "./instructions.ts";
import { memory } from "./memory.ts";
import { asStreamingPlan } from "./streaming.ts";
import {
  addToNextDelivery,
  getNextDeliveryExtras,
  removeFromNextDelivery,
} from "./tools/cart.ts";
import { getProduct, searchProducts } from "./tools/products.ts";
import {
  getRecurringOrder,
  removeRecurringItem,
  updateRecurringItem,
} from "./tools/recurring.ts";

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

    // Mastra's auto-injected channel tools (add_reaction etc.) read the
    // current channel/thread/message from requestContext.channel. When we
    // call agent.stream() ourselves we have to populate it; the default
    // Mastra chat handler does this for us, but our custom handleMention
    // bypasses that path.
    const requestContext = new RequestContext();
    requestContext.set("channel", {
      platform: "slack",
      eventType: "mention",
      isDM: false,
      threadId: thread.id,
      channelId: thread.channelId,
      messageId: message.id,
      userId: message.author.userId,
      userName: message.author.userName,
    });

    const stream = await odaAgent.stream(messages, {
      memory: {
        thread: { id: thread.id, resourceId: `slack:${thread.channelId}` },
        resource: `slack:${thread.channelId}`,
      },
      requestContext,
    });
    const { plan, wasTextEmitted } = asStreamingPlan(stream.fullStream);
    try {
      await thread.post(plan);
    } catch (streamErr) {
      // Errors that fire after the user has already seen text (e.g. a
      // post-stream finalize, a 413 on the next turn, a Slack edit
      // failure) get logged but not surfaced — dropping a "something
      // broke" message under a perfectly good reply just confuses people.
      logger.error("stream failed", {
        channelId: thread.channelId,
        threadId: thread.id,
        messageId: message.id,
        textEmitted: wasTextEmitted(),
        error: streamErr,
      });
      if (!wasTextEmitted()) throw streamErr;
    }
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
 * Show a Slack thinking indicator with a rotating list of food-themed
 * loading messages while the agent works. We sample a fresh subset on each
 * mention so the messages vary across invocations.
 *
 * Auto-clears as soon as anything lands in the thread, including the empty
 * placeholder message that `chat.startStream` posts when the agent begins
 * streaming — so the rotating messages are only visible for the brief
 * window before the first stream chunk. After that Slack shows its built-in
 * "Thinking..." placeholder until our first text chunk arrives.
 *
 * Best-effort: failures (rate limits, transient errors) shouldn't block the
 * response.
 */
async function setLoadingStatus(thread: Thread): Promise<void> {
  const adapter = thread.adapter as SlackAdapter;
  if (typeof adapter.setAssistantStatus !== "function") return;

  const decoded = decodeSlackThreadId(thread.id);
  if (!decoded) {
    logger.warn("could not decode Slack thread id", { threadId: thread.id });
    return;
  }

  try {
    await adapter.setAssistantStatus(
      decoded.channel,
      decoded.threadTs,
      "is shopping…",
      sampleSize(LOADING_MESSAGE_POOL, LOADING_MESSAGE_LIMIT),
    );
  } catch (err) {
    logger.warn("failed to set loading status", {
      threadId: thread.id,
      error: err,
    });
  }
}

export const odaAgent = new Agent({
  id: "oda",
  name: "Oda",
  // Function form so Mastra re-evaluates per turn; otherwise the
  // current-time block freezes to whenever the process started.
  instructions: () => buildOdaSystemPrompt(),
  model: "anthropic/claude-sonnet-4-6",
  memory,
  tools: {
    search_products: searchProducts,
    get_product: getProduct,
    get_recurring_order: getRecurringOrder,
    update_recurring_item: updateRecurringItem,
    remove_recurring_item: removeRecurringItem,
    get_next_delivery_extras: getNextDeliveryExtras,
    add_to_next_delivery: addToNextDelivery,
    remove_from_next_delivery: removeFromNextDelivery,
  },
  channels: {
    adapters: {
      slack: createSlackAdapter({
        mode: "socket",
        appToken: requireEnv("SLACK_APP_TOKEN"),
        botToken: requireEnv("SLACK_BOT_TOKEN"),
      }),
    },
    // Mastra auto-injects add_reaction / remove_reaction tools so the
    // agent can drop a quick 👋 on a user's message instead of writing a
    // full reply for trivial acknowledgements. Their tool-call cards are
    // hidden in `streaming.ts` so they don't visually compete with the
    // actual response — the reaction itself is enough signal.
    inlineMedia: ["image/*"],
    handlers: {
      onMention: handleMention,
      onSubscribedMessage: false,
    },
  },
});
