import { describe, it, expect, vi } from "vitest";
import { GursError, type GursClient, type KoDownload } from "../gurs";
import { createOfflineStore } from "../offline/store";
import type { Mirror } from "../mirror/data";
import { withCopy } from "./copy";

const sq = (x: number, y: number, d = 0.001) => ({ type: "Polygon" as const, coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const extra = { landUse: ["gozdna zemljišča"], intendedUse: [], buildings: [] };
const KO: KoDownload = {
  ko: { id: 999, name: "VZORČNA VAS" },
  parcels: [
    { eid: "P1", koId: 999, koName: "VZORČNA VAS", number: "100/1", area: 672, soilQuality: null, centroid: [15.0005, 46.0005], centroidD96: [500000, 100000], geometry: sq(15, 46), extra },
    { eid: "P2", koId: 999, koName: "VZORČNA VAS", number: "100/2", area: 50, soilQuality: null, centroid: [15.0105, 46.0105], centroidD96: [500000, 100000], geometry: sq(15.01, 46.01) },
  ],
  buildings: [{ eid: "B1", koId: 999, koName: "VZORČNA VAS", number: 682, floors: 4, flats: 12, businessUnits: 0, yearBuilt: 1830, facadeRenovated: null, type: null, structure: null,
    utilities: { electricity: true, water: true, sewage: true, gas: false }, centroid: [15.0002, 46.0002], centroidD96: [500000, 100000], geometry: sq(15.0001, 46.0001, 0.0003) }],
  parts: [{ building: 682, part: { eid: "D1", number: 1, use: "stanovanje", area: 44, usableArea: 37.5, floor: null, elevator: false, condominium: true } }],
};

/** Every GURS method throws: the copy must never need it (except spatialPlanUnit, set per test). */
function gurs(): GursClient {
  const no = () => { throw new Error("GURS must not be asked"); };
  return new Proxy({}, { get: (_t, k) => (k === "then" ? undefined : vi.fn(no)) }) as unknown as GursClient;
}
function mirror(o: { down?: boolean } = {}): Mirror {
  return {
    downloadKo: vi.fn(async (id: number) => { if (o.down) throw new TypeError("Failed to fetch"); if (id !== 999) throw new Error("unknown"); return KO; }),
    kosAt: vi.fn(async (lon: number, lat: number) => (lon > 14 && lon < 16 && lat > 45 && lat < 47 ? [999] : [])),
    kosIn: vi.fn(async () => [999]),
    listKos: vi.fn(async () => [{ id: 999, name: "VZORČNA VAS" }]),
    searchAddresses: vi.fn(async () => []),
  } as unknown as Mirror;
}
let n = 0;
const store = () => createOfflineStore(`copy-${n++}`);

describe("cadastre copy client", () => {
  it("answers lookups from the copy, loading each KO once, and never asks GURS", async () => {
    const m = mirror();
    const c = withCopy(gurs(), m, store(), { pinDelayMs: 0 });
    expect((await c.findParcel(999, "100/1"))?.eid).toBe("P1");
    expect((await c.findBuilding(999, 682))?.flats).toBe(12);
    expect((await c.buildingParts(999, 682)).map((p) => p.number)).toEqual([1]);
    expect((await c.parcelAt(15.0005, 46.0005))?.number).toBe("100/1");
    expect((await c.buildingAt(15.0002, 46.0002))?.number).toBe(682);
    expect(m.downloadKo).toHaveBeenCalledTimes(1);
  });

  it("a miss in the copy is final: not found, no GURS question", async () => {
    const c = withCopy(gurs(), mirror(), store(), { pinDelayMs: 0 });
    expect(await c.findParcel(999, "1/1")).toBeNull();
    expect(await c.buildingParts(999, 1)).toEqual([]);
    expect(await c.parcelAt(10, 10)).toBeNull();
  });

  it("keeps loaded KOs on the device and answers from them when the copy can't be reached", async () => {
    const s = store();
    await withCopy(gurs(), mirror(), s, { pinDelayMs: 0 }).findBuilding(999, 682);
    await vi.waitFor(async () => expect((await s.listPins()).map((p) => p.koId)).toEqual([999]), { timeout: 5000, interval: 100 });
    const offline = withCopy(gurs(), mirror({ down: true }), s, { pinDelayMs: 0 });
    expect((await offline.findParcel(999, "100/1"))?.eid).toBe("P1");
    expect((await offline.buildingParts(999, 682)).length).toBe(1);
  });

  it("finds parcels in a drawn area from the copy", async () => {
    const c = withCopy(gurs(), mirror(), store(), { pinDelayMs: 0 });
    const ring: [number, number][] = [[14.99, 45.99], [15.005, 45.99], [15.005, 46.005], [14.99, 46.005]];
    const r = await c.featuresInPolygon("parcel", ring, { max: 300 });
    expect(r.items.map((i) => i.number)).toEqual(["100/1"]);
    expect(r.tooMany).toBe(false);
    expect((await c.featuresInPolygon("parcel", ring, { max: 0 })).tooMany).toBe(true);
    await expect(c.featuresInPolygon("parcel", ring.slice(0, 2))).rejects.toBeInstanceOf(GursError);
  });

  it("parcel details come from the copy; GURS only for the spatial plan unit (EUP)", async () => {
    const spatialPlanUnit = vi.fn(async () => ({ code: "LE 12", plan: "OPN Lenart" }));
    const g = { ...({} as GursClient), spatialPlanUnit } as unknown as GursClient;
    const c = withCopy(g, mirror(), store(), { pinDelayMs: 0 });
    const d = await c.parcelDetails(KO.parcels[0]);
    expect(d).toMatchObject({ landUse: ["gozdna zemljišča"], spatialPlanUnit: { code: "LE 12" }, errors: [] });
    spatialPlanUnit.mockRejectedValueOnce(new GursError("network", "x"));
    expect((await c.parcelDetails(KO.parcels[0])).errors).toEqual(["spatialPlanUnit"]);
  });
});
