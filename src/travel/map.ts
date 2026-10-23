import { cp, lstat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { key } from "./google.ts";

export const help = `  bun run travel map init <folder>     # satellite map site: Google place cards + drive routes (edit places.json; bun install && bun run dev)`;

export async function main([command, folder]: string[]) {
  if (command !== "init" || !folder) throw new Error(help);
  const target = resolve(folder);
  if (await lstat(target).catch(() => null)) throw new Error(`Destination already exists: ${target}`);
  const template = new URL("../../skills/travel/assets/template/", import.meta.url).pathname;
  await cp(template, target, { recursive: true, filter: (p) => !p.includes("node_modules") });
  await writeFile(`${target}/.env.local`, `GOOGLE_MAPS_API_KEY=${JSON.stringify(key)}\n`, { mode: 0o600 });
  return {
    path: target,
    keyConfigured: Boolean(key),
    next: ["bun install", "bun run dev"],
    url: "http://localhost:3000",
  };
}
