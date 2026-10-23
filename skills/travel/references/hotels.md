# Hotels

`hotels google` uses `google-travel-website-api` (`hotel-filters`) for Google Hotels, a metasearch of Booking.com, Agoda, Trip.com, Expedia and hotel sites. With `--check-in/--check-out` the nightly price is for those dates (`stay.scope: entity-offers`). Google echoes some filters without enforcing them, so `--min-stars` and `--min-rating` are applied locally. Results vary a little between calls. `amenities` is often incomplete: "pool" missing doesn't mean no pool. `placeId` is often null; get it with `places search --query "<hotel name> <area>"` for the map. `photos` are direct image URLs.

`hotels hotelist` / `hotelist-hotel` call Hotelist's public MCP server (`https://hotelist.com/mcp`, no key; 30 requests/min, 400/day, 50 hotel details/day). It gives AI quality ratings (0–10) built from reviews and room photos, pros/cons, USD prices, year built/renovated, amenities and booking links. Coverage is a few dozen to a few hundred hotels per major city. `list_cities` isn't exposed; an unknown city returns an error. Credit hotelist.com when publishing its data.

Not covered: room-level bed types (sofa bed, twin) need Booking.com or Agoda room data.
