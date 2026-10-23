#!/usr/bin/env bun
/**
 * One-time: builds data/walk-graph.bin from an OpenStreetMap .osm.pbf extract.
 * Keeps walkable ways inside the bounding box (default Newcastle–Sydney–Wollongong) and the
 * connected pieces of the network big enough to matter.
 *
 *   bun run eatclub map [path/to/extract.osm.pbf]    (default data/osm/australia-latest.osm.pbf)
 */
import { createOSMStream } from "osm-pbf-parser-node";
import { encodeGraph, GRAPH_PATH, haversine } from "./graph.ts";
import { log } from "./util.ts";

const input = Bun.argv[2] ?? new URL("../../data/osm/australia-latest.osm.pbf", import.meta.url).pathname;
const [south, west, north, east] = (process.env.EATCLUB_MAP_BBOX ?? "-34.65,150.4,-32.6,152.0")
  .split(",")
  .map(Number) as [number, number, number, number];
/** Components smaller than this are islands (building interiors, private paths) that would trap a snap. */
const MIN_COMPONENT = 200;

const WALKABLE = new Set([
  "footway",
  "path",
  "pedestrian",
  "steps",
  "living_street",
  "residential",
  "service",
  "unclassified",
  "tertiary",
  "tertiary_link",
  "secondary",
  "secondary_link",
  "primary",
  "primary_link",
  "trunk",
  "trunk_link",
  "track",
  "cycleway",
  "corridor",
  "bridleway",
  "road",
  "crossing",
]);
const NO = new Set(["no", "private"]);
const YES = new Set(["yes", "designated", "permissive", "destination"]);

function walkable(tags: Record<string, string> | undefined): boolean {
  if (!tags?.highway || !WALKABLE.has(tags.highway)) return false;
  if (tags.foot && NO.has(tags.foot)) return false;
  if (tags.access && NO.has(tags.access) && !(tags.foot && YES.has(tags.foot))) return false;
  return tags.area !== "yes" || tags.highway === "pedestrian";
}

/** Growable typed array. */
class Grow<T extends Float64Array | Float32Array | Uint32Array> {
  len = 0;
  constructor(public arr: T) {}
  push(v: number) {
    if (this.len === this.arr.length) {
      const next = new (this.arr.constructor as new (n: number) => T)(this.arr.length * 2);
      next.set(this.arr);
      this.arr = next;
    }
    this.arr[this.len++] = v;
  }
  get view(): T {
    return this.arr.subarray(0, this.len) as T;
  }
}

const ids = new Grow(new Float64Array(1 << 20));
const lats = new Grow(new Float32Array(1 << 20));
const lngs = new Grow(new Float32Array(1 << 20));
const from = new Grow(new Uint32Array(1 << 20));
const to = new Grow(new Uint32Array(1 << 20));
let sorted = true;
let seen = 0;
let ways = 0;

const find = (id: number) => {
  const a = ids.arr;
  let lo = 0;
  let hi = ids.len - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = a[mid] as number;
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
};

log(`reading ${input} (bbox ${south},${west} → ${north},${east})`);
for await (const item of createOSMStream(input, {
  withTags: { node: false, way: ["highway", "foot", "access", "area"], relation: false },
})) {
  const it = item as {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    refs?: number[];
    tags?: Record<string, string>;
  };
  if (it.type === "node") {
    if (++seen % 20_000_000 === 0) log(`${seen / 1e6}M nodes read, ${ids.len} in bbox`);
    const lat = it.lat as number;
    const lon = it.lon as number;
    if (lat < south || lat > north || lon < west || lon > east) continue;
    if (ids.len && it.id < (ids.arr[ids.len - 1] as number)) sorted = false;
    ids.push(it.id);
    lats.push(lat);
    lngs.push(lon);
  } else if (it.type === "way") {
    if (!sorted) throw new Error("extract isn't sorted by node id (re-sort it with `osmium sort`)");
    if (!walkable(it.tags) || !it.refs) continue;
    let prev = -1;
    for (const ref of it.refs) {
      const cur = find(ref);
      if (cur >= 0 && prev >= 0 && cur !== prev) {
        from.push(prev);
        to.push(cur);
      }
      prev = cur;
    }
    ways++;
  }
}
log(`${ways} walkable ways, ${from.len} segments, ${ids.len} nodes in bbox`);

