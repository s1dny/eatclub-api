/// <reference types="google.maps" />
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import groups from "./places.json";

// places.json: [{ name, color?, places: [{ kind, name, placeId, lat, lng }], routes?: [[fromIndex, toIndex]] }]
type Group = {
  name: string;
  color?: string;
  places: { kind: string; name: string; placeId: string; lat: number; lng: number }[];
  routes?: number[][];
};

const colors = ["#00acc1", "#fb8c00", "#e53935", "#43a047", "#1e88e5", "#8e24aa"];
const glyphs: Record<string, string> = {
  airport: "✈",
  hotel: "🏨",
  beach: "🏖",
  hike: "🥾",
  sight: "⛰",
  market: "🛍",
  food: "🍜",
  cafe: "☕",
  bar: "🍹",
};
const card = document.getElementById("card")!;
const legend = document.getElementById("legend")!;
// Replaced at build time by `travel map build`.
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) throw new Error("No Maps key; build with `bun run travel map build <folder>`.");
setOptions({ key, v: "weekly" });
const [{ Map, Polyline }, { AdvancedMarkerElement, PinElement }, , { Route }, { LatLngBounds }] = await Promise.all([
  importLibrary("maps"),
  importLibrary("marker"),
  importLibrary("places"), // registers <gmp-place-details>
  importLibrary("routes"),
  importLibrary("core"),
]);

const map = new Map(document.getElementById("map")!, {
  mapId: "DEMO_MAP_ID",
  mapTypeId: "hybrid",
  streetViewControl: false,
});
const all = new LatLngBounds();

/** Google's own place card (Places UI Kit). Must be built with createElement; innerHTML on the container doesn't load. */
function showCard(placeId: string) {
  card.classList.add("open");
  const details = document.createElement("gmp-place-details");
  details.addEventListener("gmp-error", (e) => console.error("place card", placeId, e));
  details.innerHTML = `<gmp-place-details-place-request place="${placeId}"></gmp-place-details-place-request><gmp-place-all-content></gmp-place-all-content>`;
  card.replaceChildren(details);
}

/** "Maneh Villa Langkawi - Private Pool" → "Maneh Villa Langkawi" for legend lines. */
const short = (name: string) => name.split(/ [-~|·(]|,/)[0]!.trim();

for (const [i, group] of (groups as Group[]).entries()) {
  const color = group.color ?? colors[i % colors.length]!;
  const bounds = new LatLngBounds();
  const row = document.createElement("div");
  row.innerHTML = `<b><i style="background:${color}"></i>${group.name}</b>`;
  row.onclick = () => map.fitBounds(bounds, 120);
  legend.append(row);
  for (const p of group.places) {
    const position = { lat: p.lat, lng: p.lng };
    const pin = new PinElement({
      background: color,
      borderColor: "#fff",
      glyphColor: "#fff",
      glyphText: glyphs[p.kind] ?? "",
    } as google.maps.marker.PinElementOptions);
    const marker = new AdvancedMarkerElement({
      map,
      position,
      title: p.name,
      content: pin as unknown as Node,
      gmpClickable: true,
    });
    marker.addEventListener("gmp-click", () => showCard(p.placeId));
    bounds.extend(position);
    all.extend(position);
  }
  for (const [from, to] of group.routes ?? []) {
    const a = group.places[from!]!,
      b = group.places[to!]!;
    // One line per route, created in places.json order so labels never depend on which response arrives first.
    const line = document.createElement("small");
    line.textContent = `${short(a.name)} → ${short(b.name)}: …`;
    row.append(line);
    Route.computeRoutes({
      origin: { lat: a.lat, lng: a.lng },
      destination: { lat: b.lat, lng: b.lng },
      travelMode: "DRIVING",
      fields: ["path", "durationMillis", "distanceMeters"],
    }).then(
      ({ routes }) => {
        const r = routes?.[0];
        if (!r?.path) throw new Error(`No route ${a.name} → ${b.name}`);
        new Polyline({ map, path: r.path, strokeColor: color, strokeWeight: 5, strokeOpacity: 0.9 });
        const minutes = Math.round(Number(r.durationMillis) / 60000);
        line.textContent = `${short(a.name)} → ${short(b.name)}: ${minutes} min drive`;
      },
      (e: unknown) => {
        line.textContent = `${short(a.name)} → ${short(b.name)}: route failed`;
        console.error(group.name, e);
      },
    );
  }
}
map.fitBounds(all, 60);

// ?place=<placeId> opens that place's card on load.
const initial = new URLSearchParams(location.search).get("place");
if (initial) showCard(initial);
