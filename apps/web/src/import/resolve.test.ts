import type { GursClient, Ko } from "../gurs";
import { parseRows } from "./parse";
import { resolveImport } from "./resolve";

const kos: Ko[] = [{ id: 657, name: "MARIBOR GRAD" }];
const sq = { type: "Polygon" as const, coordinates: [[[15, 46], [15.001, 46], [15.001, 46.001], [15, 46]]] };
const client = () => ({
  findParcel: vi.fn(async (_k: number, n: string) => (["1587", "1980"].includes(n) ? { eid: `P${n}`, geometry: sq } : null)),
  findBuilding: vi.fn(async (_k: number, n: number) => (n === 130 ? { eid: "B130", geometry: sq } : null)),
  buildingParts: vi.fn(async (_k: number, n: number) => (n === 130 ? [2, 5].map((p) => ({ number: p, eid: `D${p}`, use: "stanovanje" })) : [])),
}) as unknown as GursClient;

describe("resolveImport", () => {
  it("validates rows against the cadastre and returns list items + invalid rows", async () => {
    const rows = parseRows([
      ["657", "1587"], ["657", "1980"], ["657", "999999"],
      ["657", "st:130"], ["657", "st:99999999"],
      ["657", "del:130/2"], ["657", "del:130/5"], ["657", "del:130/999"],
      ["9999", "1"], ["657", "x"],
    ], kos);
    const res = await resolveImport(client(), rows, kos);
    expect(res.items.map((i) => `${i.kind}:${i.number}${i.part ? "/" + i.part : ""}`)).toEqual([
      "parcel:1587", "parcel:1980", "building:130", "part:130/2", "part:130/5",
    ]);
    expect(res.items.every((i) => i.koName === "MARIBOR GRAD" && i.eid && i.geometry)).toBe(true);
    expect(res.items.find((i) => i.kind === "part")!.note).toBe("stanovanje");
    expect(res.invalid.map((r) => [r.line, r.reason])).toEqual([
      [3, "notFound"], [5, "notFound"], [8, "notFound"], [9, "unknownKo"], [10, "malformed"],
    ]);
  });

  it("marks a row as failed instead of throwing when the lookup errors", async () => {
    const c = { findParcel: vi.fn(async () => { throw new Error("offline"); }) } as unknown as GursClient;
    const res = await resolveImport(c, parseRows([["657", "1"]], kos), kos);
    expect(res.items).toHaveLength(0);
    expect(res.invalid[0]).toMatchObject({ line: 1, reason: "serviceError" });
  });
});
