---
name: eatclub
description: Query EatClub restaurant API data for NSW venues, menus, recurring deals, walking distances and today's live deal availability.
---

Resolve this skill directory through symlinks. The repository root is two directories above it. Run commands from that root; read `docs/eatclub.md` for the full schema, request sources and SQL examples.

- `bun run walk <lat> <lng> --max <minutes>` calculates walking times into `walk_times` using the local OSM graph.
- `bun run sql --json "SELECT …"` queries venue/menu/schedule data read-only. Full website/app records are retained in JSON columns.
- `bun run live <slug> [slug…]` refreshes today's availability, terms and exclusions for specified venues. Then query `live_deals` and `discount_exclusions`. Always supply a shortlist; no-argument refresh fetches all NSW venues.
- `bun run sync` rebuilds the cache; `meta.synced_at` records when it was fetched. Local database: `data/eatclub.db` (`EATCLUB_DB` overrides it).

Location is caller-provided or a named place, never inferred as the user's current location. Times use the venue's timezone; `deals.day` is ISO weekday 1–7. `deals` is a recurring schedule, not a guarantee of availability on a future date. `live_deals` is today's state only; inspect its `fetched_at`.

Return the queried API data, including terms and exclusions relevant to the query. The calling agent decides ranking, interpretation, dish suitability, price calculations and presentation.
