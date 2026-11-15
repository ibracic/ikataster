// @vitest-environment node
import { readFileSync } from "node:fs";
import { DATASET_BASE } from "./datasets/loader";

/** Production headers (Cloudflare Pages, public/_headers): path pattern -> header lines. */
function rules(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let cur: string[] | null = null;
  for (const line of readFileSync(new URL("../public/_headers", import.meta.url), "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) out.set(line.trim(), (cur = []));
    else cur?.push(line.trim());
  }
  return out;
}
const header = (path: string, name: string) => rules().get(path)?.find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))?.slice(name.length + 1).trim();

it("the service worker script is never cached, so updates reach users", () => {
  expect(header("/sw.js", "Cache-Control")).toMatch(/no-store/);
  expect(rules().get("/sw.js")).toContain("! Cache-Control"); // detach the site-wide value
});

it("CSP allows every external host the app talks to, and nothing executes from elsewhere", () => {
  const csp = header("/*", "Content-Security-Policy")!;
  const connect = csp.split(";").find((d) => d.trim().startsWith("connect-src"))!;
  for (const host of ["https://tiles.openfreemap.org", "https://ipi.eprostor.gov.si", new URL(DATASET_BASE).origin]) expect(connect).toContain(host);
  expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval';/); // pdf.js / MapLibre, no inline scripts
  expect(csp).toMatch(/frame-ancestors 'none'/);
});

it("hashed assets are immutable and the published copy is cacheable and CORS-readable", () => {
  expect(header("/assets/*", "Cache-Control")).toMatch(/immutable/);
  expect(header("/mirror/*", "Access-Control-Allow-Origin")).toBe("*");
  expect(header("/mirror/tiles/*", "Content-Type")).toBe("application/x-protobuf");
});
