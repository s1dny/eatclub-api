import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DB_PATH } from "../src/eatclub/db.ts";

// Runs the CLIs the agent uses against the synced DB (`bun run eatclub sync` first) and live OSM routing.
const root = new URL("..", import.meta.url).pathname;
const SYDNEY_CBD = ["-33.8688", "151.2093"];

async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

const sql = async (query: string) => {
  const r = await run("run", "eatclub", "sql", query);
  expect(r.code).toBe(0);
  return JSON.parse(r.out) as Record<string, unknown>[];
};

describe("eatclub db", () => {
  beforeAll(() => {
    if (!existsSync(DB_PATH)) throw new Error(`no database at ${DB_PATH}; run \`bun run eatclub sync\``);
  });

  test("is populated", async () => {
    const [counts] = await sql(`SELECT (SELECT count(*) FROM venues) v, (SELECT count(*) FROM deals) d,
      (SELECT count(*) FROM menu_items) m, (SELECT count(*) FROM regions) r`);
    expect(Number(counts?.v)).toBeGreaterThan(2000);
    expect(Number(counts?.d)).toBeGreaterThan(5000);
    expect(Number(counts?.m)).toBeGreaterThan(50000);
    expect(Number(counts?.r)).toBe(3);
  });

  test("walk + full-text menu search finds beef or lamb nearby", async () => {
    const started = performance.now();
    const walk = await run("run", "eatclub", "walk", ...SYDNEY_CBD, "--max", "10");
    expect(walk.code).toBe(0);
    // Routing is local: a whole walk query, process start included, stays well under 2 s.
    expect(performance.now() - started).toBeLessThan(2000);
    const data = JSON.parse(walk.out);
    expect(data.maxMinutes).toBe(10);
    expect(data.count).toBe(data.venues.length);
    expect(data.count).toBeGreaterThan(0);
    const rows = await sql(`SELECT DISTINCT v.name, w.minutes, m.category, m.title, m.description
      FROM menu_fts f JOIN menu_items m ON m.id = f.rowid
      JOIN walk_times w ON w.slug = m.slug JOIN venues v ON v.slug = m.slug
      WHERE menu_fts MATCH 'beef OR lamb' ORDER BY w.minutes`);
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(Number(r.minutes)).toBeLessThanOrEqual(10);
      expect(`${r.category} ${r.title} ${r.description}`.toLowerCase()).toMatch(/beef|lamb/);
    }
  });

  test("walk times grow with distance and stay realistic", async () => {
    await run("run", "eatclub", "walk", "-33.8834", "151.2005", "--max", "30");
    const [r] = await sql(`WITH o(lat,lng) AS (VALUES(-33.8834,151.2005)),
      r AS (SELECT w.minutes, w.meters / (6371000*acos(min(1, sin(radians(o.lat))*sin(radians(v.latitude))
        + cos(radians(o.lat))*cos(radians(v.latitude))*cos(radians(v.longitude-o.lng))))) ratio
        FROM walk_times w JOIN venues v USING (slug), o)
      SELECT count(*) n, max(minutes) maxmin, avg(ratio) avg FROM r WHERE ratio < 100`);
    expect(Number(r?.n)).toBeGreaterThan(200);
    expect(Number(r?.maxmin)).toBeLessThanOrEqual(30);
    // Street routes are longer than straight lines, but not wildly.
    expect(Number(r?.avg)).toBeWithin(1.1, 1.8);
  });

  test("live refreshes just the named venues", async () => {
    const before = await sql("SELECT max(fetched_at) t FROM live_deals WHERE slug <> 'bar-bruno'");
    const r = await run("run", "eatclub", "live", "bar-bruno");
    expect(r.code).toBe(0);
    const after = await sql("SELECT max(fetched_at) t FROM live_deals WHERE slug <> 'bar-bruno'");
    expect(after[0]?.t).toBe(before[0]?.t);
  });

  test("venues carry website, app and review data", async () => {
    const [v] = await sql(`SELECT count(*) n, count(bio) bio, count(dining_type) dining, count(food_rating) food,
      (SELECT count(*) FROM reviews) reviews, (SELECT count(*) FROM menu_items WHERE options IS NOT NULL) options
      FROM venues`);
    // Only some venues have bios on EatClub; the rest are common.
    expect(Number(v?.bio)).toBeGreaterThan(100);
    for (const k of ["dining", "food", "reviews", "options"]) expect(Number(v?.[k])).toBeGreaterThan(500);
  });

  test("today's deals have live availability", async () => {
    const [l] = await sql(`SELECT count(*) n, count(qty_left) qty, count(subheading) sub,
      (SELECT count(*) FROM deals d JOIN live_deals USING (deal_id)) joined FROM live_deals`);
    expect(Number(l?.n)).toBeGreaterThan(500);
    expect(Number(l?.qty)).toBe(Number(l?.n));
    expect(Number(l?.joined)).toBeGreaterThan(0);
  });

  test("a venue's weekly deal days are ISO weekdays", async () => {
    const deals = await sql("SELECT day FROM deals");
    for (const d of deals) expect(Number(d.day)).toBeWithin(1, 8);
  });

  test("sql is read-only", async () => {
    const r = await run("run", "eatclub", "sql", "DELETE FROM venues");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/readonly|read-only|query_only/i);
  });
});

describe("flights grid", () => {
  test("returns a full live date grid per destination", async () => {
    const out = `/tmp/flights-e2e-${Date.now()}`;
    const r = await run(
      "run",
      "flights",
      "grid",
      "--origin",
      "SYD",
      "--destination",
      "DPS,HKT",
      "--start",
      "2026-12-01",
      "--end",
      "2026-12-10",
      "--min-days",
      "6",
      "--max-days",
      "8",
      "--out",
      out,
    );
    expect(r.code).toBe(0);
    const { grids } = JSON.parse(r.out) as {
      grids: { query: { destination: string }; complete: boolean; cells: { price: number }[] }[];
    };
    expect(grids.map((g) => g.query.destination)).toEqual(["DPS", "HKT"]);
    for (const g of grids) {
      expect(g.complete).toBe(true);
      expect(g.cells.length).toBeGreaterThan(20);
      expect(g.cells.every((c) => c.price > 0)).toBe(true);
    }
  });
});

describe("maps kml", () => {
  test("builds colour-coded pins and a real drive", async () => {
    const dir = `/tmp/maps-e2e-${Date.now()}`;
    await Bun.write(
      `${dir}/map.json`,
      JSON.stringify({
        name: "Test",
        groups: [
          {
            name: "Sydney",
            color: "#ff0000",
            places: [
              { id: "a", name: "Sydney Airport", lat: -33.9399, lng: 151.1753, icon: "airport" },
              {
                id: "b",
                name: "Bondi",
                lat: -33.8915,
                lng: 151.2767,
                icon: "hotel",
                photo: "https://example.com/p.jpg",
              },
            ],
            drives: [{ from: "a", to: "b" }],
          },
        ],
      }),
    );
    const r = await run("run", "maps", "kml", "--in", `${dir}/map.json`, "--out", `${dir}/map.kml`);
    expect(r.code).toBe(0);
    const { groups } = JSON.parse(r.out);
    expect(groups[0].drives[0].minutes).toBeGreaterThan(5);
    const kml = await Bun.file(`${dir}/map.kml`).text();
    expect(kml).toContain("icon?color=ff0000&amp;id=2011");
    expect(kml).toContain("card_template.kml#main");
    expect(kml).toContain("<gx:imageUrl>https://example.com/p.jpg</gx:imageUrl>");
    expect(kml).toContain("<LineString>");
  });
});
