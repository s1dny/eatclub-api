// Airbnb has no public API. Its search and listing pages embed the same GraphQL data the site renders,
// in <script id="data-deferred-state-0">; these read that JSON.
const ORIGIN = "https://www.airbnb.com.au";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  "Accept-Language": "en-AU,en;q=0.9",
};
const POOL_AMENITY = "7";

async function page(url: string) {
  const response = await fetch(url, { headers: HEADERS });
  const html = await response.text();
  if (!response.ok) throw new Error(`Airbnb ${response.status} for ${url}`);
  const json = html.match(/<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) throw new Error(`Airbnb returned no page data for ${url} (blocked or layout changed)`);
  return JSON.parse(json).niobeClientData?.[0]?.[1]?.data;
}

const money = (s?: string) => (s ? Number(s.match(/[\d,]+(\.\d+)?/)?.[0].replaceAll(",", "")) || null : null);
const nights = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
/** Listing ids arrive as base64 "DemandStayListing:<id>". */
const listingId = (id: string) => atob(id).split(":").pop()!;

type Listing = {
  id: string;
  name: string;
  type: string;
  rating: number | null;
  reviews: number;
  badges: string[];
  totalPrice: number | null;
  pricePerNight: number | null;
  currency: string;
  details: string[];
  lat: number;
  lng: number;
  url: string;
  photos: string[];
};

export type AirbnbSearch = {
  location: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
  entire: boolean;
  pool: boolean;
  minBedrooms?: number;
  maxPricePerNight?: number;
  pages: number;
};

export async function search(
  q: AirbnbSearch,
): Promise<{ nights: number; totalAvailable: number | null; listings: Listing[] }> {
  const params = new URLSearchParams({
    query: q.location,
    checkin: q.checkIn,
    checkout: q.checkOut,
    adults: String(q.adults),
    currency: q.currency,
  });
  if (q.entire) params.append("room_types[]", "Entire home/apt");
  if (q.pool) params.append("amenities[]", POOL_AMENITY);
  if (q.minBedrooms) params.set("min_bedrooms", String(q.minBedrooms));
  if (q.maxPricePerNight) params.set("price_max", String(q.maxPricePerNight));
  const n = nights(q.checkIn, q.checkOut);
  const listings = new Map<string, Listing>();
  let total: number | null = null;
  let cursors: string[] = [];
  for (let i = 0; i < q.pages; i++) {
    if (i) {
      if (!cursors[i]) break;
      params.set("cursor", cursors[i]!);
    }
    const url = `${ORIGIN}/s/${encodeURIComponent(q.location)}/homes?${params}`;
    const results = (await page(url))?.presentation?.staysSearch?.results;
    if (!results) throw new Error(`Airbnb search returned no results block for ${url}`);
    cursors = results.paginationInfo?.pageCursors ?? [];
    total ??= results.filters?.filterPanel?.resultCount ?? null;
    for (const r of results.searchResults ?? []) {
      const l = r.demandStayListing;
      if (!l) continue;
      const id = listingId(l.id);
      if (listings.has(id)) continue; // pages overlap
      const price = money(r.structuredDisplayPrice?.primaryLine?.accessibilityLabel);
      const [rating, reviews] = (r.avgRatingLocalized?.match(/^([\d.]+) \((\d+)\)/) ?? []).slice(1).map(Number);
      const content = r.structuredContent ?? {};
      listings.set(id, {
        id,
        name: r.nameLocalized?.localizedStringWithTranslationPreference ?? r.subtitle,
        type: r.title,
        rating: rating ?? null,
        reviews: reviews ?? 0,
        badges: (r.badges ?? []).map((b: any) => b.text),
        totalPrice: price,
        pricePerNight: price ? Math.round(price / n) : null,
        currency: q.currency,
        details: [
          ...new Set(
            [...(content.mapPrimaryLine ?? []), ...(content.primaryLine ?? []), ...(content.secondaryLine ?? [])]
              .map((m: any) => m.body)
              .filter(Boolean),
          ),
        ],
        lat: l.location?.coordinate?.latitude,
        lng: l.location?.coordinate?.longitude,
        url: `${ORIGIN}/rooms/${id}?check_in=${q.checkIn}&check_out=${q.checkOut}&adults=${q.adults}`,
        photos: (r.contextualPictures ?? []).slice(0, 3).map((p: any) => p.picture),
      });
    }
  }
  return { nights: n, totalAvailable: total, listings: [...listings.values()] };
}

export async function listing(idOrUrl: string, stay: { checkIn?: string; checkOut?: string; adults: number }) {
  const id = idOrUrl.match(/rooms\/(\d+)/)?.[1] ?? idOrUrl;
  if (!/^\d+$/.test(id)) throw new Error(`Not an Airbnb listing id or URL: ${idOrUrl}`);
  const params = new URLSearchParams({ adults: String(stay.adults) });
  if (stay.checkIn) params.set("check_in", stay.checkIn);
  if (stay.checkOut) params.set("check_out", stay.checkOut);
  const url = `${ORIGIN}/rooms/${id}?${params}`;
  const data = await page(url);
  const node = data?.node;
  const pdp = node?.pdpPresentation;
  if (!pdp) throw new Error(`Airbnb listing ${id} has no details (removed, blocked or layout changed)`);
  const overview = find(data, "StaysPdpOverview");
  const amenities = pdp.amenities;
  const groups = [...(amenities?.seeAllAmenitiesGroups ?? amenities?.previewAmenitiesGroups ?? [])];
  const stats = pdp.quality?.listingRatingStats?.overallRatingStats;
  const host = pdp.hostInfo?.passportData;
  return {
    id,
    url,
    name: node.description?.name?.localizedStringWithTranslationPreference,
    type: overview?.title,
    overview: overview?.items ?? [],
    // Room-by-room beds ("Bedroom 1: 1 queen bed", "Living room: 1 sofa bed") when the host filled them in.
    sleepingArrangements: strings(find(data, "sleepingArrangements", true)),
    rating: stats?.ratingAverage ?? null,
    reviews: Number(stats?.ratingCount ?? 0),
    host: host ? { name: host.name, superhost: Boolean(host.isSuperhost) } : null,
    lat: pdp.location?.latitude,
    lng: pdp.location?.longitude,
    exactLocation: pdp.location?.isExactLocation ?? null,
    amenities: groups.flatMap((g: any) => (g.amenities ?? []).filter((a: any) => a.available).map((a: any) => a.title)),
    unavailable: groups.flatMap((g: any) =>
      (g.amenities ?? []).filter((a: any) => !a.available).map((a: any) => a.title),
    ),
    description: html(pdp.descriptions?.longDescriptionHtml?.localizedStringWithTranslationPreference),
  };
}

/** First object with that __typename, or with `key` set to a non-null value when byKey. */
function find(o: any, name: string, byKey = false): any {
  if (!o || typeof o !== "object") return undefined;
  if (!Array.isArray(o)) {
    if (byKey ? o[name] != null : o.__typename === name) return byKey ? o[name] : o;
  }
  for (const v of Object.values(o)) {
    const hit = find(v, name, byKey);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function strings(o: any): string[] {
  if (o == null) return [];
  const out: string[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === "string" && ["title", "subtitle", "body", "label"].includes(k) && x.trim()) out.push(x);
        else walk(x);
      }
  };
  walk(o);
  return [...new Set(out)];
}

const html = (s?: string) =>
  s
    ?.replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .trim()
    .slice(0, 2000) ?? null;
