import { parseArgs } from "node:util";
import { executeOperation } from "google-travel-website-api";

export const help = `  bun run travel hotels google --query "Kata Beach Phuket resorts with pool" --check-in 2026-12-01 --check-out 2026-12-07 [--adults 2] [--min-stars 4] [--min-rating 4.3] [--sort lowest-price|highest-rating|most-reviewed] [--limit 20]
  bun run travel hotels hotelist --city Phuket [--amenities pool,beach_view] [--max-price-usd 150] [--min-rating 7.5] [--sort best|cheapest|priciest|newest]
  bun run travel hotels hotelist-hotel --hotel "<name, slug or hotelist URL>" [--city Phuket]`;

/** Google Hotels (metasearch across Booking, Agoda, Trip.com, …): nightly price for the dates, rating, photos, place ids. */
async function google(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      query: { type: "string" },
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
  if (!v.query) throw new Error(help);
  const r: any = await executeOperation({
    operation: "hotel-filters",
    query: v.query,
    checkIn: v["check-in"],
    checkOut: v["check-out"],
    adults: Number(v.adults ?? 2),
    currency: v.currency ?? "AUD",
    sort: v.sort ?? "lowest-price",
    limit: 40,
    timeout: 90,
  } as any);
  const minStars = Number(v["min-stars"] ?? 0),
    minRating = Number(v["min-rating"] ?? 0);
  // Google echoes some filters without enforcing them, so stars and rating are filtered here.
  const hotels = (r.entities ?? [])
    .map((e: any) => ({
      name: e.name,
      pricePerNight: e.price?.amount ? Math.round(e.price.amount) : null,
      currency: e.price?.currency,
      stars: e.hotelClass?.stars ?? null,
      rating: e.reviews?.rating ?? null,
      reviews: e.reviews?.count ?? null,
      amenities: e.amenities,
      lat: e.location?.latitude,
      lng: e.location?.longitude,
      address: e.location?.address,
      placeId: e.placeId,
      fid: e.knowledgeGraphId,
      website: e.location?.officialSiteUrl,
      mapsUrl: e.location?.mapsUrl,
      photos: (e.photos ?? []).slice(0, 5).map((p: any) => String(p.url).split("=")[0] + "=w800-h533-k-no"),
    }))
    .filter((h: any) => (h.stars ?? 0) >= minStars && (h.rating ?? 0) >= minRating)
    .sort((a: any, b: any) =>
      (v.sort ?? "lowest-price") === "lowest-price"
        ? (a.pricePerNight ?? 1e9) - (b.pricePerNight ?? 1e9)
        : (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0),
    );
  return { stay: r.stay, count: hotels.length, hotels: hotels.slice(0, Number(v.limit ?? 20)), warnings: r.warnings };
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
