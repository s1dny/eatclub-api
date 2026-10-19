#!/usr/bin/env bun
/**
 * Rebuilds the EatClub database for the configured states (default NSW) from the website and the
 * app API, then runs the live-deal refresh. Builds into a temp file and swaps it in when done.
 */
import { rename, rm } from "node:fs/promises";
import type { InStatement } from "@libsql/client";
import { type AppRestaurant, appRestaurants } from "./app.ts";
import { DB_PATH, open, SCHEMA } from "./db.ts";
import { fetchAllVenues, fetchRegions, fetchVenueDetail, type VenueDetail, type VenueSummary } from "./eatclub.ts";
import { refreshLive } from "./live.ts";
import { DAYS, localDate, log, mapLimit, TZ_BY_STATE } from "./util.ts";

const STATES = (process.env.EATCLUB_STATES ?? "NSW").split(",").map((s) => s.trim().toUpperCase());

type Shift = { open: number; close: number };
type Hours = Record<string, number>;

const parseJson = <T>(s: unknown, fallback: T): T => {
  if (typeof s !== "string") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

function shiftsByDay(h: Hours): Shift[][] {
  return DAYS.map((d) =>
    ["", "Ex"]
      .map((sfx) => ({ open: h[`${d}Open${sfx}`] ?? -1, close: h[`${d}Close${sfx}`] ?? -1 }))
      .filter((s) => s.open >= 0 && s.close >= 0)
      .sort((a, b) => a.open - b.open),
  );
}

const pct = (s: string | null | undefined) => {
  const m = s ? /(\d+)\s*%/.exec(s) : null;
  return m?.[1] ? Number(m[1]) : null;
};
const bool = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : null);
const json = (v: unknown) => (v == null || (Array.isArray(v) && !v.length) ? null : JSON.stringify(v));

type Row = {
  region: string;
  v: VenueSummary;
  detail: VenueDetail | null;
  web: unknown;
  app?: AppRestaurant;
  bio: string | null;
};

