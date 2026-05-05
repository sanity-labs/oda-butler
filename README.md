# oda-butler

Slack bot for Sanity's Oslo office shared [Oda](https://oda.com/) grocery account. Powered by Claude Sonnet 4.6 and [Mastra](https://mastra.ai/).

## What it does

- Search products in Norwegian or English
- Read, add to, and remove from the shared cart
- View past orders and the next delivery
- Manage the recurring order (faste varer)
- Reads images you share so you can post a fridge photo and get help

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

The bot signs in to Oda automatically using `ODA_EMAIL` and `ODA_PASSWORD` and re-authenticates when the session expires. Cookies are persisted under `~/.sanity-oda` so subsequent starts don't need to log in again.

### Optional CLI

A few diagnostic helpers for when you want to poke at the auth state directly:

```sh
bun run oda:whoami   # check the current Oda user
bun run oda:login    # force a fresh login (useful for testing creds)
bun run oda:logout   # clear stored cookies (next request re-authenticates)
```

If you'd rather not put credentials in `.env`, omit `ODA_EMAIL`/`ODA_PASSWORD` and run `bun run oda:login` once manually. The bot will keep working until the session expires, after which you'll see an `OdaSessionExpiredError` and need to re-run the login command.

## How it's wired

- **Mastra** drives the agent: tools, memory, model routing.
- **`@chat-adapter/slack`** handles Slack events in Socket Mode (no public URL needed).
- **`OdaClient`** (in `src/lib/oda/`) is a hand-rolled client over Oda's reverse-engineered REST + `__NEXT_DATA__` endpoints. Notes in `docs/oda-api.md`.
- **LibSQL** (SQLite) stores conversation memory at `data/oda.db`.

The bot only responds to explicit `@`-mentions, and only in `#oslo-office-internal` and `#test-content-agent`.

## Scripts

```sh
bun run dev          # start with hot reload
bun run start        # start without hot reload
bun run test         # run vitest
bun run manifest     # print the Slack app manifest
```
