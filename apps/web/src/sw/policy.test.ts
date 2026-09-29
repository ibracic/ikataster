// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classify, handle, trim, precache, shellUrls, CACHE_SHELL, CACHE_DATA, CACHED_HEADER, LIMITS } from "./policy";
import { ageText, getCachedAt, noteResponse, resetCacheStatus } from "./cacheStatus";

class FakeCache {
  m = new Map<string, Response>();
  async match(r: Request) { const x = this.m.get(r.url); return x?.clone(); }
  async put(r: Request, res: Response) { this.m.set(r.url, res); }
  async delete(r: Request) { return this.m.delete(r.url); }
  async keys() { return [...this.m.keys()].map((u) => new Request(u)); }
}
function deps(fetcher: (r: Request) => Promise<Response>, t = 1000) {
  const caches = new Map<string, FakeCache>();
  const open = async (n: string) => { if (!caches.has(n)) caches.set(n, new FakeCache()); return caches.get(n)! as unknown as Cache; };
  return { d: { fetch: fetcher, open, now: () => t }, caches };
}
const WFS = "https://ipi.eprostor.gov.si/wfs-si-gurs-kn/wfs?request=GetFeature&typeNames=x";
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

describe("classify", () => {
  const O = "https://app.example";
  it("routes GURS, shell, and ignores others", () => {
    expect(classify(WFS, "GET", "cors", O)).toBe("data");
    expect(classify("https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/wfs?x", "GET", "cors", O)).toBe("data");
    expect(classify("https://ipi.eprostor.gov.si/jv-api/search?q=a", "GET", "cors", O)).toBe("data");
    expect(classify("https://ipi.eprostor.gov.si/wms-si-gurs-kn/wms?x", "GET", "no-cors", O)).toBe("tiles");
    expect(classify(O + "/assets/a.js", "GET", "cors", O)).toBe("asset");
    expect(classify(O + "/?ko=1", "GET", "navigate", O)).toBe("navigate");
    expect(classify("https://tiles.openfreemap.org/x", "GET", "cors", O)).toBeNull();
    expect(classify(WFS, "POST", "cors", O)).toBeNull();
  });
});

describe("network first with cache fallback", () => {
  it("serves network, falls back to marked cached copy offline, then fresh again", async () => {
    let online = true; let v = 1;
    const { d } = deps(async () => { if (!online) throw new TypeError("offline"); return json({ v: v++ }); }, 5000);
    const r1 = await handle("data", new Request(WFS), d);
    expect(await r1.json()).toEqual({ v: 1 });
    expect(r1.headers.get(CACHED_HEADER)).toBeNull();
    online = false;
    const r2 = await handle("data", new Request(WFS), d);
    expect(await r2.json()).toEqual({ v: 1 });
    expect(r2.headers.get(CACHED_HEADER)).toBe("5000");
    expect(r2.headers.get("Access-Control-Expose-Headers")).toContain(CACHED_HEADER);
    online = true;
    const r3 = await handle("data", new Request(WFS), d);
    expect(await r3.json()).toEqual({ v: 2 });
    online = false;
    expect(await (await handle("data", new Request(WFS), d)).json()).toEqual({ v: 2 });
  });
  it("uses cache on 5xx and on OGC XML errors, never caches them", async () => {
    let mode = "ok";
    const { d } = deps(async () => mode === "ok" ? json({ ok: 1 }) : mode === "500" ? new Response("x", { status: 503 }) : new Response("<ows:ExceptionReport/>", { headers: { "content-type": "text/xml" } }));
    await handle("data", new Request(WFS), d);
    mode = "500"; expect((await handle("data", new Request(WFS), d)).headers.get(CACHED_HEADER)).not.toBeNull();
    mode = "xml"; const r = await handle("data", new Request(WFS), d);
    expect(await r.json()).toEqual({ ok: 1 });
  });
  it("passes through 4xx and throws when offline without cache", async () => {
    const { d } = deps(async () => new Response("bad", { status: 400 }));
    expect((await handle("data", new Request(WFS), d)).status).toBe(400);
    const { d: d2 } = deps(async () => { throw new TypeError("x"); });
    await expect(handle("data", new Request(WFS), d2)).rejects.toThrow();
  });
  it("trims cache to the limit, dropping oldest", async () => {
    const c = new (FakeCache as never as { new(): Cache })();
    for (let i = 0; i < 5; i++) await c.put(new Request(WFS + i), json(i));
    await trim(c, 3);
    expect((await c.keys()).map((k) => k.url.slice(-1))).toEqual(["2", "3", "4"]);
    expect(LIMITS[CACHE_DATA]).toBeGreaterThan(100);
  });
  it("navigation falls back to cached index.html", async () => {
    let online = true;
    const { d } = deps(async () => { if (!online) throw new TypeError("x"); return new Response("<html>app</html>", { headers: { "content-type": "text/html" } }); });
    const nav = () => new Request("https://app.example/?ko=1&p=2");
    await handle("navigate", nav(), d);
    online = false;
    expect(await (await handle("navigate", nav(), d)).text()).toContain("app");
  });
});

