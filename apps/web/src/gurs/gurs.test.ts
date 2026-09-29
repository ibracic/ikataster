import { createGursClient, GursError, searchKos, toD96, fromD96, gursPublicViewUrl } from ".";
import { fakeFetch, fixture, q, typeIs } from "./testFetch";

describe("projection", () => {
  it("converts WGS84 to D96/TM and back within centimetres", () => {
    const [e, n] = toD96(15.6455, 46.5577);
    expect(e).toBeCloseTo(549492.81, 1);
    expect(n).toBeCloseTo(157764.67, 1);
    const [lon, lat] = fromD96(e, n);
    expect(lon).toBeCloseTo(15.6455, 6);
    expect(lat).toBeCloseTo(46.5577, 6);
  });
});

describe("listKos", () => {
  it("fetches KOs by id ranges in parallel (GURS caps page size and paging depth) and merges them sorted", async () => {
    const f = fakeFetch([
      [(u) => q(u, "cql_filter") === "KO_ID BETWEEN 1 AND 300", fixture("ko-page2.json")],
      [(u) => q(u, "cql_filter") === "KO_ID BETWEEN 301 AND 600", fixture("ko-page1.json")],
      [typeIs("SI.GURS.KN:KATASTRSKE_OBCINE"), fixture("parcel-empty.json")],
    ]);
    const kos = await createGursClient({ fetch: f }).listKos();
    expect(kos.map((k) => k.id)).toEqual([1, 2, 3, 4, 5]);
    expect(kos[0]).toEqual({ id: 1, name: "HODOŠ" });
    const cqls = f.calls.map((u) => q(u, "cql_filter"));
    expect(cqls).toContain("KO_ID > 3300");
    expect(f.calls.every((u) => Number(q(u, "count")) <= 300 && !u.searchParams.has("startIndex"))).toBe(true);
  });
});

describe("searchKos", () => {
  const kos = [
    { id: 657, name: "MARIBOR GRAD" },
    { id: 658, name: "TABOR" },
    { id: 1722, name: "TRNOVO" },
    { id: 2636, name: "TRNOVO OB SOČI" },
    { id: 1, name: "HODOŠ" },
  ];
  it("matches by number prefix, exact number first", () => {
    expect(searchKos(kos, "657").map((k) => k.id)).toEqual([657]);
    expect(searchKos(kos, "65").map((k) => k.id)).toEqual([657, 658]);
  });
  it("matches names case- and diacritic-insensitively, prefix before substring", () => {
    expect(searchKos(kos, "hodos").map((k) => k.id)).toEqual([1]);
    expect(searchKos(kos, "trnovo").map((k) => k.id)).toEqual([1722, 2636]);
    expect(searchKos(kos, "grad").map((k) => k.id)).toEqual([657]);
  });
  it("returns nothing for an empty query and limits results", () => {
    expect(searchKos(kos, " ")).toEqual([]);
    expect(searchKos(kos, "o", 2)).toHaveLength(2);
  });
});

describe("findParcel", () => {
  it("returns a Parcel with WGS84 geometry and domain fields", async () => {
    const f = fakeFetch([[typeIs("SI.GURS.KN:PARCELE"), fixture("parcel-657-1587.json")]]);
    const p = await createGursClient({ fetch: f }).findParcel(657, "1587");
    expect(p).toMatchObject({ koId: 657, koName: "MARIBOR GRAD", number: "1587", area: 1011, eid: "100100000222153246" });
    expect(p!.geometry.type).toBe("Polygon");
    const [lon, lat] = (p!.geometry as GeoJSON.Polygon).coordinates[0][0];
    expect(lon).toBeGreaterThan(15.6);
    expect(lat).toBeGreaterThan(46.5);
    expect(p!.centroid[0]).toBeCloseTo(15.6430, 2);
    const u = f.calls[0];
    expect(q(u, "srsName")).toBe("EPSG:4326");
    expect(q(u, "cql_filter")).toBe("KO_ID=657 AND ST_PARCELE='1587'");
  });

  it("returns null when the parcel does not exist", async () => {
    const f = fakeFetch([[typeIs("SI.GURS.KN:PARCELE"), fixture("parcel-empty.json")]]);
    expect(await createGursClient({ fetch: f }).findParcel(657, "999999")).toBeNull();
  });

  it("rejects parcel numbers that could inject CQL", async () => {
    const f = fakeFetch([]);
    await expect(createGursClient({ fetch: f }).findParcel(657, "1' OR '1'='1")).rejects.toMatchObject({ kind: "invalid-input" });
    expect(f.calls).toHaveLength(0);
  });
});

