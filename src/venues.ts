import { cached } from "./cache.ts";
import {
  type Deal,
  fetchAllVenues,
  fetchRegionFor,
  fetchRegions,
  fetchVenueDetail,
  type Menu,
  type VenueDetail,
  type VenueSummary,
} from "./eatclub.ts";
import { type Walk, walkingTimes } from "./osm.ts";

const HOUR = 3_600_000;
/** OSRM's foot profile walks ~4.5 km/h; the fallback estimate matches it. */
const WALK_METERS_PER_SEC = 4500 / 3600;
/** Generous straight-line bound (6 km/h) used only to shortlist venues before routing. */
const PREFILTER_METERS_PER_MIN = 6000 / 60;
/** Fallback route/straight-line ratio when routing is unavailable. */
const DETOUR = 1.3;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const TZ_BY_STATE: Record<string, string> = {
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  TAS: "Australia/Hobart",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  NT: "Australia/Darwin",
  WA: "Australia/Perth",
};

export type DealType = "dinein" | "takeaway" | "any";

export const regions = () => cached("regions", 24 * HOUR, fetchRegions);

export const regionVenues = (region: string) => cached(`venues:${region}`, 24 * HOUR, () => fetchAllVenues(region));

export const venueDetail = (slug: string) => cached(`venue:${slug}`, 6 * HOUR, () => fetchVenueDetail(slug));

