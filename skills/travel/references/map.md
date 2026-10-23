# Map

## Single HTML delivery

The default deliverable is one `.html` file containing the existing map UI, bundled JavaScript and inline `places.json` data. Google still supplies map imagery, place cards and routes over the internet. Preserve these live features; a static HTML file does not mean a screenshot, offline map or resort report.

For the existing template, replace the `/api/key` fetch with the browser Maps key at build time, inline the place data, bundle the entry with `bun build --target browser`, and insert the bundle in an inline module script in `index.html`. The output must not fetch localhost, `/api/key`, local JSON, TypeScript or sibling assets. Browser Maps keys are client-visible; never include server credentials or commit generated files containing keys.

Check the key's current restrictions before choosing the delivery URL. The configured key below is restricted to localhost:3000. Direct `file://` opening generally omits the HTTP referrer Google needs for website restrictions, so packaging alone does not make this key work from a local file. A static HTTPS host with an explicitly allowed origin preserves the UI without a running local server. Changing restrictions or publishing requires the appropriate authorization; do not clear protections just to make an export load. See [Google's security guidance](https://developers.google.com/maps/api-security-best-practices).

Verify the actual delivered URL/file, a pin's Google place card, and a driving route. If browser tools cannot open local files, report that validation limitation; successful localhost rendering is not proof of direct-file compatibility.

## Local development

`map init <folder>` copies `assets/template` and writes `.env.local` with the key. In the folder: `bun install`, then `bun run dev` → http://localhost:3000. The key only works on port 3000.

`places.json`: one group per option. A group's pins and route lines share its colour.

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

- Clicking a pin shows Google's own place card (Places UI Kit `<gmp-place-details>`, built with `createElement`). Don't add custom text to pins; put comparison numbers in the group name. `kind` airport/hotel sets the pin glyph.
- `routes` are Google Routes API drives between place indexes; the drive time is added to the legend.
- `?place=<placeId>` opens a card on load. Edit `map.ts`/`index.html` freely for the task.
- Check it in a real browser: the map, a card and a route line. Headless browsers can't render the map.

## Google Cloud

Key `trip-maps-local` in project `trip-maps-512505` (account plarza@plarza.com, which gcloud on this Mac is signed in as; manage with `gcloud services api-keys` and `gcloud services enable`). It's restricted to `http://localhost:3000/*` and `http://127.0.0.1:3000/*`, and to these APIs, all enabled: `maps-backend` (Maps JavaScript), `places` (Places API (New)), `placewidgets` (Places UI Kit) and `routes`. Without `placewidgets` the card fails with a 403 on `GetPlaceWidget`. An AUD 1 budget alert is set; Google wouldn't allow changing the daily quotas.
