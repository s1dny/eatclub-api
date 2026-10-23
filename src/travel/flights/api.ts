import {
  buildFlightDateGraphPayload,
  decodeGoogleRpcStatus,
  decodeGoogleRpcStream,
  type FlightSearchFilters,
  parseFlightDateGraph,
} from "google-travel-website-api";

export const SERVICE = "travel.frontend.flights.FlightsFrontendService/";
export const METHODS = [
  "GetShoppingResults",
  "GetBookingResults",
  "GetCalendarGrid",
  "GetCalendarGraph",
  "GetCalendarPicker",
  "GetDealDestinationDetails",
  "GetExploreDestinationFlightDetails",
  "GetExploreDestinations",
  "GetFlightDealsStreaming",
  "GetPartnerLinkPrices",
  "GetSolutionPrices",
  "GetDebugStream",
] as const;

export function date(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error(`${name} must be a real YYYY-MM-DD date`);
  return value;
}
export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
export function location(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^(?:[A-Z]{3}|\/(?:m|g)\/[\w-]+)$/.test(value))
    throw new Error(
      `${name} requires an IATA airport code or Google city ID; use flights autocomplete to resolve names`,
    );
  return value;
}
export interface RpcRecord {
  fetchedAt: string;
  endpoint: string;
  request: unknown[];
  status: number;
  responseText: string;
  payloads: unknown[];
}
export class RpcFailure extends Error {
  constructor(
    message: string,
    readonly response: RpcRecord,
  ) {
    super(message);
  }
}
export async function rpc(method: string, payload: unknown[], filters: FlightSearchFilters = {}) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(method)) throw new Error("Expected a flight service method name");
  const url = `https://www.google.com/_/FlightsFrontendUi/data/${SERVICE}${method}?${new URLSearchParams({ curr: filters.currency ?? "AUD", hl: filters.language ?? "en", gl: filters.country ?? "AU" })}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ "f.req": JSON.stringify([null, JSON.stringify(payload)]) }),
    signal: AbortSignal.timeout(45000),
  });
  const text = await response.text();
  const payloads = decodeGoogleRpcStream(text);
  const record: RpcRecord = {
    fetchedAt: new Date().toISOString(),
    endpoint: url,
    request: payload,
    status: response.status,
    responseText: text,
    payloads,
  };
  if (!response.ok)
    throw new RpcFailure(
      `${method}: HTTP ${response.status}${response.status === 429 ? " (rate limited; stop and resume later)" : ""}`,
      record,
    );
  const status = decodeGoogleRpcStatus(text);
  if (status !== null)
    throw new RpcFailure(`${method}: Google RPC status ${status}; no usable data (not a no-flights result)`, record);
  if (!payloads.length)
    throw new RpcFailure(
      `${method}: no decodable response; a challenge or protocol change may need browser inspection`,
      record,
    );
  return record;
}

export async function discover() {
  const response = await fetch("https://www.google.com/travel/flights?hl=en", { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Flights document: HTTP ${response.status}`);
  const html = await response.text();
  const urls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map((m) => m[1]!.replaceAll("&amp;", "&"))
    .filter((u) => u.startsWith("https://www.gstatic.com/") && u.includes("boq-travel"));
  const found = new Set<string>();
  for (const url of urls) {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Flights bundle: HTTP ${r.status}`);
    for (const m of (await r.text()).matchAll(/FlightsFrontendService\/([A-Za-z]+)/g)) found.add(m[1]!);
  }
  if (!found.size) throw new Error("No service methods found in live bundles; inspect the browser's loaded scripts");
  return {
    fetchedAt: new Date().toISOString(),
    sources: urls,
    methods: [...found].sort().map((method) => ({
      method,
      endpoint: `https://www.google.com/_/FlightsFrontendUi/data/${SERVICE}${method}`,
      support: ["GetCalendarGrid", "GetShoppingResults", "GetBookingResults"].includes(method)
        ? "typed helpers available"
        : "raw payload required",
    })),
  };
}

export interface GridQuery {
  origin: string;
  destination: string;
  start: string;
  end: string;
  minDays: number;
  maxDays: number;
  filters: FlightSearchFilters;
}
export interface Cell {
  departure: string;
  returnDate: string;
  days: number;
  price: number;
  currency: string;
  fetchedAt: string;
}
export interface GridResult {
  query: GridQuery;
  startedAt: string;
  updatedAt: string;
  complete: boolean;
  chunks: { from: string; to: string; fetchedAt: string; count: number }[];
  cells: Cell[];
  missing: { departure: string; returnDate: string; days: number }[];
  error?: string;
}

export async function fetchChunk(
  query: GridQuery,
  from: string,
  to: string,
  capture?: (raw: RpcRecord) => Promise<void>,
) {
  const payload = buildFlightDateGraphPayload(
    [
      { origin: query.origin, destination: query.destination, date: from },
      { origin: query.destination, destination: query.origin, date: addDays(from, query.minDays) },
    ],
    { ...query.filters, tripType: "round-trip" },
    { from, to, nights: query.minDays },
  );
  payload[4] = [query.minDays, query.maxDays];
  const raw = await rpc("GetCalendarGrid", payload, query.filters);
  await capture?.(raw);
  const parsed = parseFlightDateGraph(raw.payloads);
  if (!parsed.length)
    throw new Error(`Calendar returned no price rows for ${from}–${to}; left unresolved, not marked sold out`);
  const cells: Cell[] = [];
  for (const entry of parsed) {
    const departure = date(entry.departure, "response departure");
    const returnDate = date(entry.returnDate, "response return");
    const days = daysBetween(departure, returnDate);
    if (departure < from || departure > to || days < query.minDays || days > query.maxDays)
      throw new Error("Google returned dates outside the requested range");
    if (!Number.isFinite(entry.price) || entry.price <= 0 || entry.currency !== query.filters.currency)
      throw new Error("Google returned an invalid price or unexpected currency");
    cells.push({ departure, returnDate, days, price: entry.price, currency: entry.currency, fetchedAt: raw.fetchedAt });
  }
  return { raw, cells };
}

export function missingCells(result: GridResult) {
  const keys = new Set(result.cells.map((c) => `${c.departure}|${c.returnDate}`));
  const missing = [];
  for (let d = result.query.start; d <= result.query.end; d = addDays(d, 1))
    for (let n = result.query.minDays; n <= result.query.maxDays; n++) {
      const ret = addDays(d, n);
      if (!keys.has(`${d}|${ret}`)) missing.push({ departure: d, returnDate: ret, days: n });
    }
  return missing;
}
