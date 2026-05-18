import { createServer } from "node:net";

const host = process.env.HOST ?? "127.0.0.1";
const vitePort = process.env.VITE_PORT ?? "5173";

const children: Bun.Subprocess[] = [];

async function findAvailablePort(start = 3000): Promise<string> {
  for (let port = start; port < start + 100; port += 1) {
    if (await isPortAvailable(port)) return String(port);
  }
  throw new Error(`No available API port found from ${start} to ${start + 99}.`);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function spawn(name: string, cmd: string[], apiPort: string) {
  const child = Bun.spawn(cmd, {
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      HOST: host,
      PORT: apiPort,
      ORPC_PORT: apiPort,
    },
  });
  children.push(child);
  child.exited.then((code) => {
    if (code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const apiPort = process.env.ORPC_PORT ?? await findAvailablePort(Number(process.env.PORT ?? 3000));

spawn("runbot-api", ["bun", "run", "src/server.ts"], apiPort);
spawn("vite", ["vite", "--host", host, "--port", vitePort], apiPort);

console.log(`Runbot API proxy target: http://${host}:${apiPort}`);
