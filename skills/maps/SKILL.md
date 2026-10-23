---
name: maps
description: Local website with a Google satellite map, colour-coded pins that open Google's own place card (photos, reviews, prices) and Google drive routes between places. Bun + TypeScript template.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run from the root:

```sh
bun run maps init /absolute/path/to/new-map              # copies assets/template, writes .env.local with the key
bun run maps place --query "Phuket International Airport" # name, placeId, lat, lng, types
```

In the new folder: `bun install`, then `bun run dev` → http://localhost:3000 (the key only works on port 3000).

Edit `places.json`: one group per option, e.g. a destination. A group's pins and route lines share its colour.

```json
[
  {
    "name": "Phuket · ≈$1,331 pp",
    "color": "#00acc1",
    "places": [
      { "kind": "airport", "name": "…", "placeId": "ChIJ…", "lat": 8.1, "lng": 98.3 },
      { "kind": "hotel", "name": "…", "placeId": "ChIJ…", "lat": 7.8, "lng": 98.3 }
    ],
    "routes": [[0, 1]]
  }
]
```

- Get every `placeId`/`lat`/`lng` from `maps place`. Check the returned name and types match.
- Clicking a pin shows Google's own place card (Places UI Kit `<gmp-place-details>`). Don't add custom text to pins; put comparison numbers in the group name. `kind` airport/hotel sets the pin glyph.
- `routes` are Google Routes API drives between place indexes; drive time is added to the legend.
- `?place=<placeId>` opens a card on load. Edit `map.ts`/`index.html` freely for the task.
- Check it in a real browser before reporting it done: the map, a card and a route line. Headless browsers can't render the map.

## Google Cloud

The key is `GOOGLE_MAPS_API_KEY` in the repository `.env` (project `trip-maps-512505`, account plarza@plarza.com, managed with `gcloud services api-keys`). It's restricted to `http://localhost:3000/*` and `http://127.0.0.1:3000/*` and to these APIs, all enabled: Maps JavaScript (`maps-backend`), Places API (New) (`places`), Places UI Kit (`placewidgets`) and Routes (`routes`). Without `placewidgets` the card fails with a 403 on `GetPlaceWidget`. Personal use stays inside Google's free monthly usage; an AUD 1 budget alert is set.