export async function regionFor(latitude: number, longitude: number): Promise<string> {
  const key = `region-for:${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const { region } = await cached(key, 30 * 24 * HOUR, () => fetchRegionFor(latitude, longitude));
  if (!region) throw new Error(`EatClub doesn't cover ${latitude},${longitude}`);
  return region;
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Weekday (1 = Mon) and minutes past midnight at `when` in the venue's time zone. */
function localClock(when: Date, state: string | null | undefined) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ_BY_STATE[state ?? ""] ?? "Australia/Sydney",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(when);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = DAYS.indexOf(part("weekday").toLowerCase().slice(0, 3) as (typeof DAYS)[number]) + 1;
  return { day, minute: Number(part("hour")) * 60 + Number(part("minute")) };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

type Shift = { open: number; close: number };

function shiftsOn(hoursJson: string | null | undefined, day: number): Shift[] {
  if (!hoursJson) return [];
  let hours: Record<string, number>;
  try {
    hours = JSON.parse(hoursJson);
  } catch {
    return [];
  }
  const d = DAYS[day - 1];
  const shifts: Shift[] = [];
  for (const suffix of ["", "Ex"]) {
    const open = hours[`${d}Open${suffix}`];
    const close = hours[`${d}Close${suffix}`];
    if (open != null && close != null && open >= 0 && close >= 0) shifts.push({ open, close });
  }
  return shifts.sort((a, b) => a.open - b.open);
}

/** A deal's window on its day: explicit for time-limited deals, otherwise opening hours. */
function dealWindows(deal: Deal, hoursJson: string | null | undefined): Shift[] {
  if (deal.timeLimited) return [{ open: deal.startTime, close: deal.endTime }];
  const shifts = shiftsOn(hoursJson, deal.dayOfWeek);
  return shifts.length ? shifts : [{ open: 0, close: 24 * 60 }];
}

const typeLabel = (t: string) => (t === "dinein" ? "dine-in" : t);

function describeDeal(deal: Deal, hoursJson: string | null | undefined): string {
  const windows = dealWindows(deal, hoursJson)
    .map((w) => `${hhmm(w.open)}–${hhmm(w.close)}`)
    .join(", ");
  return `${deal.discount} ${typeLabel(deal.type)} ${windows}${deal.timeLimited ? "" : " (all day)"}`;
}

const matchesType = (deal: Deal, type: DealType) => type === "any" || deal.type === type;

/** Renders menus as compact text; identical dine-in/takeaway menus are collapsed. */
function renderMenus(menus: Menu[], keywords: string[]): { text: string; matches: number } {
  const needles = keywords.map((k) => k.toLowerCase());
  const seen = new Map<string, string[]>();
  let matches = 0;
  for (const menu of menus) {
    const lines: string[] = [];
    for (const cat of menu.categories ?? []) {
      const items = (cat.products ?? []).filter((p) => {
        if (!needles.length) return true;
        const hay = `${cat.categoryTitle} ${p.productTitle} ${p.productDescription ?? ""}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      });
      if (!items.length) continue;
      matches += items.length;
      lines.push(`## ${cat.categoryTitle}`);
      for (const p of items) {
        const price = p.price != null ? ` $${p.price.toFixed(2)}` : "";
        const desc = p.productDescription?.trim() ? ` — ${p.productDescription.trim().replace(/\s+/g, " ")}` : "";
        lines.push(`- ${p.productTitle.trim()}${price}${desc}${p.noDiscount ? " [no discount]" : ""}`);
      }
    }
    if (!lines.length) continue;
    const body = lines.join("\n");
    seen.set(body, [...(seen.get(body) ?? []), typeLabel(menu.type)]);
  }
  const text = [...seen].map(([body, types]) => `# ${types.join(" + ")} menu\n${body}`).join("\n\n");
  return { text, matches };
}

const address = (v: VenueSummary) => [v.address1, v.address2, v.city, v.state, v.postcode].filter(Boolean).join(", ");

export type NearbyQuery = {
  latitude: number;
  longitude: number;
  walkMinutes?: number;
  /** When you plan to eat; deals are evaluated at this instant. Defaults to now. */
  at?: Date;
  /** Only venues with a deal live at `at`. */
  onlyActiveDeals?: boolean;
  dealType?: DealType;
  /** Case-insensitive substrings; menus are cut to matching items and venues with none dropped. */
  menuKeywords?: string[];
  cuisines?: string[];
  includeMenus?: boolean;
  limit?: number;
};

export type NearbyVenue = {
  slug: string;
  name: string;
  url: string;
  appLink?: string | null;
  address: string;
  cuisines: string[];
  walkMinutes: number;
  walkMeters: number;
  rating?: number | null;
  numRatings?: number | null;
  openAt: string;
  dealsLive: string[];
  dealsToday: string[];
  menuMatches?: number;
  menu?: string;
};

export async function findNearby(q: NearbyQuery): Promise<{
  region: string;
  maxWalkMinutes: number;
  /** "osm" = OpenStreetMap foot routing; "estimate" = straight line × detour (routing unavailable). */
  walkSource: "osm" | "estimate";
  at: string;
  scanned: number;
  venues: NearbyVenue[];
}> {
  const at = q.at ?? new Date();
  const dealType = q.dealType ?? "any";
  const maxWalk = q.walkMinutes ?? 10;
  const region = await regionFor(q.latitude, q.longitude);
  const cuisines = q.cuisines?.map((c) => c.toLowerCase());

  // A route is never shorter than the straight line, so this prefilter can't drop a reachable venue.
  const crowLimit = maxWalk * PREFILTER_METERS_PER_MIN;
  const nearby = (await regionVenues(region))
    .map((v) => ({ v, crow: distanceMeters(q.latitude, q.longitude, v.latitude, v.longitude) }))
    .filter(({ crow }) => crow <= crowLimit)
    .filter(({ v }) => !cuisines?.length || v.cuisines?.some((c) => cuisines.includes(c.toLowerCase())));

  let walkSource: "osm" | "estimate" = "osm";
  const walks = await walkingTimes(
    q,
    nearby.map(({ v }) => v),
  ).catch(() => {
    walkSource = "estimate";
    return nearby.map(({ crow }) => ({ meters: crow * DETOUR, seconds: (crow * DETOUR) / WALK_METERS_PER_SEC }));
  });

  const candidates = nearby
    .map((c, i) => ({ ...c, walk: walks[i] }))
    .filter((c): c is typeof c & { walk: NonNullable<Walk> } => c.walk != null && c.walk.seconds <= maxWalk * 60)
    .sort((a, b) => a.walk.seconds - b.walk.seconds)
    .slice(0, 200);

  const details = await mapLimit(candidates, 12, async (c) => ({
    ...c,
    detail: await venueDetail(c.v.slug).catch(() => null),
  }));

  const venues: NearbyVenue[] = [];
  for (const { v, walk, detail } of details) {
    if (!detail) continue;
    const out = summarise(v, detail, at, dealType, q.menuKeywords ?? [], q.includeMenus ?? true);
    if (q.onlyActiveDeals && !out.dealsLive.length) continue;
    if (q.menuKeywords?.length && !out.menuMatches) continue;
    venues.push({ ...out, walkMinutes: Math.round(walk.seconds / 60), walkMeters: Math.round(walk.meters) });
    if (venues.length >= (q.limit ?? 25)) break;
  }
  return { region, maxWalkMinutes: maxWalk, walkSource, at: at.toISOString(), scanned: candidates.length, venues };
}

function summarise(
  v: VenueSummary,
  detail: VenueDetail,
  at: Date,
  dealType: DealType,
  keywords: string[],
  includeMenu: boolean,
): Omit<NearbyVenue, "walkMinutes" | "walkMeters"> {
  const { day, minute } = localClock(at, v.state);
  const deals = (detail.deals ?? []).filter((d) => matchesType(d, dealType));
  const today = deals.filter((d) => d.dayOfWeek === day);
  const live = today.filter((d) => dealWindows(d, v.hours).some((w) => minute >= w.open && minute < w.close));
  const shifts = shiftsOn(v.hours, day);
  const menu = renderMenus(detail.menuData ?? [], keywords);
  return {
    slug: v.slug,
    name: v.name,
    url: `https://eatclub.com.au/venue/${v.slug}`,
    appLink: v.deepLink,
    address: address(v),
    cuisines: v.cuisines ?? [],
    rating: detail.ratings?.aveRating ? Math.round(detail.ratings.aveRating * 10) / 10 : null,
    numRatings: detail.ratings?.numRatings,
    openAt: shifts.length
      ? `${shifts.some((s) => minute >= s.open && minute < s.close) ? "open" : "closed"} (today ${shifts.map((s) => `${hhmm(s.open)}–${hhmm(s.close)}`).join(", ")})`
      : "hours unknown",
    dealsLive: live.map((d) => describeDeal(d, v.hours)),
    dealsToday: today.map((d) => describeDeal(d, v.hours)),
    ...(keywords.length ? { menuMatches: menu.matches } : {}),
    ...(includeMenu ? { menu: menu.text || (v.pdfMenu ? `PDF menu: ${v.pdfMenu}` : "no menu listed") } : {}),
  };
}

/** Full venue record: weekly deal schedule, hours and every menu. */
export async function getVenue(slug: string) {
  const detail = await venueDetail(slug);
  const v = detail.venue;
  const weekly = DAYS.map((name, i) => {
    const day = i + 1;
    return {
      day: name,
      hours: shiftsOn(v.hours, day).map((s) => `${hhmm(s.open)}–${hhmm(s.close)}`),
      deals: (detail.deals ?? []).filter((d) => d.dayOfWeek === day).map((d) => describeDeal(d, v.hours)),
    };
  });
  return {
    slug: v.slug,
    name: v.name,
    description: v.description,
    url: `https://eatclub.com.au/venue/${v.slug}`,
    appLink: v.deepLink,
    address: address(v),
    phone: v.phone,
    website: v.website,
    latitude: v.latitude,
    longitude: v.longitude,
    cuisines: v.cuisines ?? [],
    rating: detail.ratings?.aveRating,
    numRatings: detail.ratings?.numRatings,
    weekly,
    menu: renderMenus(detail.menuData ?? [], []).text || (v.pdfMenu ? `PDF menu: ${v.pdfMenu}` : "no menu listed"),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}
