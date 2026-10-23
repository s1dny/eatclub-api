# Skills

Agent skills with data-only CLIs and small reusable app starters. Agents decide how to interpret data and extend generated apps.

## Setup

```sh
bun upgrade --canary
bun install
bun run skills:install
```

Skills are installed into `~/skills`, `~/.codex/skills` and `~/.claude/skills`. Run commands from this repository.

## EatClub

NSW venues, menus, weekly deals, live availability and walking distances.

```sh
bun run eatclub help
bun run eatclub sql "SELECT name, slug FROM venues LIMIT 5"
bun run eatclub walk -33.8688 151.2093 --max 10
bun run eatclub live bar-bruno
```

`sync` refreshes the database. `map` builds the local walking graph. Data is stored in `data/eatclub.db` and `data/walk-graph.bin`.

[Skill](skills/eatclub/SKILL.md) · [API reference](skills/eatclub/references/api.md)

## Travel

Trip research in one CLI: Google Flights date grids and itineraries, hotel, villa and home search across Google Hotels, Airbnb and Agoda, Google Maps place and nearby search, and a satellite trip map built as one HTML file with Google place cards and drive routes.

```sh
bun run travel help
bun run travel flights grid --origin SYD --destination HKT,LGK --start 2026-12-01 --return-by 2026-12-31
bun run travel flights search --origin SYD --destination LGK --departure 2026-12-01 --return 2026-12-09 --select cheapest
bun run travel hotels search --location "Langkawi, Malaysia" --check-in 2026-12-02 --check-out 2026-12-09 --entire --pool
bun run travel places nearby --lat 6.2817 --lng 99.7332 --types cafe
bun run travel map init /abs/trip-map && bun run travel map build /abs/trip-map
```

[Skill](skills/travel/SKILL.md) · references: [flights](skills/travel/references/flights.md), [hotels](skills/travel/references/hotels.md), [places](skills/travel/references/places.md), [map](skills/travel/references/map.md)

## Development

Each skill has `skills/<name>/SKILL.md`, `skills/<name>/references/api.md` and `src/<name>/cli.ts`. Add its command to `package.json`; the installer discovers skill directories automatically.

```sh
bun run lint
bun run format:check
bun run typecheck
bun test
```

Use `bun run fix` to apply lint fixes and formatting. EatClub tests require a synced database, walking graph and `EATCLUB_APP_API_KEY` in `.env`.
