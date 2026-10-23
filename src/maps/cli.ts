import { cp, lstat } from "node:fs/promises";
import { resolve } from "node:path";

const help = "bun run maps init <folder> — create a barebones Esri satellite map + Bun/TypeScript app";
const [command, directory] = Bun.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  console.log(help);
} else if (command === "init" && directory) {
  const target = resolve(directory);
  if (await lstat(target).catch(() => null)) throw new Error(`Destination already exists: ${target}`);
  const template = new URL("../../skills/maps/assets/starter/", import.meta.url).pathname;
  await cp(template, target, {
    recursive: true,
    filter: (path) => !path.split("/").some((part) => part === "node_modules"),
  });
  console.log(JSON.stringify({ path: target, next: ["bun install", "bun run dev"] }));
} else {
  throw new Error(help);
}
