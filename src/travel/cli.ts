import * as flights from "./flights/cli.ts";
import * as hotels from "./hotels.ts";
import * as map from "./map.ts";
import * as places from "./places.ts";

const help = `travel — flights, hotels, places and maps for trip research (JSON on stdout)
  bun run travel flights help                 # Google Flights: grid, search, booking, autocomplete, …
${hotels.help}
${places.help}
${map.help}`;

const [area, ...args] = Bun.argv.slice(2);
try {
  if (!area || area === "help" || area === "--help") console.log(help);
  else if (area === "flights")
    await flights.main(args); // prints its own output
  else {
    const mod = ({ hotels, places, map } as Record<string, { main(a: string[]): Promise<unknown> }>)[area];
    if (!mod) throw new Error(help);
    console.log(JSON.stringify(await mod.main(args), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
