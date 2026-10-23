import { cp, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { key } from "./google.ts";

export const help = `  bun run travel map init <folder>     # copy the satellite map template and install it; then edit <folder>/places.json
  bun run travel map build <folder> [--title "Langkawi vs Krabi"] [--out <file.html>]   # single self-contained HTML (default <folder>/map.html)`;

const sh = async (cmd: string[], cwd: string) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
};

async function init(folder: string) {
  const target = resolve(folder);
  if (await lstat(target).catch(() => null)) throw new Error(`Destination already exists: ${target}`);
  const template = new URL("../../skills/travel/assets/template/", import.meta.url).pathname;
  await cp(template, target, { recursive: true, filter: (p) => !p.includes("node_modules") });
  await sh(["bun", "install"], target);
  return { path: target, edit: join(target, "places.json"), next: `bun run travel map build ${target}` };
}

/** Bundles map.ts with places.json and the browser Maps key into one HTML file that opens straight from disk. */
async function build(folder: string, args: string[]) {
  const { values } = parseArgs({ args, options: { title: { type: "string" }, out: { type: "string" } }, strict: true });
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set (repository .env)");
  const dir = resolve(folder);
  if (!(await Bun.file(join(dir, "node_modules/@googlemaps/js-api-loader/package.json")).exists()))
    await sh(["bun", "install"], dir);
  const bundle = await Bun.build({
    entrypoints: [join(dir, "map.ts")],
    target: "browser",
    minify: true,
    define: { "process.env.GOOGLE_MAPS_API_KEY": JSON.stringify(key) },
  });
  if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
  const js = (await bundle.outputs[0]!.text()).replaceAll("</script", "<\\/script");
  let html = await Bun.file(join(dir, "index.html")).text();
  const tag = '<script type="module" src="./map.ts"></script>';
  if (!html.includes(tag)) throw new Error(`index.html must load the map with ${tag}`);
  html = html.replace(tag, () => `<script type="module">\n${js}\n</script>`);
  if (values.title) html = html.replace(/<title>.*?<\/title>/, () => `<title>${Bun.escapeHTML(values.title!)}</title>`);
  const out = resolve(values.out ?? join(dir, "map.html"));
  await Bun.write(out, html);
  return { out, bytes: html.length };
}

export async function main([command, target, ...args]: string[]) {
  if (!target) throw new Error(help);
  if (command === "init") return init(target);
  if (command === "build") return build(target, args);
  throw new Error(help);
}
