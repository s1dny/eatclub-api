Bun + TypeScript. Use `bun`, `bun test`; no Node tooling.

The product is `data/eatclub.db` (libSQL) plus `README.md`, which is the agent-facing schema doc. Keep `README.md` in sync with `SCHEMA` in `src/db.ts`.

- `src/eatclub.ts`: website client (JSON listing + venue-page RSC). Venue pages dedupe objects into `"$row:path"` refs, so `resolveRefs` runs before parsing. The region filter takes display names ("Gold Coast"), not slugs.
- `src/app.ts` + `src/graphql/`: app AppSync API; key in `.env` (`EATCLUB_APP_API_KEY`). The app only lists some regions (sydney yes, newcastle/wollongong no). `allDealsForRestaurant` uses the UTC date, so live state goes through `dealForId` per deal.
- `src/sync.ts`: full rebuild into a temp DB, then an atomic rename; calls `refreshLive`.
- `src/live.ts`: today's live deal state + discount exclusions; `bun run live <slug…>` scopes it to a shortlist.
- `src/map.ts` + `src/graph.ts`: one-time build of `data/walk-graph.bin` (CSR walking network) from an OSM .pbf; `src/walk.ts` runs Dijkstra in-process → `walk_times`. No routing servers or Docker.
- `src/sql.ts`: read-only query CLI.
- Tests live in `tests/` and run the CLIs end to end against the synced DB.
- Scope is NSW, manual refresh only, local file. Location always comes from the caller. No MCP layer.
