# Hotels

`hotels search` queries Google Hotels, Airbnb, Agoda and cozycozy in parallel and returns one row per listing per source (the same villa can appear once per source). `hotels details --url` reads an Airbnb or Agoda row in full. Only Google Hotels is reached through a library; the others are read through their website endpoints, so a block or layout change fails loudly.

cozycozy is itself a metasearch over Booking.com, Airbnb, Agoda, Expedia, Hotels.com, Stayz, HomeToGo, Trip.com and ZenHotels. Its rows carry the cheapest offer: `site` names the booking site, `url` goes straight to that listing, and `details` says how many offers it compared. It's the only source with Booking.com and Expedia listings; `details` reads its Agoda and Airbnb links but not the other sites.

## search

- Rows: `source`, `name`, `type`, `totalPrice` (whole stay), `pricePerNight`, `rating` (out of 5; Agoda's /10 is halved), `reviews`, `stars`, `entire`, `pool`, `bedrooms`, `details`, lat/lng, `url`, `placeId` (Google only) and photos. `null` means the site didn't say.
- Prices: Airbnb, Agoda and cozycozy totals are for the whole stay as the booking site quotes it. Google's is its nightly rate × nights. Agoda and Google price the property's cheapest room, which may not be the room you want (Adagaya Villa: $624 without a pool, $1,537 with one); check `details`.
- Filters: `--entire` and `--pool` are applied by Airbnb, Agoda and cozycozy (holiday rentals; swimming pool); none of them distinguish private from shared pools. Google can't filter either, so its rows stay with `entire: null`. `--min-bedrooms`, `--max-price-per-night` and `--min-rating` drop rows that fail them; unknown values are kept, except unrated rows fail `--min-rating`.
- `sources` reports rows found and each source's total match count; `--pages` (up to 5) fetches more from Airbnb (18 a page), Agoda (45 a page) and cozycozy (50 a page, cheapest first). A site that fails is listed in `failures` (and on stderr) while the others still return.
- Agoda and cozycozy look up `--location`; Airbnb takes it as typed. Google gets three phrasings built from the first part of `--location`; replace them with `--query` (repeatable). Narrow Google phrasings often return nothing; those appear in `warnings`.
- Google rows get missing ratings and place ids from Google Maps when a place of that name is within 1 km. Generic names ("Villa, Private Pool") can match the wrong place.

## details

- Airbnb: overview ("2 guests", "1 bedroom", "1 bed"), amenities in the host's wording ("Private outdoor pool" vs "Shared outdoor pool"), rating, host, `exactLocation`, description. Room-by-room beds are rarely filled in.
- Agoda: `available` (false when it's sold out for the dates, which search can miss), every room type with its beds per room ("Bedroom 1: 1 king bed", "Common space: 1 sofa bed"), occupancy and stay price, plus amenities, rating and description.
- Google Hotels rows link to the booking site; read those listings on Agoda or Airbnb when they're there.
