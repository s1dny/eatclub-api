import { parseArgs } from "node:util";
import { executeOperation } from "google-travel-website-api";
import { places } from "./google.ts";
import { FIELDS, shape } from "./places.ts";

export const help = `  bun run travel hotels google --query "Langkawi villas" [--query "Pantai Cenang villas" …] --check-in 2026-12-02 --check-out 2026-12-09 [--adults 2] [--min-stars 4] [--min-rating 4.3] [--sort lowest-price|highest-rating|most-reviewed] [--limit 20]
  bun run travel hotels hotelist --city Phuket [--amenities pool,beach_view] [--max-price-usd 150] [--min-rating 7.5] [--sort best|cheapest|priciest|newest]
  bun run travel hotels hotelist-hotel --hotel "<name, slug or hotelist URL>" [--city Phuket]`;

type Hotel = {
  name: string;
  pricePerNight: number | null;
  currency?: string;
  stars: number | null;
  rating: number | null;
  reviews: number | null;
  amenities: string[];
  lat: number;
  lng: number;
  address?: string;
  placeId: string | null;
  fid?: string;
  website?: string;
  mapsUrl?: string;
  photos: string[];
  queries: string[];
};

/** Google Hotels (metasearch across Booking, Agoda, Trip.com, …): nightly price for the dates, rating, photos, place ids. */
async function google(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      query: { type: "string", multiple: true },
      "check-in": { type: "string" },
      "check-out": { type: "string" },
      adults: { type: "string" },
      currency: { type: "string" },
      "min-stars": { type: "string" },
      "min-rating": { type: "string" },
      sort: { type: "string" },
      limit: { type: "string" },
    },
    strict: true,
  });
  if (!v.query?.length) throw new Error(help);
  const sort = v.sort ?? "lowest-price";
  if (!["lowest-price", "highest-rating", "most-reviewed"].includes(sort)) throw new Error(help);
  const warnings: unknown[] = [];
  const byKey = new Map<string, Hotel>();
  let stay: unknown;
  // Each query returns at most ~12 entities, and narrow phrasings ("<island> private pool villa") often return none,
  // so several phrasings are searched one after another and merged.
  for (const query of v.query) {
    const r: any = await executeOperation({
      operation: "hotel-filters",
      query,
      checkIn: v["check-in"],
      checkOut: v["check-out"],
      adults: Number(v.adults ?? 2),
      currency: v.currency ?? "AUD",
      sort: "lowest-price",
      limit: 40,
      timeout: 90,
    } as any);
    stay ??= r.stay;
    for (const w of r.warnings ?? []) if (w.code !== "HOTEL_PRICE_SCOPE") warnings.push({ query, ...w });
    if (!r.entities?.length) {
      warnings.push({ query, code: "NO_RESULTS", message: "Google returned no hotels; try a broader phrasing" });
      console.error(`hotels google: no results for "${query}"`);
    }
    for (const e of r.entities ?? []) {
      const h: Hotel = {
        name: e.name,
        pricePerNight: e.price?.amount ? Math.round(e.price.amount) : null,
        currency: e.price?.currency,
        stars: e.hotelClass?.stars ?? null,
        rating: e.reviews?.rating ?? null,
        reviews: e.reviews?.count ?? null,
        amenities: e.amenities ?? [],
        lat: e.location?.latitude,
        lng: e.location?.longitude,
        address: e.location?.address,
        placeId: e.placeId ?? null,
        fid: e.knowledgeGraphId,
        website: e.location?.officialSiteUrl,
        mapsUrl: e.location?.mapsUrl,
        photos: (e.photos ?? []).slice(0, 5).map((p: any) => String(p.url).split("=")[0] + "=w800-h533-k-no"),
        queries: [query],
      };
      merge(byKey, h.name.toLowerCase(), h);
    }
  }
  const minStars = Number(v["min-stars"] ?? 0),
    minRating = Number(v["min-rating"] ?? 0);
  // Google echoes star filters without enforcing them, so they are applied here.
  const candidates = [...byKey.values()].filter((h) => (h.stars ?? 0) >= minStars);
  await enrich(candidates.slice(0, 80));
  // Room types of one listing ("Villa 25", "Villa 25 - Villa with Private Pool") share a Google place.
  const byPlace = new Map<string, Hotel>();
  for (const h of candidates) merge(byPlace, h.placeId ?? h.name.toLowerCase(), h);
  const hotels = [...byPlace.values()]
    .filter((h) => (h.rating ?? 0) >= minRating)
    .sort((a, b) =>
      sort === "lowest-price"
        ? (a.pricePerNight ?? 1e9) - (b.pricePerNight ?? 1e9)
        : sort === "most-reviewed"
          ? (b.reviews ?? 0) - (a.reviews ?? 0)
          : (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0),
    );
  return { stay, count: hotels.length, hotels: hotels.slice(0, Number(v.limit ?? 20)), warnings };
}

