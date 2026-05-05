import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const LEGACY_HOME_DIRS = [".sanity-oda", ".mcp-oda"] as const;

/**
 * Where Oda session cookies live on disk.
 *
 * Default: `<project>/data/oda-cookies.json`. Putting it next to the libsql
 * memory DB means all the bot's persistent state lives in one directory,
 * and there's no implicit coupling to the home directory of whichever user
 * happens to run the process.
 *
 * Override with `SANITY_ODA_DATA_DIR` for the legacy home-dir layout (or
 * any other location). On a fresh install with no override, we still pick
 * up cookies from `~/.sanity-oda/cookies.json` if they exist, so existing
 * users don't have to re-log in.
 */
export function cookiePath(): string {
  const fromEnv =
    process.env.SANITY_ODA_DATA_DIR ?? process.env.MCP_ODA_DATA_DIR;
  if (fromEnv) return join(fromEnv, "cookies.json");

  const projectLocal = resolve(projectRoot(), "data", "oda-cookies.json");
  if (existsSync(projectLocal)) return projectLocal;

  for (const dir of LEGACY_HOME_DIRS) {
    const legacy = join(homedir(), dir, "cookies.json");
    if (existsSync(legacy)) return legacy;
  }

  return projectLocal;
}

/**
 * Resolve to the repo root regardless of where the process is launched from.
 * Walks up from this file until a `package.json` is found.
 */
function projectRoot(): string {
  let dir = import.meta.dir;
  while (dir !== "/" && !existsSync(join(dir, "package.json"))) {
    dir = dirname(dir);
  }
  return dir;
}
