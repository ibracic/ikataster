import { describe, expect, it } from "vitest";
import { createQuota, dayOf } from "./quota";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe("eZK daily quota", () => {
  it("counts downloads and plans batches against 400/day", () => {
    const q = createQuota(mem(), () => new Date("2026-09-29T10:00:00+02:00"));
    expect(q.plan(10)).toMatchObject({ allowed: 10, deferred: 0, blocked: false, warn: false });
    q.recordSuccess(395);
    expect(q.remaining()).toBe(5);
    expect(q.plan(12)).toMatchObject({ remaining: 5, allowed: 5, deferred: 7, blocked: false, warn: true });
  });
  it("LIMIT from eZK blocks the rest of the day even if our count is lower", () => {
    const q = createQuota(mem(), () => new Date("2026-09-29T10:00:00+02:00"));
    q.recordSuccess(120); q.markExhausted();
    expect(q.remaining()).toBe(0);
    expect(q.plan(3)).toMatchObject({ allowed: 0, deferred: 3, blocked: true });
  });
  it("resets at Ljubljana midnight, not UTC midnight", () => {
    const st = mem(); let t = new Date("2026-09-29T23:30:00+02:00");
    const q = createQuota(st, () => t);
    q.markExhausted(); expect(q.remaining()).toBe(0);
    t = new Date("2026-09-29T23:59:00+02:00"); expect(q.remaining()).toBe(0); // 21:59 UTC, same local day
    t = new Date("2026-09-30T00:01:00+02:00"); expect(q.remaining()).toBe(400);  // still 29th in UTC
    expect(dayOf(t)).toBe("2026-09-30");
  });
  it("survives corrupt storage", () => {
    const st = mem(); st.setItem("ikataster.ezk.quota.v1", "{nope");
    expect(createQuota(st).remaining()).toBe(400);
  });
});
