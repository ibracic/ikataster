// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { probeOrtho } from "./orthoProbe";

const res = (status: number, type: string) => new Response("x", { status, headers: { "content-type": type } });
describe("probeOrtho", () => {
  it("ok for an image", async () => { expect(await probeOrtho(vi.fn().mockResolvedValue(res(200, "image/jpeg")))).toBe(true); });
  it("fails on 403 or an HTML block page", async () => {
    expect(await probeOrtho(vi.fn().mockResolvedValue(res(403, "text/html")))).toBe(false);
    expect(await probeOrtho(vi.fn().mockResolvedValue(res(200, "text/html")))).toBe(false);
  });
  it("fails on network error and timeout", async () => {
    expect(await probeOrtho(vi.fn().mockRejectedValue(new TypeError("net")))).toBe(false);
    const hang = vi.fn((_u: string, o: RequestInit) => new Promise<Response>((_r, rej) => o.signal!.addEventListener("abort", () => rej(new Error("abort")))));
    expect(await probeOrtho(hang as unknown as typeof fetch, 20)).toBe(false);
  });
});

describe("ORTHO_PROBE_URL", () => {
  it("uses only standard WMS parameters (GURS WAF blocks unknown ones)", async () => {
    const { ORTHO_PROBE_URL } = await import("./orthoProbe");
    const keys = [...new URL(ORTHO_PROBE_URL).searchParams.keys()];
    expect(keys.sort()).toEqual(["bbox", "crs", "format", "height", "layers", "request", "service", "styles", "version", "width"]);
  });
});
