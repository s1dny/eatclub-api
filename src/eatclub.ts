import { z } from "zod";

/** Thin client for the public JSON + RSC endpoints behind eatclub.com.au/venues. */

const BASE = process.env.EATCLUB_BASE_URL ?? "https://eatclub.com.au";
const UA = "eatclub-api/0.1 (+https://github.com/s1dny/eatclub-api)";

const Envelope = z.object({ status: z.string(), error: z.string().nullable(), data: z.unknown() });

export const Region = z.object({
  region: z.string(),
  slug: z.string(),
  state: z.string(),
  venueCount: z.number(),
});
export type Region = z.infer<typeof Region>;

export const VenueSummary = z.object({
  objectId: z.string(),
  slug: z.string(),
  name: z.string(),
  region: z.string(),
  description: z.string().nullish(),
  address1: z.string().nullish(),
  address2: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  postcode: z.string().nullish(),
  phone: z.string().nullish(),
  cuisines: z.array(z.string()).nullish(),
  latitude: z.number(),
  longitude: z.number(),
  maxDiscount: z.string().nullish(),
  hours: z.string().nullish(),
  deepLink: z.string().nullish(),
  pdfMenu: z.string().nullish(),
  website: z.string().nullish(),
});
export type VenueSummary = z.infer<typeof VenueSummary>;

const VenuePage = z.object({
  results: z.array(VenueSummary),
  pageSize: z.number(),
  offset: z.number(),
  totalResults: z.number(),
});

export const Deal = z.object({
  objectId: z.string(),
  discount: z.string(),
  isStunt: z.boolean().nullish(),
  /** ISO weekday: 1 = Monday … 7 = Sunday, in the venue's local time. */
  dayOfWeek: z.number(),
  timeLimited: z.boolean(),
  /** Minutes after local midnight, as strings. */
  startTime: z.coerce.number(),
  endTime: z.coerce.number(),
  type: z
    .string()
    .nullish()
    .transform((t) => t ?? "any"),
});
export type Deal = z.infer<typeof Deal>;

const Choice = z.object({ choiceTitle: z.string(), price: z.number().nullish() });
const Option = z.object({
  optionTitle: z.string(),
  mandatory: z.boolean().nullish(),
  choices: z.array(Choice).nullish(),
});
const Product = z.object({
  productTitle: z.string(),
  productDescription: z.string().nullish(),
  price: z.number().nullish(),
  noDiscount: z.boolean().nullish(),
  disableDate: z.unknown().nullish(),
  disableUntilDate: z.unknown().nullish(),
  options: z.array(Option).nullish(),
});
const Category = z.object({
  categoryTitle: z
    .string()
    .nullish()
    .transform((t) => t ?? "Menu"),
  products: z.array(Product).nullish(),
});
export const Menu = z.object({
  type: z
    .string()
    .nullish()
    .transform((t) => t ?? "all"),
  menuTitle: z.string().nullish(),
  menuDescription: z.string().nullish(),
  categories: z.array(Category).nullish(),
});
export type Menu = z.infer<typeof Menu>;

export const VenueDetail = z.object({
  venue: VenueSummary,
  deals: z.array(Deal).nullish(),
  menuData: z.array(Menu).nullish(),
  ratings: z.object({ numRatings: z.number().nullish(), aveRating: z.number().nullish() }).nullish(),
});
export type VenueDetail = z.infer<typeof VenueDetail>;

async function request(path: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "user-agent": UA, ...init?.headers },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) return res;
    if (attempt >= 2 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`EatClub ${init?.method ?? "GET"} ${path} → ${res.status}`);
    }
    await Bun.sleep(1000 * 2 ** attempt);
  }
}

async function api<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
  const body = Envelope.parse(await (await request(path, init)).json());
  if (body.status !== "success" || body.data == null) {
    throw new Error(`EatClub ${path}: ${body.error ?? body.status}`);
  }
  return schema.parse(body.data);
}

export const fetchRegions = () => api(z.array(Region), "/api/restaurant-regions");

/** Resolves coordinates to EatClub's region slug, e.g. "sydney". */
export const fetchRegionFor = (latitude: number, longitude: number) =>
  api(z.object({ region: z.string().nullish(), state: z.string().nullish() }), "/api/user/location", {
    method: "POST",
    body: JSON.stringify({ latitude, longitude }),
  });

export const fetchVenuePage = (region: string, page: number) =>
  api(VenuePage, `/api/restaurants?page=${page}`, {
    method: "POST",
    body: JSON.stringify({ region }),
  });

/** Every venue in a region. The endpoint is slow (~3s/page), so pages are fetched in parallel. */
export async function fetchAllVenues(region: string, concurrency = 8): Promise<VenueSummary[]> {
  const first = await fetchVenuePage(region, 1);
  const pages = Math.ceil(first.totalResults / first.pageSize);
  const results: VenueSummary[][] = [first.results];
  let next = 2;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next <= pages) {
        const page = next++;
        results[page - 1] = (await fetchVenuePage(region, page)).results;
      }
    }),
  );
  const bySlug = new Map(results.flat().map((v) => [v.slug, v]));
  return [...bySlug.values()];
}

/**
 * Deals and menus only exist in the venue page's React Server Components payload.
 * Each RSC line is `<id>:<json>`; we look for the props object carrying `menuData`.
 */
export async function fetchVenueDetail(slug: string): Promise<VenueDetail> {
  const res = await request(`/venue/${encodeURIComponent(slug)}`, { headers: { rsc: "1" } });
  const rows = new Map<string, unknown>();
  for (const line of (await res.text()).split("\n")) {
    const colon = line.indexOf(":");
    const json = line.slice(colon + 1);
    if (colon > 0 && (json.startsWith("[") || json.startsWith("{"))) {
      try {
        rows.set(line.slice(0, colon), JSON.parse(json));
      } catch {}
    }
  }
  for (const row of rows.values()) {
    const found = findProps(row);
    if (found) return VenueDetail.parse(resolveRefs(found, rows));
  }
  throw new Error(`No venue data on /venue/${slug}`);
}

function findProps(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findProps(child);
      if (hit) return hit;
    }
  } else if (node && typeof node === "object") {
    if ("venue" in node && "menuData" in node) return node;
    for (const child of Object.values(node)) {
      const hit = findProps(child);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * RSC dedupes repeated objects into `"$<row>:<path>"` strings; inline them.
 * A path walks from the row's root, where `props` on a `["$", type, key, props]` element is index 3.
 */
function resolveRefs(node: unknown, rows: Map<string, unknown>, depth = 0): unknown {
  if (depth > 50) return node;
  if (typeof node === "string") {
    const ref = /^\$([0-9a-f]+):(.+)$/.exec(node);
    if (!ref?.[1] || !ref[2] || !rows.has(ref[1])) return node;
    let target: unknown = rows.get(ref[1]);
    for (const seg of ref[2].split(":")) {
      if (Array.isArray(target) && target[0] === "$" && seg === "props") target = target[3];
      else target = (target as Record<string, unknown> | undefined)?.[seg];
    }
    return target === undefined ? node : resolveRefs(target, rows, depth + 1);
  }
  if (Array.isArray(node)) return node.map((n) => resolveRefs(n, rows, depth + 1));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveRefs(v, rows, depth + 1)]));
  }
  return node;
}
