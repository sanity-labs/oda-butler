import { mastra } from "./mastra/index.ts";

const log = mastra.getLogger();
const tools = await mastra.getAgentById("oda").listTools();
log.info(`⚡ Oda Slack bot starting (socket mode)`);
log.info(`Tools loaded: ${Object.keys(tools).join(", ")}`);
