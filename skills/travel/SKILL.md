---
name: travel
description: Trip and holiday research. Google Flights date grids and itineraries, Google Hotels prices, Hotelist hotel quality ratings, Google Maps place search and nearby search (cafes, food, markets, sights), and a local satellite map website with Google place cards and drive routes. Use for any flight, hotel, destination, itinerary or "where should we go" question.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run commands from the root; they print JSON.

```sh
bun run travel help
bun run travel flights grid --origin SYD --destination HKT,DPS,LGK --start 2026-12-01 --end 2026-12-31 --min-days 6 --max-days 8
bun run travel hotels google --query "Kata Beach Phuket resorts with pool" --check-in 2026-12-01 --check-out 2026-12-07 --min-stars 4
bun run travel hotels hotelist --city Phuket --amenities pool --sort best
bun run travel places search --query "Aurico Kata Resort & Spa"
bun run travel places nearby --lat 7.8269 --lng 98.2992 --types cafe,restaurant --radius 1500
bun run travel map init /absolute/path/to/trip-map
```

## Holiday workflow

1. **Shortlist destinations** that meet every hard requirement: weather for the dates, visas for the travellers' passports, vibe and transport limits. Only propose options that meet all of them.
2. **Flights:** when dates are a range or flexible, always run `flights grid` over the whole range for every candidate destination in one call. Never sample one date pair. Use `flights search` only after picking dates, and check `inputs.tripType` is `round-trip`.
3. **Hotels:** `hotels google` for real prices on the cheapest dates (Google Hotels compares Booking.com, Agoda, Trip.com and others). Use `hotels hotelist` to check quality: AI ratings from reviews and photos, pros/cons, booking links. Prices are per room per night.
4. **Around the hotel:** `places nearby` from the hotel's coordinates for cafes, restaurants, markets and sights, ranked by popularity with distance in km.
5. **Map:** `map init`, fill `places.json` (one group per option; each place's `placeId` from `places search`), run it, and check the map, a place card and a route line in a real browser before showing the user.

Report prices with the date they were fetched; they change daily. Treat HTTP/RPC failures as errors, not empty results.

References, read when using that area: [flights](references/flights.md) · [hotels](references/hotels.md) · [places](references/places.md) · [map](references/map.md)
