/// <reference types="google.maps" />
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { type Location, locations, routes, title } from "./locations.ts";

const panel = document.querySelector<HTMLElement>("#panel")!;
const list = document.querySelector<HTMLElement>("#list")!;
const status = document.querySelector<HTMLElement>("#status")!;
const colors = { airport: "#3b82f6", stay: "#f97316", place: "#22c55e" } as const;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** Name, detail rows and link for a location; used in both the side panel and the popup. */
function card(location: Location, extra: Record<string, string>) {
  const root = el("div", undefined, "card");
  const heading = el("h2", location.name);
  heading.style.borderColor = colors[location.kind];
  root.append(heading);
  const rows = { ...location.details, ...extra };
  if (Object.keys(rows).length) {
    const dl = el("dl");
    for (const [label, value] of Object.entries(rows)) dl.append(el("dt", label), el("dd", value));
    root.append(dl);
  }
  if (location.url) {
    const a = el("a", "Open link ↗");
    a.href = location.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    root.append(a);
  }
  return root;
}

async function main() {
  document.title = title;
  panel.querySelector("h1")!.textContent = title;
  const { apiKey, mapId } = await fetch("/api/config").then((response) => response.json());
  if (!apiKey) throw new Error("Set GOOGLE_MAPS_API_KEY in .env.local, then restart the app.");
  setOptions({ key: apiKey, v: "weekly" });
  const [{ Map, InfoWindow, Polyline }, { AdvancedMarkerElement, PinElement }, { LatLngBounds }] = await Promise.all([
    importLibrary("maps"),
    importLibrary("marker"),
    importLibrary("core"),
  ]);

  const byId = new globalThis.Map(locations.map((location) => [location.id, location]));
  if (byId.size !== locations.length) throw new Error("Location IDs must be unique.");

  const map = new Map(document.querySelector<HTMLElement>("#map")!, {
    mapId,
    mapTypeId: "hybrid",
    tilt: 0,
    streetViewControl: false,
  });
  const bounds = new LatLngBounds();
  const popup = new InfoWindow();
  const extras = new globalThis.Map<string, Record<string, string>>(locations.map((l) => [l.id, {}]));
  const markers = new globalThis.Map<string, google.maps.marker.AdvancedMarkerElement>();

  const open = (location: Location) => {
    popup.setContent(card(location, extras.get(location.id)!));
    popup.open({ map, anchor: markers.get(location.id) });
  };
  const render = () => {
    list.replaceChildren(
      ...locations.map((location) => {
        const item = card(location, extras.get(location.id)!);
        item.tabIndex = 0;
        item.onclick = () => {
          map.panTo(location.position);
          map.setZoom(Math.max(map.getZoom() ?? 12, 12));
          open(location);
        };
        return item;
      }),
    );
  };

  for (const location of locations) {
    const pin = new PinElement({ background: colors[location.kind], borderColor: "#fff", glyphColor: "#fff" });
    const marker = new AdvancedMarkerElement({
      map,
      position: location.position,
      title: location.name,
      content: pin,
    });
    marker.addEventListener("gmp-click", () => open(location));
    markers.set(location.id, marker);
    bounds.extend(location.position);
  }
  map.fitBounds(bounds, 80);
  render();

  if (!routes.length) {
    status.textContent = `${locations.length} locations`;
    return;
  }
  status.textContent = `Loading ${routes.length} drives…`;
  const { Route } = await importLibrary("routes");
  const outcomes = await Promise.allSettled(
    routes.map(async ({ from, to }) => {
      const origin = byId.get(from);
      const destination = byId.get(to);
      if (!origin || !destination) throw new Error(`Unknown route location: ${from} → ${to}`);
      const { routes: found } = await Route.computeRoutes({
        origin: origin.position,
        destination: destination.position,
        travelMode: "DRIVING",
        fields: ["path", "durationMillis", "distanceMeters"],
      });
      const route = found?.[0];
      if (!route?.path?.length) throw new Error(`No driving route: ${origin.name} → ${destination.name}`);
      new Polyline({
        map,
        path: route.path.map((point) => ({ lat: point.lat, lng: point.lng })),
        strokeColor: "#facc15",
        strokeWeight: 5,
      });
      const minutes = Math.round((route.durationMillis ?? 0) / 60000);
      const km = ((route.distanceMeters ?? 0) / 1000).toFixed(1);
      extras.get(destination.id)![`Drive from ${origin.name}`] = `${minutes} min · ${km} km`;
    }),
  );
  render();
  const errors = outcomes.filter((result) => result.status === "rejected");
  for (const result of errors) console.error(result.reason);
  status.textContent = errors.length
    ? `${errors.length} of ${routes.length} drives failed: ${errors[0]!.reason instanceof Error ? errors[0]!.reason.message : errors[0]!.reason}`
    : `${locations.length} locations · ${routes.length} drives`;
  if (errors.length) status.setAttribute("role", "alert");
}

void main().catch((error: unknown) => {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.setAttribute("role", "alert");
  console.error(error);
});
