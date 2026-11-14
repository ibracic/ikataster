// Contract test: a real KO file excerpt written by the Python mirror scripts (scripts/mirror/check_format.py
// --sample 532 682, validated there against scripts/mirror/format.json) must decode in the web app.
import format from "../../../../scripts/mirror/format.json";
import sample from "./__fixtures__/ko-532-682.json";
import { decodeKo } from "./data";

type Arg<i extends number> = Parameters<typeof decodeKo>[i];
const doc = sample.doc as unknown as Arg<0>;
const codes = sample.codes as unknown as Arg<1>;

describe("mirror KO file contract", () => {
  it("fixture matches the shared format description", () => {
    expect(sample.doc.v).toBe(format.version);
    expect(Object.keys(sample.doc)).toEqual(format.ko.keys);
    for (const r of sample.doc.p) expect(r).toHaveLength(format.ko.p.length);
    for (const r of sample.doc.b) expect(r).toHaveLength(format.ko.b.length);
    for (const rs of Object.values(sample.doc.d)) for (const r of rs) expect(r).toHaveLength(format.ko.d.length);
    for (const rs of Object.values(sample.doc.de)) for (const r of rs) expect(r).toHaveLength(format.ko.de.length);
    for (const c of format.index.codes) expect(sample.codes).toHaveProperty(c);
  });

  it("decodes building 532/682 with its parts, floors and parcels", () => {
    const k = decodeKo(doc, codes);
    expect(k.ko).toEqual({ id: 532, name: expect.any(String) });
    const b = k.buildings.find((x) => x.number === 682)!;
    expect(b.eid).toMatch(/^1002\d+$/);
    expect(b.geometry.type).toMatch(/Polygon/);
    expect(b.centroid[0]).toBeGreaterThan(15.5); expect(b.centroid[0]).toBeLessThan(16.1);
    expect(b.centroid[1]).toBeGreaterThan(46.5); expect(b.centroid[1]).toBeLessThan(46.7);
    const parts = k.parts.filter((x) => x.building === 682).map((x) => x.part);
    expect(parts).toHaveLength(13);
    const p10 = parts.find((p) => p.number === 10)!;
    expect(p10).toMatchObject({ floor: "2,3,4", entranceFloor: 3 });
    expect(typeof p10.use).toBe("string");
    for (const p of parts) expect(p.eid).toMatch(/^1003\d+$/);
    expect(k.parcels.length).toBeGreaterThan(0);
    for (const p of k.parcels) {
      expect(p.extra?.buildings.some((x) => x.number === 682)).toBe(true);
      expect(p.area).toBeGreaterThan(0);
    }
  });
});
