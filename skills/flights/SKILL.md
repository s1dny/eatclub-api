---
name: flights
description: Query Google Flights API data for itineraries, booking offers, airport and city lookup, and large departure/return price grids with configurable trip lengths.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run commands from that root. Commands return data; the calling agent decides interpretation and presentation.

```sh
bun run flights help
bun run flights autocomplete --query Tokyo
bun run flights search --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08
bun run flights grid --origin SYD --destination NRT --start 2026-11-01 --end 2026-12-31 --min-days 6 --max-days 8 --currency AUD
bun run flights booking --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08 --select 1 --select-return 1
bun run flights filters
bun run flights endpoints --discover
```

Use the request's route, dates and filters. Resolve city names with `autocomplete`. Defaults are AUD, one adult, economy and a 6–8-day interval for grids. Stay length is the calendar-day difference between departure and return dates.

`grid` returns JSON date/price records and checkpoints responses in `data/flights/`. `--out` chooses a directory; `--resume` continues the same query using cached chunks. Each price has a fetch timestamp. `missing` lists combinations without prices; failures leave `complete: false` and partial results. Search and booking also include original decoded API responses. Booking reads vendor offers.

Read [references/api.md](references/api.md) for filters, output schemas, endpoint support and raw requests. `rpc --method <name> --payload file.json` accepts inner request arrays. A discovered method may still require an unmapped request schema or session tokens. Treat HTTP and RPC failures as errors, not empty inventory.
