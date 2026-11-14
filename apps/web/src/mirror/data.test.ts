import { describe, it, expect, vi } from "vitest";
import { decodeGeometry, createMirror, addressKey } from "./data";
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

const MGR_INDEX = { v: 1, date: "2026-11-13", m: [[714, "UPRAVNIK Vzorčni d.o.o.", 3, 2, [999, 998]], [715, "DRUGI UPRAVITELJ", 1, 1, [999]]] };
const MGR = { v: 1, id: 714, name: "UPRAVNIK Vzorčni d.o.o.", b: [
  [998, 5, "100200000000000009", null, [[1, "100300000000000009", 2]]],
  [999, 682, "100200000000000002", [[ring(SQ)]], [[1, "100300000000000003", 2], [2, "100300000000000004", null]]],
] };

function fakeFetch() {
  return vi.fn(async (u: string) => {
    const p = new URL(u).pathname;
    if (p === "/mirror/ko/index.json") return Response.json(INDEX);
    if (p === "/mirror/ko/999.json") return Response.json(KO);
    if (p === "/mirror/mgr/index.json") return Response.json(MGR_INDEX);
    if (p === "/mirror/mgr/714.json") return Response.json(MGR);
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



  it("searches managers locally by every folded word", async () => {
    const m = createMirror({ fetch: fakeFetch() as unknown as typeof fetch, base: "https://app.example/mirror" });
    expect((await m.searchManagers("vzorcni upr")).managers).toEqual([{ id: 714, name: "UPRAVNIK Vzorčni d.o.o.", address: null, parts: 3 }]);
    expect((await m.searchManagers("up", 20)).managers).toEqual([]);
    const all = await m.searchManagers("upr", 1);
    expect(all.managers).toHaveLength(1);
    expect(all.truncated).toBe(true);
  });

  it("opens a portfolio from one file, filters by KO and serves its outlines", async () => {
    const f = fakeFetch();
    const m = createMirror({ fetch: f as unknown as typeof fetch, base: "https://app.example/mirror" });
    const p = await m.managerPortfolio(714);
    expect(p!.buildings.map((b) => [b.koId, b.number, b.parts.length])).toEqual([[998, 5, 1], [999, 682, 2]]);
    expect(p!.parts[1]).toEqual({ koId: 999, building: 682, part: 1, eid: "100300000000000003", buildingEid: "100200000000000002", use: "stanovanje" });
    expect((await m.managerPortfolio(714, 999))!.parts).toHaveLength(2);
    expect(f.mock.calls.filter(([u]) => String(u).endsWith("/mgr/714.json"))).toHaveLength(1);
    expect([...m.knownOutlines([{ koId: 999, number: 682 }, { koId: 998, number: 5 }]).keys()]).toEqual(["999:682"]);
  });

});

describe("mirror details (extras)", () => {
  const docs = (extra: object) => vi.fn(async (u: string) => {
    const p = new URL(u).pathname;
    if (p === "/mirror/ko/index.json") return Response.json({ ...INDEX, codes: { ...INDEX.codes, landUse: { 10: "gozdna zemljišča", 11: "poseljena zemljišča" }, intended: { 3: ["stanovanjske površine", "opis"] } } });
    if (p === "/mirror/ko/999.json") return Response.json({ ...KO, ...extra });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;

  it("decodes parcel land use, intended use, buildings and part floor/entrance/address", async () => {
    const m = createMirror({ fetch: docs({
      pe: { "100/1": [[[[10], 60], [[11], 40]], [[3, 100]], [[999, 682, 120, "100200000000000002"]]] },
      de: { 682: [[1, "2,3", 2, "Trg osvoboditve 1, 2230 Lenart v Slov. goricah, stan. 1"]] },
    }), base: "https://app.example/mirror" });
    const d = await m.downloadKo(999);
    expect(d.parcels[0].extra).toEqual({
      landUse: ["gozdna zemljišča (60 %)", "poseljena zemljišča (40 %)"],
      intendedUse: [{ code: "stanovanjske površine", description: "opis" }],
      buildings: [{ eid: "100200000000000002", koId: 999, number: 682, areaOnParcel: 120 }],
    });
    expect(d.parts[0].part).toMatchObject({ floor: "2,3", entranceFloor: 2, address: "Trg osvoboditve 1, 2230 Lenart v Slov. goricah, stan. 1" });
  });

  it("leaves extra undefined for old files without details", async () => {
    const d = await createMirror({ fetch: docs({}), base: "https://app.example/mirror" }).downloadKo(999);
    expect(d.parcels[0].extra).toBeUndefined();
    expect(d.parts[0].part.floor).toBeNull();
  });
});
