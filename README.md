# Skills

Reusable, data-only agent skills backed by reverse-engineered website APIs. Each skill documents its requests, data structures and limitations and provides a CLI. The calling agent chooses how to interpret and present the data. No UI, MCP server, recommendation policy or answer formatting.

| Skill                              | Data                                                                                                       | Entry point                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [eatclub](skills/eatclub/SKILL.md) | NSW venues, weekly deals, menus, walking distances, today's live availability                              | `bun run sql`, `bun run live` |
| [flights](skills/flights/SKILL.md) | Google Flights searches, booking offers, location lookup, date/price combinations and raw service requests | `bun run flights`             |

```sh
bun upgrade --canary
bun install
bun run skills:install
```

The installer links these two skills into `~/skills`, `~/.codex/skills` and `~/.claude/skills`. Existing nonmatching entries are backed up before replacement. Skills resolve the repository through their real directory, so no checkout path is embedded in their instructions.

## Google Flights

```sh
bun run flights autocomplete --query Tokyo
bun run flights grid --origin SYD --destination NRT --start 2026-11-01 --end 2026-12-31 --min-days 6 --max-days 8 --currency AUD
bun run flights search --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08
bun run flights filters
bun run flights endpoints --discover
```

These are example arguments, not pinned routes or dates. Date-grid queries sweep configurable departure ranges in 30-day chunks and request the trip-length interval directly from Google. Only returned date/price combinations are populated. Results are complete JSON on stdout, with checkpointed JSON and original response bodies under `data/flights/`. No HTML or other display output is generated. `--resume` reuses completed chunks for the exact same query; use a new output directory for fresh prices.

Read [the flight protocol notes](skills/flights/references/api.md) for endpoint discovery, raw requests, schemas and verification scope. The client uses `google-travel-website-api@0.5.2` for shared request builders, decoders, search, autocomplete and booking operations; this repo adds the native minimum/maximum stay request, large-range chunking, checkpointing and raw access to the live method inventory.

## EatClub

The existing database and walking graph remain in `data/`. Commands retain their previous names. [EatClub schema and API notes](docs/eatclub.md) document the database and queries. Source is namespaced under `src/eatclub/`; Google Flights is under `src/flights/`.

## Adding a skill

Add `skills/<name>/SKILL.md`, protocol references when needed, and a namespaced client in `src/<name>/`. Keep endpoint evidence and limitations with that skill. Return API data without prescribing agent decisions or presentation. Register its CLI in `package.json` and its name in `scripts/install.ts`.

Use Bun canary (`bun upgrade --canary`). `bun run lint` uses Bun's built-in linter; `bun run format` formats files and `bun run format:check` checks formatting. `bun run fix` applies lint fixes and formatting. `bun run typecheck` checks TypeScript. Existing EatClub end-to-end tests live in `tests/` and require its local synced database, walking graph and app API key. Flight development is verified with live CLI calls rather than prototype tests.
