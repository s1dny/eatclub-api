---
name: maps
description: Start a small website with a free, high-resolution satellite map (Esri World Imagery, no API key) and free driving routes (OSRM/OpenStreetMap). Barebones Bun + TypeScript + Leaflet template; the model builds the rest.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Create a new app from the repository root:

```sh
bun run maps init /absolute/path/to/new-map
```

The target must not exist. In the generated folder run `bun install`, then `bun run dev` (http://localhost:3000, `PORT` to change).

The template is deliberately bare: a full-screen satellite map, an example marker pair and a `drive(from, to)` helper. Design everything else (layout, panels, data, styling) for the task at hand by editing the generated files. Look up real coordinates rather than guessing them. Open the app in a browser and check that it renders before reporting it done.

- Imagery: Esri World Imagery plus Esri's place-name overlay, free with no key. Keep the Esri attribution visible. Tiles go to zoom 19; coverage detail varies by place.
- Drives: `drive()` calls the public OSRM demo server and returns `{ path, minutes, km }`. It allows about one request a second with no traffic data. Run requests one after another for many routes, and report failures rather than drawing straight lines.
- Map library: [Leaflet](https://leafletjs.com/reference.html). Replace it if the task needs something else (e.g. MapLibre for 3D terrain).
