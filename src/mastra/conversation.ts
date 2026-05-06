import type { Message, Thread } from "chat";
import { logger } from "../lib/logger.ts";
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
 *
 * Image attachments on the user's message are inlined as base64 data URLs
 * so Claude's vision input can see them. We only inline images on the
 * `current` mention to keep the request small; older messages in the
 * thread are forwarded as text only.
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
    if (!hasContent(msg)) continue;
    collected.push(msg);
  }
  collected.push(current);

  return Promise.all(
    collected.map((msg) => toModelMessage(msg, msg.id === current.id)),
  );
}

function hasContent(msg: Message): boolean {
  if (stripMentions(msg.text).trim()) return true;
  return (msg.attachments ?? []).some((a) => a.type === "image");
}

async function toModelMessage(
  msg: Message,
  inlineImages: boolean,
): Promise<Turn> {
  const text = stripMentions(msg.text).trim();
  const createdAt = slackTsToDate(msg.id);
  const role = msg.author.isMe ? "assistant" : "user";

  const attachments = inlineImages ? await fetchImageAttachments(msg) : [];

  return {
    id: msg.id,
    role,
    createdAt,
    content: {
      format: 2,
      parts: [{ type: "text", text: renderMessage(msg, text, role) }],
      ...(attachments.length > 0 && {
        experimental_attachments: attachments,
      }),
    },
  };
}

/**
 * Wrap each turn with a small XML envelope carrying the Slack message id
 * and (for non-bot users) the speaker. The id is what `add_reaction` needs
 * to react to a specific message; the speaker prefix lets the agent tell
 * people apart in multi-person threads. Assistant turns don't need a
 * speaker tag (it's always us) but get the id so the agent can correlate
 * its own past replies if needed.
 */
function renderMessage(
  msg: Message,
  text: string,
  role: "user" | "assistant",
): string {
  if (role === "assistant") {
    return `<message id="${msg.id}">\n${text}\n</message>`;
  }
  const speaker = msg.author.fullName || msg.author.userName;
  const speakerAttr = speaker ? ` from="${escapeAttr(speaker)}"` : "";
  return `<message id="${msg.id}"${speakerAttr}>\n${text}\n</message>`;
}

function escapeAttr(value: string): string {
  return value.replace(/["&<>]/g, (c) => {
    switch (c) {
      case '"':
        return "&quot;";
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return c;
    }
  });
}

async function fetchImageAttachments(
  msg: Message,
): Promise<NonNullable<Turn["content"]["experimental_attachments"]>> {
  const images = (msg.attachments ?? []).filter((a) => a.type === "image");
  const fetched = await Promise.all(
    images.map(async (att) => {
      try {
        const buffer = att.data
          ? toBuffer(att.data)
          : att.fetchData
            ? await att.fetchData()
            : null;
        if (!buffer) return null;
        const contentType = att.mimeType ?? "image/jpeg";
        const url = `data:${contentType};base64,${buffer.toString("base64")}`;
        return { name: att.name, contentType, url };
      } catch (err) {
        logger.warn("failed to fetch image attachment", {
          messageId: msg.id,
          name: att.name,
          error: err,
        });
        return null;
      }
    }),
  );
  return fetched.filter((a): a is NonNullable<typeof a> => a !== null);
}

async function toBuffer(data: Buffer | Blob): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(await data.arrayBuffer());
}
