#!/usr/bin/env bun
/**
 * Fills `walk_times` with walking times from a point to every venue within --max minutes
 * (default 15), using the local OpenStreetMap walking network (data/walk-graph.bin). No network calls.
 */
import { open } from "./db.ts";
import { dijkstra, haversine, loadGraph, nearestNode, WALK_METERS_PER_MIN } from "./graph.ts";

const [latArg, lngArg, ...rest] = Bun.argv.slice(2);
const latitude = Number(latArg);
const longitude = Number(lngArg);
const maxIdx = rest.indexOf("--max");
const max = maxIdx >= 0 ? Number(rest[maxIdx + 1]) : 15;
if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !(max > 0)) {
  console.error("usage: bun src/walk.ts <lat> <lng> [--max minutes]");
  process.exit(2);
}

const limit = max * WALK_METERS_PER_MIN;
const [graph, db] = [await loadGraph(), open()];
const start = nearestNode(graph, latitude, longitude);
if (!start) {
  console.error(`no walkable path within ~400 m of ${latitude},${longitude} (outside the map area?)`);
  process.exit(1);
}
const dist = dijkstra(graph, start.node, limit);

// Straight-line prefilter: nothing farther than the walking limit can be reachable.
const dLat = limit / 111_320;
const dLng = limit / (111_320 * Math.cos((latitude * Math.PI) / 180));
const { rows } = await db.execute({
  sql: "SELECT slug, latitude, longitude FROM venues WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?",
  args: [latitude - dLat, latitude + dLat, longitude - dLng, longitude + dLng],
});

const reachable: { slug: string; meters: number }[] = [];
for (const r of rows) {
  const vLat = Number(r.latitude);
  const vLng = Number(r.longitude);
  const end = nearestNode(graph, vLat, vLng);
  if (!end) continue;
  // Path along the network plus the short hops from the exact points onto it.
  const meters = start.meters + (dist[end.node] as number) + end.meters;
  if (meters <= limit || haversine(latitude, longitude, vLat, vLng) < 60) {
    reachable.push({ slug: String(r.slug), meters: Number.isFinite(meters) ? meters : 0 });
  }
}

await db.batch(
  [
    "DELETE FROM walk_times",
    ...reachable.map((r) => ({
      sql: "INSERT INTO walk_times VALUES (?,?,?)",
      args: [r.slug, Math.round((r.meters / WALK_METERS_PER_MIN) * 10) / 10, Math.round(r.meters)],
    })),
    {
      sql: "INSERT OR REPLACE INTO meta VALUES ('walk_origin', ?)",
      args: [JSON.stringify({ latitude, longitude, maxMinutes: max, at: new Date().toISOString() })],
    },
  ],
  "write",
);
console.log(`walk_times: ${reachable.length} venues within ${max} min walk of ${latitude},${longitude}`);
