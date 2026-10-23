import index from "./index.html";

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": index,
    "/api/config": () =>
      Response.json(
        { apiKey: process.env.GOOGLE_MAPS_API_KEY ?? "", mapId: process.env.GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID" },
        { headers: { "Cache-Control": "no-store" } },
      ),
  },
});
console.log(`Google Maps: ${server.url}`);
