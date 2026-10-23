import L from "leaflet";
import "leaflet/dist/leaflet.css";

const esri = "https://server.arcgisonline.com/ArcGIS/rest/services";
const map = L.map("map");

// Esri World Imagery satellite tiles, plus an optional place-name overlay. Keep the attribution visible.
L.tileLayer(`${esri}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
  maxZoom: 19,
  attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
}).addTo(map);
L.tileLayer(`${esri}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19 }).addTo(map);

/** Driving route from OSRM's public OpenStreetMap router. Throws on failure; never fall back to a straight line. */
export async function drive(from: L.LatLngTuple, to: L.LatLngTuple) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  const body = await response.json();
  const route = body.routes?.[0];
  if (!response.ok || body.code !== "Ok" || !route)
    throw new Error(`OSRM ${response.status}: ${body.message ?? body.code}`);
  return {
    path: route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as L.LatLngTuple),
    minutes: Math.round(route.duration / 60),
    km: route.distance / 1000,
  };
}

/** Teardrop map pin as an inline SVG (no image assets to bundle). */
export function pin(color: string, glyph = "") {
  return L.divIcon({
    className: "",
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
    html: `<svg width="32" height="42" viewBox="0 0 32 42"><path d="M16 41C16 41 30 26 30 15A14 14 0 0 0 2 15C2 26 16 41 16 41Z" fill="${color}" stroke="#fff" stroke-width="2"/><text x="16" y="20" font-size="14" text-anchor="middle">${glyph}</text></svg>`,
  });
}

/** Popup card: title, optional photo, label/value rows. */
export function card(title: string, image?: string, rows: Record<string, string> = {}) {
  const lines = Object.entries(rows)
    .map(([k, v]) => `<tr><td style="color:#666;padding-right:8px">${k}</td><td>${v}</td></tr>`)
    .join("");
  return `<b>${title}</b>${image ? `<img src="${image}" style="display:block;width:240px;height:135px;object-fit:cover;margin:6px 0;border-radius:6px">` : ""}<table>${lines}</table>`;
}

// Example: replace with the real content. Wikipedia's REST summary API gives free place photos.
const airport: L.LatLngTuple = [-33.9399, 151.1753];
const hotel: L.LatLngTuple = [-33.8915, 151.2767];
L.marker(airport, { icon: pin("#2563eb", "✈️") })
  .addTo(map)
  .bindPopup(
    card(
      "Sydney Airport (SYD)",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Sydney_Airport_%28Kingsford_Smith%29_-_aerial_view_%28cropped%29.jpg/330px-Sydney_Airport_%28Kingsford_Smith%29_-_aerial_view_%28cropped%29.jpg",
      { Flight: "$000 pp return", Dates: "1 → 7 Dec" },
    ),
  );
L.marker(hotel, { icon: pin("#ea580c", "🏨") })
  .addTo(map)
  .bindPopup(
    card(
      "Example Hotel, Bondi",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Bondi_from_above.jpg/330px-Bondi_from_above.jpg",
      {
        Night: "$000",
        Pool: "Yes",
      },
    ),
  );
map.fitBounds([airport, hotel], { padding: [60, 60] });
const route = await drive(airport, hotel);
L.polyline(route.path, { color: "#facc15", weight: 5 })
  .addTo(map)
  .bindPopup(`${route.minutes} min · ${route.km.toFixed(1)} km`);
