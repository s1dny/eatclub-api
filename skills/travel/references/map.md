# Map

A satellite Google map with one coloured group of pins per option, Google's own place card on click and driving routes. Delivered as one HTML file that opens from disk; Google still serves imagery, cards and routes over the internet.

```sh
bun run travel map init /abs/trip-map          # copies the template and installs it
# write /abs/trip-map/places.json
bun run travel map build /abs/trip-map --title "Langkawi vs Krabi"   # → /abs/trip-map/map.html
```

`places.json`, one group per option; a group's pins and routes share its colour:

```json
[
  {
    "name": "Langkawi · Maneh Villa · ≈$2,070 pp",
    "places": [
      { "kind": "airport", "name": "Langkawi International Airport", "placeId": "ChIJ…", "lat": 6.342, "lng": 99.731 },
      { "kind": "hotel", "name": "Maneh Villa Langkawi", "placeId": "ChIJ…", "lat": 6.282, "lng": 99.733 },
      { "kind": "hike", "name": "Seven Wells Waterfall", "placeId": "ChIJ…", "lat": 6.383, "lng": 99.668 }
    ],
    "routes": [
      [0, 1],
      [1, 2]
    ]
  }
]
```

- `kind` sets the pin glyph: airport, hotel, beach, hike, sight, market, food, cafe, bar.
- `routes` are index pairs; each is listed under its group as "A → B: N min drive". Put comparison numbers in the group name, not on pins.
- `?place=<placeId>` opens a card on load. Edit the folder's `map.ts`/`index.html` freely; `build` bundles them.
- A route between places with no road between them (an island, a boat-only beach) shows "route failed".

## Google Cloud

Key `trip-maps-local` in project `trip-maps-512505` (account plarza@plarza.com; manage with `gcloud services api-keys`). On 23 October 2026 the user approved removing its website restrictions so files opened from disk work. It is restricted to four APIs: `maps-backend` (Maps JavaScript), `places`, `placewidgets` (Places UI Kit; without it the card fails with 403 on `GetPlaceWidget`) and `routes`. The key is visible in the built HTML, so don't commit or publish built maps. An AUD 1 budget alert is set.
