---
name: flights
description: Query Google Flights API data for itineraries, booking offers, airport and city lookup, and large departure/return price grids with configurable trip lengths. Use for flight searches and flexible-date fare data.
---

Resolve this skill directory through symlinks. The repository root is two directories above it. Run commands from that root. This is a data-only skill: return original responses and structured records; the caller decides analysis and display.

```sh
bun run flights help
bun run flights autocomplete --query Tokyo
bun run flights search --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08
bun run flights grid --origin SYD --destination NRT --start 2026-11-01 --end 2026-12-31 --min-days 6 --max-days 8 --currency AUD
bun run flights booking --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08 --select 1 --select-return 1
bun run flights filters
bun run flights endpoints --discover
```

All route, date and filter values above are examples. Use the actual request's inputs. Resolve city names with `autocomplete`; airport codes and Google city IDs have different scopes. Defaults are AUD, one adult, economy and (for grid only) a 6–8 day stay. All are configurable. Stay length is return date minus departure date in calendar days, not time at the destination after flight duration.

`grid` returns every date/price record Google provides within the supplied departure and trip-length ranges. It sweeps 30-day chunks, writes `grid.json` and original responses to `data/flights/<query-hash>/raw/`, and prints the complete structured result on stdout. `--out <directory>` chooses storage. `--resume` continues the exact saved query without refetching completed chunks. Prices have per-chunk fetch timestamps; use a new directory for a fresh query. Missing combinations remain in `missing`, not invented fares or sold-out claims. Failures leave `complete: false`, an error and recoverable partial data.

Common filters: `--currency`, `--adults`, `--children`, `--cabin-class`, `--max-stops`, `--airlines`, `--exclude-airlines`, `--checked-bags`, `--carry-on-bags`, `--departure-window`, `--arrival-window`, `--max-duration`. `filters` publishes the complete supported contract; `--filters file.json` accepts camelCase filter keys. Outbound/return selections are one-based indices from this search's results. `booking` reads vendor offers; it does not purchase a ticket.

For payload layouts, service inventory, raw calls, live verification evidence and unsupported request schemas, read [references/api.md](references/api.md). `rpc --method <name> --payload file.json` exposes named flight services without requiring a new wrapper. Discovery identifies methods in the live bundle; it does not establish a valid request schema for every method.

HTTP 429, a challenge, an undecodable response or a gRPC failure is an error, not no availability. Stop and inspect the saved data/browser request rather than repeatedly retrying. Search and booking use the dependency's browser fallback when needed; grid/raw calls currently use HTTP and report rejection explicitly.