describe("cache status", () => {
  it("tracks oldest cached time and clears on fresh data", () => {
    resetCacheStatus();
    noteResponse(new Response("", { headers: { [CACHED_HEADER]: "2000" } }));
    noteResponse(new Response("", { headers: { [CACHED_HEADER]: "1000" } }));
    expect(getCachedAt()).toBe(1000);
    noteResponse(new Response(""));
    expect(getCachedAt()).toBeNull();
    expect(ageText(0, 5 * 60000, "sl")).toBe("5 min");
    expect(ageText(0, 3 * 3600000, "en")).toBe("3 h");
    expect(ageText(0, 72 * 3600000, "sl")).toBe("3 d");
  });
});

describe("precache", () => {
  it("caches index.html and all referenced assets so the shell starts offline", async () => {
    const html = '<script type="module" src="/assets/main-abc.js"></script><link rel="stylesheet" href="/assets/main-def.css"><link rel="manifest" href="/manifest.webmanifest">';
    expect(shellUrls(html)).toEqual(expect.arrayContaining(["/assets/main-abc.js", "/assets/main-def.css", "/index.html"]));
    const O = "https://app.example";
    const { d, caches } = deps(async (r) => new Response(r.url.endsWith("index.html") ? html : "x"));
    expect(await precache(O, d)).toBeGreaterThanOrEqual(5);
    const shell = caches.get(CACHE_SHELL)!;
    expect(shell.m.has(O + "/assets/main-abc.js")).toBe(true);
    // offline navigation served from the precached shell
    const off = { ...d, fetch: async () => { throw new TypeError("offline"); } };
    expect(await (await handle("navigate", new Request(O + "/?source=pwa"), off)).text()).toContain("main-abc.js");
    expect(await (await handle("asset", new Request(O + "/assets/main-abc.js"), off)).text()).toBe("x");
  });
});

describe("orthophoto tiles: cache first", () => {
  const ORTHO = "https://ipi.eprostor.gov.si/wms-si-gurs-dts/wms?layers=SI.GURS.ZPDZ%3ADOF025&bbox=1,2,3,4";
  const img = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  it("ortho is its own route; cadastre WMS stays network-first tiles", () => {
    expect(classify(ORTHO, "GET", "cors", "https://app.example")).toBe("ortho");
    expect(classify("https://ipi.eprostor.gov.si/wms-si-gurs-kn/wms?x", "GET", "cors", "https://app.example")).toBe("tiles");
  });
  it("second view comes from the cache without GURS; after 30 days it is re-fetched; stale served if GURS fails", async () => {
    let calls = 0, t = 1000, down = false;
    const { d } = deps(async () => { calls++; if (down) throw new TypeError("offline"); return img(); });
    const dd = { ...d, now: () => t };
    await handle("ortho", new Request(ORTHO), dd);
    await handle("ortho", new Request(ORTHO), dd);
    expect(calls).toBe(1);
    t += 31 * 86_400_000;
    await handle("ortho", new Request(ORTHO), dd);
    expect(calls).toBe(2);
    t += 31 * 86_400_000; down = true;
    const r = await handle("ortho", new Request(ORTHO), dd);
    expect(r.ok).toBe(true);
  });
  it("GURS error pages (XML) are never stored as tiles", async () => {
    let calls = 0;
    const { d, caches } = deps(async () => { calls++; return new Response("<ServiceException/>", { headers: { "content-type": "text/xml" } }); });
    await handle("ortho", new Request(ORTHO), d);
    await handle("ortho", new Request(ORTHO), d);
    expect(calls).toBe(2);
    expect(caches.get("ikataster-ortho-v1")?.m.size ?? 0).toBe(0);
  });
});
