import { createGursClient, GursError } from ".";
import { fakeFetch, fixture, q } from "./testFetch";

const isJv = (u: URL) => u.pathname === "/jv-api/search";

describe("searchAddresses", () => {
  it("queries the GURS public-view address index and maps results to Address", async () => {
    const f = fakeFetch([[isJv, fixture("addr-koroska.json")]]);
    const res = await createGursClient({ fetch: f }).searchAddresses("Koroška cesta 5");
    expect(q(f.calls[0], "source")).toBe("NSLV-STA-FULL");
    expect(q(f.calls[0], "filter")).toBe("Koroška cesta 5");
    expect(res[0]).toMatchObject({ label: "Koroška cesta 5", place: "4260 Bled", postCode: 4260 });
    expect(res[0].e).toBeGreaterThan(300000);
    expect(res[0].lon).toBeGreaterThan(13);
    expect(res[0].lat).toBeGreaterThan(45);
    expect(res.every((a) => a.id)).toBe(true);
    expect(new Set(res.map((a) => a.id)).size).toBe(res.length);
  });

  it("drops commas so 'street 1, town' narrows by town (GURS returns nothing with commas)", async () => {
    const f = fakeFetch([[isJv, fixture("addr-koroska.json")]]);
    await createGursClient({ fetch: f }).searchAddresses("  Bevkova ulica 1,  Ptuj ");
    expect(q(f.calls[0], "filter")).toBe("Bevkova ulica 1 Ptuj");
  });

  it("formats house number suffixes", async () => {
    const f = fakeFetch([[isJv, fixture("addr-koroska.json")]]);
    const res = await createGursClient({ fetch: f }).searchAddresses("Koroška cesta 5");
    expect(res.map((a) => a.label)).toContain("Koroška cesta 5a");
  });

  it("returns [] for empty results, null features and too-short queries (no request)", async () => {
    const empty = fakeFetch([[isJv, fixture("addr-empty.json")]]);
    expect(await createGursClient({ fetch: empty }).searchAddresses("Celovška cesta 99999")).toEqual([]);
    const nul = fakeFetch([[isJv, '{"features":null}']]);
    expect(await createGursClient({ fetch: nul }).searchAddresses("glavni tr")).toEqual([]);
    const none = fakeFetch([]);
    expect(await createGursClient({ fetch: none }).searchAddresses("ab")).toEqual([]);
    expect(none.calls).toHaveLength(0);
  });

  it("maps failures to GursError", async () => {
    const f = fakeFetch([[isJv, () => new Response("x", { status: 500 })]]);
    await expect(createGursClient({ fetch: f }).searchAddresses("Glavni trg 1")).rejects.toBeInstanceOf(GursError);
  });
});

describe("parcelAtD96", () => {
  it("finds the parcel under a D96 point (address location)", async () => {
    const f = fakeFetch([[(u) => q(u, "typeNames") === "SI.GURS.KN:PARCELE", fixture("parcel-657-1587.json")]]);
    const p = await createGursClient({ fetch: f }).parcelAtD96(549513, 157710);
    expect(p?.number).toBe("1587");
    expect(q(f.calls[0], "cql_filter")).toBe("INTERSECTS(GEOM,POINT(549513 157710))");
  });
});
