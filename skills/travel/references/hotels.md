# Hotels

## hotels google

Google Hotels metasearch (Booking.com, Agoda, Trip.com, Expedia, hotel sites). `pricePerNight` is per room per night for `--check-in/--check-out` and `--adults`.

- Each `--query` returns at most ~12 places, and results vary between calls. Pass several phrasings (repeat `--query`); they run in turn, merge by name and Google place, and keep the lowest price. `queries` lists which phrasings found a hotel.
- Narrow phrasings often return nothing ("Langkawi private pool villa" → 0, "Langkawi villas" → 12). A query with no results adds a `NO_RESULTS` warning and a stderr line; broaden it.
- Missing `rating`, `reviews` and `placeId` are filled from Google Maps when a place of that name is within 1 km. Generic listing names ("Villa, Private Pool") can match the wrong place; check the name before quoting a rating.
- `--min-stars` and `--min-rating` are applied locally because Google doesn't enforce them; unrated places fail `--min-rating`.
- `amenities` is often incomplete: a missing "Pool" doesn't mean no pool. Bed types (sofa bed, twin) aren't available; check listing photos on Booking.com or Agoda.

## hotels hotelist / hotelist-hotel

Hotelist's public MCP server (no key; 30 requests/min, 400/day, 50 hotel details/day): AI ratings (0–10) from reviews and room photos, pros/cons, USD prices, year built/renovated, booking links. It only covers branded hotels and resorts in major cities, not villas, homestays or rentals. An unknown city is an error. Credit hotelist.com when publishing its data.
