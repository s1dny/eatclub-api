# Places

Google Places API (New) with `GOOGLE_MAPS_API_KEY` from the repository `.env`. The key is referrer-restricted, so requests send `Referer: http://localhost:3000/`.

- `places search --query` → `searchText`: name, placeId, lat/lng, types, rating, reviews, priceLevel, address, mapsUrl. Check the name and types match before using a result.
- `places nearby --lat --lng` → `searchNearby`: up to 20 places within `--radius` metres (default 1500), filtered by `--types` (Google place types such as `cafe`, `restaurant`, `market`, `tourist_attraction`, `hiking_area`, `beach`, `night_club`, `spa`), ranked by `popularity` or `distance`, with `km` from the centre.

Popular times (busy hours) aren't available: the Places API doesn't offer them, and Google Maps hides them from signed-out visitors ("limited view"). They need a signed-in Google session.

Rating, review count and price level are billed at a higher Places tier. Personal use stays within Google's monthly free usage.
