# eatclub-api

Every NSW [EatClub](https://eatclub.com.au/venues/) venue, deal, menu item and review in a local libSQL database, for an agent to query with SQL.
Ask Claude Code things like *"healthy beef or lamb within a 10 min walk of -33.8688, 151.2093 with a deal at lunch"*.

There's no MCP server or tool schema to learn. The agent reads this file and writes queries
([why](https://www.anthropic.com/engineering/code-execution-with-mcp)).

```sh
bun install
bun run map                                   # once: build data/walk-graph.bin from an OSM extract (see Sources)
bun run sync                                  # ~90 s: rebuild data/eatclub.db (website + app API + live deals)
bun run walk -33.8688 151.2093 --max 10       # <0.1 s: walking times from a point → walk_times (local, offline)
bun run sql "SELECT count(*) FROM venues"     # read-only SQL; TSV out, --json for JSON, or SQL on stdin
bun run live <slug> [slug…]                   # ~1 s: today's live deal state for just these venues
```

Run commands from the repo root. A question takes three steps:

1. `walk` from the user's location.
2. `sql` to shortlist venues using the weekly `deals` schedule, menus and `walk_times`.
3. `live` on the 3–10 venues you'll recommend, then read their `live_deals` (deals left, terms, exclusions).

Don't run `bun run live` with no arguments; it refreshes every venue in NSW (~45 s).
`meta.synced_at` says when venues, menus and the schedule were last rebuilt. Run `bun run sync` if it's more than a few days old.

## Schema

All times are minutes past local midnight in the venue's time zone (`venues.timezone`, `Australia/Sydney` for NSW).
`day` is the ISO weekday: 1 = Mon … 7 = Sun. Get the current local weekday and time with
`TZ=Australia/Sydney date '+%u %H %M'`, or use the time the user says they'll eat.
Columns ending in `_json`, plus `options`, `tags`, `food_labels`, `venue_types`, `occasions`, `other_images`, `items`,
`important_info` and `raw`, hold JSON. Use `json_extract` / `json_each`.

### venues
One row per venue.

| column | notes |
| --- | --- |
| `slug` (PK), `id` | `id` is EatClub's objectId (used by the app API) |
| `name`, `region`, `description`, `bio` | `bio` is a longer write-up of the venue |
| `address`, `suburb`, `state`, `postcode`, `latitude`, `longitude`, `timezone` | |
| `phone`, `website`, `url`, `app_link` | `app_link` opens the venue in the EatClub app to claim a deal |
| `rating`, `food_rating`, `atmosphere_rating`, `num_ratings` | 0–5, from EatClub diners |
| `max_discount_pct` | best discount the venue offers |
| `dining_type` | e.g. `Casual dining`, `Fine dining`, `Cafe`, `Quick service`, `Pub` *(app data)* |
| `cost`, `food_labels`, `tags`, `venue_types`, `occasions` | extra classifications, often empty |
| `offers_dine_in`, `offers_takeaway`, `offers_delivery`, `sells_out_early`, `cover_charge`, `is_new`, `excluded_item_count` | *(app data)* NULL if unknown |
| `image`, `other_images`, `pdf_menu` | URLs |
| `has_detail` | 0 = EatClub's venue page had no deals/menu data |
| `web_json`, `app_json` | the complete raw records from the website and the app, for anything not broken out above |

*App data* is only present for venues the app lists (Sydney); it's NULL for Newcastle and Wollongong.

### venue_cuisines
`slug`, `cuisine`. EatClub's tags, e.g. `Thai`, `Healthy`, `Salads`, `Vegan`, `Bar`. Run `SELECT DISTINCT cuisine` for the full list.

### hours
`slug`, `day`, `open_min`, `close_min`, `kitchen_close_min`. One row per shift; venues can have two shifts a day.
`close_min` can exceed 1440 when a venue is open past midnight. `kitchen_close_min` is app data.

### deals: the weekly schedule
`deal_id`, `slug`, `day`, `start_min`, `end_min`, `all_day`, `discount` (e.g. `25% Off`), `discount_pct`,
`type` (`dinein` / `takeaway`), `is_stunt` (limited promo).
`all_day = 1` deals are valid all opening hours and expanded into one row per shift, so a `deal_id` can repeat.

### live_deals: today's state from the app
One row per deal available today, fetched by `bun run live <slug…>` (and for every venue by `sync`). It covers the
weekly schedule plus one-off and lightning deals the app lists for today that never appear in `deals`, so once you've
run `live` on your shortlist, **read today's deals for those venues from `live_deals`**. Check `fetched_at`.
Use `deals` for other days. `deal_id` matches `deals.deal_id`. `start_min = 0, end_min = 1440` means all day
during opening hours; check `hours`.

| column | notes |
| --- | --- |
| `qty_left`, `qty_total` | deals left to claim today; 0 = sold out |
| `max_party_size` | |
| `subheading` | what the discount covers, e.g. `The Total Bill Incl. Drinks` |
| `terms`, `drinks_only_terms`, `important_info` | conditions; `important_info` is JSON `[{heading, text}]` (seating limits, best-value policy…) |
| `new_customers_only`, `lightning`, `dine_in_only`, `takeaway_only`, `sells_out_early` | flags |
| `last_booked_at`, `date`, `fetched_at`, `raw` | `raw` = full app record |

### discount_exclusions
What a venue's deal doesn't apply to today (happy hours, set menus, specials): `slug`, `date`, `category`, `description`,
`applicable_days`, `items` (JSON), `raw`.

### menu_items + menu_fts
`menu_items`: `id`, `slug`, `menu_type` (`dinein` / `takeaway` / `all`; the same dish often appears in both, so use `DISTINCT`),
`menu_title`, `menu_start_min`/`menu_end_min` (NULL = all day), `category`, `title`, `description`, `price` (AUD),
`no_discount` (1 = excluded from deals), `popularity`, `image`, `options` (JSON `[{option, required, max, choices:[{choice, price}]}]`
for add-ons, sizes and dietary swaps like gluten free).

`menu_fts` is FTS5 over `title`, `description`, `category` with porter stemming:
`menu_fts MATCH 'beef OR lamb'`, joined with `menu_items.id = menu_fts.rowid`.

### reviews
`slug`, `date`, `stars`, `message`, `reviewer`, `deal_used`. Recent diner reviews (up to ~10 per venue).

### walk_times
`slug`, `minutes`, `meters` along OpenStreetMap streets and footpaths from the last `bun run walk` origin
(`meta.walk_origin`), at 4.8 km/h. Each run replaces the table. Walk time doesn't include waiting at crossings,
so add a minute or two for busy roads. SQLite math functions (`sin`, `cos`, `acos`, `radians`) are available for
straight-line distance, but walking time should come from `walk_times`.

### regions, meta
`regions`: `slug`, `name`, `state`, `timezone`, `venue_count`.
`meta`: `synced_at`, `live_fetched_at`, `states`, `venues`, `venues_without_detail`, `venues_with_app_data`, `walk_origin`.

## Recipes

Shortlist venues within a 10 min walk with a scheduled deal at 12:30 on Tuesday (day 2):

```sh
bun run walk -33.8688 151.2093 --max 10
bun run sql "
SELECT v.slug, v.name, w.minutes AS walk, d.discount, d.type,
       printf('%02d:%02d-%02d:%02d', d.start_min/60, d.start_min%60, d.end_min/60, d.end_min%60) AS deal_window,
       v.rating, v.dining_type
FROM walk_times w JOIN venues v USING (slug) JOIN deals d USING (slug)
WHERE d.day = 2 AND 750 >= d.start_min AND 750 < d.end_min
ORDER BY d.discount_pct DESC, w.minutes"
```

Then confirm today's live state for the ones you'll recommend:

```sh
bun run live restaurant-leo margot-osteria uccello
bun run sql "
SELECT v.name, l.discount, l.qty_left, l.subheading, l.max_party_size, l.terms, v.app_link,
       (SELECT group_concat(category, '; ') FROM discount_exclusions x WHERE x.slug = v.slug) AS excluded
FROM live_deals l JOIN venues v USING (slug)
WHERE l.slug IN ('restaurant-leo','margot-osteria','uccello') AND l.qty_left > 0"
```

Dishes mentioning beef or lamb at those venues:

```sh
bun run sql "
SELECT DISTINCT v.name, w.minutes AS walk, m.category, m.title, m.description, m.price
FROM menu_fts f JOIN menu_items m ON m.id = f.rowid
JOIN walk_times w ON w.slug = m.slug JOIN venues v ON v.slug = m.slug
WHERE menu_fts MATCH 'beef OR lamb OR wagyu' AND m.no_discount = 0 ORDER BY w.minutes"
```

A venue in full:

```sh
bun run sql "SELECT name, bio, dining_type, rating, food_rating FROM venues WHERE slug = 'bar-bruno'"
bun run sql "SELECT day, discount, type, start_min, end_min FROM deals WHERE slug = 'bar-bruno' ORDER BY day, start_min"
bun run sql "SELECT DISTINCT category, title, description, price FROM menu_items WHERE slug = 'bar-bruno'"
bun run sql "SELECT category, description FROM discount_exclusions WHERE slug = 'bar-bruno'"
bun run sql "SELECT date, stars, message FROM reviews WHERE slug = 'bar-bruno' ORDER BY date DESC"
```

Judging "healthy", "high protein" and similar is up to you, the agent. Read titles, descriptions, options and the venue's
cuisines; keyword search only narrows things down.

## Sources

- **Website** (`eatclub.com.au`): `POST /api/restaurants` lists venues per region (~3 s/page, fetched in parallel). Each venue
  page's React Server Components payload holds the weekly deals, menus and reviews. Bios come from `eccdn.com.au/bios`.
- **App API**: the Android app (`dinnerdeal.android.customer`) uses AWS AppSync GraphQL at `consumer-api.eatclub.com.au/graphql`,
  authorised by a public API key bundled in the APK. `src/graphql/*.graphql` are the app's own queries:
  - `restaurants`: venue listing with app fields
  - `deal`: live state per deal; the deal ids are the website's
  - `excluded-items`: per-venue discount exclusions
  
  Set `EATCLUB_APP_API_KEY` in `.env`. To recover it, decompile the APK with jadx and read `res/ju.json` → `AppSync.Default.ApiKey`.
- **Walking**: a local walking network built once by `bun run map` from OpenStreetMap
  (`data/osm/australia-latest.osm.pbf` from https://download.geofabrik.de/australia-oceania.html). It keeps walkable
  streets and paths in the Newcastle–Sydney–Wollongong box (`EATCLUB_MAP_BBOX`) and writes `data/walk-graph.bin`
  (~85 MB, 2.9M nodes; ~25 s to build). `walk` loads it and runs Dijkstra in-process, with no network calls.
  The 1 GB extract can be deleted afterwards. To rebuild with fresh streets:
  `curl -o data/osm/australia-latest.osm.pbf https://download.geofabrik.de/australia-oceania/australia-latest.osm.pbf && bun run map`.

`sync` builds into `data/eatclub.db.tmp` and renames it over the old DB when finished. `EATCLUB_DB` overrides the
path. `EATCLUB_STATES` (default `NSW`, comma-separated) picks the states to sync.
