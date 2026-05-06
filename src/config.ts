import { type AppConfig, ConfigSchema } from "./types/config.ts";

/**
 * Validated, typed config singleton. Read once at process start and
 * exported as `config`. If the environment is missing required values
 * or has malformed ones, the process exits with a clear pointer to
 * what's wrong instead of mysteriously misbehaving later.
 *
 * Bun loads `.env` automatically, so there's no dotenv import here.
 *
 * Pattern modeled on sanity-io/sanity-agent: a Zod schema in
 * `types/config.ts` defines the shape, this file builds a raw object
 * from `process.env` and validates it. Defaults live in the schema so
 * they're discoverable next to the field they apply to.
 */
function buildConfig(): AppConfig {
  const raw = {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
      allowedChannels: parseChannels(process.env.ALLOWED_CHANNELS),
    },
    oda: {
      email: process.env.ODA_EMAIL || undefined,
      password: process.env.ODA_PASSWORD || undefined,
    },
    office: {
      name: process.env.OFFICE_NAME?.trim() || undefined,
      manager: process.env.OFFICE_MANAGER?.trim() || undefined,
      timezone: process.env.OFFICE_TIMEZONE?.trim() || undefined,
    },
    database: {
      url: process.env.ODA_BOT_DB_URL || undefined,
    },
  };

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    process.stderr.write(
      `Invalid configuration. Check your .env file:\n${formatZodError(result.error)}\n`,
    );
    process.exit(1);
  }
  return result.data;
}

function parseChannels(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/^#/, ""))
    .filter(Boolean);
}

function formatZodError(error: {
  issues: Array<{ path: unknown[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

export const config = buildConfig();
