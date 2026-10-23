# Flights

Google Flights through its unofficial website protocol (no key). Implementation: `src/travel/flights/`.

## grid

One request per 30-day departure chunk returns every departure/return pair with a stay of `--min-days`–`--max-days` calendar days. A comma-separated `--destination` runs each grid in turn and prints `{grids: [...]}`.

- `--return-by` drops pairs that return after that date and defaults `--end` (last departure) to `return-by − min-days`. Without it, `--end` is the last departure date and returns can fall after it.
- Cells: `{departure, returnDate, days, price, currency}`. `price` is the total for all `--adults`, with the requested filters (stops, bags); not per person.
- `grid.json` and raw responses are saved under `--out` (default `data/flights/<hash>`); an existing output needs `--resume` or a new `--out`. `complete: false` plus `error` means a chunk failed.
- Common filters: `--adults 2 --max-stops one-or-fewer-stops --checked-bags 1 --airlines QF,JQ --cabin-class economy`. `flights filters` lists every accepted value.

## search

Itineraries for one departure/return pair; `--destination` accepts a comma list, run sequentially (parallel calls came back empty or short).

- Results are outbound legs with `price` (round-trip total for all passengers), `legs`, `layovers` and `select`.
- `--select N` uses a result's `select` value (1-based, Google's order, not price order) and returns that outbound's return flights; `--select cheapest` picks the cheapest priced outbound. `selectedOutbound` echoes the choice.
- Check `inputs.tripType` is `round-trip`.
- Some results have `price: null` (no fare in that response). The grid's cheapest fare can be missing from a search; if so, search again, or search the neighbouring dates.
- Low-cost fares (Scoot, AirAsia, Jetstar) include carry-on only unless `--checked-bags` is set.

`booking --select N --select-return M` returns provider prices for a chosen pair; nothing is booked.
