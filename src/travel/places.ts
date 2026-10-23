import { parseArgs } from "node:util";
import { km, places } from "./google.ts";

export const help = `  bun run travel places search --query "Phuket International Airport"     # Google place id, lat/lng, types, rating
  bun run travel places nearby --lat 7.8269 --lng 98.2992 [--radius 1500] [--types cafe,restaurant] [--rank popularity|distance] [--limit 20]`;

export const FIELDS = [
  "id",
  "displayName",
  "location",
  "types",
  "primaryType",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "priceLevel",
  "googleMapsUri",
];

export function shape(p: any, from?: { lat: number; lng: number }) {
  const at = { lat: p.location.latitude, lng: p.location.longitude };
  return {
    name: p.displayName?.text,
    placeId: p.id,
    ...at,
    ...(from ? { km: km(from, at) } : {}),
    type: p.primaryType,
    types: p.types,
    rating: p.rating,
    reviews: p.userRatingCount,
    priceLevel: p.priceLevel,
    address: p.formattedAddress,
    mapsUrl: p.googleMapsUri,
  };
}

export async function main([command, ...args]: string[]) {
  if (command === "search") {
    const { values } = parseArgs({
      args,
      options: { query: { type: "string" }, limit: { type: "string" } },
      strict: true,
    });
    if (!values.query) throw new Error(help);
    const found = await places("searchText", { textQuery: values.query, pageSize: Number(values.limit ?? 5) }, FIELDS);
    if (!found.length) throw new Error(`No place for "${values.query}"`);
    return found.map((p) => shape(p));
  }
  if (command === "nearby") {
    const { values } = parseArgs({
      args,
      options: {
        lat: { type: "string" },
        lng: { type: "string" },
        radius: { type: "string" },
        types: { type: "string" },
        rank: { type: "string" },
        limit: { type: "string" },
      },
      strict: true,
    });
    const center = { lat: Number(values.lat), lng: Number(values.lng) };
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) throw new Error(help);
    const found = await places(
      "searchNearby",
      {
        includedTypes: values.types?.split(",").map((t) => t.trim()),
        maxResultCount: Math.min(20, Number(values.limit ?? 20)),
        rankPreference: (values.rank ?? "popularity").toUpperCase(),
        locationRestriction: {
          circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Number(values.radius ?? 1500) },
        },
      },
      FIELDS,
    );
    return found.map((p) => shape(p, center));
  }
  throw new Error(help);
}
