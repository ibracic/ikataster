import { describe, it, expect, vi, beforeEach } from "vitest";
import { GursError, type GursClient, type KoDownload } from "../gurs";
import { createOfflineStore } from "../offline/store";
import { withOffline } from "../offline/withOffline";
import { setGursDown } from "./state";
import type { Mirror } from "./data";

const sq = (x: number, y: number, d = 0.001) => ({ type: "Polygon" as const, coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const KO: KoDownload = {
  ko: { id: 999, name: "VZORČNA VAS" },
  parcels: [{ eid: "P1", koId: 999, koName: "VZORČNA VAS", number: "100/1", area: 672, soilQuality: null, centroid: [15.0005, 46.0005], centroidD96: [500000, 100000], geometry: sq(15, 46) }],
  buildings: [{ eid: "B1", koId: 999, koName: "VZORČNA VAS", number: 682, floors: 4, flats: 12, businessUnits: 0, yearBuilt: 1830, facadeRenovated: null, type: null, structure: null,
    utilities: { electricity: true, water: true, sewage: true, gas: false }, centroid: [15.0002, 46.0002], centroidD96: [500000, 100000], geometry: sq(15.0001, 46.0001, 0.0003) }],
  parts: [{ building: 682, part: { eid: "D1", number: 1, use: "stanovanje", area: 44, usableArea: 37.5, floor: null, elevator: false, condominium: true } }],
};
const down = () => { throw new GursError("network", "Failed to fetch"); };
function gurs(): GursClient {
  return { findParcel: vi.fn(down), parcelAt: vi.fn(down), parcelAtD96: vi.fn(down), findBuilding: vi.fn(down), buildingAt: vi.fn(down), buildingParts: vi.fn(down),
    searchAddresses: vi.fn(down), listKos: vi.fn(down) } as unknown as GursClient;
}
function mirror(): Mirror {
  return {
    downloadKo: vi.fn(async (id: number) => { if (id !== 999) throw new Error("unknown"); return KO; }),
    kosAt: vi.fn(async (lon: number, lat: number) => (lon > 14 && lon < 16 && lat > 45 && lat < 47 ? [999] : [])),
    searchAddresses: vi.fn(async () => [{ id: "m", label: "Trg 1", place: "2230 Lenart", postCode: 2230, municipality: "Lenart", e: 1, n: 2, lon: 15, lat: 46, buildingEid: null }]),
  } as unknown as Mirror;
}
let n = 0;
beforeEach(() => setGursDown(false));

describe("GURS unreachable -> mirror", () => {
  it("loads the KO from the mirror on demand and answers parcel, building and parts lookups", async () => {
    const store = createOfflineStore(`fb-${n++}`), m = mirror();
    const c = withOffline(gurs(), store, m);
    expect((await c.findParcel(999, "100/1"))?.eid).toBe("P1");
    expect((await c.findBuilding(999, 682))?.flats).toBe(12);
    expect((await c.buildingParts(999, 682)).map((p) => p.number)).toEqual([1]);
    expect(m.downloadKo).toHaveBeenCalledTimes(1);
    // kept as a pin for offline use, in the background
    await vi.waitFor(async () => expect((await store.listPins()).map((p) => p.koId)).toEqual([999]), { timeout: 5000, interval: 200 });
  });

  it("finds parcel and building by map point via the KO index", async () => {
    const c = withOffline(gurs(), createOfflineStore(`fb-${n++}`), mirror());
    expect((await c.parcelAt(15.0005, 46.0005))?.number).toBe("100/1");
    expect((await c.buildingAt(15.0002, 46.0002))?.number).toBe(682);
  });

  it("searches addresses in the mirror", async () => {
    const c = withOffline(gurs(), createOfflineStore(`fb-${n++}`), mirror());
    expect((await c.searchAddresses("trg 1"))[0].label).toBe("Trg 1");
  });

  it("treats GURS firewall refusals (403) as unavailable", async () => {
    const g = gurs();
    (g.findBuilding as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new GursError("http", "HTTP 403", 403); });
    expect((await withOffline(g, createOfflineStore(`fb-${n++}`), mirror()).findBuilding(999, 682))?.number).toBe(682);
  });

  it("skips GURS entirely once it is known to be down", async () => {
    setGursDown(true);
    const g = gurs();
    await withOffline(g, createOfflineStore(`fb-${n++}`), mirror()).findParcel(999, "100/1");
    expect(g.findParcel).not.toHaveBeenCalled();
  });

  it("asks GURS only when the copy has no answer, and passes its not-found through", async () => {
    const g = gurs();
    (g.findParcel as ReturnType<typeof vi.fn>).mockImplementation(async () => null);
    const m = mirror();
    expect(await withOffline(g, createOfflineStore(`fb-${n++}`), m).findParcel(999, "1")).toBeNull();
    expect(m.downloadKo).toHaveBeenCalledTimes(1);
    expect(g.findParcel).toHaveBeenCalledTimes(1);
  });

  it("answers from the copy first even when GURS works (GURS is never asked)", async () => {
    const ok = vi.fn(async () => { throw new Error("GURS must not be called"); });
    const g = { ...gurs(), findParcel: ok, findBuilding: ok, buildingParts: ok, buildingAt: ok, parcelAt: ok, searchAddresses: ok } as unknown as GursClient;
    const c = withOffline(g, createOfflineStore(`fb-${n++}`), mirror());
    expect((await c.findParcel(999, "100/1"))?.eid).toBe("P1");
    expect((await c.buildingAt(15.0002, 46.0002))?.number).toBe(682);
    expect((await c.buildingParts(999, 682)).length).toBe(1);
    expect((await c.searchAddresses("trg 1", 8))[0].label).toBe("Trg 1");
    expect(ok).not.toHaveBeenCalled();
  });

  it("serves parcel details from the copy and asks GURS only for the spatial plan unit", async () => {
    const extra = { landUse: ["gozdna zemljišča"], intendedUse: [{ code: "stanovanjske površine", description: "" }], buildings: [] };
    const p = { ...KO.parcels[0], extra };
    const details = vi.fn(async () => { throw new Error("full GURS details must not be called"); });
    const spu = vi.fn(async () => ({ code: "LE 12", plan: "OPN Lenart" }));
    const c = withOffline({ ...gurs(), parcelDetails: details, spatialPlanUnit: spu } as unknown as GursClient, createOfflineStore(`fb-${n++}`), mirror());
    expect(await c.parcelDetails(p)).toEqual({ ...extra, spatialPlanUnit: { code: "LE 12", plan: "OPN Lenart" }, soilQuality: null, errors: [] });
    setGursDown(true);
    expect((await c.parcelDetails(p)).errors).toEqual(["spatialPlanUnit"]);
    expect(spu).toHaveBeenCalledTimes(1);
    expect(details).not.toHaveBeenCalled();
  });
});
