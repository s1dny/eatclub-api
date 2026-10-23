// cozycozy.com is a metasearch over Booking.com, Airbnb, Agoda, Expedia, Hotels.com, Stayz, HomeToGo, Trip.com and
// ZenHotels. It has no public API; these call the endpoints its website uses: resolve the place, launch a search,
// wait for the providers to answer, then page through the result list.
const ORIGIN = "https://www.cozycozy.com";
const HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-AU",
  "x-split-id": "1",
  origin: ORIGIN,
  referer: `${ORIGIN}/au`,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
};
const SITE = { siteCode: "cozycozy", locale: "en-au" };

async function api(name: string, body: unknown) {
  const response = await fetch(`${ORIGIN}/api/${name}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`cozycozy ${name} ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** cozycozy's own 16-character ids for a search, visit and browser. */
const id = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62],
  ).join("");

export type CozySearch = {
  location: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  entire: boolean;
  pool: boolean;
  minBedrooms?: number;
  pages: number;
};

export async function search(q: CozySearch) {
  const session = crypto.randomUUID();
  const [place] = (await api("getPlacePredictions", { ...SITE, input: q.location, session })).predictions ?? [];
  if (!place) throw new Error(`cozycozy has no place matching "${q.location}"`);
  const { location } = await api("getInputLocation", { ...SITE, placeId: place.placeId, session });
  const searchId = id();
  // Months are zero-based, as in JavaScript's Date.
  const date = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return [y, m! - 1, day, 0, 0, 0, 0];
  };
  await api("launch", {
    searchId,
    visitId: id(),
    browserId: id(),
    splitId: "1",
    frontEndParam: {
      fromDate: date(q.checkIn),
      toDate: date(q.checkOut),
      preferredFromDate: null,
      preferredToDate: null,
      adults: q.adults,
      children: 0,
      location,
      roomCount: 1,
      childAges: [],
      marketCode: "au",
      ...SITE,
      options: { resultsTimeout: 20, softResultsTimeout: 5 },
    },
    sourceForTracking: "homepage",
    isPpcSession: false,
    isReload: false,
    isMobile: false,
    isStandaloneApp: false,
    browserName: "chrome",
    deviceOs: "macos",
  });
  // State 3 means the providers have answered (about 3 s); polling past it returns HTTP 500.
  let state = 0;
  for (let i = 0; state < 3; i++) {
    if (i > 30) throw new Error("cozycozy search did not finish");
    state = (await api("getSearchStateWhenNot", { searchId, state })).searchState;
  }
  const filters = {
    bounds: null,
    noBounds: true,
    price: [-0.5, Number.MAX_SAFE_INTEGER],
    instantBooking: false,
    combinedTypeCodes: q.entire ? ["$VR"] : [],
    starRatings: [],
    minRating: 0,
    ratingRequired: false,
    amenityCodes: q.pool ? ["SWIMPOOL"] : [],
    providerCodes: [],
    minBedRoomCount: q.minBedrooms ?? 0,
    minBedCount: 0,
    minBathRoomCount: 0,
    areaCodes: [],
    themeCodes: [],
    minResponseTime: null,
    updateBounds: false,
    breakfast: false,
    minCancellationCategory: 0,
  };
  const entries: any[] = [];
  let total: number | null = null;
  for (let page = 0; page < q.pages; page++) {
    const r = await api("getResultList", {
      searchId,
      sorting: "price",
      offset: page * 50,
      count: 50,
      filters,
      estimateBounds: { targetSize: { width: 451, height: 836 } },
      processNewResults: true,
      columnCount: 3,
      excludeAds: true,
      prefixAccommodationIds: [],
    });
    total ??= r.filteredCount ?? null;
    const results = (r.entries ?? []).filter((e: any) => e.type === "result");
    entries.push(...results);
    if (results.length < 50) break;
  }
  return {
    totalAvailable: total,
    results: entries.map((e) => {
      const offer = e.highlightedResults?.[0];
      const url = deeplink(offer?.deeplinkUrl);
      return {
        id: String(e.accommodationId),
        name: e.name as string,
        type: e.title as string,
        totalPrice: offer?.totalPrice?.value ? Math.round(offer.totalPrice.value) : null,
        currency: (offer?.totalPrice?.currencyCode as string) ?? "AUD",
        site: offer?.providerText as string | undefined,
        offerText: offer?.text as string | undefined,
        offers: e.resultCount as number,
        rating: e.ratingScore ? e.ratingScore / 20 : null,
        reviews: (e.ratingCount as number) ?? 0,
        bedrooms: (e.subTitleDetails?.bedRoomCount as number) ?? null,
        beds: (e.subTitleDetails?.bedCount as number) ?? null,
        guests: (e.subTitleDetails?.guestCapacity as number) ?? null,
        lat: e.coordinates?.latitude as number,
        lng: e.coordinates?.longitude as number,
        url,
        photos: (e.lightThumbnails?.firstUrls ?? []) as string[],
      };
    }),
  };
}

/** Deeplinks carry a %CLICK_ID% placeholder (label=, tag=, …) that cozycozy fills in on click; drop that parameter. */
function deeplink(raw?: string) {
  if (!raw) return "";
  const url = new URL(raw);
  for (const [k, v] of [...url.searchParams]) if (v.includes("%CLICK_ID%")) url.searchParams.delete(k);
  return url.toString();
}
