import { parseArgs } from "node:util";
import * as agoda from "./agoda.ts";
import * as airbnb from "./airbnb.ts";
import * as cozycozy from "./cozycozy.ts";
import * as google from "./google-hotels.ts";

export const help = `  bun run travel hotels search --location "Langkawi, Malaysia" --check-in 2026-12-02 --check-out 2026-12-09 [--adults 2] [--entire] [--pool] [--min-bedrooms 1] [--max-price-per-night 250] [--min-rating 4.5] [--sort lowest-price|highest-rating|most-reviewed] [--sources google,airbnb,agoda,cozycozy] [--query "Pantai Cenang villas" …] [--pages 1] [--limit 40]
  bun run travel hotels details --url <Airbnb or Agoda URL from search> [--check-in 2026-12-02 --check-out 2026-12-09] [--adults 2]`;

const SOURCES = ["google", "airbnb", "agoda", "cozycozy"] as const;
type Source = (typeof SOURCES)[number];

/** One row per listing per site. Prices are for the whole stay and per night; ratings are out of 5. */
type Stay = {
  source: Source;
  /** For cozycozy rows, the booking site with the cheapest offer. */
  site?: string;
  id: string;
  name: string;
  type: string | null;
  totalPrice: number | null;
  pricePerNight: number | null;
  currency: string;
  rating: number | null;
  reviews: number;
  stars: number | null;
  entire: boolean | null;
  pool: boolean | null;
  bedrooms: number | null;
  details: string[];
  lat: number;
  lng: number;
  url: string;
  placeId: string | null;
  photos: string[];
};

