#!/usr/bin/env bun
/** Read-only SQL against the EatClub database, returned as JSON rows. */
import { open } from "./db.ts";

const sql = Bun.argv.slice(2).join(" ") || (await Bun.stdin.text());
if (!sql.trim()) {
  console.error('usage: bun run eatclub sql "SELECT …"   (or pipe SQL on stdin)');
  process.exit(2);
}

const db = open();
try {
  await db.execute("PRAGMA query_only = ON");
  const result = await db.execute(sql);
  console.log(JSON.stringify(result.rows));
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
} finally {
  db.close();
}
