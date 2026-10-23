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

## Google Flights

Flight searches, airport and city lookup, booking offers and flexible-date prices.

```sh
bun run flights help
bun run flights autocomplete --query Tokyo
bun run flights search --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08
bun run flights grid --origin SYD --destination NRT --start 2026-11-01 --end 2026-12-31 --min-days 6 --max-days 8 --currency AUD
```

`filters` lists search options. `endpoints --discover` lists service methods. Date-grid responses and checkpoints are stored in `data/flights/`.

[Skill](skills/flights/SKILL.md) · [API reference](skills/flights/references/api.md)

## Maps

Local website template: Google satellite map, colour-coded pins that open Google's own place card, and Google drive routes.

```sh
bun run maps init /absolute/path/to/new-map
bun run maps place --query "Phuket International Airport"
```

[Skill and Google Cloud setup](skills/maps/SKILL.md)

## Development

Each skill has `skills/<name>/SKILL.md`, `skills/<name>/references/api.md` and `src/<name>/cli.ts`. Add its command to `package.json`; the installer discovers skill directories automatically.

```sh
bun run lint
bun run format:check
bun run typecheck
bun test
```

Use `bun run fix` to apply lint fixes and formatting. EatClub tests require a synced database, walking graph and `EATCLUB_APP_API_KEY` in `.env`.