function venueStatements({ region, v, detail, web, app, bio }: Row): InStatement[] {
  const tz = TZ_BY_STATE[v.state ?? ""] ?? "Australia/Sydney";
  const hours = parseJson<Hours>(v.hours, {});
  const appHours = parseJson<Hours>(app?.hours, {});
  const shifts = shiftsByDay(hours);
  const r = detail?.ratings;
  const a = (k: string) => app?.[k];
  const out: InStatement[] = [
    {
      sql: `INSERT INTO venues (slug, id, name, region, description, bio, address, suburb, state, postcode, latitude, longitude,
              timezone, phone, website, rating, food_rating, atmosphere_rating, num_ratings, max_discount_pct,
              dining_type, cost, venue_types, occasions, food_labels, tags,
              offers_dine_in, offers_takeaway, offers_delivery, sells_out_early, cover_charge, is_new, excluded_item_count,
              image, other_images, url, app_link, pdf_menu, has_detail, web_json, app_json)
            VALUES (${Array(41).fill("?").join(",")})`,
      args: [
        v.slug,
        v.objectId,
        v.name,
        region,
        v.description?.trim() || null,
        bio,
        [v.address1, v.address2].filter(Boolean).join(", ") || null,
        v.city ?? null,
        v.state ?? null,
        v.postcode ?? null,
        v.latitude,
        v.longitude,
        tz,
        v.phone ?? null,
        v.website ?? null,
        r?.aveRating || null,
        r?.aveFoodRating || null,
        r?.aveAtmosphereRating || null,
        r?.numRatings ?? null,
        pct(v.maxDiscount) ?? (Number(v.maxDiscount) || null),
        (a("diningType") as string) ?? null,
        (a("cost") as string) ?? null,
        json(v.venueTypes ?? a("venueTypes")),
        json(v.occasions),
        json(a("foodLabels")),
        json(a("tags")),
        bool(a("offersDineIn")),
        bool(a("offersTakeaway")),
        bool(a("offersDelivery")),
        bool(a("sellsOutEarly")),
        bool(a("coverCharge")),
        bool(a("isNew")),
        (a("excludedItemCount") as number) ?? null,
        v.imageLink ?? null,
        json(v.otherImages),
        `https://eatclub.com.au/venue/${v.slug}`,
        v.deepLink ?? null,
        v.pdfMenu ?? null,
        detail ? 1 : 0,
        json(web),
        json(app),
      ],
    },
  ];
  for (const c of new Set(v.cuisines ?? [])) {
    out.push({ sql: "INSERT INTO venue_cuisines VALUES (?,?)", args: [v.slug, c] });
  }
  shifts.forEach((day, i) => {
    const kitchen = appHours[`${DAYS[i]}KitchenClose`];
    for (const s of day) {
      out.push({
        sql: "INSERT INTO hours VALUES (?,?,?,?,?)",
        args: [v.slug, i + 1, s.open, s.close, kitchen != null && kitchen >= 0 ? kitchen : null],
      });
    }
  });
  if (!detail) return out;

  for (const d of detail.deals ?? []) {
    // All-day deals run during opening hours; expand them into one row per shift.
    const day = shifts[d.dayOfWeek - 1] ?? [];
    const windows = d.timeLimited
      ? [{ open: d.startTime, close: d.endTime }]
      : day.length
        ? day
        : [{ open: 0, close: 1440 }];
    for (const w of windows) {
      out.push({
        sql: "INSERT INTO deals VALUES (?,?,?,?,?,?,?,?,?,?)",
        args: [
          d.objectId,
          v.slug,
          d.dayOfWeek,
          w.open,
          w.close,
          d.timeLimited ? 0 : 1,
          d.discount,
          pct(d.discount),
          d.type,
          d.isStunt ? 1 : 0,
        ],
      });
    }
  }
  for (const menu of detail.menuData ?? []) {
    const window = (m: number | null | undefined) => (m != null && m >= 0 ? m : null);
    for (const cat of menu.categories ?? []) {
      for (const p of cat.products ?? []) {
        const options = (p.options ?? []).map((o) => ({
          option: o.optionTitle,
          required: o.mandatory ?? false,
          max: o.maxSelections,
          choices: (o.choices ?? []).map((c) => ({ choice: c.choiceTitle, price: c.price })),
        }));
        out.push({
          sql: `INSERT INTO menu_items (slug, menu_type, menu_title, menu_start_min, menu_end_min, category, title,
                  description, price, no_discount, popularity, image, options) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            v.slug,
            menu.type,
            menu.menuTitle?.trim() || null,
            window(menu.startTime),
            window(menu.endTime),
            cat.categoryTitle.trim(),
            p.productTitle.trim(),
            p.productDescription?.trim().replace(/\s+/g, " ") || null,
            p.price ?? null,
            p.noDiscount ? 1 : 0,
            p.popularity || null,
            p.imageLink ?? null,
            json(options),
          ],
        });
      }
    }
  }
  for (const s of r?.ratings ?? []) {
    const rev = parseJson<Record<string, unknown>>(s, {});
    out.push({
      sql: "INSERT INTO reviews VALUES (?,?,?,?,?,?)",
      args: [
        v.slug,
        (rev.createdDate as string) ?? null,
        (rev.numStars as number) ?? null,
        (rev.message as string)?.trim() || null,
        (rev.name as string) ?? null,
        (rev.discount as string) ?? null,
      ],
    });
  }
  return out;
}

const tmp = `${DB_PATH}.tmp`;
await rm(tmp, { force: true });
const db = open(tmp);
await db.executeMultiple(SCHEMA);

const regions = (await fetchRegions()).filter((r) => STATES.includes(r.state));
await db.batch(
  regions.map((r) => ({
    sql: "INSERT INTO regions VALUES (?,?,?,?,?)",
    args: [r.slug, r.region, r.state, TZ_BY_STATE[r.state] ?? "Australia/Sydney", r.venueCount],
  })),
  "write",
);
log(`regions: ${regions.map((r) => r.slug).join(", ")}`);

// The app only serves some regions (e.g. sydney, not newcastle); missing ones just lack app fields.
const appById = new Map<string, AppRestaurant>();
const listed: { region: string; v: VenueSummary }[] = [];
const seen = new Set<string>();
await Promise.all([
  mapLimit(regions, 3, async (r) => {
    const today = localDate(TZ_BY_STATE[r.state] ?? "Australia/Sydney");
    const app = await appRestaurants(r.slug, today).catch((e) => {
      log(`app ${r.slug}: ${e}`);
      return [];
    });
    for (const a of app) appById.set(a.objectId, a);
    log(`app ${r.slug}: ${app.length} venues`);
  }),
  mapLimit(regions, 3, async (r) => {
    // The website filter takes the display name; hyphenated slugs 500.
    const venues = await fetchAllVenues(r.region);
    for (const v of venues) {
      if (seen.has(v.slug)) continue;
      seen.add(v.slug);
      listed.push({ region: r.slug, v });
    }
    log(`web ${r.slug}: ${venues.length} venues`);
  }),
]);

let done = 0;
let failed = 0;
let pending: InStatement[] = [];
// Writes are serialised through one promise chain; fetches stay parallel.
let writes = Promise.resolve();
const flush = () => {
  const batch = pending;
  pending = [];
  if (batch.length) writes = writes.then(() => db.batch(batch, "write").then(() => {}));
  return writes;
};
await mapLimit(listed, 12, async ({ region, v }) => {
  const [page, bio] = await Promise.all([
    fetchVenueDetail(v.slug).catch(() => null),
    v.bioLink
      ? fetch(v.bioLink, { signal: AbortSignal.timeout(20_000) })
          .then((r) => (r.ok ? r.text() : null))
          .then((t) => t?.trim() || null)
          .catch(() => null)
      : null,
  ]);
  if (!page) failed++;
  pending.push(
    ...venueStatements({
      region,
      v: page?.detail.venue ?? v,
      detail: page?.detail ?? null,
      web: page?.raw ?? v,
      app: appById.get(v.objectId),
      bio,
    }),
  );
  if (pending.length > 5000) flush();
  if (++done % 500 === 0) log(`details ${done}/${listed.length} (${failed} without detail)`);
});
await flush();

await db.batch(
  [
    "INSERT INTO menu_fts(menu_fts) VALUES ('rebuild')",
    {
      sql: "INSERT INTO meta VALUES ('synced_at', ?), ('states', ?), ('venues', ?), ('venues_without_detail', ?), ('venues_with_app_data', ?)",
      args: [
        new Date().toISOString(),
        STATES.join(","),
        String(listed.length),
        String(failed),
        String(listed.filter(({ v }) => appById.has(v.objectId)).length),
      ],
    },
  ],
  "write",
);
log(`static: ${listed.length} venues (${failed} without deals/menus)`);
await refreshLive(db);
db.close();
await rename(tmp, DB_PATH);
log(`done → ${DB_PATH}`);
