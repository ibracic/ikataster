import {
  APP_SOURCE, EXT_SOURCE, PROTOCOL_VERSION, BRIDGE_TIMEOUT_MS,
  isAllowedOrigin, parseOrigins, ALLOWED_ORIGINS, isAppMessage, isExtMessage, acceptWindowMessage, createBridgeClient, mockTransport, BridgeError,
  type Transport, type ExtMessage,
} from "./index";

describe("origins", () => {
  it("allows only the production app and local dev origins", () => {
    expect(isAllowedOrigin("https://app.example")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4173")).toBe(true);
    for (const o of ["https://evil.example", "https://app.example.evil.com", "http://app.example", "null", "", "https://esodisce.si"]) {
      expect(isAllowedOrigin(o)).toBe(false);
    }
  });
});

describe("build-time origins", () => {
  it("parses only bare https origins from IKATASTER_ORIGINS", () => {
    expect(parseOrigins("https://a.example, https://b.example  https://c.example")).toEqual(["https://a.example", "https://b.example", "https://c.example"]);
    expect(parseOrigins("http://a.example,https://a.example/,https://a.example/x,nope,,")).toEqual([]);
    expect(parseOrigins(undefined)).toEqual([]);
    expect(ALLOWED_ORIGINS).toEqual(["https://app.example"]);
  });
});

describe("message validation", () => {
  it("recognises app requests and extension replies by source, version and shape", () => {
    expect(isAppMessage({ source: APP_SOURCE, v: PROTOCOL_VERSION, id: "a1", type: "hello" })).toBe(true);
    expect(isAppMessage({ source: APP_SOURCE, v: PROTOCOL_VERSION, id: "a1", type: "nope" })).toBe(false);
    expect(isAppMessage({ source: APP_SOURCE, v: 99, id: "a1", type: "hello" })).toBe(false);
    expect(isAppMessage({ source: EXT_SOURCE, v: PROTOCOL_VERSION, id: "a1", type: "hello" })).toBe(false);
    expect(isAppMessage("hello")).toBe(false);
    expect(isExtMessage({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "ready", version: "0.1.0" })).toBe(true);
    expect(isExtMessage({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "response", id: "a1", ok: true, data: {} })).toBe(true);
    expect(isExtMessage({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "response", ok: true })).toBe(false); // no id
  });

  it("accepts window messages only from the same window, same origin, an allowed origin and the expected source", () => {
    const win = { location: { origin: "https://app.example" } } as unknown as Window;
    const data = { source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "ready", version: "1" };
    const ev = (o: Partial<MessageEvent>) => ({ source: win, origin: "https://app.example", data, ...o }) as MessageEvent;
    expect(acceptWindowMessage(ev({}), win, "ext")).toEqual(data);
    expect(acceptWindowMessage(ev({ source: {} as Window }), win, "ext")).toBeNull(); // iframe / other window
    expect(acceptWindowMessage(ev({ origin: "https://evil.example" }), win, "ext")).toBeNull();
    expect(acceptWindowMessage(ev({}), win, "app")).toBeNull(); // wrong direction
    const foreign = { location: { origin: "https://evil.example" } } as unknown as Window;
    expect(acceptWindowMessage(ev({ source: foreign, origin: "https://evil.example" }), foreign, "ext")).toBeNull();
  });
});

describe("bridge client", () => {
  it("correlates responses by request id", async () => {
    const t = mockTransport({ status: async () => ({ ezkTab: true }) });
    const c = createBridgeClient(t);
    await expect(c.request("status")).resolves.toEqual({ ezkTab: true });
  });

  it("hello handshake returns extension info, or null when nothing answers in time", async () => {
    await expect(createBridgeClient(mockTransport({})).hello(50)).resolves.toMatchObject({ version: expect.any(String), mock: true });
    const silent: Transport = { send() {}, onMessage: () => () => {} };
    await expect(createBridgeClient(silent).hello(20)).resolves.toBeNull();
  });

  it("rejects with a typed error when the extension answers ok:false", async () => {
    const c = createBridgeClient(mockTransport({ status: async () => { throw new BridgeError("NO_EZK_TAB", "no tab"); } }));
    await expect(c.request("status")).rejects.toMatchObject({ code: "NO_EZK_TAB" });
  });

  it("times out after the configured timeout (default 90 s) and ignores late replies", async () => {
    expect(BRIDGE_TIMEOUT_MS).toBe(90_000);
    vi.useFakeTimers();
    let listener: ((m: ExtMessage) => void) | undefined;
    let lastId = "";
    const t: Transport = { send: (m) => { lastId = m.id; }, onMessage: (fn) => { listener = fn; return () => {}; } };
    const c = createBridgeClient(t);
    const p = c.request("status");
    const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
    vi.advanceTimersByTime(90_000);
    await assertion;
    listener!({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "response", id: lastId, ok: true, data: {} }); // no throw
    vi.useRealTimers();
  });

  it("generates unique request ids", () => {
    const ids = new Set<string>();
    const t: Transport = { send: (m) => { ids.add(m.id); }, onMessage: () => () => {} };
    const c = createBridgeClient(t, { timeoutMs: 1 });
    for (let i = 0; i < 50; i++) c.request("status").catch(() => {});
    expect(ids.size).toBe(50);
  });
});
