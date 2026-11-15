// @vitest-environment node
import { createLiveGurs, GursError, type Parcel } from ".";

const parcel = { centroidD96: [549301.48, 157807.83] } as Parcel;
const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("live GURS (EUP only)", () => {
  it("asks the MNVP WFS for the unit under the parcel centroid", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return new Response(JSON.stringify({ features: [{ properties: { EUP_OZN: "RT-72", NAZIV_PA: "OPN Maribor" } }] })); }) as unknown as typeof fetch;
    expect(await createLiveGurs({ fetch: f }).spatialPlanUnit(parcel)).toEqual({ code: "RT-72", plan: "OPN Maribor" });
    // GURS's firewall rejects unknown parameters: only standard WFS ones may be sent
    expect([...new URL(urls[0]).searchParams.keys()].sort()).toEqual(["count", "cql_filter", "outputFormat", "propertyName", "request", "service", "typeNames", "version"]);
    expect(new URL(urls[0]).searchParams.get("cql_filter")).toBe("INTERSECTS(GEOM,POINT(549301.48 157807.83))");
  });
  it("no unit -> null; OGC exception, HTTP error, network failure and timeout -> typed GursError", async () => {
    expect(await createLiveGurs({ fetch: reply('{"features":[]}') }).spatialPlanUnit(parcel)).toBeNull();
    await expect(createLiveGurs({ fetch: reply("<ows:ExceptionText>bad filter</ows:ExceptionText>") }).spatialPlanUnit(parcel)).rejects.toMatchObject({ kind: "service" });
    await expect(createLiveGurs({ fetch: reply("down", 403) }).spatialPlanUnit(parcel)).rejects.toMatchObject({ kind: "http", status: 403 });
    const net = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(createLiveGurs({ fetch: net }).spatialPlanUnit(parcel)).rejects.toBeInstanceOf(GursError);
    const slow = ((_: unknown, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    await expect(createLiveGurs({ fetch: slow, timeoutMs: 20 }).spatialPlanUnit(parcel)).rejects.toMatchObject({ kind: "timeout" });
  });
});
