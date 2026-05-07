# oda-butler

Slack bot for Sanity's Oslo office shared [Oda](https://oda.com/) grocery account. Built on [Mastra](https://mastra.ai/) and Claude Sonnet 4.6.

## What it does

The office runs a weekly recurring order on a shared Oda B2B account. The bot lets anyone in the office:

- Search and recommend products from Oda's catalog (Norwegian and English queries both work)
- Look up details on a specific product (price, nutrition, ingredients, allergens, origin, supplier, storage)
- See what's on the recurring order, when the next delivery lands, and the schedule
- Stage one-off additions onto the next scheduled delivery (just this week)
- Drop one-off additions before they ride along
- React to messages with a quick emoji instead of a full reply when that fits

The bot has vision: drag a fridge photo into the thread and it'll cross-reference what it sees against the recurring order.

Out of scope: editing the recurring order, browsing past orders, payment or delivery details, changing the recurring schedule itself. Those go through the office manager.

## Toolset

Six domain tools plus two reaction tools (auto-injected by Mastra, hidden from the Slack UI):

```
search_products
get_product
get_recurring_order
get_next_delivery_extras
add_to_next_delivery
remove_from_next_delivery
```

## Setup

You need [Bun](https://bun.sh/), an [Anthropic API key](https://console.anthropic.com/), and a Slack workspace.

```sh
# 1. Configure
cp .env.template .env
# fill in ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN, ODA_EMAIL, ODA_PASSWORD

# 2. Create the Slack app from the manifest
bun run manifest
# follow the printed link, paste the manifest, install to workspace

# 3. Run
bun install
bun run dev
```

The bot signs in to Oda automatically using `ODA_EMAIL`/`ODA_PASSWORD` and re-authenticates when the session expires. Cookies persist at `<project>/data/oda-cookies.json` so subsequent starts don't need to log in again.

### Optional CLI

```sh
bun run oda:whoami   # check the current Oda user
bun run oda:login    # force a fresh login (useful for testing creds)
bun run oda:logout   # clear stored cookies
```

If you'd rather not put credentials in `.env`, omit `ODA_EMAIL`/`ODA_PASSWORD` and run `bun run oda:login` once manually. The bot will keep working until the session expires; then you'll see an `OdaSessionExpiredError` and need to re-run the login command.

### Office identity

The agent's replies feel native when you tell it who runs the show:

```sh
OFFICE_NAME="Acme's Oslo office"
OFFICE_MANAGER="Sara, the office manager"
OFFICE_TIMEZONE=Europe/Oslo
```

All three are optional. Without them, the bot says "the office" and "your office's Oda admin", which works but reads generically. The timezone drives the `<current_time>` block the agent sees on every turn, so set it to the office's actual zone for accurate "when's the next delivery" answers.

## How it's wired

- **Mastra** drives the agent: tools, memory, model routing, channel adapters.
- **`@chat-adapter/slack`** handles Slack events in Socket Mode (no public URL needed).
- **`OdaClient`** (`src/lib/oda/`) is a hand-rolled client over Oda's reverse-engineered REST + `__NEXT_DATA__` endpoints. The wire shapes live in `docs/oda-openapi.yaml`; conceptual notes (consumer-vs-B2B recurring distinction, where data is _not_ served from) live in `docs/oda-api.md`.
- **LibSQL** (SQLite) stores conversation memory at `data/oda.db`.

The bot only responds to explicit `@`-mentions, scoped to the channels listed in `ALLOWED_CHANNELS`.

## Scripts

```sh
bun run dev            # start with hot reload
bun run start          # start without hot reload
bun run test           # run vitest
bun run check          # biome lint + format check
bun run format         # auto-fix formatting
bun run gen:api-types  # regenerate src/lib/oda/api-types.generated.ts from the OpenAPI spec
bun run manifest       # print the Slack app manifest
bun run deploy         # rsync to autofoos-mac and reload the LaunchAgent
```

## Editor setup

Format-on-save is wired up for both Zed and VSCode via `.zed/settings.json` and `.vscode/settings.json`. VSCode users get a one-time prompt to install the Biome extension.

## Deployment

The bot runs as a macOS LaunchAgent on a Mac mini in the office. `bun run deploy` rsyncs the source over SSH, installs deps, writes the plist, and reloads the service.

The remote `.env` is bootstrapped once by hand and never touched by deploys:

```sh
scp .env autofoos@autofoos-mac.local:~/src/oda-butler/.env
ssh autofoos@autofoos-mac.local 'chmod 600 ~/src/oda-butler/.env'
```

After that, deploys verify the remote `.env` exists and refuse to run if it doesn't.

## Project structure

```
src/
  index.ts                 # entry point + graceful shutdown
  manifest.ts              # Slack app manifest definition
  config.ts                # validated env → typed config singleton
  types/
    config.ts              # Zod schema for AppConfig
  lib/
    logger.ts              # shared Mastra ConsoleLogger
    slack.ts               # stripMentions, slackTsToDate, decodeSlackThreadId
    oda/
      client.ts            # OdaClient
      api-types.yaml       # generated wire types
      parsers.ts           # wire → domain (Anti-Corruption Layer)
      types.ts             # domain types
      ...                  # cookie jar, http transport, etc.
  mastra/
    agent.ts               # mention handler + agent definition
    instructions.ts        # system prompt
    constants.ts           # HISTORY_LIMIT, LOADING_MESSAGE_POOL
    types.ts               # Turn (Mastra DB shape)
    conversation.ts        # Slack thread → Mastra conversation
    streaming.ts           # tool-call → Slack task_update card translation
    memory.ts              # libsql conversation memory
    tools/                 # the agent's tools
docs/
  oda-openapi.yaml         # canonical wire-shape spec
  oda-api.md               # conceptual notes
scripts/
  deploy.ts                # macOS LaunchAgent deployment
  generate-manifest.ts     # prints the Slack app manifest
  oda-auth.ts              # CLI for cookie management
```
