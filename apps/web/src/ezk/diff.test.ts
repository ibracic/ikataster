import { describe, expect, it } from "vitest";
import { diffExtracts } from "./diff";
import type { EzkExtract, Owner, Right } from "./types";

const owner = (positionId: number, name: string, share: string): Owner =>
  ({ positionId, right: "lastninska pravica", share, holder: { kind: "person", name }, restrictions: [] });
const mortgage = (id: number, amount: number): Right => ({ id, order: 1, type: "hipoteka", code: 403, category: "mortgage", holders: [{ kind: "company", name: "VZORČNA BANKA d.d." }], positionIds: [1], charge: { amount, currency: "EUR" }, secondary: [] });
const base: EzkExtract = {
  kind: "current", createdAt: "2026-10-01", pending: false,
  property: { type: "part", koId: 999, number: "50", part: 1, label: "999 VZORČNA VAS 50/1" },
  owners: [owner(1, "ANA NOVAK", "1/2"), owner(2, "BOJAN NOVAK", "1/2")],
  rights: [mortgage(10, 50000)], benefits: [],
};

describe("diffExtracts", () => {
  it("reports nothing for an identical extract downloaded later", () => {
    expect(diffExtracts(base, { ...base, createdAt: "2026-11-13" })).toEqual([]);
  });

  it("reports a new owner, a removed owner and a share change", () => {
    const next = { ...base, owners: [owner(1, "ANA NOVAK", "1/1"), owner(3, "CIRIL KOS", "1/1")] };
    expect(diffExtracts(base, next)).toEqual([
      { kind: "ownerRemoved", text: "BOJAN NOVAK (1/2)" },
      { kind: "ownerAdded", text: "CIRIL KOS (1/1)" },
      { kind: "shareChanged", text: "ANA NOVAK: 1/2 → 1/1" },
    ]);
  });

  it("reports new and deleted rights and a new pending case", () => {
    const next = { ...base, pending: true, rights: [mortgage(11, 80000)] };
    expect(diffExtracts(base, next).map((c) => c.kind)).toEqual(["rightRemoved", "rightAdded", "pendingAdded"]);
    expect(diffExtracts(base, next)[1].text).toMatch(/hipoteka.*80/);
  });

  it("tolerates old records without rights", () => {
    const old = { ...base, rights: undefined as unknown as Right[] };
    expect(diffExtracts(old, base).map((c) => c.kind)).toEqual(["rightAdded"]);
  });
});
