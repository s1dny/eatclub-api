import { z } from "zod";

/**
 * EatClub's mobile app API: AWS AppSync GraphQL at consumer-api.eatclub.com.au, authorised by the
 * public API key bundled in the Android app (res/ju.json → AppSync.Default.ApiKey). Queries in
 * ./graphql were extracted verbatim from the app, so requests look like the app's own.
 */
const URL = "https://consumer-api.eatclub.com.au/graphql";
const query = (name: string) => Bun.file(new globalThis.URL(`./graphql/${name}.graphql`, import.meta.url)).text();

function apiKey(): string {
  const key = process.env.EATCLUB_APP_API_KEY;
  if (!key) throw new Error("EATCLUB_APP_API_KEY is not set; see skills/eatclub/references/api.md");
  return key;
}

async function gql<T extends z.ZodType>(name: string, variables: object, data: T): Promise<z.infer<T>> {
  const body = JSON.stringify({ query: await query(name), variables });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey(), "ec-country": "AU" },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const json = z.object({ data: z.unknown(), errors: z.array(z.unknown()).nullish() }).parse(await res.json());
      if (json.errors?.length) throw new Error(`EatClub app ${name}: ${JSON.stringify(json.errors).slice(0, 300)}`);
      return data.parse(json.data);
    }
    if (attempt >= 2 || (res.status < 500 && res.status !== 429))
      throw new Error(`EatClub app ${name} → ${res.status}`);
    await Bun.sleep(1000 * 2 ** attempt);
  }
}

export const AppRestaurant = z.looseObject({ objectId: z.string() });
export type AppRestaurant = z.infer<typeof AppRestaurant> & Record<string, unknown>;

/** Every venue the app lists in a region (1000 per page). Only some regions are served. */
export async function appRestaurants(region: string, date: string): Promise<AppRestaurant[]> {
  const out: AppRestaurant[] = [];
  for (let page = 1; page > 0;) {
    const { restaurants } = await gql(
      "restaurants",
      { region, page, dates: [date] },
      z.object({ restaurants: z.object({ restaurants: z.array(AppRestaurant), nextPage: z.number() }) }),
    );
    out.push(...restaurants.restaurants);
    page = restaurants.restaurants.length ? restaurants.nextPage : -1;
  }
  return out;
}

export const LiveDeal = z.looseObject({
  objectId: z.string(),
  restId: z.string(),
  discount: z.string().nullish(),
  dayOfWeek: z.number().nullish(),
  startTime: z.number().nullish(),
  endTime: z.number().nullish(),
  displayedQtyLeft: z.number().nullish(),
  recurringQty: z.number().nullish(),
  lastBookingDate: z.string().nullish(),
  maxPartySize: z.number().nullish(),
  subheading: z.string().nullish(),
  terms: z.string().nullish(),
  drinksOnlyTerms: z.string().nullish(),
  newCustOnly: z.boolean().nullish(),
  lightning: z.boolean().nullish(),
  dineInOnly: z.boolean().nullish(),
  takeawayOnly: z.boolean().nullish(),
  iaoOnly: z.boolean().nullish(),
  sellsOutEarly: z.boolean().nullish(),
  additionalImportantInfo: z.array(z.object({ heading: z.string().nullish(), text: z.string().nullish() })).nullish(),
});
export type LiveDeal = z.infer<typeof LiveDeal>;

/** A deal with today's remaining quantity. Deal ids match the website's. */
export const liveDeal = async (dealId: string) =>
  (await gql("deal", { dealId }, z.object({ dealForId: LiveDeal.nullable() }))).dealForId;

/** Menu items the discount doesn't apply to on `date` (JSON string from the API). */
export const excludedItems = async (restId: string, date: string) =>
  (await gql("excluded-items", { restId, date }, z.object({ excludedItems: z.string().nullable() }))).excludedItems;
