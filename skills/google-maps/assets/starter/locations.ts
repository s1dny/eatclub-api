// Edit this file for each trip. Everything on the map comes from here.

export type Location = {
  id: string;
  name: string;
  kind: "airport" | "stay" | "place";
  position: { lat: number; lng: number };
  /** Label → value rows shown in the side panel and popup, e.g. "Cheapest flight": "$928 pp, 1–7 Dec". */
  details?: Record<string, string>;
  /** Booking or info link. */
  url?: string;
};

export const locations: Location[] = [
  {
    id: "syd",
    name: "Sydney Airport",
    kind: "airport",
    position: { lat: -33.9399, lng: 151.1753 },
    details: { "Cheapest flight": "$000 pp return", Dates: "1 Dec → 7 Dec", Airline: "Example Air, 1 stop" },
  },
  {
    id: "stay",
    name: "Example Resort",
    kind: "stay",
    position: { lat: -33.8915, lng: 151.2767 },
    details: { "Price / night": "$000", Room: "King bed + sofa", Pool: "Yes" },
    url: "https://www.google.com/travel/hotels",
  },
];

/** Google computes each drive; the app adds its time and distance to the side panel. */
export const routes: { from: string; to: string }[] = [{ from: "syd", to: "stay" }];

export const title = "Trip map";