async function search(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      location: { type: "string" },
      "check-in": { type: "string" },
      "check-out": { type: "string" },
      adults: { type: "string" },
      currency: { type: "string" },
      entire: { type: "boolean" },
      pool: { type: "boolean" },
      "min-bedrooms": { type: "string" },
      "max-price-per-night": { type: "string" },
      "min-rating": { type: "string" },
      sort: { type: "string" },
      sources: { type: "string" },
      query: { type: "string", multiple: true },
      pages: { type: "string" },
      limit: { type: "string" },
    },
    strict: true,
  });
  const location = v.location,
    checkIn = v["check-in"],
    checkOut = v["check-out"];
  if (!location || !checkIn || !checkOut) throw new Error(help);
  const sort = v.sort ?? "lowest-price";
  if (!["lowest-price", "highest-rating", "most-reviewed"].includes(sort)) throw new Error(help);
  const sources = (v.sources?.split(",") ?? [...SOURCES]) as Source[];
  for (const s of sources) if (!SOURCES.includes(s)) throw new Error(`Unknown source ${s}; use ${SOURCES.join(",")}`);
  const adults = Number(v.adults ?? 2),
    currency = v.currency ?? "AUD",
    pages = Math.min(5, Number(v.pages ?? 1)),
    entire = Boolean(v.entire),
    pool = Boolean(v.pool),
    minBedrooms = v["min-bedrooms"] ? Number(v["min-bedrooms"]) : undefined,
    maxPerNight = v["max-price-per-night"] ? Number(v["max-price-per-night"]) : undefined,
    minRating = Number(v["min-rating"] ?? 0);
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
  if (!(nights > 0)) throw new Error("--check-out must be after --check-in");
  const place = location.split(",")[0]!.trim();

  const run: Record<Source, () => Promise<{ stays: Stay[]; totalAvailable?: number | null; warnings?: string[] }>> = {
    async google() {
      // Google Hotels has no whole-place or bedroom filters; phrasings steer it towards villas and homes.
      const queries = v.query?.length
        ? v.query
        : entire || pool
          ? [`${place} villas`, `${place} hotels with pool`, `${place} resorts`]
          : [`hotels in ${location}`, `${place} villas`, `${place} resorts`];
      const r = await google.search({ queries, checkIn, checkOut, adults, currency });
      const stays = r.hotels.map((h): Stay => ({
        source: "google",
        id: h.fid ?? h.placeId ?? h.name,
        name: h.name,
        type: null,
        totalPrice: h.pricePerNight ? h.pricePerNight * nights : null,
        pricePerNight: h.pricePerNight,
        currency: h.currency ?? currency,
        rating: h.rating,
        reviews: h.reviews ?? 0,
        stars: h.stars,
        entire: null,
        pool: h.amenities.some((a) => /pool/i.test(a)) || /pool/i.test(h.name) || null,
        bedrooms: Number(h.name.match(/(\d+)[- ]?(?:bed(?:room)?|BR)\b/i)?.[1]) || null,
        details: h.amenities,
        lat: h.lat,
        lng: h.lng,
        url: h.website ?? h.mapsUrl ?? "",
        placeId: h.placeId,
        photos: h.photos,
      }));
      return { stays, warnings: r.warnings };
    },
    async airbnb() {
      const r = await airbnb.search({
        location,
        checkIn,
        checkOut,
        adults,
        currency,
        entire,
        pool,
        minBedrooms,
        maxPricePerNight: maxPerNight,
        pages,
      });
      const stays = r.listings.map((l): Stay => ({
        source: "airbnb",
        id: l.id,
        name: l.name,
        type: l.type,
        totalPrice: l.totalPrice,
        pricePerNight: l.pricePerNight,
        currency: l.currency,
        rating: l.rating,
        reviews: l.reviews,
        stars: null,
        entire: entire || null,
        pool: pool || null,
        bedrooms: Number(l.details.join(" ").match(/(\d+) bedrooms?/)?.[1]) || (/studio/i.test(l.name) ? 0 : null),
        details: [...l.details, ...l.badges],
        lat: l.lat,
        lng: l.lng,
        url: l.url,
        placeId: null,
        photos: l.photos,
      }));
      return { stays, totalAvailable: r.totalAvailable };
    },
    async cozycozy() {
      const r = await cozycozy.search({ location, checkIn, checkOut, adults, entire, pool, minBedrooms, pages });
      const stays = r.results.map((c): Stay => ({
        source: "cozycozy",
        site: c.site,
        id: c.id,
        name: c.name,
        type: c.type,
        totalPrice: c.totalPrice,
        pricePerNight: c.totalPrice ? Math.round(c.totalPrice / nights) : null,
        currency: c.currency,
        rating: c.rating,
        reviews: c.reviews,
        stars: null,
        entire: entire || (/entire/i.test(c.offerText ?? "") ? true : null),
        pool: pool || null,
        bedrooms: c.bedrooms,
        details: [
          ...(c.bedrooms !== null ? [`${c.bedrooms} bedrooms`] : []),
          ...(c.beds !== null ? [`${c.beds} beds`] : []),
          ...(c.guests !== null ? [`${c.guests} guests`] : []),
          ...(c.offerText ? [c.offerText] : []),
          `${c.offers} offers compared`,
        ],
        lat: c.lat,
        lng: c.lng,
        url: c.url,
        placeId: null,
        photos: c.photos,
      }));
      return { stays, totalAvailable: r.totalAvailable };
    },
    async agoda() {
      const c = await agoda.city(location);
      const r = await agoda.search({
        cityId: c.id,
        checkIn,
        checkOut,
        adults,
        currency,
        entire,
        pool,
        minBedrooms,
        pages,
      });
      const available = r.properties.filter((p: any) => p.pricing?.isAvailable !== false);
      const stays = available.map((p: any): Stay => {
        const info = p.content.informationSummary;
        const room = p.content.nonHotelAccommodation?.masterRooms?.[0];
        const offer = p.pricing?.offers?.[0]?.roomOffers?.[0]?.room?.pricing?.[0]?.price;
        const total = offer?.perBook?.inclusive?.display ?? null;
        const review = p.content.reviews?.cumulative;
        return {
          source: "agoda",
          id: String(p.propertyId),
          name: info.displayName.trim(),
          type: agoda.TYPES[info.accommodationType] ?? null,
          totalPrice: total ? Math.round(total) : null,
          pricePerNight: total ? Math.round(total / nights) : null,
          currency,
          rating: review?.score ? review.score / 2 : null,
          reviews: review?.reviewCount ?? 0,
          stars: info.rating || null,
          entire: agoda.ENTIRE_TYPES.includes(info.accommodationType),
          pool: pool || null,
          bedrooms: room?.noOfBedrooms ?? null,
          details: room
            ? [`${room.noOfBedrooms} bedrooms`, `${room.noOfBeds} beds`, `${room.noOfBathrooms} baths`]
            : (info.atmospheres ?? []).map((a: any) => a.name),
          lat: info.geoInfo?.latitude,
          lng: info.geoInfo?.longitude,
          url: `https://www.agoda.com/en-au${info.propertyLinks?.propertyPage}?checkIn=${checkIn}&los=${nights}&adults=${adults}&rooms=1&currency=${currency}`,
          placeId: null,
          photos: (p.content.images?.hotelImages ?? []).slice(0, 3).map((i: any) => `https:${i.urls?.[0]?.value}`),
        };
      });
      return { stays, totalAvailable: r.totalAvailable };
    },
  };

  // Sites are independent, so they run in parallel; one failing doesn't hide the others' results.
  const settled = await Promise.allSettled(sources.map((s) => run[s]()));
  const bySource: Record<string, unknown> = {};
  const failures: { source: Source; error: string }[] = [];
  const warnings: string[] = [];
  let stays: Stay[] = [];
  settled.forEach((r, i) => {
    const source = sources[i]!;
    if (r.status === "rejected") {
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failures.push({ source, error });
      console.error(`hotels search: ${source} failed: ${error}`);
      return;
    }
    bySource[source] = { found: r.value.stays.length, totalAvailable: r.value.totalAvailable ?? null };
    warnings.push(...(r.value.warnings ?? []));
    stays.push(...r.value.stays);
  });
  // Filters each site can't apply itself. Unknown values (null) are kept, not guessed.
  stays = stays.filter(
    (s) =>
      (!entire || s.entire !== false) &&
      (!pool || s.pool !== false) &&
      (!minBedrooms || s.bedrooms === null || s.bedrooms >= minBedrooms) &&
      (!maxPerNight || s.pricePerNight === null || s.pricePerNight <= maxPerNight) &&
      (s.rating ?? 0) >= minRating,
  );
  stays.sort((a, b) =>
    sort === "lowest-price"
      ? (a.totalPrice ?? 1e9) - (b.totalPrice ?? 1e9)
      : sort === "most-reviewed"
        ? b.reviews - a.reviews
        : (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews,
  );
  return {
    stay: { location, checkIn, checkOut, nights, adults, currency },
    sources: bySource,
    failures,
    warnings,
    count: stays.length,
    stays: stays.slice(0, Number(v.limit ?? 40)),
  };
}

async function details(args: string[]) {
  const { values: v } = parseArgs({
    args,
    options: {
      url: { type: "string" },
      "check-in": { type: "string" },
      "check-out": { type: "string" },
      adults: { type: "string" },
      currency: { type: "string" },
    },
    strict: true,
  });
  if (!v.url) throw new Error(help);
  const stay = { checkIn: v["check-in"], checkOut: v["check-out"], adults: Number(v.adults ?? 2) };
  if (/airbnb\./.test(v.url)) return airbnb.listing(v.url, stay);
  if (/agoda\.com/.test(v.url)) return agoda.details(v.url, { ...stay, currency: v.currency ?? "AUD" });
  throw new Error("details reads Airbnb and Agoda URLs; Google Hotels rows link to the booking site or Google Maps");
}

export async function main([command, ...args]: string[]) {
  if (command === "search") return search(args);
  if (command === "details") return details(args);
  throw new Error(help);
}
