# Google Flights protocol

This is an unofficial website protocol, not a Google-supported developer API. The client uses anonymous requests without an API key. Methods and positional schemas can change independently.

## Transport

Named methods use:

```text
POST https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/<method>?curr=AUD&hl=en&gl=AU
Content-Type: application/x-www-form-urlencoded;charset=UTF-8

f.req = JSON.stringify([null, JSON.stringify(innerPayload)])
```

Use URLSearchParams for form encoding. Responses begin with the `)]}'` XSSI prefix and contain framed `wrb.fr` rows. Row `[2]` contains JSON text; an absent payload with row `[5][0]` contains a gRPC failure even if HTTP is 200. The shared decoder handles chunked/multibyte framing and multiple frames. Original response text and decoded payloads are preserved by raw/grid calls.

Airport IDs use `["SYD",0]`; Google cities use `["/m/…",4]` (also `/g/…`). A city ID may cover several airports. Use `autocomplete` instead of treating city names as airport codes.

Search and booking use the shared library's HTTP transport and browser fallback when Google returns gRPC status 13. Grid and raw calls use HTTP and fail explicitly if rejected. HTTP 429, an interstitial, no payload and an upstream failure are distinct from a valid empty result. No unbounded retries or proxy rotation.

## Date grid

`src/flights/api.ts` uses the shared shopping/calendar builders and extends the calendar request's last field to a native stay interval:

```text
[
  null,
  tripSettings.slice(0, 18),
  [departureStart, departureEnd],
  null,
  [minimumDays, maximumDays]
]
```

The CLI sends the stay interval in one request per 30-day departure chunk. It checkpoints completed chunks so interrupted queries can resume. A comma-separated `--destination` runs one grid per destination sequentially; stdout is `{grids: [...]}` and each grid is saved under `<out>/<destination>`.

Trip settings (zero-based indices):

| Slot | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| 2    | Trip type: 1 round trip, 2 one way                                 |
| 5    | Cabin: 1 economy, 2 premium economy, 3 business, 4 first           |
| 6    | Passenger counts; use the shared builder to preserve wire ordering |
| 7    | Price filter                                                       |
| 10   | Baggage requirements                                               |
| 13   | Trip segments                                                      |
| 17   | Round-trip context flag                                            |

A segment carries origin and destination airport/entity sets at `[0]`/`[1]`, time filters `[2]`, stop filter `[3]`, airline includes/excludes `[4]`/`[5]`, travel date `[6]`, duration `[7]` and selected legs `[8]`. Use `filters` for accepted values rather than inventing enum codes. Unknown slots are kept null by the shared builder.

Calendar payload entries contain departure, return and a price block. The price currency is decoded from Google's token and checked against the requested currency. `days` is the UTC date difference, unaffected by daylight savings. Requesting 6–8 days does not calculate time on the ground or account for arrival-day offsets.

### Output

```text
grid.json and stdout:
  query: {origin, destination, start, end, minDays, maxDays, filters}
  startedAt, updatedAt: ISO timestamps
  complete: all request chunks finished successfully
  chunks: [{from, to, fetchedAt, count}]
  cells: [{departure, returnDate, days, price, currency, fetchedAt}]
  missing: [{departure, returnDate, days}]
  error?: failure message when partial

raw/<from>_<to>.json:
  fetchedAt, endpoint, request, status, responseText, payloads
```

`complete` describes completed requests, not guaranteed inventory for every combination. `missing` lists combinations absent from Google's responses. No prices are interpolated, no cells are ranked, and no HTML is produced. Prices are Google's returned amounts for the requested passengers and filters; do not assume these include baggage unless the query requested it. `--resume` retains the original timestamps and prices; it is not a fresh search.

`search`, `autocomplete`, `booking`, `dates` and `scan` return the dependency's JSON result and original decoded Google payloads (`google`) and requests (`request`). `search --select N` advances to return options. `booking --select N --select-return M` reads provider prices for the chosen combination; no booking is submitted.

## Service inventory

`bun run flights endpoints --discover` loads the live Flights document, fetches its first-party `boq-travel` script bundle and extracts `FlightsFrontendService/<method>` references. The output includes source URLs and fetch time. This is an inventory of methods advertised by that bundle, not proof of every request schema, every lazily loaded module or every backend endpoint.

| Method                             | Access                                           |
| ---------------------------------- | ------------------------------------------------ |
| GetShoppingResults                 | `search`                                         |
| GetBookingResults                  | `booking`; selection tokens come from a search   |
| GetCalendarGrid                    | `grid` / `dates`                                 |
| GetCalendarGraph                   | `rpc`; accepts the calendar payload above        |
| GetCalendarPicker                  | `rpc`; accepts the calendar payload above        |
| GetExploreDestinations             | `rpc`; request layout below                      |
| GetExploreDestinationFlightDetails | `rpc`; request schema unmapped                   |
| GetFlightDealsStreaming            | `rpc`; deal-result request schema unmapped       |
| GetDealDestinationDetails          | `rpc`; request schema unmapped                   |
| GetSolutionPrices                  | `rpc`; token-bound price-refresh schema unmapped |
| GetPartnerLinkPrices               | `rpc`; partner/token request schema unmapped     |
| GetDebugStream                     | `rpc`; diagnostic request schema unmapped        |

`endpoints` without `--discover` also returns the dependency's broader flight endpoint catalog, including batchexecute autocomplete IDs and frontend support resources. Inventory is not a claim that telemetry, debug or undocumented methods are implemented as typed operations.

### Raw requests

```sh
bun run flights rpc --method GetCalendarGraph --payload request.json --currency AUD
```

`request.json` contains the inner array shown above, without form encoding or the outer `[null,"…"]` wrapper. Raw access accepts any alphanumeric method under FlightsFrontendService, including newly discovered methods. It returns the unmodified payloads and response text. Supplying a method name alone is not enough; requests requiring selection/booking tokens need values from the same search session.

For an unmapped method, exercise its corresponding Google Flights feature in the collaborative browser and capture the page's network request. Decode `f.req` twice to obtain the inner array. Keep filter inputs and the original response with that request. Session proofs/headers are ephemeral; do not commit them. `rpc` deliberately does not invent payloads for unmapped schemas.

An Explore request uses `[[],null,null,settings,null,1,null,0,null,1,[1004,833],2]`: settings have trip type/cabin/passengers as above, `[17]=0`, and segments `[[originSet,[],null,stops],[[],originSet,null,stops]]`. The date range is Google's suggested Explore window, not the date-grid range. Do not infer that every shopping filter has identical Explore semantics.

## Sources

- Live Google Flights document and linked `www.gstatic.com/_/mss/boq-travel/` frontend bundle.
- [google-travel-website-api](https://www.npmjs.com/package/google-travel-website-api), pinned to 0.5.2: shared request builders, parsers and operations.
- [Swoop protocol source](https://github.com/saraswatayu/swoop): Explore and deals request layouts.
- [Calendar client reference](https://github.com/licheng5625/google-flights/blob/main/fast_flights/calendar.py): calendar endpoint and positional payload comparison.
