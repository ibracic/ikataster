import { describe, expect, it } from "vitest";
import { valuesForRecords } from "./forRecords";
import type { ResultRecord } from "../ezk/results";
import type { Values } from ".";

const rec = (key: string, property: object) => ({ key, extract: { property } }) as unknown as ResultRecord;

describe("valuesForRecords", () => {
  it("looks up parcel and part values per KO, skipping failed KOs", async () => {
    const api: Values = {
      get: async (ko) => { if (ko === 1) throw new Error("x"); return { ko, date: "2026-09-26", p: { "100/1": 13500 }, d: { "20/3": 65200 } }; },
      count: async () => 0, clear: async () => undefined,
    };
    const m = await valuesForRecords([
      rec("a", { type: "parcel", koId: 999, number: "100/1" }),
      rec("b", { type: "part", koId: 999, number: "20", part: 3 }),
      rec("c", { type: "parcel", koId: 1, number: "5" }),
    ], api);
    expect([...m]).toEqual([["a", 13500], ["b", 65200]]);
  });
});
