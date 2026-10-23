# Hotels

## hotels google

Google Hotels metasearch (Booking.com, Agoda, Trip.com, Expedia, hotel sites). `pricePerNight` is per room per night for `--check-in/--check-out` and `--adults`.

- Each `--query` returns at most ~12 places, and results vary between calls. Pass several phrasings (repeat `--query`); they run in turn, merge by name and Google place, and keep the lowest price. `queries` lists which phrasings found a hotel.
- Narrow phrasings often return nothing ("Langkawi private pool villa" → 0, "Langkawi villas" → 12). A query with no results adds a `NO_RESULTS` warning and a stderr line; broaden it.
- Missing `rating`, `reviews` and `placeId` are filled from Google Maps when a place of that name is within 1 km. Generic listing names ("Villa, Private Pool") can match the wrong place; check the name before quoting a rating.
- `--min-stars` and `--min-rating` are applied locally because Google doesn't enforce them; unrated places fail `--min-rating`.
- `amenities` is often incomplete: a missing "Pool" doesn't mean no pool. Bed types (sofa bed, twin) aren't available; check listing photos on Booking.com or Agoda.

## hotels airbnb / airbnb-listing

Reads the data embedded in airbnb.com.au search and listing pages (no API, no key). Failures are errors: a block or layout change throws rather than returning nothing.

- `airbnb` returns 18 listings per page (`--pages` up to 5) with `totalPrice` for the stay including fees, taxes and discounts, `pricePerNight` (total ÷ nights), rating, `details` ("1 bedroom", "1 king bed"), lat/lng, `url` and photos. `totalAvailable` is Airbnb's count for the filters.
- Filters: `--entire` (whole place), `--pool` (any pool, shared included), `--min-bedrooms`, `--max-price-per-night` (applied by Airbnb), `--min-rating` (local; new listings have no rating).
- `airbnb-listing --id <id or URL>`: overview ("2 guests", "1 bedroom", "1 bed"), all amenities with their wording ("Private outdoor pool" vs "Shared outdoor pool"), rating, host and superhost, location (`exactLocation: false` means approximate), description. `sleepingArrangements` is usually empty; for a couch or sofa bed, check amenities, description and listing photos.
- Listings have no Google place id, so on the map use the Google place if the property has one (`places search`), otherwise skip the card.

## hotels hotelist / hotelist-hotel

Hotelist's public MCP server (no key; 30 requests/min, 400/day, 50 hotel details/day): AI ratings (0–10) from reviews and room photos, pros/cons, USD prices, year built/renovated, booking links. It only covers branded hotels and resorts in major cities, not villas, homestays or rentals. An unknown city is an error. Credit hotelist.com when publishing its data.
