// @vitest-environment node
import { readFileSync, existsSync } from "node:fs";

// The pdf.js worker is emitted as .mjs; served as application/octet-stream the
// browser refuses the module worker and every PDF fails ("could not read the file").
it("nginx serves .mjs as JavaScript", () => {
  const p = new URL("../../../../nginx.conf", import.meta.url);
  if (!existsSync(p)) return; // not in the Docker test stage
  expect(readFileSync(p, "utf8")).toMatch(/application\/javascript[^;]*\bmjs\b/);
});

it("nginx never caches the service worker script", () => {
  const p = new URL("../../../../nginx.conf", import.meta.url);
  if (!existsSync(p)) return;
  expect(readFileSync(p, "utf8")).toMatch(/location = \/sw\.js \{[^}]*no-store/);
});

it("nginx merges security headers into locations that set Cache-Control", () => {
  const p = new URL("../../../../nginx.conf", import.meta.url);
  if (!existsSync(p)) return;
  const s = readFileSync(p, "utf8");
  expect(s).toMatch(/add_header_inherit merge;/);
  expect(s).toMatch(/manifest-src 'self'/);
  expect(s).toMatch(/application\/manifest\+json webmanifest/);
});
