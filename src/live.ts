#!/usr/bin/env bun
/**
 * Refreshes today's live deal state from the app API: quantity left, terms, party size, and the
 * items each venue excludes from its discount today. ~1 min for NSW. Run before "right now" questions.
 */
import type { Client, InStatement } from "@libsql/client";
import { excludedItems, liveDeal } from "./app.ts";
import { open } from "./db.ts";
import { localDate, localWeekday, log, mapLimit } from "./util.ts";

const bool = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : null);

export async function refreshLive(db: Client): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const { rows: zones } = await db.execute("SELECT DISTINCT timezone FROM venues");
  const statements: InStatement[] = ["DELETE FROM live_deals", "DELETE FROM discount_exclusions"];
  let deals = 0;
  let venues = 0;

  for (const { timezone } of zones) {
    const tz = String(timezone);
    const date = localDate(tz);
    // Today's deals: the website's weekly schedule plus the app's list for today, which also
    // carries one-off deals that never appear in the schedule.
    const { rows } = await db.execute({
      sql: `SELECT d.deal_id, d.slug, v.id AS venue_id, v.excluded_item_count FROM deals d JOIN venues v USING (slug)
              WHERE v.timezone = ?1 AND d.day = ?2
            UNION
            SELECT json_extract(r.value, '$.dealId'), v.slug, v.id, v.excluded_item_count
              FROM venues v, json_each(json_extract(v.app_json, '$.recentDeals')) r
              WHERE v.timezone = ?1 AND json_valid(json_extract(v.app_json, '$.recentDeals'))`,
      args: [tz, localWeekday(tz)],
    });

    await mapLimit(rows, 12, async (r) => {
      const d = await liveDeal(String(r.deal_id)).catch(() => null);
      if (!d) return;
      deals++;
      statements.push({
        sql: `INSERT OR REPLACE INTO live_deals VALUES (${Array(21).fill("?").join(",")})`,
        args: [
          d.objectId,
          String(r.slug),
          date,
          d.discount ?? null,
          d.startTime ?? null,
          d.endTime ?? null,
          d.displayedQtyLeft ?? null,
          d.recurringQty ?? null,
          d.maxPartySize ?? null,
          d.subheading?.trim() || null,
          d.terms?.trim() || null,
          d.drinksOnlyTerms?.trim() || null,
          d.additionalImportantInfo?.length
            ? JSON.stringify(d.additionalImportantInfo.map(({ heading, text }) => ({ heading, text })))
            : null,
          bool(d.newCustOnly),
          bool(d.lightning),
          bool(d.dineInOnly),
          bool(d.takeawayOnly),
          bool(d.sellsOutEarly),
          d.lastBookingDate ?? null,
          fetchedAt,
          JSON.stringify(d),
        ],
      });
    });

    // Exclusions only exist where the app reports some (or where we have no app data to say).
    const withDeals = [
      ...new Map(rows.filter((r) => r.excluded_item_count !== 0).map((r) => [String(r.slug), r])).values(),
    ];
    await mapLimit(withDeals, 12, async (r) => {
      const raw = await excludedItems(String(r.venue_id), date).catch(() => null);
      const parsed = raw ? (JSON.parse(raw) as { categories?: Record<string, unknown>[] }) : null;
      if (!parsed?.categories?.length) return;
      venues++;
      for (const c of parsed.categories) {
        statements.push({
          sql: "INSERT INTO discount_exclusions VALUES (?,?,?,?,?,?,?)",
          args: [
            String(r.slug),
            date,
            (c.name as string) ?? null,
            (c.description as string)?.trim() || null,
            (c.applicableDays as string) ?? null,
            Array.isArray(c.categories) && c.categories.length ? JSON.stringify(c.categories) : null,
            JSON.stringify(c),
          ],
        });
      }
    });
  }

  statements.push({ sql: "INSERT OR REPLACE INTO meta VALUES ('live_fetched_at', ?)", args: [fetchedAt] });
  await db.batch(statements, "write");
  log(`live: ${deals} deals today, exclusions at ${venues} venues`);
}

if (import.meta.main) {
  const db = open();
  await refreshLive(db);
  db.close();
}
