import { cp, lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { key } from "./google.ts";

export const help = `  bun run travel map init <folder>     # copy the satellite map template and install it; then edit <folder>/places.json
  bun run travel map build <folder> [--title "Langkawi vs Krabi"] [--out <file.html>]   # single self-contained HTML (default <folder>/map.html)
  bun run travel map check <file.html>  # open it from disk in Chromium: pins, every route, a hotel's place card; screenshot beside it`;

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
  return { out, bytes: html.length, next: `bun run travel map check ${out}` };
}

/**
 * Opens the delivered file from disk in a visible Chromium (headless can't render Google's vector map),
 * waits for every route, opens the first hotel's place card and saves a screenshot next to the file.
 */
async function check(file: string) {
  const path = resolve(file);
  if (!(await Bun.file(path).exists())) throw new Error(`No file ${path}`);
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`file://${path}`);
    type Status = {
      markers: number;
      tiles: boolean;
      routes: { from: string; to: string; minutes?: number; error?: string }[];
      card: null | { placeId: string; loaded?: boolean; error?: string };
    };
    // Page code is passed as strings: this file is type-checked without DOM types.
    const status = () => page.evaluate("window.tripMap") as Promise<Status | undefined>;
    const until = (done: string, timeout: number) => page.waitForFunction(done, null, { timeout }).catch(() => {});
    await until(
      "window.tripMap?.tiles && tripMap.markers > 0 && tripMap.routes.every(r => r.minutes !== undefined || r.error)",
      30000,
    );
    // Open the card through the marker's own handler: pins overlap when zoomed out, so a pointer click can hit a neighbour.
    const hotel = (await page.evaluate(`(() => {
      const m = document.querySelector("gmp-advanced-marker[data-kind=hotel]") ?? document.querySelector("gmp-advanced-marker");
      m?.dispatchEvent(new Event("gmp-click"));
      return m?.title ?? null;
    })()`)) as string | null;
    await until("tripMap.card?.loaded || tripMap.card?.error", 20000);
    await page.waitForTimeout(1500); // let the card's photos paint before the screenshot
    const s = await status();
    const screenshot = join(dirname(path), "map-check.png");
    await page.screenshot({ path: screenshot });
    const failures = [
      ...(s ? [] : ["map script did not start"]),
      ...(s?.markers ? [] : ["no markers rendered"]),
      ...(s?.tiles ? [] : ["map tiles did not load"]),
      ...(s?.routes ?? [])
        .filter((r) => r.minutes === undefined)
        .map((r) => `route ${r.from} → ${r.to}: ${r.error ?? "timed out"}`),
      ...(s?.card?.loaded ? [] : [`place card for ${hotel}: ${s?.card?.error ?? "did not load"}`]),
      ...errors,
    ];
    const result = {
      file: path,
      markers: s?.markers ?? 0,
      routes: s?.routes ?? [],
      card: { place: hotel, loaded: Boolean(s?.card?.loaded) },
      screenshot,
      ok: !failures.length,
      failures,
    };
    if (failures.length) throw new Error(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await browser.close();
  }
}

export async function main([command, target, ...args]: string[]) {
  if (!target) throw new Error(help);
  if (command === "init") return init(target);
  if (command === "build") return build(target, args);
  if (command === "check") return check(target);
  throw new Error(help);
}
