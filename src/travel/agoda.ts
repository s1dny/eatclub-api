// Agoda has no public API. These call the same endpoints its website uses: the place suggester, the
// `citySearch` GraphQL query (request captured from agoda.com and kept in agoda-city-search.json) and the
// property page's secondary data.
import template from "./agoda-city-search.json";

const ORIGIN = "https://www.agoda.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
  "Accept-Language": "en-AU",
  "ag-language-locale": "en-au",
  "ag-cid": "-1",
  "ag-debug-override-origin": "AU",
};
/** Agoda accommodation types rented as a whole place: villa, apartment, entire house/bungalow, serviced apartment. */
export const ENTIRE_TYPES = [28, 29, 30, 103, 120, 131];
const POOL_FACILITY = 93;
/** Names for Agoda's accommodationType ids, from its search filters. */
export const TYPES: Record<number, string> = {
  28: "Villa",
  29: "Apartment",
  30: "Villa",
  32: "Guesthouse",
  33: "Hostel",
  34: "Hotel",
  35: "Motel",
  37: "Resort",
  103: "Entire bungalow",
  106: "Chalet",
  108: "Homestay",
  111: "Inn",
  112: "Lodge",
  120: "Serviced apartment",
  122: "Resort villa",
  131: "Entire house",
};

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...HEADERS, ...init?.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Agoda ${response.status} for ${url}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Agoda returned non-JSON for ${url} (blocked or changed): ${text.slice(0, 200)}`);
  }
}

/** Agoda's city id for a place name ("Langkawi, Malaysia" → 16928). */
export async function city(location: string) {
  const r = await json(
    `${ORIGIN}/api/cronos/search/GetUnifiedSuggestResult/3/1/1/0/en-au/?searchText=${encodeURIComponent(location)}&origin=AU&cid=-1&pageTypeId=1`,
  );
  // Page type 5 is a city page; type 6 areas (e.g. Pantai Cenang) need a different search query.
  const hit = (r.ViewModelList ?? []).find((v: any) => v.PageTypeId === 5 && v.ObjectId > 0);
  if (!hit) throw new Error(`Agoda has no city matching "${location}"`);
  return { id: hit.ObjectId as number, name: hit.Name as string };
}

export type AgodaSearch = {
  cityId: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  currency: string;
  entire: boolean;
  pool: boolean;
  minBedrooms?: number;
  pages: number;
};

export async function search(q: AgodaSearch) {
  const nights = Math.round((Date.parse(q.checkOut) - Date.parse(q.checkIn)) / 86400000);
  const listings = new Map<number, any>();
  let total: number | null = null;
  for (let page = 1; page <= q.pages; page++) {
    const r = await json(`${ORIGIN}/graphql/search`, {
      method: "POST",
      headers: { "content-type": "application/json", "ag-page-type-id": "103", origin: ORIGIN },
      body: JSON.stringify(request(q, nights, page)),
    });
    if (r.errors?.length) throw new Error(`Agoda search: ${JSON.stringify(r.errors).slice(0, 300)}`);
    const cs = r.data?.citySearch;
    if (!cs) throw new Error("Agoda search returned no citySearch block");
    total ??= cs.searchResult?.searchInfo?.totalFilteredHotels ?? null;
    for (const p of cs.properties ?? []) listings.set(p.propertyId, p);
    if ((cs.properties ?? []).length < 40) break;
  }
  return { nights, totalAvailable: total, properties: [...listings.values()] };
}

function request(q: AgodaSearch, nights: number, page: number) {
  const body = structuredClone(template) as any;
  const v = body.variables;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const checkIn = `${q.checkIn}T00:00:00.000Z`;
  const cs = v.CitySearchRequest;
  const sr = cs.searchRequest;
  cs.cityId = q.cityId;
  Object.assign(sr.searchCriteria, {
    bookingDate: now,
    checkInDate: checkIn,
    localCheckInDate: q.checkIn,
    los: nights,
    rooms: 1,
    adults: q.adults,
    currency: q.currency,
  });
  Object.assign(sr.searchContext, { userId: id, searchId: crypto.randomUUID() });
  sr.page = { pageSize: 45, pageNumber: page, pageToken: "" };
  sr.filterRequest.idsFilters = [
    ...(q.pool ? [{ filterKey: "HotelFacilities", ids: [POOL_FACILITY] }] : []),
    ...(q.entire ? [{ filterKey: "AccommodationType", ids: ENTIRE_TYPES }] : []),
    // Agoda's bedroom buckets are 1 (incl. studio), 2 and 3+.
    ...(q.minBedrooms && q.minBedrooms > 1
      ? [{ filterKey: "NumberOfBedrooms", ids: [1, 2, 3].filter((n) => n >= Math.min(3, q.minBedrooms!)) }]
      : []),
  ];
  const content = v.ContentSummaryRequest.context;
  Object.assign(content, { rawUserId: id });
  content.searchCriteria.cityId = q.cityId;
  Object.assign(content.occupancy, { numberOfAdults: q.adults, checkIn });
  const pricing = v.PricingSummaryRequest;
  Object.assign(pricing.context.clientInfo, { userId: id, searchId: sr.searchContext.searchId });
  Object.assign(pricing.pricing, {
    bookingDate: now,
    checkIn,
    checkout: `${q.checkOut}T00:00:00.000Z`,
    localCheckInDate: q.checkIn,
    localCheckoutDate: q.checkOut,
    currency: q.currency,
  });
  Object.assign(pricing.pricing.occupancy, { adults: q.adults, rooms: 1 });
  return body;
}

/** Property id from an id or an agoda.com property URL (the URL needs a lookup; ids are what search returns). */
export async function details(
  idOrUrl: string,
  stay: { checkIn?: string; checkOut?: string; adults: number; currency: string },
) {
  const id = /^\d+$/.test(idOrUrl) ? idOrUrl : await idFromUrl(idOrUrl);
  const params = new URLSearchParams({
    hotel_id: id,
    adults: String(stay.adults),
    rooms: "1",
    currency: stay.currency,
  });
  // Rooms and prices only come back for dates: flags win, else the dates in a search row's URL.
  const fromUrl = /^https?:/.test(idOrUrl) ? new URL(idOrUrl).searchParams : new URLSearchParams();
  const checkIn = stay.checkIn ?? fromUrl.get("checkIn");
  const los =
    stay.checkIn && stay.checkOut
      ? String(Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000))
      : fromUrl.get("los");
  if (checkIn) params.set("checkIn", checkIn);
  if (los) params.set("los", los);
  const d = await json(`${ORIGIN}/api/cronos/property/BelowFoldParams/GetSecondaryData?${params}`);
  if (!d.hotelInfo?.name) throw new Error(`Agoda property ${id} has no details (removed, blocked or changed)`);
  const about = d.aboutHotel ?? {};
  const [lat, lng] = d.mapParams?.latlng ?? [];
  const rooms = (d.roomGridData?.masterRooms ?? []).map((r: any) => ({
    name: r.name,
    maxOccupancy: r.maxOccupancy,
    beds: r.bedConfigurationSummary?.title ?? r.numberOfBeds,
    bedrooms: (r.bedroomLayouts?.[0]?.bedrooms ?? []).map(
      (b: any) => `${b.title} ${(b.beds ?? []).map((x: any) => x.name).join(", ")}`,
    ),
    totalPrice: r.cheapestPrice ?? null,
  }));
  return {
    source: "agoda",
    id,
    url: /^https?:/.test(idOrUrl) ? idOrUrl : `${ORIGIN}/en-au/search?selectedproperty=${id}`,
    name: d.hotelInfo.name.trim(),
    type: d.hotelInfo.accommodationType,
    address: d.hotelInfo.address?.full,
    lat,
    lng,
    rating: d.reviews?.score ? Number(d.reviews.score) / 2 : null,
    reviews: d.reviews?.reviewsCount ?? 0,
    // Empty rooms for given dates means sold out on Agoda, even if search still showed a price.
    available: checkIn ? rooms.length > 0 : null,
    rooms,
    amenities: (about.featureGroups ?? []).flatMap((g: any) =>
      (g.feature ?? []).filter((f: any) => f.available).map((f: any) => f.name),
    ),
    description: html(about.hotelDesc?.overview),
  };
}

async function idFromUrl(url: string) {
  const response = await fetch(url, { headers: HEADERS });
  const m = (await response.text()).match(/hotel_id=(\d+)|"hotelId":(\d+)|hotelId:(\d+)/);
  if (!m) throw new Error(`No Agoda property id found at ${url}`);
  return m[1] ?? m[2] ?? m[3]!;
}

const html = (s?: string) =>
  s
    ?.replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .trim()
    .slice(0, 2000) ?? null;
