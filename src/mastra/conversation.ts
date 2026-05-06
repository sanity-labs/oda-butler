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
  const speaker = msg.author.isMe
    ? null
    : msg.author.fullName || msg.author.userName;
  const display = speaker ? `${speaker}: ${text}` : text;

  const attachments = inlineImages ? await fetchImageAttachments(msg) : [];

  return {
    id: msg.id,
    role,
    createdAt,
    content: {
      format: 2,
      parts: [{ type: "text", text: display }],
      ...(attachments.length > 0 && {
        experimental_attachments: attachments,
      }),
    },
  };
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
