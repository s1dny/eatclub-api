#!/usr/bin/env bun
/**
 * Fills `walk_times` with OpenStreetMap walking times from a point to every venue
 * reachable within --max minutes (default 15), so SQL can JOIN on it.
 */
import { open } from "./db.ts";
import { walkingTimes } from "./osm.ts";

const [latArg, lngArg, ...rest] = Bun.argv.slice(2);
const latitude = Number(latArg);
const longitude = Number(lngArg);
const maxIdx = rest.indexOf("--max");
const max = maxIdx >= 0 ? Number(rest[maxIdx + 1]) : 15;
if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !(max > 0)) {
  console.error("usage: bun src/walk.ts <lat> <lng> [--max minutes]");
  process.exit(2);
}

// Nobody walks faster than 6 km/h, and a route is never shorter than the straight line,
// so this shortlist can't miss a reachable venue.
const crow = max * 100;
const dLat = crow / 111_320;
const dLng = crow / (111_320 * Math.cos((latitude * Math.PI) / 180));

const db = open();
const { rows } = await db.execute({
  sql: `SELECT slug, latitude, longitude FROM venues
        WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
  args: [latitude - dLat, latitude + dLat, longitude - dLng, longitude + dLng],
});
const venues = rows.map((r) => ({
  slug: String(r.slug),
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
}));

const walks = await walkingTimes({ latitude, longitude }, venues);
const reachable = venues
  .map((v, i) => ({ slug: v.slug, walk: walks[i] }))
  .filter((v) => v.walk && v.walk.seconds <= max * 60);

await db.batch(
  [
    "DELETE FROM walk_times",
    ...reachable.map((v) => ({
      sql: "INSERT INTO walk_times VALUES (?,?,?)",
      args: [v.slug, Math.round((v.walk?.seconds ?? 0) / 6) / 10, Math.round(v.walk?.meters ?? 0)],
    })),
    {
      sql: "INSERT OR REPLACE INTO meta VALUES ('walk_origin', ?)",
      args: [JSON.stringify({ latitude, longitude, maxMinutes: max, at: new Date().toISOString() })],
    },
  ],
  "write",
);
console.log(`walk_times: ${reachable.length} venues within ${max} min walk of ${latitude},${longitude}`);
