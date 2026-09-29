import { APP_SOURCE, PROTOCOL_VERSION, EXT_SOURCE, type AppMessage } from "@ikataster/bridge";
import { handleBackgroundMessage, type BackgroundApi } from "./background-core";
import { startRelay, type RuntimeLike } from "./relay-core";
import { openEzk, EZK_URL, EZK_MATCH } from "./popup-core";
import { manifest } from "./manifest";

const msg = (type: AppMessage["type"], id = "r1"): AppMessage => ({ source: APP_SOURCE, v: PROTOCOL_VERSION, id, type });
const api = (tabs: { id: number; windowId: number }[] = []): BackgroundApi & { created: string[] } => {
  const created: string[] = [];
  return { runtimeId: "self", version: "0.1.0", queryTabs: async () => tabs, created };
};
const fromApp = { id: "self", origin: "https://app.example", url: "https://app.example/", tab: { id: 1 } };

describe("background", () => {
  it("answers hello and status for messages relayed from the app origin", async () => {
    await expect(handleBackgroundMessage(msg("hello"), fromApp, api())).resolves.toMatchObject({ ok: true, data: { version: "0.1.0" } });
    await expect(handleBackgroundMessage(msg("status"), fromApp, api([{ id: 7, windowId: 1 }]))).resolves.toMatchObject({ ok: true, data: { ezkTab: true } });
    await expect(handleBackgroundMessage(msg("status"), fromApp, api())).resolves.toMatchObject({ ok: true, data: { ezkTab: false } });
  });

  it("rejects foreign origins, other extensions and malformed messages", async () => {
    for (const sender of [
      { ...fromApp, origin: "https://evil.example", url: "https://evil.example/" },
      { ...fromApp, origin: undefined, url: "https://app.example.evil.com/x" },
      { ...fromApp, id: "other-extension" },
    ]) {
      await expect(handleBackgroundMessage(msg("status"), sender, api())).resolves.toMatchObject({ ok: false, code: "FORBIDDEN_ORIGIN" });
    }
    await expect(handleBackgroundMessage({ hi: 1 }, fromApp, api())).resolves.toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  it("falls back to sender.url when sender.origin is missing (Firefox)", async () => {
    await expect(handleBackgroundMessage(msg("hello"), { id: "self", url: "https://app.example/?ko=1" }, api())).resolves.toMatchObject({ ok: true });
  });

  it("rejects a download without a valid property", async () => {
    await expect(handleBackgroundMessage(msg("download"), fromApp, api())).resolves.toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
});

describe("relay", () => {
  const post = (data: unknown, o: Partial<MessageEventInit> = {}) =>
    window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source: window, ...o }));
  const collect = () => {
    const got: unknown[] = [];
    const h = (e: MessageEvent) => { if ((e.data as { source?: string })?.source === EXT_SOURCE) got.push(e.data); };
    window.addEventListener("message", h);
    return { got, stop: () => window.removeEventListener("message", h) };
  };
  const flush = () => new Promise((r) => setTimeout(r, 10));

  it("announces ready, answers hello locally and forwards requests to the runtime", async () => {
    const sent: unknown[] = [];
    const runtime: RuntimeLike = { sendMessage: async (m) => { sent.push(m); return { source: EXT_SOURCE, v: 1, type: "response", id: "r2", ok: true, data: { ezkTab: false } }; } };
    const c = collect();
    const stop = startRelay(window, runtime, "0.1.0");
    await flush();
    expect(c.got[0]).toMatchObject({ type: "ready", version: "0.1.0" });
    post(msg("hello", "h1")); await flush();
    expect(c.got).toContainEqual(expect.objectContaining({ type: "response", id: "h1", ok: true }));
    post(msg("status", "r2")); await flush();
    expect(sent).toEqual([msg("status", "r2")]);
    expect(c.got).toContainEqual(expect.objectContaining({ id: "r2", ok: true, data: { ezkTab: false } }));
    stop(); c.stop();
  });

  it("ignores messages from other windows, other origins or the wrong source", async () => {
    const sent: unknown[] = [];
    const runtime: RuntimeLike = { sendMessage: async (m) => { sent.push(m); return undefined; } };
    const stop = startRelay(window, runtime, "0.1.0");
    post(msg("status"), { source: null });
    post(msg("status"), { origin: "https://evil.example" });
    post({ ...msg("status"), source: EXT_SOURCE });
    await flush();
    expect(sent).toHaveLength(0);
    stop();
  });

  it("maps a dead extension context to EXT_RELOAD", async () => {
    const runtime: RuntimeLike = { sendMessage: async () => { throw new Error("Extension context invalidated."); } };
    const c = collect();
    const stop = startRelay(window, runtime, "0.1.0");
    post(msg("status", "x1")); await flush();
    expect(c.got).toContainEqual(expect.objectContaining({ id: "x1", ok: false, code: "EXT_RELOAD" }));
    stop(); c.stop();
  });
});

describe("popup", () => {
  it("focuses an existing eZK tab or opens a new one", async () => {
    const calls: string[] = [];
    const tabsApi = (tabs: { id: number; windowId: number }[]) => ({
      query: async (q: { url: string }) => { calls.push(`query ${q.url}`); return tabs; },
      update: async (id: number) => { calls.push(`update ${id}`); },
      create: async (o: { url: string }) => { calls.push(`create ${o.url}`); },
      focusWindow: async (id: number) => { calls.push(`focus ${id}`); },
    });
    await openEzk(tabsApi([{ id: 5, windowId: 2 }]));
    await openEzk(tabsApi([]));
    expect(calls).toEqual([`query ${EZK_MATCH}`, "update 5", "focus 2", `query ${EZK_MATCH}`, `create ${EZK_URL}`]);
  });
});

describe("manifest", () => {
  it("builds MV3 manifests: Chrome service worker vs Firefox scripts + gecko id", () => {
    const c = manifest("chrome", "0.1.0", ["https://app.example"]);
    const f = manifest("firefox", "0.1.0", ["https://app.example"]);
    for (const m of [c, f]) {
      expect(m.manifest_version).toBe(3);
      expect(m.permissions).toEqual(["tabs", "scripting"]);
      expect(m.host_permissions).toEqual(["https://esodisce.si/*"]);
      const relay = (m.content_scripts as { matches: string[]; js: string[] }[]).find((s) => s.js.includes("relay.js"))!;
      expect(relay.matches).toEqual(["https://app.example/*", "http://localhost/*", "http://127.0.0.1/*"]);
    }
    expect(c.background).toEqual({ service_worker: "background.js", type: "module" });
    expect(c).not.toHaveProperty("browser_specific_settings");
    expect(f.background).toEqual({ scripts: ["background.js"], type: "module" });
    expect(f.browser_specific_settings).toMatchObject({ gecko: { id: "ikataster@ikataster", strict_min_version: "140.0" } });
  });
});

import { reloadAppTabs } from "./background-core";
it("reloads already-open app tabs after install so the relay gets injected", async () => {
  const reloaded: number[] = [];
  const n = await reloadAppTabs(["https://app.example/*"], {
    query: async (q) => (q.url[0] === "https://app.example/*" ? [{ id: 4 }, { id: 9 }, {}] : []),
    reload: async (id) => { reloaded.push(id); },
  });
  expect(n).toBe(3); expect(reloaded).toEqual([4, 9]);
});
