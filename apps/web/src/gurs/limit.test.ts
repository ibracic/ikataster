import { getJson, GURS_MAX_PARALLEL } from "./wfs";

describe("GURS request limiter", () => {
  it("never has more than GURS_MAX_PARALLEL requests in flight", async () => {
    let active = 0, peak = 0;
    const fetch = (async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return new Response("{}", { status: 200 });
    }) as typeof globalThis.fetch;
    await Promise.all(Array.from({ length: 20 }, (_, i) => getJson(`https://x.example/${i}`, { fetch, timeoutMs: 1000 })));
    expect(peak).toBe(GURS_MAX_PARALLEL);
  });

  it("aborted waiters give up their slot without fetching", async () => {
    let calls = 0;
    const fetch = (async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return new Response("{}"); }) as typeof globalThis.fetch;
    const busy = Array.from({ length: GURS_MAX_PARALLEL }, (_, i) => getJson(`https://x.example/b${i}`, { fetch, timeoutMs: 1000 }));
    const ctl = new AbortController();
    const waiting = getJson("https://x.example/w", { fetch, timeoutMs: 1000, signal: ctl.signal });
    ctl.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    await Promise.all(busy);
    expect(calls).toBe(GURS_MAX_PARALLEL);
  });
});
