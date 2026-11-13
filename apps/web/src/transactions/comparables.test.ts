import { describe, expect, it } from "vitest";
import type { KoTx } from ".";
import { comparableParts, partTypeFromUse } from "./comparables";

// Flats (type 2) in one KO; deal 5 is non-market, deal 6 is a half share, deal 7 too old, deal 8 a garage.
const tx: KoTx = {
  ko: 999, date: "2026-11-13",
  s: {
    "1": ["2025-03-01", 120000, 1, 1, 1, 0], "2": ["2024-06-10", 150000, 1, 1, 1, 0], "3": ["2023-01-20", 90000, 1, 1, 1, 0],
    "4": ["2022-09-09", 200000, 1, 1, 1, 0], "5": ["2025-01-01", 10000, 4, 3, 1, 0], "6": ["2025-02-02", 50000, 1, 1, 1, 0],
    "7": ["2015-01-01", 60000, 1, 1, 1, 0], "8": ["2025-05-05", 15000, 1, 1, 1, 0],
  },
  sd: {
    "10/1": [[1, null, 60, 2, "1/1", "1"]], "10/2": [[2, null, 70, 2, "1/1", "2"]], "11/1": [[3, null, 50, 2, "1/1", ""]],
    "11/2": [[4, null, 140, 2, "1/1", ""]], "11/3": [[5, null, 60, 2, "1/1", ""]], "12/1": [[6, null, 60, 2, "1/2", ""]],
    "12/2": [[7, null, 60, 2, "1/1", ""]], "12/3": [[8, null, 15, 4, "1/1", ""]],
  },
  sp: {}, r: {}, rd: {},
};

describe("comparable sales", () => {
  it("maps GURS part use to the ETN type code", () => {
    expect(partTypeFromUse("Stanovanje v večstanovanjski stavbi")).toBe(2);
    expect(partTypeFromUse("Enostanovanjska stavba")).toBe(1);
    expect(partTypeFromUse("Garaža")).toBe(4);
    expect(partTypeFromUse("Pisarna")).toBe(5);
    expect(partTypeFromUse(undefined)).toBeNull();
  });

  it("keeps recent market sales of the same type and similar size, excluding the part itself", () => {
    const c = comparableParts(tx, { type: 2, area: 62, exclude: "10/1", now: "2026-11-13" })!;
    // 10/2 (70 m²) and 11/1 (50 m²) qualify; 11/2 too big, 11/3 non-market, 12/1 half share, 12/2 too old, 12/3 garage, 10/1 self.
    expect(c.items.map((i) => i.key)).toEqual(["10/2", "11/1"]);
    expect(c.count).toBe(2);
    expect(c.medianPerM2).toBe(1971); // median of 2143 and 1800
    expect(c.estimate).toBe(Math.round(1971 * 62 / 100) * 100);
  });

  it("returns null without a type or matches", () => {
    expect(comparableParts(tx, { type: null, area: 60 })).toBeNull();
    expect(comparableParts(tx, { type: 9, area: 60 })).toBeNull();
  });
});
