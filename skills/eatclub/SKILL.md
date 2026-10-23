---
name: eatclub
description: Query EatClub restaurant API data for NSW venues, menus, recurring deals, walking distances and today's live deal availability.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run commands from that root. Commands return data; the calling agent decides interpretation and presentation.

```sh
bun run eatclub help
bun run eatclub sql "SELECT name, slug FROM venues LIMIT 5"
bun run eatclub walk -33.8688 151.2093 --max 10
bun run eatclub live bar-bruno
bun run eatclub sync
bun run eatclub map
```

`sql` returns read-only query results as JSON and accepts SQL on stdin. `walk` calculates local walking distances, returns JSON and updates `walk_times`. `live` requires venue slugs, refreshes their availability and returns deals and exclusions as JSON. `sync` rebuilds the database; `map` builds the walking graph from an OSM extract.

Use caller-provided coordinates or a named place. Times use each venue's timezone and ISO weekdays 1–7. `deals` contains recurring schedules; `live_deals` contains today's availability. Inspect `fetched_at` when using cached results. Raw website and app records are retained in JSON columns.

Read [references/api.md](references/api.md) for setup, endpoint details, database schema and query examples.