// Keep only nodes on walkable segments, then drop small disconnected pieces.
const N = ids.len;
const degree = new Uint32Array(N);
for (let i = 0; i < from.len; i++) {
  const a = from.arr[i] as number;
  const b = to.arr[i] as number;
  degree[a] = (degree[a] as number) + 1;
  degree[b] = (degree[b] as number) + 1;
}
const adjStart = new Uint32Array(N + 1);
for (let i = 0; i < N; i++) adjStart[i + 1] = (adjStart[i] as number) + (degree[i] as number);
const adj = new Uint32Array(adjStart[N] as number);
const fill = adjStart.slice(0, N);
for (let i = 0; i < from.len; i++) {
  const a = from.arr[i] as number;
  const b = to.arr[i] as number;
  const fa = fill[a] as number;
  const fb = fill[b] as number;
  adj[fa] = b;
  adj[fb] = a;
  fill[a] = fa + 1;
  fill[b] = fb + 1;
}

const component = new Int32Array(N).fill(-1);
const sizes: number[] = [];
const stack: number[] = [];
for (let s = 0; s < N; s++) {
  if (component[s] !== -1 || degree[s] === 0) continue;
  const c = sizes.length;
  let size = 0;
  component[s] = c;
  stack.push(s);
  while (stack.length) {
    const u = stack.pop() as number;
    size++;
    for (let e = adjStart[u] as number; e < (adjStart[u + 1] as number); e++) {
      const v = adj[e] as number;
      if (component[v] === -1) {
        component[v] = c;
        stack.push(v);
      }
    }
  }
  sizes.push(size);
}

const keep = new Int32Array(N).fill(-1);
let n = 0;
for (let i = 0; i < N; i++) {
  const c = component[i] as number;
  if (c >= 0 && (sizes[c] as number) >= MIN_COMPONENT) keep[i] = n++;
}

const lat = new Float32Array(n);
const lng = new Float32Array(n);
const offsets = new Uint32Array(n + 1);
for (let i = 0; i < N; i++) {
  const k = keep[i] as number;
  if (k < 0) continue;
  lat[k] = lats.arr[i] as number;
  lng[k] = lngs.arr[i] as number;
  offsets[k + 1] = degree[i] as number;
}
for (let k = 0; k < n; k++) offsets[k + 1] = (offsets[k + 1] as number) + (offsets[k] as number);
const m = offsets[n] as number;
const targets = new Uint32Array(m);
const meters = new Float32Array(m);
for (let i = 0; i < N; i++) {
  const k = keep[i] as number;
  if (k < 0) continue;
  let e = offsets[k] as number;
  for (let j = adjStart[i] as number; j < (adjStart[i + 1] as number); j++) {
    const t = keep[adj[j] as number] as number;
    targets[e] = t;
    meters[e] = haversine(
      lats.arr[i] as number,
      lngs.arr[i] as number,
      lats.arr[adj[j] as number] as number,
      lngs.arr[adj[j] as number] as number,
    );
    e++;
  }
}

await Bun.write(GRAPH_PATH, encodeGraph({ lat, lng, offsets, targets, meters }));
const big = sizes.filter((s) => s >= MIN_COMPONENT).length;
log(`wrote ${GRAPH_PATH}: ${n} nodes, ${m / 2} edges, ${big} components ≥ ${MIN_COMPONENT} nodes`);

console.log(JSON.stringify({ path: GRAPH_PATH, nodes: n, edges: m / 2, components: big }));
