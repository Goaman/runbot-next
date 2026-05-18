import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const orpcPort = process.env.ORPC_PORT ?? process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [solid()],
  server: {
    host: "127.0.0.1",
    port: 5173,
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
