import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// App origins come from IKATASTER_ORIGINS (env or repo-root .env), never from the repo. Tests use a made-up origin.
const origins = (mode: string) =>
  mode === "test" ? "https://app.example" : (process.env.IKATASTER_ORIGINS ?? loadEnv(mode, "../..", "IKATASTER_").IKATASTER_ORIGINS ?? "");

export default defineConfig(({ mode }) => ({
  define: { __IKATASTER_ORIGINS__: JSON.stringify(origins(mode)) },
  plugins: [react()],
  worker: { format: "es" },
  build: {
    rollupOptions: {
      input: { main: "index.html", sw: "src/sw/sw.ts" },
      output: { entryFileNames: (c: { name: string }) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js") },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    // Flow tests render large tables; the 4-core ARM host needs more than the 5 s default under parallel load.
    testTimeout: 15_000,
  },
}) as never);
