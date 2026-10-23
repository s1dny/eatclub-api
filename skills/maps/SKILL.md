---
name: maps
description: Build a KML file of colour-coded pins (airports, hotels, places) with photo/detail popups and real driving routes, for Google Earth. Free; no API key.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run from the root:

```sh
bun run maps help                                   # input schema
bun run maps kml --in map.json --out ~/Downloads/map.kml
```

Write `map.json` with real data gathered for the task (e.g. fares and dates from the flights skill's `grid`/`search`, hotels from Google Hotels via `google-travel-website-api`), then build the KML. Look up coordinates; don't guess them.

- One `group` per option, e.g. one destination: its airport, hotel and drive share a colour (auto-assigned or `#rrggbb`). Put the comparison number in the group name, e.g. `Phuket · ≈$1,331 pp`.
- Each place's popup shows its `photo` (direct image URL), `details` rows, `links` and optional `html`. Check photo URLs return an image.
- `drives` are OSRM/OpenStreetMap road routes (no traffic). Their time and distance are added to the destination's details. Failures stop the build; never substitute straight lines.

The user opens it at earth.google.com → New → Import file to map project → Upload from device (needs their Google sign-in). Hand them the file path and these steps.
