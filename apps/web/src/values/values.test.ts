import { describe, expect, it } from "vitest";
import { createValues, formatEur, parcelValue, partValue, VALUES_TTL } from ".";

const file = { v: 1, date: "2026-09-26", ko: 999, p: { "100/1": 13500 }, d: { "20/3": 65200 } };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function setup(respond: (url: string) => Response | Promise<Response>) {
  let t = 1_000_000;
  const calls: string[] = [];
  const v = createValues({
    name: `values-${Math.random()}`, base: "https://data.example/",
    fetch: (async (u: string) => { calls.push(u); return respond(u); }) as unknown as typeof fetch,
    now: () => t,
  });
  return { v, calls, advance: (ms: number) => { t += ms; } };
}

describe("values", () => {
  it("fetches a KO file once and looks up parcel and part values", async () => {
    const { v, calls } = setup(() => json(file));
    const k = await v.get(999);
    expect(calls).toEqual(["https://data.example/ko/999.json"]);
    expect(parcelValue(k, "100/1")).toBe(13500);
    expect(partValue(k, 20, 3)).toBe(65200);
    expect(partValue(k, 20, 4)).toBeUndefined();
    await v.get(999);
    expect(calls).toHaveLength(1);
  });

  it("treats 404 as a KO without values and remembers it", async () => {
    const { v, calls } = setup(() => new Response("", { status: 404 }));
    expect(await v.get(1)).toBeNull();
    expect(await v.get(1)).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("refreshes after the TTL and serves stale data when the network fails", async () => {
    let fail = false;
    const { v, calls, advance } = setup(() => { if (fail) throw new TypeError("offline"); return json(file); });
    await v.get(999);
    advance(VALUES_TTL + 1);
    fail = true;
    expect(parcelValue(await v.get(999), "100/1")).toBe(13500);
    expect(calls).toHaveLength(2);
  });

  it("throws when nothing is cached and the network fails", async () => {
    const { v } = setup(() => json({}, 500));
    await expect(v.get(5)).rejects.toThrow();
  });

  it("formats euros per language", () => {
    expect(formatEur(65200, "sl").replace(/\s/g, " ")).toMatch(/65\.200 €/);
    expect(formatEur(65200, "en")).toBe("€65,200");
  });
});
