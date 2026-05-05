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

export const memory = new Memory({
  storage,
  options: {
    lastMessages: 50,
    generateTitle: false,
    semanticRecall: false,
  },
});
