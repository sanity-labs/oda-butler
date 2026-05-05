import { logger } from "./lib/logger.ts";
import { mastra } from "./mastra/index.ts";

const tools = await mastra.getAgentById("oda").listTools();
logger.info("⚡ Oda Slack bot starting (socket mode)");
logger.info(`Tools loaded: ${Object.keys(tools).join(", ")}`);

let shuttingDown = false;

/**
 * Graceful shutdown. macOS launchd sends SIGTERM on system restart and on
 * `launchctl bootout`; Ctrl-C sends SIGINT in dev. Either way we want to:
 *  - stop accepting new mentions
 *  - let any in-flight `agent.stream()` calls finish posting their reply
 *  - close the libsql storage cleanly so the conversation memory isn't
 *    corrupted mid-write
 *
 * We bound the wait to 10s so launchd doesn't SIGKILL us with messy state.
 */
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`received ${signal}, shutting down`);

  const deadline = setTimeout(() => {
    logger.warn("shutdown deadline exceeded, forcing exit");
    process.exit(1);
  }, 10_000);
  deadline.unref();

  try {
    await mastra.shutdown();
  } catch (err) {
    logger.error("error during shutdown", { error: err });
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
