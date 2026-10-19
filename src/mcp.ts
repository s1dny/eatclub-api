import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findNearby, getVenue, regions } from "./venues.ts";

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "eatclub", version: "0.1.0" },
    {
      instructions: [
        "EatClub (eatclub.com.au) lists Australian restaurants with time-limited discount deals.",
        "The caller must supply coordinates. If the user hasn't given a location, ask them or geocode a place they name.",
        "Walk times come from OpenStreetMap foot routing. Deal windows and hours are in the venue's local time.",
        "Menus come back as plain text. Judge dietary fit (healthy, protein, etc.) yourself by reading them.",
        "`menuKeywords` is only a cheap substring pre-filter to save tokens, e.g. ['beef','lamb'].",
        "Deals are claimed in the EatClub app; share each venue's appLink or url.",
      ].join(" "),
    },
  );

  server.registerTool(
    "find_venues_nearby",
    {
      title: "Find EatClub venues nearby",
      description:
        "EatClub venues within a walking time of a point, nearest first, with today's deals, which deals are live at `at`, opening hours and menus.",
      inputSchema: {
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        walkMinutes: z.number().positive().max(60).default(10).describe("Maximum walking time in minutes"),
        at: z.iso
          .datetime({ offset: true })
          .optional()
          .describe("When the user plans to eat (ISO 8601 with offset). Defaults to now."),
        onlyActiveDeals: z.boolean().default(false).describe("Only venues with a deal live at `at`"),
        dealType: z.enum(["dinein", "takeaway", "any"]).default("any"),
        menuKeywords: z
          .array(z.string().min(1))
          .optional()
          .describe("Keep only menu items containing any of these substrings; venues with no match are dropped"),
        cuisines: z.array(z.string()).optional().describe("EatClub cuisine tags, e.g. Thai, Japanese, Healthy"),
        includeMenus: z.boolean().default(true),
        limit: z.number().int().positive().max(100).default(25),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ at, ...q }) => json(await findNearby({ ...q, at: at ? new Date(at) : undefined })),
  );

  server.registerTool(
    "get_venue",
    {
      title: "Get EatClub venue",
      description: "One venue's full weekly deal schedule, opening hours, contact details and complete menu.",
      inputSchema: { slug: z.string().describe("Venue slug, e.g. 'ca-de-vin'") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ slug }) => json(await getVenue(slug)),
  );

  server.registerTool(
    "list_regions",
    {
      title: "List EatClub regions",
      description: "Cities EatClub covers, with venue counts.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => json(await regions()),
  );

  return server;
}
