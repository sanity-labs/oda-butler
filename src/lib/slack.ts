/**
 * Pure helpers for Slack-format data. No Mastra or chat-sdk concepts here —
 * just translation between Slack's wire conventions and ergonomic types.
 */

/** Slack user-mention syntax, e.g. `<@U0AGNB12B9V>`. */
const MENTION_PATTERN = /<@[A-Z0-9]+>/g;

/** Strip `<@USERID>` mentions from message text. */
export function stripMentions(text: string): string {
  return text.replace(MENTION_PATTERN, "");
}

/** Slack message timestamps look like `"1700000001.123456"` (seconds since epoch). */
export function slackTsToDate(ts: string): Date {
  const seconds = Number.parseFloat(ts);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

/**
 * chat-sdk encodes Slack thread IDs as `slack:CHANNEL:THREAD_TS`. Some
 * adapter methods (e.g. `assistant.threads.setStatus`) want the raw values,
 * so we peel them apart. Returns null when the input doesn't match the
 * expected format.
 */
export function decodeSlackThreadId(
  threadId: string,
): { channel: string; threadTs: string } | null {
  const parts = threadId.split(":");
  if (parts.length !== 3 || parts[0] !== "slack" || !parts[1] || !parts[2]) {
    return null;
  }
  return { channel: parts[1], threadTs: parts[2] };
}
