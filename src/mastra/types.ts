/**
 * Mastra DB-shape message. Required for Mastra to honor our supplied `id`
 * (for dedupe) and `createdAt` (for ordering). Other shapes look like they
 * accept those fields but silently overwrite `createdAt` with `Date.now()`.
 * Verified empirically; see `agent.test.ts` for the regression locks.
 *
 * `experimental_attachments` is the AI SDK v4 carrier for images on a user
 * message; we use it to forward Slack image uploads to Claude's vision input.
 * Each attachment is a base64 data URL we synthesize from the Slack file's
 * authenticated bytes (Anthropic can't fetch Slack-private URLs directly).
 */
export type Turn = {
  id: string;
  role: "user" | "assistant";
  content: {
    format: 2;
    parts: Array<{ type: "text"; text: string }>;
    experimental_attachments?: Array<{
      name?: string;
      contentType: string;
      url: string;
    }>;
  };
  createdAt: Date;
};
