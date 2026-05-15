#!/usr/bin/env node
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toOrpcProcedures } from "./adapters/orpc";
import { createToolContext } from "./runbot/tools";
import { TrafficRecorder } from "./runbot/traffic";

const initialPort = Number(process.env.PORT ?? 3000);
const maxPortAttempts = 100;
const host = process.env.HOST ?? "127.0.0.1";
const procedures = toOrpcProcedures();
const traffic = new TrafficRecorder();
const context = createToolContext({ fetcher: traffic.wrapFetch() });
const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = join(packageRoot, "dist");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response: import("node:http").ServerResponse, data: unknown, status = 200) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(data));
}

async function readJson(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendStatic(response: import("node:http").ServerResponse, pathname: string) {
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = join(dist, requested);
  const fallback = join(dist, "index.html");
  const isAsset = requested.startsWith("assets/") || requested === "favicon.ico";
  const resolved = existsSync(filePath) ? filePath : isAsset ? "" : fallback;
  if (!resolved || !existsSync(resolved)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(isAsset ? "Not Found" : "Build the UI first with `bun run build`.");
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes[extname(resolved)] ?? "application/octet-stream",
  });
  createReadStream(resolved).pipe(response);
}

async function handleRequest(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
) {
  if (request.method === "OPTIONS") return sendJson(response, {});

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${initialPort}`}`);
  if (url.pathname === "/orpc/tools") {
    return sendJson(response, Object.keys(procedures).map((name) => ({ name })));
  }

  if (url.pathname === "/traffic") return sendJson(response, traffic.snapshot());
  if (url.pathname === "/traffic/start" && request.method === "POST") return sendJson(response, traffic.start());
  if (url.pathname === "/traffic/stop" && request.method === "POST") return sendJson(response, traffic.stop());
  if (url.pathname === "/traffic/clear" && request.method === "POST") return sendJson(response, traffic.clear());

  const match = url.pathname.match(/^\/orpc\/([a-z_]+)$/);
  if (match) {
    const name = match[1] ?? "";
    const procedure = procedures[name];
    if (!procedure) return sendJson(response, { error: `Unknown procedure: ${name}` }, 404);
    try {
      const input = request.method === "POST" ? await readJson(request) : Object.fromEntries(url.searchParams);
      const data = await procedure.handler(input, context);
      return sendJson(response, { data });
    } catch (error) {
      return sendJson(response, { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  }

  return sendStatic(response, url.pathname);
}

function listen(port: number, attemptsLeft = maxPortAttempts) {
  const server = createServer(handleRequest);
  server.once("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      server.close();
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    if (error.code === "EADDRINUSE") {
      console.error(`No available port found from ${initialPort} to ${initialPort + maxPortAttempts}.`);
      process.exit(1);
    }
    throw error;
  });
  server.listen(port, host, () => {
    console.log(`Runbot Next listening on http://${host}:${port}`);
  });
}

listen(initialPort);
