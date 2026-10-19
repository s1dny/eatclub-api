Bun + TypeScript. Use `bun`, `bun test`, `Bun.serve`, `bun:sqlite`; no Node tooling.

- `src/eatclub.ts`: EatClub HTTP/RSC client and zod schemas. Venue pages dedupe objects into `"$row:path"` refs, so `resolveRefs` must run before parsing.
- `src/venues.ts`: caching, deal/hour logic (ISO weekday 1 = Mon, minutes past local midnight), menu rendering, nearby search.
- `src/osm.ts`: OSRM foot `table` walking times.
- `src/mcp.ts`: tool definitions shared by `src/stdio.ts` and `src/http.ts`.
- Tests live in `tests/` and hit the live services end to end.
- Location always comes from the caller. Don't add device geolocation.
