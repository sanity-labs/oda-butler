import { ConsoleLogger, LogLevel } from "@mastra/core/logger";

/**
 * Shared logger for the Oda bot. Defaults to `info` so operational signals
 * (mention received, tool failures, image fetch warnings) actually surface
 * in the LaunchAgent log files. Override with `LOG_LEVEL=debug` for verbose
 * tracing or `LOG_LEVEL=warn` if the bot ever gets noisy.
 */
const ALLOWED_LEVELS = new Set<string>([
  LogLevel.DEBUG,
  LogLevel.INFO,
  LogLevel.WARN,
  LogLevel.ERROR,
  LogLevel.NONE,
]);

const fromEnv = process.env.LOG_LEVEL;
const level: LogLevel =
  fromEnv && ALLOWED_LEVELS.has(fromEnv)
    ? (fromEnv as LogLevel)
    : LogLevel.INFO;

export const logger = new ConsoleLogger({ name: "oda", level });
