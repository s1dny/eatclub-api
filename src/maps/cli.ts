import { parseArgs } from "node:util";

const help = `maps — build a KML file for Google Earth (earth.google.com → New → Import file to map project)
  bun run maps kml --in map.json --out map.kml

Input JSON:
  { "name": "Trip", "description": "optional HTML",
    "groups": [{
      "name": "Phuket · ≈$1,331 pp", "color": "#e6194b" (optional; a distinct colour is assigned otherwise),
      "places": [{ "id": "hkt", "name": "Phuket Airport", "lat": 8.11, "lng": 98.31,
                   "icon": "airport" | "hotel" | "food" | "hike" | "beach" | "pin",
                   "photo": "https://… (optional)", "details": { "Label": "value" },
                   "links": { "Book": "https://…" }, "html": "optional extra HTML" }],
      "drives": [{ "from": "hkt", "to": "hotel" }] }] }

Output follows Google Earth's own KML export (card template styles, gx:Carousel photos, Earth icons), so
descriptions and photos show in Earth's info card. Each group's pins and drive lines share its colour. Drives are OSRM (OpenStreetMap) road routes; their time and
distance are added to the destination place's details. Prints a JSON summary; failures exit non-zero.`;

type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  icon?: keyof typeof icons;
  photo?: string;
  details?: Record<string, string>;
  links?: Record<string, string>;
  html?: string;
};
type Group = { name: string; color?: string; places: Place[]; drives?: { from: string; to: string }[] };
type Input = { name: string; description?: string; groups: Group[] };

// Google Earth's own icon set (earth.google.com/earth/document/icon?id=N), tinted per group.
const icons = { airport: 2011, hotel: 2099, food: 2130, hike: 2071, beach: 2039, pin: 2000 } as const;
// Earth's info card only renders description and carousel when the style uses its card template (as in Earth's own KML export).
const CARD = "https://earth.google.com/balloon_components/base/1.0.26.0/card_template.kml#main";
const palette = [
  "#e6194b",
  "#3cb44b",
  "#4363d8",
  "#f58231",
  "#911eb4",
  "#42d4f4",
  "#f032e6",
  "#bfef45",
  "#ffe119",
  "#9a6324",
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = (s: string) => `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
/** #rrggbb → KML aabbggrr */
function kmlColor(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Colour must be #rrggbb: ${hex}`);
  return `ff${m[3]}${m[2]}${m[1]}`.toLowerCase();
}

async function drive(from: Place, to: Place) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url);
    const body = (await response.json().catch(() => ({}))) as any;
    const route = body.routes?.[0];
    if (response.ok && body.code === "Ok" && route)
      return {
        minutes: Math.round(route.duration / 60),
        km: Math.round(route.distance / 100) / 10,
        path: route.geometry.coordinates as [number, number][],
      };
    if (response.status !== 429 || attempt >= 3)
      throw new Error(`No drive ${from.name} → ${to.name}: OSRM ${response.status} ${body.message ?? body.code ?? ""}`);
    await Bun.sleep(2000 * (attempt + 1));
  }
}

/** Description in the simple HTML Earth itself exports (div, b, br, a). Photos go in the carousel, not here. */
function description(place: Place) {
  const rows = Object.entries(place.details ?? {}).map(([k, v]) => `<div><b>${esc(k)}:</b> ${esc(v)}</div>`);
  const links = Object.entries(place.links ?? {}).map(([k, v]) => `<a href="${esc(v)}">${esc(k)}</a>`);
  return [...rows, links.length ? `<div><br>${links.join(" · ")}</div>` : "", place.html ?? ""].join("");
}

