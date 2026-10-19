import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Live end-to-end checks against eatclub.com.au and OpenStreetMap routing.
const SYDNEY_CBD = { latitude: -33.8688, longitude: 151.2093 };
const root = new URL("..", import.meta.url).pathname;

type Nearby = {
  region: string;
  walkSource: string;
  venues: { slug: string; walkMinutes: number; menu?: string; menuMatches?: number; dealsToday: string[] }[];
};

const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";

describe("stdio MCP", () => {
  const client = new Client({ name: "e2e", version: "0" });
  beforeAll(() =>
    client.connect(new StdioClientTransport({ command: "bun", args: ["src/stdio.ts"], cwd: root, stderr: "inherit" })),
  );
  afterAll(() => client.close());

  test("lists tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["find_venues_nearby", "get_venue", "list_regions"]);
  });

  test("finds beef or lamb within a 10 minute walk, with menus", async () => {
    const res: Nearby = JSON.parse(
      text(
        await client.callTool({
          name: "find_venues_nearby",
          arguments: { ...SYDNEY_CBD, walkMinutes: 10, menuKeywords: ["beef", "lamb"], limit: 10 },
        }),
      ),
    );
    expect(res.region).toBe("sydney");
    expect(res.walkSource).toBe("osm");
    expect(res.venues.length).toBeGreaterThan(0);
    for (const v of res.venues) {
      expect(v.walkMinutes).toBeLessThanOrEqual(10);
      expect(v.menuMatches).toBeGreaterThan(0);
      expect(v.menu?.toLowerCase()).toMatch(/beef|lamb/);
    }
    const minutes = res.venues.map((v) => v.walkMinutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  test("gets a venue's weekly deals and menu", async () => {
    const venue = JSON.parse(text(await client.callTool({ name: "get_venue", arguments: { slug: "ca-de-vin" } })));
    expect(venue.name).toBe("Ca De Vin");
    expect(venue.weekly).toHaveLength(7);
    expect(venue.weekly.flatMap((d: { deals: string[] }) => d.deals).join(" ")).toMatch(/% Off/);
    expect(venue.menu).toContain("Garlic Bread");
  });
});

describe("HTTP API", () => {
  const port = 39_000 + Math.floor(Math.random() * 1000);
  const base = `http://localhost:${port}`;
  let proc: ReturnType<typeof Bun.spawn>;

  beforeAll(async () => {
    proc = Bun.spawn(["bun", "src/http.ts"], { cwd: root, env: { ...process.env, PORT: String(port) } });
    for (let i = 0; i < 50; i++) {
      if (
        await fetch(`${base}/health`).then(
          (r) => r.ok,
          () => false,
        )
      )
        return;
      await Bun.sleep(100);
    }
    throw new Error("server did not start");
  });
  afterAll(() => proc.kill());

  test("GET /venues/nearby", async () => {
    const res = await fetch(`${base}/venues/nearby?lat=${SYDNEY_CBD.latitude}&lng=${SYDNEY_CBD.longitude}&limit=3`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Nearby;
    expect(body.venues.length).toBe(3);
  });

  test("GET /venues/nearby rejects bad input", async () => {
    expect((await fetch(`${base}/venues/nearby?lat=nope&lng=1`)).status).toBe(400);
  });

  test("MCP over streamable HTTP", async () => {
    const client = new Client({ name: "e2e-http", version: "0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const regions = JSON.parse(text(await client.callTool({ name: "list_regions", arguments: {} })));
    expect(regions.map((r: { slug: string }) => r.slug)).toContain("melbourne");
    await client.close();
  });
});
