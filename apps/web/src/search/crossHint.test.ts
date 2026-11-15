// @vitest-environment node
import { describe, expect, it } from "vitest";
import { findElsewhere, parsePropertyQuery } from "./crossHint";
import type { GursClient, Ko } from "../gurs";

const kos = [{ id: 400, name: "PTUJ" }, { id: 532, name: "LENART" }] as Ko[];
const client = {
  findParcel: async (ko: number, n: string) => (ko === 400 && n === "634" ? { number: n } : null),
  findBuilding: async (ko: number, n: number) => (ko === 532 && n === 682 ? { number: n } : null),
  searchAddresses: async (q: string) => (q.includes("Vošnjakova") ? [{ id: "a1", label: "Vošnjakova ulica 6", place: "2250 Ptuj" }] : []),
  searchManagers: async (q: string) => ({ managers: q.toLowerCase().includes("pss") ? [{ id: 752, name: "PSS" }] : [], truncated: false }),
} as unknown as GursClient;

describe("parsePropertyQuery", () => {
  it("reads KO by id or name and the parcel number", () => {
    expect(parsePropertyQuery("400 634", kos)).toMatchObject({ ko: { id: 400 }, number: "634" });
    expect(parsePropertyQuery("Ptuj 1/2", kos)).toMatchObject({ ko: { id: 400 }, number: "1/2" });
    expect(parsePropertyQuery("Vošnjakova ulica", kos)).toBeNull();
  });
});

describe("findElsewhere", () => {
  it("address tab finds a parcel typed as KO + number", async () => {
    expect(await findElsewhere("address", "Ptuj 634", client, kos)).toMatchObject({ kind: "parcel", koId: 400, number: "634" });
  });
  it("parcel tab miss finds the same numbers as a building", async () => {
    expect(await findElsewhere("parcel", "532 682", client, kos)).toMatchObject({ kind: "building", koId: 532, number: 682 });
  });
  it("address tab finds a manager; manager tab finds an address", async () => {
    expect(await findElsewhere("address", "PSS", client, kos)).toMatchObject({ kind: "manager", manager: { id: 752 } });
    expect(await findElsewhere("manager", "Vošnjakova 6", client, kos)).toMatchObject({ kind: "address" });
  });
  it("returns null when nothing matches anywhere", async () => {
    expect(await findElsewhere("address", "xyz nič", client, kos)).toBeNull();
    expect(await findElsewhere("parcel", "400 634", client, kos)).toBeNull();
  });
});
