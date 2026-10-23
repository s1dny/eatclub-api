---
name: travel
description: Trip and holiday research. Google Flights date grids and itineraries, Google Hotels prices, Airbnb homes, Hotelist hotel quality ratings, Google Maps place search and nearby search (cafes, food, markets, sights), and a satellite trip map delivered as one HTML file with Google place cards and drive routes. Use for any flight, hotel, destination, itinerary or "where should we go" question.
---

Resolve this skill's real directory through symlinks. The repository root is two directories above it. Run commands from the root; they print JSON. `bun run travel help` lists every command and flag.

## Holiday workflow

1. **Shortlist destinations** that meet every hard requirement: weather for the dates, visas for the travellers' passports, vibe and transport limits. Only propose options that meet all of them.
2. **Flights:** for a date range, run one `flights grid` over the whole range with every candidate destination, never a sampled date pair:
   `flights grid --origin SYD --destination HKT,KBV,LGK --start 2026-12-01 --return-by 2026-12-31 --min-days 6 --max-days 8 --adults 2 --max-stops one-or-fewer-stops`
   Then get itineraries for the chosen dates, outbound plus the return of the cheapest outbound:
   `flights search --origin SYD --destination LGK,KBV --departure 2026-12-01 --return 2026-12-09 --adults 2 --select cheapest`
3. **Hotels:** `hotels google` with several phrasings in one call; results are merged and missing ratings and place ids are filled from Google Maps:
   `hotels google --query "Langkawi villas" --query "Pantai Cenang villas" --query "Langkawi hotels with pool" --check-in 2026-12-02 --check-out 2026-12-09`
   For villas, apartments and whole homes also search Airbnb, then read the shortlisted listings (beds, private vs shared pool, amenities):
   `hotels airbnb --location "Langkawi, Malaysia" --check-in 2026-12-02 --check-out 2026-12-09 --entire --pool --min-rating 4.7 --pages 2`
   `hotels airbnb-listing --id <id or URL from the search>`
   For branded hotels and resorts, `hotels hotelist --city Phuket --amenities pool` adds AI quality ratings, pros/cons and booking links.
4. **Around the hotel:** `places nearby --lat … --lng … --types cafe,restaurant` (or `market`, `tourist_attraction`, `hiking_area`, `beach`) ranks places by popularity with distance in km.
5. **Map:** always deliver the map as one HTML file that opens from disk:
   `map init <folder>`, write `<folder>/places.json`, then `map build <folder> --title "…"` writes `<folder>/map.html`.

Report prices with the date they were fetched; they change daily. Commands exit non-zero on HTTP/RPC failures: those are errors, not empty results.

References, read when using that area: [flights](references/flights.md) · [hotels](references/hotels.md) · [places](references/places.md) · [map](references/map.md)
