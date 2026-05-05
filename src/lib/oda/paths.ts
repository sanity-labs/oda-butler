import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const NEW_DIR = ".sanity-oda";
const LEGACY_DIR = ".mcp-oda";

/**
 * Where Oda session cookies live on disk. Prefer `SANITY_ODA_DATA_DIR`, fall
 * back to the legacy `MCP_ODA_DATA_DIR` for anyone with an existing setup.
 * If neither env var is set, use `~/.sanity-oda`, but transparently read from
 * `~/.mcp-oda` if that's where the user's cookies still are. Saves them a
 * re-login after the rename.
 */
export function odaDataDir(): string {
  const fromEnv =
    process.env.SANITY_ODA_DATA_DIR ?? process.env.MCP_ODA_DATA_DIR;
  if (fromEnv) return fromEnv;

  const newDir = join(homedir(), NEW_DIR);
  const legacyDir = join(homedir(), LEGACY_DIR);
  if (!existsSync(newDir) && existsSync(legacyDir)) return legacyDir;
  return newDir;
}

export function cookiePath(): string {
  return join(odaDataDir(), "cookies.json");
}
