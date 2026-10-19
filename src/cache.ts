import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = process.env.EATCLUB_CACHE_DIR ?? join(homedir(), ".cache", "eatclub-api");
mkdirSync(dir, { recursive: true });

const db = new Database(join(dir, "cache.sqlite"), { create: true, strict: true });
db.run("PRAGMA journal_mode = WAL");
db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, fetched_at INTEGER NOT NULL)");

const get = db.query<{ value: string; fetched_at: number }, { key: string }>(
  "SELECT value, fetched_at FROM kv WHERE key = $key",
);
const put = db.query<never, { key: string; value: string; fetched_at: number }>(
  "INSERT OR REPLACE INTO kv (key, value, fetched_at) VALUES ($key, $value, $fetched_at)",
);

const inflight = new Map<string, Promise<unknown>>();

function refresh<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load()
      .then((value) => {
        put.run({ key, value: JSON.stringify(value), fetched_at: Date.now() });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/**
 * Stale-while-revalidate: fresh rows are returned as-is, stale rows are returned
 * immediately while a background refresh runs, missing rows block on the loader.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const row = get.get({ key });
  if (!row) return refresh(key, load);
  if (Date.now() - row.fetched_at > ttlMs) refresh(key, load).catch(() => {});
  return JSON.parse(row.value) as T;
}

export const cacheDir = dir;
