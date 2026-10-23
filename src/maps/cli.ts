import { cp, lstat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const help = `maps — Google satellite map with Google's place cards and drive routes
  bun run maps init <folder>                              # copy the template; writes .env.local with GOOGLE_MAPS_API_KEY
  bun run maps place --query "Phuket International Airport" # Places API text search → name, placeId, lat, lng, types
Edit <folder>/places.json, then in <folder>: bun install && bun run dev  (http://localhost:3000)`;

const key = process.env.GOOGLE_MAPS_API_KEY ?? "";

/** Places API (New) text search. The key is referrer-restricted to the template's origin, so send that referrer. */
async function place(query: string) {
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set (repository .env)");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types,places.formattedAddress",
      Referer: "http://localhost:3000/",
    },
    body: JSON.stringify({ textQuery: query, pageSize: 5 }),
  });
  const body = (await response.json()) as any;
  if (!response.ok) throw new Error(`Places API ${response.status}: ${body.error?.message ?? JSON.stringify(body)}`);
  if (!body.places?.length) throw new Error(`No place for "${query}"`);
  return body.places.map((p: any) => ({
    name: p.displayName?.text,
    placeId: p.id,
    lat: p.location.latitude,
    lng: p.location.longitude,
    types: p.types,
    address: p.formattedAddress,
  }));
}

const [command, ...rest] = Bun.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  console.log(help);
} else if (command === "init" && rest[0]) {
  const target = resolve(rest[0]);
  if (await lstat(target).catch(() => null)) throw new Error(`Destination already exists: ${target}`);
  const template = new URL("../../skills/maps/assets/template/", import.meta.url).pathname;
  await cp(template, target, { recursive: true, filter: (p) => !p.includes("node_modules") });
  await writeFile(`${target}/.env.local`, `GOOGLE_MAPS_API_KEY=${JSON.stringify(key)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ path: target, keyConfigured: Boolean(key), next: ["bun install", "bun run dev"] }));
} else if (command === "place") {
  const { values } = parseArgs({ args: rest, options: { query: { type: "string" } }, strict: true });
  if (!values.query) throw new Error(help);
  console.log(JSON.stringify(await place(values.query), null, 2));
} else {
  throw new Error(help);
}