function style(id: string, color: string, icon?: number) {
  const rgb = color.slice(1).toLowerCase();
  return (
    `<gx:CascadingStyle kml:id="${id}"><styleUrl>${CARD}</styleUrl><Style>` +
    (icon
      ? `<IconStyle><scale>1.2</scale><Icon><href>https://earth.google.com/earth/document/icon?color=${rgb}&amp;id=${icon}&amp;scale=4</href></Icon><hotSpot x="64" y="128" xunits="pixels" yunits="insetPixels"/></IconStyle>`
      : "") +
    `<LabelStyle/><LineStyle><color>${kmlColor(color)}</color><width>5</width></LineStyle></Style></gx:CascadingStyle>`
  );
}

async function kml(input: Input) {
  if (!input?.name || !Array.isArray(input.groups)) throw new Error("Input needs name and groups[]");
  const styles: string[] = [];
  const folders: string[] = [];
  const summary = [];
  for (const [g, group] of input.groups.entries()) {
    const color = group.color ?? palette[g % palette.length]!;
    kmlColor(color); // validate
    const byId = new Map(group.places.map((p) => [p.id, p]));
    if (byId.size !== group.places.length) throw new Error(`Duplicate place id in ${group.name}`);
    const lines: string[] = [];
    const drives = [];
    for (const { from, to } of group.drives ?? []) {
      const a = byId.get(from),
        b = byId.get(to);
      if (!a || !b) throw new Error(`Unknown drive place in ${group.name}: ${from} → ${to}`);
      const d = await drive(a, b);
      b.details = { ...b.details, [`Drive from ${a.name}`]: `${d.minutes} min · ${d.km} km` };
      drives.push({ from, to, minutes: d.minutes, km: d.km });
      lines.push(
        `<Placemark><name>${esc(`${a.name} → ${b.name}: ${d.minutes} min`)}</name><styleUrl>#g${g}_line</styleUrl>` +
          `<description>${cdata(`${d.minutes} min · ${d.km} km by car (OpenStreetMap estimate, no traffic)`)}</description>` +
          `<LineString><tessellate>1</tessellate><coordinates>${d.path.map(([lo, la]) => `${lo},${la},0`).join(" ")}</coordinates></LineString></Placemark>`,
      );
      await Bun.sleep(1100); // OSRM demo server: about one request per second
    }
    styles.push(style(`g${g}_line`, color));
    const pins = group.places.map((p, i) => {
      const icon = icons[p.icon ?? "pin"];
      if (!icon) throw new Error(`Unknown icon ${p.icon}`);
      const id = `g${g}_${icon}`;
      if (!styles.some((s) => s.includes(`kml:id="${id}"`))) styles.push(style(id, color, icon));
      const carousel = p.photo
        ? `<gx:Carousel><gx:Image kml:id="img_${g}_${i}"><gx:imageUrl>${esc(p.photo)}</gx:imageUrl></gx:Image></gx:Carousel>`
        : "";
      return `<Placemark><name>${esc(p.name)}</name><description>${cdata(description(p))}</description><styleUrl>#${id}</styleUrl>${carousel}<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`;
    });
    folders.push(`<Folder><name>${esc(group.name)}</name>${pins.join("")}${lines.join("")}</Folder>`);
    summary.push({ group: group.name, color, places: group.places.length, drives });
  }
  const doc =
    `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2" xmlns:kml="http://www.opengis.net/kml/2.2"><Document><name>${esc(input.name)}</name>` +
    (input.description ? `<description>${cdata(input.description)}</description>` : "") +
    `${styles.join("")}${folders.join("")}</Document></kml>\n`;
  return { doc, summary };
}

const [command, ...rest] = Bun.argv.slice(2);
if (!command || command === "help" || command === "--help") {
  console.log(help);
} else if (command === "kml") {
  const { values } = parseArgs({
    args: rest,
    options: { in: { type: "string" }, out: { type: "string" } },
    strict: true,
  });
  if (!values.in || !values.out) throw new Error(help);
  const { doc, summary } = await kml(await Bun.file(values.in).json());
  await Bun.write(values.out, doc);
  console.log(JSON.stringify({ out: values.out, bytes: doc.length, groups: summary }, null, 2));
} else {
  throw new Error(help);
}
