import { describe, it, expect, vi } from "vitest";
import { decodeGeometry, createMirror, withMirror, addressKey } from "./data";
import type { GursClient } from "../gurs";

const ring = (pts: [number, number][]) => {
  const out: number[] = []; let px = 0, py = 0;
  for (const [x, y] of pts) { const ix = Math.round(x * 1e6), iy = Math.round(y * 1e6); out.push(ix - px, iy - py); px = ix; py = iy; }
  return out;
};
const SQ: [number, number][] = [[15.8, 46.5], [15.801, 46.5], [15.801, 46.501], [15.8, 46.5]];
const INDEX = {
  v: 1, date: "2026-11-13", src: "Geodetska uprava Republike Slovenije, kataster nepremičnin, stanje 2026-11-13",
  codes: { use: { 2: "stanovanje" }, type: { 1: "samostoječa stavba" }, structure: { 1: "opeka" }, status: { 1: "Katastrski vpis po ZEN" }, areaMethod: { 1: "Izmerjena površina" }, mgrStatus: { 2: "R – registrski" } },
  kos: [[999, "VZORČNA VAS", [15.7, 46.4, 15.9, 46.6], 1, 1]],
};
const KO = {
  v: 1, ko: [999, "VZORČNA VAS"], date: "2026-11-13", src: "x", managers: { 714: "UPRAVNIK d.o.o." },
  p: [["100/1", "100100000000000001", 672, 51, 563410.03, 160683.78, [[ring(SQ)]]]],
  b: [[682, "100200000000000002", 4, 12, 0, 1830, 2020, 1, 1, 1, 1, 1, 0, 563557.24, 159893.19, [[ring(SQ)], [ring(SQ)]]]],
  d: { 682: [[1, "100300000000000003", 2, 44, 37.5, 0, 1, 1, 2020, 2020, 0, 1, 1, 714, 2]] },
};
const SHARD = { v: 1, date: "2026-11-13", src: "x", a: [
  ["Trg osvoboditve", "1", 2230, "Lenart v Slov. goricah", "Lenart", 563610, 159947, "100200000208213088"],
  ["Trg osvoboditve", "10", 2230, "Lenart v Slov. goricah", "Lenart", 563700, 159900, null],
  ["Trnovska ulica", "3", 1000, "Ljubljana", "Ljubljana", 462000, 100000, null],
] };

function fakeFetch() {
  return vi.fn(async (u: string) => {
    const p = new URL(u).pathname;
    if (p === "/mirror/ko/index.json") return Response.json(INDEX);
    if (p === "/mirror/ko/999.json") return Response.json(KO);
    if (p === "/mirror/addr/tr.json") return Response.json(SHARD);
    return new Response("", { status: 404 });
  });
}

describe("mirror data", () => {
  it("decodes delta-encoded polygons and multipolygons", () => {
    expect(decodeGeometry([[ring(SQ)]])).toEqual({ type: "Polygon", coordinates: [SQ] });
    expect(decodeGeometry([[ring(SQ)], [ring(SQ)]]).type).toBe("MultiPolygon");
  });

  it("loads a KO as the same KoDownload shape the GURS client returns", async () => {
    const m = createMirror({ fetch: fakeFetch() as unknown as typeof fetch, base: "https://app.example/mirror" });
    const d = await m.downloadKo(999);
    expect(d.ko).toEqual({ id: 999, name: "VZORČNA VAS" });
    const p = d.parcels[0];
    expect(p).toMatchObject({ koId: 999, koName: "VZORČNA VAS", number: "100/1", eid: "100100000000000001", area: 672, soilQuality: 51, centroidD96: [563410.03, 160683.78] });
    expect(p.geometry).toEqual({ type: "Polygon", coordinates: [SQ] });
    expect(p.centroid[0]).toBeCloseTo(15.82, 1);
    const b = d.buildings[0];
    expect(b).toMatchObject({ number: 682, floors: 4, flats: 12, businessUnits: 0, yearBuilt: 1830, facadeRenovated: 2020, type: "samostoječa stavba", structure: "opeka",
      utilities: { electricity: true, water: true, sewage: true, gas: false } });
    expect(d.parts).toEqual([{ building: 682, part: expect.objectContaining({ number: 1, eid: "100300000000000003", use: "stanovanje", area: 44, usableArea: 37.5,
      elevator: false, condominium: true, flat: 1, installationsYear: 2020, windowsYear: 2020, commonPart: false, status: "Katastrski vpis po ZEN",
      areaMethod: "Izmerjena površina", floor: null, manager: { id: 714, name: "UPRAVNIK d.o.o.", status: "R – registrski" } }) }]);
    expect(m.date()).toBe("2026-11-13");
  });

  it("lists KOs from the index and rejects unknown KOs", async () => {
    const m = createMirror({ fetch: fakeFetch() as unknown as typeof fetch, base: "https://app.example/mirror" });
    expect(await m.listKos()).toEqual([{ id: 999, name: "VZORČNA VAS" }]);
    await expect(m.downloadKo(5)).rejects.toThrow();
  });

  it("searches addresses in the shard of the first two folded letters", async () => {
    expect(addressKey("Čopova")).toBe("co");
    expect(addressKey("Ž")).toBe("z_");
    const f = fakeFetch();
    const m = createMirror({ fetch: f as unknown as typeof fetch, base: "https://app.example/mirror" });
    const r = await m.searchAddresses("trg osvoboditve 1, lenart");
    expect(r[0]).toMatchObject({ label: "Trg osvoboditve 1", place: "2230 Lenart v Slov. goricah", postCode: 2230, municipality: "Lenart", e: 563610, n: 159947, buildingEid: "100200000208213088" });
    expect(r.map((a) => a.label)).toEqual(["Trg osvoboditve 1", "Trg osvoboditve 10"]);
    expect(await m.searchAddresses("x")).toEqual([]);
    expect((await m.searchAddresses("Trg osvoboditve 1, 2230 Lenart v Slov. goricah"))[0]?.label).toBe("Trg osvoboditve 1");
  });

  it("pins KOs from the mirror and falls back to GURS when the mirror fails", async () => {
    const gurs = { downloadKo: vi.fn(async () => ({ ko: { id: 5, name: "G" }, parcels: [], buildings: [], parts: [] })), listKos: vi.fn() } as unknown as GursClient;
    const c = withMirror(gurs, createMirror({ fetch: fakeFetch() as unknown as typeof fetch, base: "https://app.example/mirror" }));
    expect((await c.downloadKo(999)).ko.name).toBe("VZORČNA VAS");
    expect(gurs.downloadKo).not.toHaveBeenCalled();
    expect((await c.downloadKo(5)).ko.name).toBe("G");
  });

  it("lists KOs from the mirror (GURS blocks range filters), GURS only as fallback", async () => {
    const gurs = { listKos: vi.fn(async () => [{ id: 1, name: "G" }]) } as unknown as GursClient;
    expect(await withMirror(gurs, createMirror({ fetch: fakeFetch() as unknown as typeof fetch, base: "https://app.example/mirror" })).listKos()).toEqual([{ id: 999, name: "VZORČNA VAS" }]);
    expect(gurs.listKos).not.toHaveBeenCalled();
    const down = createMirror({ fetch: (async () => new Response("", { status: 500 })) as unknown as typeof fetch, base: "https://app.example/mirror" });
    expect(await withMirror(gurs, down).listKos()).toEqual([{ id: 1, name: "G" }]);
  });
});
