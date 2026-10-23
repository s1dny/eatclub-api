---
name: google-maps
description: Create a small local website with a 2D Google satellite map, pins for airports, stays and places, a side panel of details (flight prices, resort info) and Google-calculated driving routes. Bun + TypeScript starter.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it.

This skill includes a minimal reusable app, not a map-building framework. Keep the app small and let the calling model edit or extend its ordinary TypeScript directly.

Create a standalone copy from the repository root:

```sh
bun run maps init /absolute/path/to/new-map
```

The target must not exist. The initializer copies `assets/starter/` and writes an ignored `.env.local`, using `GOOGLE_MAPS_API_KEY` from the repository environment when available. It never prints the key. In the generated folder, run `bun install` and `bun run dev` (default http://localhost:3000). Run `bun run typecheck` after edits.

- `locations.ts`: the only file to edit per trip. `locations` have an ID, name, `kind` (`airport` blue, `stay` orange, `place` green), position, optional `details` (label → value rows, e.g. cheapest flight and dates from the flights skill's `grid`, price per night, room/bed, pool) and an optional `url`. `routes` reference `from`/`to` IDs. `title` names the page.
- `map.ts`: 2D satellite (`hybrid`) map fitted to all pins, a side panel and pin popups showing each location's details, and drives from Google's Routes library drawn as lines. Each drive's time and distance is added to its destination's details. Failed routes are shown as errors, never straight-line substitutes.
- `server.ts`: Bun HTML entrypoint and runtime config (`GOOGLE_MAPS_API_KEY`, optional `GOOGLE_MAPS_MAP_ID`, default `DEMO_MAP_ID`, needed for pins). No database, frontend framework or custom routing engine.

Fill locations with real coordinates (look them up; don't guess) and real data from other skills. Open the app in a browser and check the map, pins and drives render before reporting it done.

## Google Cloud setup

Use the user's chosen Cloud project with **Maps JavaScript API** and **Routes API** enabled and billing attached. The key's website restrictions must include `http://localhost:*/*` (and any deployed domain); otherwise Google shows "Oops! Something went wrong" with `RefererNotAllowedMapError` in the console. Set `GOOGLE_MAPS_API_KEY` in the generated app's `.env.local`, or in this repository's ignored `.env` to reuse it for future generated apps. The provided `env.example` shows the variable.

A Maps JavaScript key is intentionally sent to the browser; restrict it to the app's HTTP referrers and the required APIs. Include localhost for development. Do not commit real keys or copy a different service's credentials. If setup is missing, report it; do not silently use a fake map. Existing session authorization determines whether enabling APIs or generating a key is permitted.

Routes use the default basic driving request and can incur Google API usage; don't describe usage as unconditionally free. Keep Google attribution and its built-in map UI visible.

Official docs, read when changing integration details:

- [Advanced markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
- [Loader](https://developers.google.com/maps/documentation/javascript/load-maps-js-api)
- [Driving routes](https://developers.google.com/maps/documentation/javascript/routes/get-a-route)
- [Polylines](https://developers.google.com/maps/documentation/javascript/shapes#polylines)
