#!/usr/bin/env bun
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createServer } from "./mcp.ts";
import { findNearby, getVenue, regions } from "./venues.ts";

const csv = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  )
  .optional();
const bool = z
  .enum(["true", "false"])
  .transform((s) => s === "true")
  .optional();

const NearbyParams = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  walkMinutes: z.coerce.number().positive().max(60).optional(),
  at: z.iso.datetime({ offset: true }).optional(),
  onlyActiveDeals: bool,
  dealType: z.enum(["dinein", "takeaway", "any"]).optional(),
  menuKeywords: csv,
  cuisines: csv,
  includeMenus: bool,
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const handle = async (fn: () => Promise<unknown>) => {
  try {
    return Response.json(await fn());
  } catch (err) {
    const status = err instanceof z.ZodError ? 400 : 502;
    return Response.json({ error: err instanceof z.ZodError ? z.treeifyError(err) : String(err) }, { status });
  }
};

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  idleTimeout: 120,
  routes: {
    "/health": new Response("ok"),
    "/regions": () => handle(regions),
    "/venues/nearby": (req) =>
      handle(() => {
        const { lat, lng, at, ...rest } = NearbyParams.parse(Object.fromEntries(new URL(req.url).searchParams));
        return findNearby({ latitude: lat, longitude: lng, at: at ? new Date(at) : undefined, ...rest });
      }),
    "/venues/:slug": (req) => handle(() => getVenue(req.params.slug)),
    // Stateless Streamable HTTP MCP: a fresh server/transport per request.
    "/mcp": async (req) => {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await createServer().connect(transport);
      return transport.handleRequest(req);
    },
  },
  fetch: () => Response.json({ error: "not found" }, { status: 404 }),
});

console.log(`eatclub-api listening on ${server.url}`);
