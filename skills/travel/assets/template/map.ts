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

const colors = ["#e53935", "#43a047", "#1e88e5", "#fb8c00", "#8e24aa", "#00acc1"];
const glyphs: Record<string, string> = { airport: "✈", hotel: "🏨" };
const card = document.getElementById("card")!;
const legend = document.getElementById("legend")!;

const { key } = await (await fetch("/api/key")).json();
if (!key) throw new Error("Set GOOGLE_MAPS_API_KEY in .env.local and restart.");
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

for (const [i, group] of (groups as Group[]).entries()) {
  const color = group.color ?? colors[i % colors.length]!;
  const bounds = new LatLngBounds();
  const row = document.createElement("div");
  row.innerHTML = `<i style="background:${color}"></i>${group.name}<small></small>`;
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
        row.querySelector("small")!.textContent += ` · ${Math.round(Number(r.durationMillis) / 60000)} min drive`;
      },
      (e: unknown) => console.error(group.name, e),
    );
  }
}
map.fitBounds(all, 60);

// ?place=<placeId> opens that place's card on load.
const initial = new URLSearchParams(location.search).get("place");
if (initial) showCard(initial);
