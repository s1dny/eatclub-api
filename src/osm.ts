import { z } from "zod";

/**
 * Walking times over the OpenStreetMap street network, via an OSRM `table` service.
 * Defaults to FOSSGIS's public foot-routing server (fair-use; self-host for heavy use).
 */
const OSRM = process.env.OSRM_FOOT_URL ?? "https://routing.openstreetmap.de/routed-foot";
/** Public OSRM servers cap table size; stay well under it. */
const BATCH = 90;

const Table = z.object({
  code: z.string(),
  message: z.string().optional(),
  durations: z.array(z.array(z.number().nullable())),
  distances: z.array(z.array(z.number().nullable())),
});

export type Point = { latitude: number; longitude: number };
export type Walk = { seconds: number; meters: number } | null;

/** Walking time and route distance from `origin` to each destination, in input order. */
export async function walkingTimes(origin: Point, destinations: Point[]): Promise<Walk[]> {
  const out: Walk[] = [];
  for (let i = 0; i < destinations.length; i += BATCH) {
    const batch = destinations.slice(i, i + BATCH);
    const coords = [origin, ...batch].map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(";");
    const res = await fetch(`${OSRM}/table/v1/foot/${coords}?sources=0&annotations=duration,distance`, {
      headers: { "user-agent": "eatclub-api/0.1" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const table = Table.parse(await res.json());
    if (table.code !== "Ok") throw new Error(`OSRM ${table.code}: ${table.message ?? ""}`);
    const durations = table.durations[0] ?? [];
    const distances = table.distances[0] ?? [];
    batch.forEach((_, j) => {
      const seconds = durations[j + 1];
      const meters = distances[j + 1];
      out.push(seconds != null && meters != null ? { seconds, meters } : null);
    });
  }
  return out;
}
