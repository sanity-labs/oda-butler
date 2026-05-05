import { ConsoleLogger } from "@mastra/core/logger";

/**
 * Shared logger for the Oda bot. Avoid using `console.*` directly so we
 * get consistent prefixes and can swap in a transport later if we want.
 */
export const logger = new ConsoleLogger({ name: "oda" });
