const commands = ["sql", "walk", "live", "sync", "map"] as const;
const help = `eatclub — EatClub API data
  bun run eatclub sql "SELECT name, slug FROM venues LIMIT 5"
  bun run eatclub walk -33.8688 151.2093 --max 10
  bun run eatclub live bar-bruno
  bun run eatclub sync
  bun run eatclub map [path/to/extract.osm.pbf]

Data commands return JSON on stdout. Progress and errors go to stderr.
Read-only SQL also accepts queries on stdin. Live refresh requires venue slugs.
Sync rebuilds the database; map builds the local walking graph.
`;
const [command, ...args] = Bun.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  console.log(help);
} else if (!(commands as readonly string[]).includes(command)) {
  console.error(`Unknown command: ${command}\n${help}`);
  process.exitCode = 2;
} else if (args.includes("--help")) {
  console.log(help);
} else {
  const child = Bun.spawn([process.execPath, new URL(`./${command}.ts`, import.meta.url).pathname, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
}