describe("parcelAt", () => {
  it("queries by a D96 point intersecting parcels", async () => {
    const f = fakeFetch([[typeIs("SI.GURS.KN:PARCELE"), fixture("parcel-657-1587.json")]]);
    const p = await createGursClient({ fetch: f }).parcelAt(15.6455, 46.5577);
    expect(p?.number).toBe("1587");
    expect(q(f.calls[0], "cql_filter")).toMatch(/^INTERSECTS\(GEOM,POINT\(549492\.8\d* 157764\.6\d*\)\)$/);
  });
});

describe("parcelDetails", () => {
  it("combines land use, intended use, soil quality, buildings and spatial plan unit", async () => {
    const f = fakeFetch([
      [typeIs("SI.GURS.KN:PARCELE"), fixture("parcel-657-1587.json")],
      [typeIs("SI.GURS.KN:DEJANSKE_RABE"), fixture("raba.json")],
      [typeIs("SI.GURS.KN:NAMENSKE_RABE"), fixture("namenska.json")],
      [typeIs("SI.GURS.KN:STAVBE_PARCELE"), fixture("stavbe-parcele.json")],
      [typeIs("SI.MNVP.PA:EUP_OPN"), fixture("eup.json")],
    ]);
    const c = createGursClient({ fetch: f });
    const p = (await c.findParcel(657, "1587"))!;
    const d = await c.parcelDetails(p);
    expect(d.landUse).toEqual(["Hkratna raba zemljišča"]);
    expect(d.intendedUse).toEqual([{ code: "CU", description: "Osrednja območja centralnih dejavnosti" }]);
    expect(d.soilQuality).toBeNull();
    expect(d.buildings!.map((b) => b.number)).toEqual([1879, 1952, 1958]);
    expect(d.buildings![0]).toMatchObject({ koId: 657, eid: "100200000100293055", areaOnParcel: 265 });
    expect(d.spatialPlanUnit).toEqual({ code: "RT-72", plan: "Tehnična posodobitev Občinskega prostorskega načrta Mestne občine Maribor št. 2" });
    const eupCall = f.calls.find((u) => q(u, "typeNames") === "SI.MNVP.PA:EUP_OPN")!;
    expect(eupCall.pathname).toBe("/wfs-si-mnvp-pa/wfs");
    expect(q(f.calls.find((u) => q(u, "typeNames") === "SI.GURS.KN:STAVBE_PARCELE")!, "cql_filter")).toBe("EID_PARCELA='100100000222153246'");
  });

  it("degrades per section when one GURS layer fails", async () => {
    const f = fakeFetch([
      [typeIs("SI.GURS.KN:PARCELE"), fixture("parcel-657-1587.json")],
      [typeIs("SI.GURS.KN:DEJANSKE_RABE"), () => new Response("boom", { status: 503 })],
      [typeIs("SI.GURS.KN:NAMENSKE_RABE"), fixture("namenska.json")],
      [typeIs("SI.GURS.KN:STAVBE_PARCELE"), fixture("stavbe-parcele.json")],
      [typeIs("SI.MNVP.PA:EUP_OPN"), fixture("eup.json")],
    ]);
    const c = createGursClient({ fetch: f });
    const d = await c.parcelDetails((await c.findParcel(657, "1587"))!);
    expect(d.landUse).toBeNull();
    expect(d.errors).toEqual(["landUse"]);
    expect(d.buildings).toHaveLength(3);
  });
});

describe("errors", () => {
  it("maps an OGC exception report to a service GursError", async () => {
    const f = fakeFetch([[() => true, fixture("exception.xml")]]);
    const err = await createGursClient({ fetch: f }).findParcel(657, "1").catch((e) => e);
    expect(err).toBeInstanceOf(GursError);
    expect(err.kind).toBe("service");
  });
  it("maps HTTP errors and network failures", async () => {
    const http = fakeFetch([[() => true, () => new Response("down", { status: 502 })]]);
    await expect(createGursClient({ fetch: http }).findParcel(657, "1")).rejects.toMatchObject({ kind: "http", status: 502 });
    const net = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(createGursClient({ fetch: net }).findParcel(657, "1")).rejects.toMatchObject({ kind: "network" });
  });
  it("times out slow requests", async () => {
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    await expect(createGursClient({ fetch: slow, timeoutMs: 20 }).findParcel(657, "1")).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("gursPublicViewUrl", () => {
  it("deep-links to the GURS public viewer by EID", () => {
    expect(gursPublicViewUrl("100100000222153246")).toBe("https://ipi.eprostor.gov.si/jv/?eid=100100000222153246");
  });
});
