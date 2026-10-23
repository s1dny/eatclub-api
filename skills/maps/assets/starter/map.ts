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

// Example: replace with the real content. (L.marker image icons need their PNGs bundled; circleMarker or divIcon need none.)
const airport: L.LatLngTuple = [-33.9399, 151.1753];
const beach: L.LatLngTuple = [-33.8915, 151.2767];
L.circleMarker(airport).addTo(map).bindPopup("Sydney Airport");
L.circleMarker(beach).addTo(map).bindPopup("Bondi Beach");
map.fitBounds([airport, beach], { padding: [60, 60] });
const route = await drive(airport, beach);
L.polyline(route.path, { color: "#facc15", weight: 5 })
  .addTo(map)
  .bindPopup(`${route.minutes} min · ${route.km.toFixed(1)} km`);
