#!/usr/bin/env bun
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { OdaClient } from "../src/lib/oda/client.ts";
import { cookiePath as resolveCookiePath } from "../src/lib/oda/paths.ts";

const cookiePath = resolveCookiePath();

const [, , command, ...args] = process.argv;

if (!command) {
  printHelp();
  process.exit(1);
}

const client = new OdaClient(cookiePath);

const flags = parseFlags(args);

try {
  switch (command) {
    case "login":
      await login(flags);
      break;
    case "logout":
      logout();
      break;
    case "whoami":
      await whoami();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function parseFlags(input: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < input.length; i += 2) {
    const key = input[i];
    const value = input[i + 1];
    if (!key || !key.startsWith("--") || value == null) continue;
    out[key.slice(2)] = value;
  }
  return out;
}

async function login(flags: Record<string, string>): Promise<void> {
  const user = flags.user ?? process.env.ODA_EMAIL;
  const pass = flags.pass ?? process.env.ODA_PASSWORD;
  if (!user || !pass) {
    console.error(
      "Usage: bun run oda:login -- --user <email> --pass <password>",
    );
    console.error("Or set ODA_EMAIL and ODA_PASSWORD env vars.");
    process.exit(1);
  }

  mkdirSync(dirname(cookiePath), { recursive: true });
  const ok = await client.login(user, pass);
  if (!ok) {
    console.error("Login failed. Check your credentials.");
    process.exit(1);
  }
  const me = await client.getUser();
  console.log(me ? `Signed in as ${me.fullName}` : "Signed in.");
}

function logout(): void {
  if (existsSync(cookiePath)) {
    unlinkSync(cookiePath);
    console.log("Signed out.");
  } else {
    console.log("Already signed out.");
  }
}

async function whoami(): Promise<void> {
  const me = await client.getUser();
  console.log(
    me ? `Signed in as ${me.fullName} (${me.email})` : "Not signed in.",
  );
}

function printHelp(): void {
  console.log(`Oda auth CLI
Commands:
  login --user <email> --pass <password>   Sign in and store session cookies
  logout                                    Remove stored session
  whoami                                    Show current user
Environment:
  SANITY_ODA_DATA_DIR  Override the cookie store directory (default: ~/.sanity-oda)
  ODA_EMAIL            Default email for login
  ODA_PASSWORD         Default password for login`);
}
