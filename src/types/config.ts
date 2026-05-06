import { z } from "zod";

const SlackConfigSchema = z.object({
  /** Bot token starting with `xoxb-`. From the Slack app's OAuth & Permissions page. */
  botToken: z.string().min(1),
  /** App-level token starting with `xapp-`. Required for Socket Mode. */
  appToken: z.string().min(1),
  /**
   * Channel names where the bot is allowed to respond to mentions, with
   * or without a leading `#`. Empty list means "respond nowhere" — the
   * bot will reject mentions with a configuration-hint error.
   */
  allowedChannels: z.array(z.string().min(1)),
});

const AnthropicConfigSchema = z.object({
  apiKey: z.string().min(1),
});

const OdaConfigSchema = z.object({
  /** Email for auto-relogin. When unset, the bot relies on cookies on disk. */
  email: z.string().email().optional(),
  /** Password for auto-relogin. Required when `email` is set. */
  password: z.string().min(1).optional(),
});

const OfficeConfigSchema = z.object({
  /**
   * Office identity rendered into the cached system prompt. e.g.
   * "Acme's Oslo office". Defaults to "the office", which works but
   * reads generically.
   */
  name: z.string().min(1).default("the office"),
  /**
   * Person to refer out to for things outside the bot's scope (browsing
   * past orders, account settings, schedule changes). e.g.
   * "Sara, the office manager".
   */
  manager: z.string().min(1).default("your office's Oda admin"),
  /**
   * IANA timezone for the office. Drives the per-turn `<current_time>`
   * block so the agent answers temporal questions in the user's local
   * frame regardless of where the bot host is.
   */
  timezone: z.string().min(1).default("Europe/Oslo"),
});

const DatabaseConfigSchema = z.object({
  /** libsql URL. `file:` for local SQLite, `libsql://` for Turso. */
  url: z.string().min(1).default("file:./data/oda.db"),
});

export const ConfigSchema = z.object({
  anthropic: AnthropicConfigSchema,
  slack: SlackConfigSchema,
  oda: OdaConfigSchema,
  office: OfficeConfigSchema,
  database: DatabaseConfigSchema,
});

export type AppConfig = z.infer<typeof ConfigSchema>;
