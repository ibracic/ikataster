import { defineConfig } from "vitest/config";
// Made-up app origin for tests; real origins are injected at build time from IKATASTER_ORIGINS.
export default defineConfig({ define: { __IKATASTER_ORIGINS__: JSON.stringify("https://app.example") }, test: { globals: true, environment: "jsdom" } });
