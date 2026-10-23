import index from "./index.html";
const server = Bun.serve({
  hostname: "localhost",
  port: 3000,
  routes: { "/": index, "/api/key": () => Response.json({ key: process.env.GOOGLE_MAPS_API_KEY ?? "" }) },
});
console.log(`Trip map: ${server.url}`);