function merge(into: Map<string, Hotel>, key: string, h: Hotel) {
  const seen = into.get(key);
  if (!seen) return void into.set(key, h);
  for (const q of h.queries) if (!seen.queries.includes(q)) seen.queries.push(q);
  if (h.pricePerNight && (!seen.pricePerNight || h.pricePerNight < seen.pricePerNight)) {
    seen.pricePerNight = h.pricePerNight;
    seen.name = h.name;
  }
  seen.rating ??= h.rating;
  seen.reviews ??= h.reviews;
}

/** Google Hotels often omits ratings and place ids for villas and rentals; fill them from Google Maps when the match is within 1 km. */
async function enrich(hotels: Hotel[]) {
  const missing = hotels.filter((h) => (!h.placeId || h.rating === null) && Number.isFinite(h.lat));
  for (let i = 0; i < missing.length; i += 10)
    await Promise.all(
      missing.slice(i, i + 10).map(async (h) => {
        const center = { lat: h.lat, lng: h.lng };
        const [p] = await places(
          "searchText",
          {
            // "Villa Sawah, Langkawi with Private pool in secluded area." → "Villa Sawah"
            textQuery: h.name.split(/ [-~|(]|,/)[0]!.trim(),
            pageSize: 1,
            locationBias: { circle: { center: { latitude: h.lat, longitude: h.lng }, radius: 2000 } },
          },
          FIELDS,
        );
        const found = p && shape(p, center);
        if (!found || found.km > 1) return;
        h.placeId ??= found.placeId;
        if (h.rating === null && found.rating) [h.rating, h.reviews] = [found.rating, found.reviews ?? null];
        h.mapsUrl ??= found.mapsUrl;
      }),
    );
}

/** Hotelist MCP (https://hotelist.com/mcp): AI quality ratings from reviews + photos. Free, no key; 400 requests/day, 50 hotel details/day. */
async function hotelist(tool: string, args: Record<string, unknown>) {
  const response = await fetch("https://hotelist.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const text = await response.text();
  const body = JSON.parse(text.slice(text.indexOf("{")));
  if (!response.ok || body.error || body.result?.isError)
    throw new Error(`Hotelist ${response.status}: ${JSON.stringify(body.error ?? body.result?.content)}`);
  const content = body.result.content?.[0]?.text ?? "";
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export async function main([command, ...args]: string[]) {
  if (command === "google") return google(args);
  if (command === "hotelist") {
    const { values: v } = parseArgs({
      args,
      options: {
        city: { type: "string" },
        query: { type: "string" },
        amenities: { type: "string" },
        "max-price-usd": { type: "string" },
        "min-rating": { type: "string" },
        sort: { type: "string" },
      },
      strict: true,
    });
    if (!v.city) throw new Error(help);
    return hotelist("search_hotels", {
      city: v.city,
      ...(v.query ? { query: v.query } : {}),
      ...(v.amenities ? { amenities: v.amenities.split(",") } : {}),
      ...(v["max-price-usd"] ? { max_price_usd: Number(v["max-price-usd"]) } : {}),
      ...(v["min-rating"] ? { min_rating: Number(v["min-rating"]) } : {}),
      ...(v.sort ? { sort: v.sort } : {}),
    });
  }
  if (command === "hotelist-hotel") {
    const { values: v } = parseArgs({
      args,
      options: { hotel: { type: "string" }, city: { type: "string" } },
      strict: true,
    });
    if (!v.hotel) throw new Error(help);
    return hotelist("get_hotel", { hotel: v.hotel, ...(v.city ? { city: v.city } : {}) });
  }
  throw new Error(help);
}
