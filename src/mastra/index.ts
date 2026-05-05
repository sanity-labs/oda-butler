import { Mastra } from "@mastra/core";
import { odaAgent } from "./agent.ts";
import { memory, storage } from "./memory.ts";

export const mastra = new Mastra({
  agents: { oda: odaAgent },
  memory: { default: memory },
  storage,
});
