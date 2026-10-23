#!/usr/bin/env bun
/** Read-only SQL against the EatClub database. Prints TSV (or JSON with --json). */
import { open } from "./db.ts";

const args = Bun.argv.slice(2);
const json = args.includes("--json");
const sql = args.filter((a) => a !== "--json").join(" ") || (await Bun.stdin.text());
if (!sql.trim()) {
  console.error('usage: bun run sql [--json] "SELECT …"   (or pipe SQL on stdin)');
  process.exit(2);
}

const db = open();
await db.execute("PRAGMA query_only = ON");
try {
  const rs = await db.execute(sql);
  if (json) {
    console.log(JSON.stringify(rs.rows));
  } else {
    const cell = (v: unknown) => (v == null ? "" : String(v).replace(/[\t\n]+/g, " "));
    console.log(rs.columns.join("\t"));
    for (const row of rs.rows) console.log(rs.columns.map((_, i) => cell(row[i])).join("\t"));
    console.error(`(${rs.rows.length} rows)`);
  }
} catch (err) {
  console.error(String(err));
  process.exit(1);
}
