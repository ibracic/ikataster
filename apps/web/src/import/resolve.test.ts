import { createGursClient, type Ko } from "../gurs";
import { fakeFetch, fixture, q, typeIs } from "../gurs/testFetch";
import { parseRows } from "./parse";
import { resolveImport } from "./resolve";

const kos: Ko[] = [{ id: 657, name: "MARIBOR GRAD" }];
const client = () => {
  const f = fakeFetch([
    [typeIs("SI.GURS.KN:PARCELE"), fixture("imp-parcels-657.json")],
    [typeIs("SI.GURS.KN:STAVBE_OBRIS"), fixture("imp-buildings-657.json")],
    [typeIs("SI.GURS.KN:DELI_STAVB"), fixture("imp-parts-657.json")],
  ]);
  return { f, c: createGursClient({ fetch: f }) };
};

describe("resolveImport", () => {
  it("validates rows against GURS in batches and returns cart items + invalid rows", async () => {
    const rows = parseRows([
      ["657", "1587"], ["657", "1980"], ["657", "999999"],
      ["657", "st:130"], ["657", "st:99999999"],
      ["657", "del:130/2"], ["657", "del:130/5"], ["657", "del:130/999"],
      ["9999", "1"], ["657", "x"],
    ], kos);
    const { f, c } = client();
    const res = await resolveImport(c, rows, kos);

    expect(res.items.map((i) => `${i.kind}:${i.number}${i.part ? "/" + i.part : ""}`)).toEqual([
      "parcel:1587", "parcel:1980", "building:130", "part:130/2", "part:130/5",
    ]);
    expect(res.items.every((i) => i.koName === "MARIBOR GRAD" && i.eid && i.geometry)).toBe(true);
    expect(res.items.find((i) => i.kind === "part")!.note).toBe("stanovanje");
    expect(res.invalid.map((r) => [r.line, r.reason])).toEqual([
      [3, "notFound"], [5, "notFound"], [8, "notFound"], [9, "unknownKo"], [10, "malformed"],
    ]);

    const cqls = f.calls.map((u) => `${q(u, "typeNames")} ${q(u, "cql_filter")}`);
    expect(cqls).toContain("SI.GURS.KN:PARCELE KO_ID=657 AND ST_PARCELE IN ('1587','1980','999999')");
    expect(cqls).toContain("SI.GURS.KN:STAVBE_OBRIS KO_ID=657 AND ST_STAVBE IN (130,99999999)");
    expect(cqls).toContain("SI.GURS.KN:DELI_STAVB KO_ID=657 AND ((ST_STAVBE=130 AND ST_DELA_STAVBE IN (2,5,999)))");
    expect(f.calls).toHaveLength(3);
  });

  it("chunks large lists so each request stays small", async () => {
    const rows = parseRows(Array.from({ length: 95 }, (_, i) => ["657", String(i + 1)]), kos);
    const { f, c } = client();
    await resolveImport(c, rows, kos);
    const parcelCalls = f.calls.filter((u) => q(u, "typeNames") === "SI.GURS.KN:PARCELE");
    expect(parcelCalls).toHaveLength(3); // 40 + 40 + 15
    expect(parcelCalls.every((u) => u.toString().length < 4000)).toBe(true);
  });

  it("marks a whole batch as failed instead of throwing when GURS errors", async () => {
    const f = fakeFetch([[() => true, () => new Response("down", { status: 503 })]]);
    const res = await resolveImport(createGursClient({ fetch: f }), parseRows([["657", "1"]], kos), kos);
    expect(res.items).toHaveLength(0);
    expect(res.invalid[0]).toMatchObject({ line: 1, reason: "serviceError" });
  });
});
