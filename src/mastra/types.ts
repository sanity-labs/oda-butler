/**
 * Mastra DB-shape message. Required for Mastra to honor our supplied `id`
 * (for dedupe) and `createdAt` (for ordering). Other shapes look like they
 * accept those fields but silently overwrite `createdAt` with `Date.now()`.
 * Verified empirically; see `agent.test.ts` for the regression locks.
 */
export type Turn = {
  id: string;
  role: "user" | "assistant";
  content: { format: 2; parts: Array<{ type: "text"; text: string }> };
  createdAt: Date;
};
