// Google Maps Platform key shared by places, nearby and the map template. It is referrer-restricted to the template's origin.
export const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
export const ORIGIN = "http://localhost:3000/";

export async function places(endpoint: string, body: unknown, fields: string[]) {
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set (repository .env)");
  const response = await fetch(`https://places.googleapis.com/v1/places:${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fields.map((f) => `places.${f}`).join(","),
      Referer: ORIGIN,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as any;
  if (!response.ok) throw new Error(`Places API ${response.status}: ${json.error?.message ?? JSON.stringify(json)}`);
  return (json.places ?? []) as any[];
}

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.sqrt(h)) * 100) / 100;
}
