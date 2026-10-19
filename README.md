# eatclub-api

MCP server and HTTP API for [EatClub](https://eatclub.com.au/venues/) restaurant deals and menus.
Ask an agent things like *"what's within a 10 minute walk of -33.8688, 151.2093 that's healthy with beef or lamb?"*

- **Venues**: every venue in a region from `POST /api/restaurants`, cached locally for 24h. The first query in a region builds the index (~80s for Sydney).
- **Deals + menus**: parsed from each venue page's React Server Components payload, cached for 6h.
- **Walk times**: real OpenStreetMap foot routing via OSRM's table API (default [routing.openstreetmap.de](https://routing.openstreetmap.de)). If routing is down it falls back to a straight-line × 1.3 estimate and reports `walkSource: "estimate"`.
- **Location**: the caller supplies coordinates. Judging dietary fit is left to the model reading the menus.

Stale cache entries are served immediately and refreshed in the background (SQLite at `~/.cache/eatclub-api`).

## Use with Claude Code

```sh
bun install
claude mcp add -s user eatclub -- bun /path/to/eatclub-api/src/stdio.ts
```

Tools:

| tool | what |
| --- | --- |
| `find_venues_nearby` | venues within `walkMinutes` of a point, nearest first: deals live at `at`, today's deals, hours, menus. Optional `menuKeywords`, `cuisines`, `dealType`, `onlyActiveDeals`. |
| `get_venue` | one venue's weekly deal schedule, hours, contact details and full menu |
| `list_regions` | covered cities |

## HTTP

```sh
bun run serve            # PORT=3000
curl 'localhost:3000/venues/nearby?lat=-33.8688&lng=151.2093&walkMinutes=10&menuKeywords=beef,lamb'
curl localhost:3000/venues/ca-de-vin
curl localhost:3000/regions
```

`/mcp` serves the same tools over stateless Streamable HTTP.

## Config

| env | default |
| --- | --- |
| `PORT` | `3000` |
| `EATCLUB_CACHE_DIR` | `~/.cache/eatclub-api` |
| `OSRM_FOOT_URL` | `https://routing.openstreetmap.de/routed-foot` |
| `EATCLUB_BASE_URL` | `https://eatclub.com.au` |

## Dev

```sh
bun run test       # live end-to-end: stdio MCP, HTTP API, HTTP MCP
bun run typecheck
bun run lint
```
