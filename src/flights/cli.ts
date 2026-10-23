import { createHash } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  executeOperation,
  FLIGHT_ENDPOINT_CATALOG,
  FLIGHT_SEARCH_FILTER_KEYS,
  parseFlightSearchFilters,
} from "google-travel-website-api";
import {
  addDays,
  date,
  daysBetween,
  discover,
  fetchChunk,
  type GridQuery,
  type GridResult,
  location,
  METHODS,
  missingCells,
  RpcFailure,
  rpc,
} from "./api.ts";

const help = `flights — Google Flights for agents
  bun run flights grid --origin SYD --destination NRT[,HKT,DPS] --start 2026-11-01 --end 2026-12-31 [--min-days 6 --max-days 8] [--out data/flights/tokyo] [--resume]
  bun run flights search --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08
  bun run flights autocomplete --query Tokyo
  bun run flights booking --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08 --select 1 --select-return 1
  bun run flights filters
  bun run flights endpoints [--discover]
  bun run flights rpc --method GetCalendarPicker --payload request.json
  bun run flights scan --origin SYD --destination NRT --departure 2026-11-01 --return 2026-11-08
Grid inputs are configurable. Defaults: 6–8 calendar days, AUD, 1 adult, economy.
Common filters: --currency AUD --adults 1 --cabin-class economy --max-stops non-stop --airlines QF,JQ --checked-bags 1
Additional filters are listed by 'filters'. --filters file.json accepts the complete filter object.
Grid outputs: complete JSON on stdout ({grids:[...]} for several destinations, each in <out>/<destination>); grid.json and raw/*.json on disk; --resume reuses completed chunks from the same query.
`;
function camel(s: string) {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
function integer(v: unknown, fallback: number, name: string, min: number, max: number) {
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer ${min}–${max}`);
  return n;
}
async function atomic(path: string, value: string) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await Bun.write(tmp, value);
  await rename(tmp, path);
}
async function save(out: string, result: GridResult) {
  result.updatedAt = new Date().toISOString();
  result.missing = missingCells(result);
  await atomic(join(out, "grid.json"), JSON.stringify(result, null, 2));
}
async function main() {
  const args = Bun.argv.slice(2),
    command = args.shift();
  if (!command || command === "help" || args.includes("--help")) {
    console.log(help);
    return;
  }
  const filterFlags = FLIGHT_SEARCH_FILTER_KEYS.map((k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
  const stringFlags = [
    ...filterFlags,
    "origin",
    "destination",
    "departure",
    "return",
    "query",
    "start",
    "end",
    "min-days",
    "max-days",
    "out",
    "filters",
    "method",
    "payload",
    "select",
    "select-return",
    "limit",
    "calendar-start",
    "calendar-end",
    "nights",
  ];
  const options = Object.fromEntries(stringFlags.map((k) => [k, { type: "string" as const }]));
  const parsed = parseArgs({
    args,
    options: { ...options, resume: { type: "boolean" }, discover: { type: "boolean" } },
    strict: true,
  });
  const values = parsed.values as Record<string, string | boolean | undefined>;
  const rawOptions: Record<string, unknown> = Object.fromEntries(Object.entries(values).map(([k, v]) => [camel(k), v]));
  const suppliedFilters = values.filters ? await Bun.file(String(values.filters)).json() : {};
  if (!suppliedFilters || Array.isArray(suppliedFilters) || typeof suppliedFilters !== "object")
    throw new Error("--filters must contain a JSON object");
  for (const key of Object.keys(suppliedFilters))
    if (!(FLIGHT_SEARCH_FILTER_KEYS as readonly string[]).includes(key)) throw new Error(`Unknown filter ${key}`);
  const merged = { currency: "AUD", ...suppliedFilters, ...rawOptions };
  const filters = parseFlightSearchFilters(merged);
  if (command === "endpoints") {
    console.log(
      JSON.stringify(
        values.discover ? await discover() : { methods: METHODS, catalog: FLIGHT_ENDPOINT_CATALOG },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "rpc") {
    if (!values.method || !values.payload) throw new Error("rpc requires --method and --payload JSON file");
    const payload = await Bun.file(String(values.payload)).json();
    if (!Array.isArray(payload)) throw new Error("RPC payload must be the inner JSON array, not an f.req wrapper");
    console.log(JSON.stringify(await rpc(String(values.method), payload, filters), null, 2));
    return;
  }
  if (command !== "grid") {
    const operation = (
      {
        search: "flight-search",
        autocomplete: "flight-autocomplete",
        booking: "flight-booking",
        filters: "flight-filter-options",
        scan: "flight-scan",
        dates: "flight-dates",
      } as Record<string, string>
    )[command];
    if (!operation) throw new Error(`Unknown command ${command}\n${help}`);
    console.log(JSON.stringify(await executeOperation({ ...merged, operation, raw: true, timeout: 90 }), null, 2));
    return;
  }
  if (filters.tripType && filters.tripType !== "round-trip") throw new Error("grid requires round-trip flights");
  const start = date(values.start, "--start"),
    end = date(values.end, "--end");
  if (end < start) throw new Error("--end must be on or after --start");
  if (values.departure || values.return || values["calendar-start"] || values["calendar-end"] || values.nights)
    throw new Error(
      "grid uses --start, --end, --min-days and --max-days; departure/return/calendar-start/calendar-end/nights belong to other commands",
    );
  const minDays = integer(values["min-days"], 6, "--min-days", 1, 90),
    maxDays = integer(values["max-days"], 8, "--max-days", minDays, 90);
  if (daysBetween(start, end) > 730) throw new Error("Use a departure range of at most two years");
  const destinations = String(values.destination ?? "")
    .split(",")
    .map((d) => location(d.trim(), "--destination"));
  const many = destinations.length > 1;
  const grids = [];
  for (const destination of destinations) {
    if (many) console.error(`Grid ${values.origin}→${destination}`);
    grids.push(await runGrid(destination));
  }
  console.log(JSON.stringify(many ? { grids } : grids[0], null, 2));
  async function runGrid(destination: string) {
    const query: GridQuery = {
      origin: location(values.origin, "--origin"),
      destination,
      start,
      end,
      minDays,
      maxDays,
      filters,
    };
    const hash = createHash("sha256").update(JSON.stringify(query)).digest("hex").slice(0, 12);
    const out = resolve(
      values.out ? (many ? join(String(values.out), destination) : String(values.out)) : `data/flights/${hash}`,
    );
    let result: GridResult = {
      query,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      complete: false,
      chunks: [],
      cells: [],
      missing: [],
    };
    const file = Bun.file(join(out, "grid.json"));
    if (await file.exists()) {
      if (!values.resume) throw new Error(`Output already exists: ${out}; use --resume or a new --out`);
      result = await file.json();
      if (JSON.stringify(result.query) !== JSON.stringify(query))
        throw new Error("Resume query differs from saved query (including filters); use a new output directory");
      delete result.error;
    }
    await mkdir(join(out, "raw"), { recursive: true });
    try {
      for (let from = start; from <= end; from = addDays(from, 30)) {
        const to = addDays(from, 29) < end ? addDays(from, 29) : end;
        if (result.chunks.some((c) => c.from === from && c.to === to)) continue;
        console.error(`Fetching ${from}–${to}, ${minDays}–${maxDays} days`);
        const { raw, cells } = await fetchChunk(query, from, to, async (raw) => {
          await atomic(join(out, "raw", `${from}_${to}.json`), JSON.stringify(raw, null, 2));
        });
        result.cells.push(...cells);
        result.chunks.push({ from, to, fetchedAt: raw.fetchedAt, count: cells.length });
        await save(out, result);
      }
      result.complete = true;
      await save(out, result);
    } catch (error) {
      if (error instanceof RpcFailure)
        await atomic(join(out, "raw", `failure-${Date.now()}.json`), JSON.stringify(error.response, null, 2));
      result.complete = false;
      result.error = error instanceof Error ? error.message : String(error);
      await save(out, result);
      throw error;
    }
    return { ...result, out };
  }
}
await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
