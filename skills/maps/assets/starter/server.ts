import index from "./index.html";

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production",
  routes: { "/": index },
});
console.log(`Map: ${server.url}`);
