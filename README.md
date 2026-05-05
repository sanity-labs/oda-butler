# oda-butler

Slack bot for Sanity's Oslo office shared [Oda](https://oda.com/) grocery account. Powered by Claude Opus 4.6 and [Mastra](https://mastra.ai/).

## What it does

- Search products in Norwegian or English
- Read, add to, and remove from the shared cart
- View past orders and the next delivery
- Manage the recurring order (faste varer)
- Reads images you share so you can post a fridge photo and get help

## Setup

You need [Bun](https://bun.sh/), an [Anthropic API key](https://console.anthropic.com/), and a Slack workspace.

```sh
# 1. Sign in to Oda (cookies stored in ~/.sanity-oda)
bun run oda:login -- --user office@example.com --pass yourpassword

# 2. Configure
cp .env.template .env
# fill in ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, SLACK_APP_TOKEN

# 3. Create the Slack app from the manifest
bun run manifest
# follow the printed link, paste the manifest, install to workspace

# 4. Run
bun install
bun run dev
```

For production, also set `ODA_EMAIL` and `ODA_PASSWORD` so the bot can re-authenticate when the Oda session expires.

## How it's wired

- **Mastra** drives the agent: tools, memory, model routing.
- **`@chat-adapter/slack`** handles Slack events in Socket Mode (no public URL needed).
- **`OdaClient`** (in `src/lib/oda/`) is a hand-rolled client over Oda's reverse-engineered REST + `__NEXT_DATA__` endpoints. Notes in `docs/oda-api.md`.
- **LibSQL** (SQLite) stores conversation memory at `data/oda.db`.

The bot only responds to explicit `@`-mentions, and only in `#oslo-office-internal` and `#test-content-agent`.

## Useful scripts

```sh
bun run dev          # start with hot reload
bun run start        # start without hot reload
bun run test         # run vitest
bun run manifest     # print the Slack app manifest

bun run oda:login    # authenticate with Oda
bun run oda:logout   # clear stored session
bun run oda:whoami   # check current Oda user
```
