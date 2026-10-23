# Hotels

`hotels search` queries Google Hotels, Airbnb and Agoda in parallel and returns one row per listing per site (the same villa can appear once per site). `hotels details --url` reads an Airbnb or Agoda row in full. Airbnb and Agoda have no public APIs; their website endpoints are used, so a block or layout change fails loudly.

## search

- Rows: `source`, `name`, `type`, `totalPrice` (whole stay), `pricePerNight`, `rating` (out of 5; Agoda's /10 is halved), `reviews`, `stars`, `entire`, `pool`, `bedrooms`, `details`, lat/lng, `url`, `placeId` (Google only) and photos. `null` means the site didn't say.
- Prices: Airbnb and Agoda totals include fees and taxes. Google's is its nightly rate × nights. Agoda and Google price the property's cheapest room, which may not be the room you want (Adagaya Villa: $624 without a pool, $1,537 with one); check `details`.
- Filters: `--entire` and `--pool` are applied by Airbnb and Agoda; Airbnb's pool includes shared pools. Google can't filter either, so its rows stay with `entire: null`. `--min-bedrooms`, `--max-price-per-night` and `--min-rating` drop rows that fail them; unknown values are kept, except unrated rows fail `--min-rating`.
- `sources` reports rows found and each site's total match count; `--pages` (up to 5) fetches more from Airbnb (18 a page) and Agoda (45 a page). A site that fails is listed in `failures` (and on stderr) while the others still return.
- Agoda looks up the city in `--location`; Airbnb takes it as typed. Google gets three phrasings built from the first part of `--location`; replace them with `--query` (repeatable). Narrow Google phrasings often return nothing; those appear in `warnings`.
- Google rows get missing ratings and place ids from Google Maps when a place of that name is within 1 km. Generic names ("Villa, Private Pool") can match the wrong place.

## details

- Airbnb: overview ("2 guests", "1 bedroom", "1 bed"), amenities in the host's wording ("Private outdoor pool" vs "Shared outdoor pool"), rating, host, `exactLocation`, description. Room-by-room beds are rarely filled in.
- Agoda: `available` (false when it's sold out for the dates, which search can miss), every room type with its beds per room ("Bedroom 1: 1 king bed", "Common space: 1 sofa bed"), occupancy and stay price, plus amenities, rating and description.
- Google Hotels rows link to the booking site; read those listings on Agoda or Airbnb when they're there.
