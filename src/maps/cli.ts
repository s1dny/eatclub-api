import { cp, lstat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const help = "bun run maps init <folder> — create a tiny Google satellite map + Bun/TypeScript app";
const [command, directory] = Bun.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  console.log(help);
} else if (command === "init" && directory) {
  const target = resolve(directory);
  if (await lstat(target).catch(() => null)) throw new Error(`Destination already exists: ${target}`);
  const template = new URL("../../skills/google-maps/assets/starter/", import.meta.url).pathname;
  await cp(template, target, {
    recursive: true,
    filter: (path) => !path.split("/").some((part) => part === "node_modules" || part.startsWith(".env")),
  });
  const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
  await writeFile(`${target}/.env.local`, `GOOGLE_MAPS_API_KEY=${JSON.stringify(key)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ path: target, keyConfigured: Boolean(key), next: ["bun install", "bun run dev"] }));
} else {
  throw new Error(help);
}
