import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const orpcPort = process.env.ORPC_PORT ?? process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [solid()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // Allow access via the tailnet hostname (runbot.mac.internal) through nginx.
    // Leading dot allows the domain and all its subdomains.
    allowedHosts: [".mac.internal"],
    proxy: {
      "/orpc": `http://127.0.0.1:${orpcPort}`,
      "/traffic": `http://127.0.0.1:${orpcPort}`,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
