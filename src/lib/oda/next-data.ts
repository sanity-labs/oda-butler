import { isPlainObject } from "es-toolkit";
import { get } from "es-toolkit/compat";

/**
 * Typed wrapper around `es-toolkit/compat/get`. The compat overloads collapse
 * the return type to whatever you ask for; for arbitrary `unknown` payloads
 * we want to keep the result `unknown` and let callers narrow.
 */
export function readPath<T = unknown>(
  source: unknown,
  path: string,
): T | undefined {
  return get(source, path) as T | undefined;
}

/**
 * Helpers for parsing Oda's Next.js page data. Oda embeds React Query state
 * in `<script id="__NEXT_DATA__">`. We extract specific dehydrated queries
 * by their `queryKey[0]` identifier.
 */

const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s;

export function extractNextData(html: string): unknown {
  const match = html.match(NEXT_DATA_PATTERN);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Find a dehydrated React Query result by its key identifier. Oda has used
 * both string keys (`queryKey[0] === "user"`) and object keys
 * (`queryKey[0]._id === "user"`); this matches both shapes and accepts a list
 * of possible keys to handle naming drift.
 */
export function findDehydratedQuery(
  nextData: unknown,
  ...keys: string[]
): unknown {
  const queries = readPath<unknown[]>(
    nextData,
    "props.pageProps.dehydratedState.queries",
  );
  if (!Array.isArray(queries)) return null;

  const targets = new Set(keys);
  for (const query of queries) {
    const first = readPath(query, "queryKey[0]");
    const id =
      typeof first === "string"
        ? first
        : isPlainObject(first)
          ? readPath<string>(first, "_id")
          : undefined;
    if (typeof id === "string" && targets.has(id)) {
      return readPath(query, "state.data");
    }
  }
  return null;
}
