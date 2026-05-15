import { existsSync } from "node:fs";
import { join } from "node:path";
import { toOrpcProcedures } from "./adapters/orpc";
import { createToolContext } from "./runbot/tools";
import { TrafficRecorder } from "./runbot/traffic";

const port = Number(process.env.PORT ?? 3000);
const procedures = toOrpcProcedures();
const traffic = new TrafficRecorder();
const context = createToolContext({ fetcher: traffic.wrapFetch() });
const dist = join(import.meta.dir, "..", "dist");

function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...init.headers,
    },
  });
}

async function staticResponse(pathname: string): Promise<Response> {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = join(dist, requested);
  const fallback = join(dist, "index.html");
  const file = Bun.file(existsSync(filePath) ? filePath : fallback);
  if (!(await file.exists())) {
    return new Response("Build the UI first with `bun run build`.", { status: 404 });
  }
  return new Response(file, {
    headers: {
      "cache-control": "no-store",
    },
  });
}

Bun.serve({
  port,
  async fetch(request) {
    if (request.method === "OPTIONS") return json({});

    const url = new URL(request.url);
    if (url.pathname === "/orpc/tools") {
      return json(Object.keys(procedures).map((name) => ({ name })));
    }

    if (url.pathname === "/traffic") {
      return json(traffic.snapshot());
    }

    if (url.pathname === "/traffic/start" && request.method === "POST") {
      return json(traffic.start());
    }

    if (url.pathname === "/traffic/stop" && request.method === "POST") {
      return json(traffic.stop());
    }

    if (url.pathname === "/traffic/clear" && request.method === "POST") {
      return json(traffic.clear());
    }

    const match = url.pathname.match(/^\/orpc\/([a-z_]+)$/);
    if (match) {
      const name = match[1] ?? "";
      const procedure = procedures[name];
      if (!procedure) return json({ error: `Unknown procedure: ${name}` }, { status: 404 });
      try {
        const input = request.method === "POST" ? await request.json() : Object.fromEntries(url.searchParams);
        const data = await procedure.handler(input, context);
        return json({ data });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
      }
    }

    return staticResponse(url.pathname);
  },
});

console.log(`Runbot oRPC server listening on http://127.0.0.1:${port}`);
