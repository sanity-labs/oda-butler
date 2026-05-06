import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";

const databaseUrl = process.env.ODA_BOT_DB_URL ?? "file:./data/oda.db";

if (databaseUrl.startsWith("file:")) {
  mkdirSync(dirname(databaseUrl.slice("file:".length)), { recursive: true });
}

export const storage = new LibSQLStore({
  id: "oda-storage",
  url: databaseUrl,
});

/**
 * Memory replay carries the *structured* assistant history (tool calls
 * and their results), which `buildConversation` cannot reconstruct from
 * Slack — Slack only stores the visible text. Mastra dedupes by message
 * id, so passing both the Slack-rebuilt turns and memory-replayed turns
 * is safe; whichever has the richer payload wins.
 *
 * Observational Memory runs background Observer/Reflector agents that
 * compress old message history into dense observations once the thread
 * crosses a token threshold (~30k by default). This lets the agent keep
 * critical early-thread context ("the budget is kr 200/uke") without
 * blowing past Anthropic's 413 cap on long-running threads.
 *
 * Why Haiku: keeps us on a single vendor (already paying for Anthropic),
 * Mastra docs list it as tested for OM, and it's fast enough to run in
 * the background without holding up replies.
 */
export const memory = new Memory({
  storage,
  options: {
    lastMessages: 50,
    generateTitle: false,
    semanticRecall: false,
    observationalMemory: {
      model: "anthropic/claude-haiku-4-5",
      // If a thread sits idle longer than the prompt-cache TTL, activate
      // any buffered observations before the next mention so the cold
      // request goes out compressed instead of as raw history. Aligned
      // with the 1h cache TTL on the static system prefix.
      activateAfterIdle: "1h",
    },
  },
});
