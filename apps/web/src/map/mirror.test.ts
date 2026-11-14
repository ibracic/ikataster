import { describe, it, expect, vi } from "vitest";
import { MIRROR_LAYER_IDS, mirrorSource, mirrorLayers, cadastreOverride } from "./mirror";
import { layerVisibility } from "./layers";
import { isOwnLayer } from "./appLayers";
import { classify } from "../sw/policy";

describe("mirror vector tiles", () => {
  it("serves z/x/y tiles from the app origin up to z14 (overzoomed beyond)", () => {
    const s = mirrorSource("https://app.example");
    expect(s.tiles).toEqual(["https://app.example/mirror/tiles/{z}/{x}/{y}.pbf"]);
    expect(s.maxzoom).toBe(14);
    expect(s.attribution).toContain("Geodetska uprava RS");
  });

  it("draws parcel and building outlines with labels from the mirror layers", () => {
    const ls = mirrorLayers();
    expect(ls.map((l) => l.id)).toEqual(MIRROR_LAYER_IDS);
    expect(ls.every((l) => "source-layer" in l)).toBe(true);
    expect(ls.find((l) => l.id === "mirror-parcels")?.minzoom).toBe(15);
  });

  it("is treated as an own layer (kept on the orthophoto)", () => {
    for (const id of MIRROR_LAYER_IDS) expect(isOwnLayer(id)).toBe(true);
  });

  it("switches the overlays between GURS rasters and mirror", () => {
    const on = { parcels: true, buildings: false };
    const g = layerVisibility("street", on, null, "gurs");
    expect(g.parcels).toBe("visible");
    expect(g["mirror-parcels"]).toBe("none");
    const m = layerVisibility("street", on, null, "mirror");
    expect(m.parcels).toBe("none");
    expect(m["mirror-parcels"]).toBe("visible");
    expect(m["mirror-parcel-labels"]).toBe("visible");
    expect(m["mirror-buildings-line"]).toBe("none");
  });

  it("reads a ?mirror=1 / ?mirror=0 override", () => {
    expect(cadastreOverride("?mirror=1")).toBe("mirror");
    expect(cadastreOverride("?x=2&mirror=0")).toBe("gurs");
    expect(cadastreOverride("")).toBeNull();
  });


  it("caches mirror tiles in the service worker like GURS tiles", () => {
    expect(classify("https://app.example/mirror/tiles/14/1/2.pbf", "GET", "cors", "https://app.example")).toBe("tiles");
  });
});
