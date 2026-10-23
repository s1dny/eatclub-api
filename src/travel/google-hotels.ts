import { executeOperation } from "google-travel-website-api";
import { places } from "./google.ts";
import { FIELDS, shape } from "./places.ts";

export type Hotel = {
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
export async function search(q: {
  queries: string[];
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
}) {
  const warnings: string[] = [];
  const byKey = new Map<string, Hotel>();
  // Each query returns at most ~12 entities, and narrow phrasings ("<island> private pool villa") often return none,
  // so several phrasings are searched one after another and merged.
  for (const query of q.queries) {
    const r: any = await executeOperation({
      operation: "hotel-filters",
      query,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      adults: q.adults,
      currency: q.currency,
      sort: "lowest-price",
      limit: 40,
      timeout: 90,
    } as any);
    if (!r.entities?.length) warnings.push(`Google Hotels returned nothing for "${query}"`);
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
  const candidates = [...byKey.values()];
  await enrich(candidates.slice(0, 80));
  // Room types of one listing ("Villa 25", "Villa 25 - Villa with Private Pool") share a Google place.
  const byPlace = new Map<string, Hotel>();
  for (const h of candidates) merge(byPlace, h.placeId ?? h.name.toLowerCase(), h);
  return { hotels: [...byPlace.values()], warnings };
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
