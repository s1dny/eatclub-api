/**
 * Walking network built from an OpenStreetMap extract, stored as one flat binary file and searched
 * in-process with Dijkstra. Loading takes ~100 ms; a 30-minute search a few ms.
 *
 * File layout (little-endian, all 4-byte fields):
 *   u32 nodeCount, u32 edgeCount,
 *   f32 lat[nodeCount], f32 lng[nodeCount],
 *   u32 offsets[nodeCount + 1], u32 targets[edgeCount], f32 meters[edgeCount]
 * Edges are stored in both directions (CSR adjacency).
 */
import { resolve } from "node:path";

export const GRAPH_PATH = resolve(
  process.env.EATCLUB_GRAPH ?? new URL("../data/walk-graph.bin", import.meta.url).pathname,
);

/** Typical urban walking pace, 4.8 km/h. */
export const WALK_METERS_PER_MIN = 80;

export type Graph = {
  n: number;
  lat: Float32Array;
  lng: Float32Array;
  offsets: Uint32Array;
  targets: Uint32Array;
  meters: Float32Array;
  grid: Map<number, number[]>;
};

const CELL = 0.002; // ~200 m grid cells for nearest-node lookup
const cellKey = (lat: number, lng: number) => Math.floor(lat / CELL) * 1_000_003 + Math.floor(lng / CELL);

export function encodeGraph(g: Omit<Graph, "grid" | "n">): Uint8Array {
  const n = g.lat.length;
  const m = g.targets.length;
  const buf = new ArrayBuffer(8 + 4 * (n * 2 + n + 1 + m * 2));
  const head = new Uint32Array(buf, 0, 2);
  head[0] = n;
  head[1] = m;
  let off = 8;
  for (const arr of [g.lat, g.lng, g.offsets, g.targets, g.meters]) {
    new Uint8Array(buf, off, arr.byteLength).set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    off += arr.byteLength;
  }
  return new Uint8Array(buf);
}

export async function loadGraph(path = GRAPH_PATH): Promise<Graph> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`no walking network at ${path}; run \`bun run map\``);
  const buf = await file.arrayBuffer();
  const [n = 0, m = 0] = new Uint32Array(buf, 0, 2);
  let off = 8;
  const take = <T>(Ctor: new (b: ArrayBuffer, o: number, l: number) => T, len: number) => {
    const arr = new Ctor(buf, off, len);
    off += len * 4;
    return arr;
  };
  const lat = take(Float32Array, n);
  const lng = take(Float32Array, n);
  const offsets = take(Uint32Array, n + 1);
  const targets = take(Uint32Array, m);
  const meters = take(Float32Array, m);
  const grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const k = cellKey(lat[i] as number, lng[i] as number);
    const cell = grid.get(k);
    if (cell) cell.push(i);
    else grid.set(k, [i]);
  }
  return { n, lat, lng, offsets, targets, meters, grid };
}

export function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Nearest network node within ~400 m, and the straight-line distance to it. */
export function nearestNode(g: Graph, lat: number, lng: number): { node: number; meters: number } | null {
  const ci = Math.floor(lat / CELL);
  const cj = Math.floor(lng / CELL);
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let di = -2; di <= 2; di++) {
    for (let dj = -2; dj <= 2; dj++) {
      for (const i of g.grid.get((ci + di) * 1_000_003 + cj + dj) ?? []) {
        const d = haversine(lat, lng, g.lat[i] as number, g.lng[i] as number);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best < 0 ? null : { node: best, meters: bestD };
}

/** Shortest walking distance (m) from `source` to every node within `limit` m. Infinity = unreached. */
export function dijkstra(g: Graph, source: number, limit: number): Float64Array {
  // Float64: the heap holds doubles, so Float32 rounding would make every popped entry look stale.
  const dist = new Float64Array(g.n).fill(Number.POSITIVE_INFINITY);
  dist[source] = 0;
  // Binary min-heap of (distance, node) in parallel arrays.
  const hd: number[] = [0];
  const hn: number[] = [source];
  while (hd.length) {
    const d = hd[0] as number;
    const u = hn[0] as number;
    const lastD = hd.pop() as number;
    const lastN = hn.pop() as number;
    if (hd.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        let sd = lastD;
        if (l < hd.length && (hd[l] as number) < sd) {
          s = l;
          sd = hd[l] as number;
        }
        if (r < hd.length && (hd[r] as number) < sd) s = r;
        if (s === i) break;
        hd[i] = hd[s] as number;
        hn[i] = hn[s] as number;
        i = s;
      }
      hd[i] = lastD;
      hn[i] = lastN;
    }
    if (d > (dist[u] as number)) continue;
    for (let e = g.offsets[u] as number; e < (g.offsets[u + 1] as number); e++) {
      const v = g.targets[e] as number;
      const nd = d + (g.meters[e] as number);
      if (nd < (dist[v] as number) && nd <= limit) {
        dist[v] = nd;
        let i = hd.length;
        hd.push(nd);
        hn.push(v);
        while (i > 0) {
          const p = (i - 1) >> 1;
          if ((hd[p] as number) <= nd) break;
          hd[i] = hd[p] as number;
          hn[i] = hn[p] as number;
          i = p;
        }
        hd[i] = nd;
        hn[i] = v;
      }
    }
  }
  return dist;
}
