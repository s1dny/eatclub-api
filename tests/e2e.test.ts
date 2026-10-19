import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { DB_PATH } from "../src/db.ts";

// Runs the CLIs the agent uses against the synced DB (`bun run sync` first) and live OSM routing.
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
  const r = await run("src/sql.ts", "--json", query);
  expect(r.code).toBe(0);
  return JSON.parse(r.out) as Record<string, unknown>[];
};

describe("eatclub db", () => {
  beforeAll(() => {
    if (!existsSync(DB_PATH)) throw new Error(`no database at ${DB_PATH}; run \`bun run sync\``);
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
    const walk = await run("src/walk.ts", ...SYDNEY_CBD, "--max", "10");
    expect(walk.code).toBe(0);
    expect(walk.out).toMatch(/walk_times: \d+ venues within 10 min/);
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
    const r = await run("src/sql.ts", "DELETE FROM venues");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/readonly|read-only|query_only/i);
  });
});
