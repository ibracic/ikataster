import { basemapLabelLayers, wmsTileUrl, GURS_WMS_KN, OVERLAYS, GURS_LAYERS, layerVisibility, basemapStyleUrl } from "./layers";

describe("wmsTileUrl", () => {
  it("builds a WMS 1.3.0 GetMap URL in EPSG:3857 with an unencoded bbox placeholder", () => {
    const url = wmsTileUrl(GURS_WMS_KN, "SI.GURS.KN:PARCELE");
    expect(url.startsWith("https://ipi.eprostor.gov.si/wms-si-gurs-kn/wms?")).toBe(true);
    expect(url).toContain("layers=SI.GURS.KN%3APARCELE");
    expect(url).toContain("crs=EPSG%3A3857");
    expect(url).toContain("transparent=true");
    expect(url.endsWith("&bbox={bbox-epsg-3857}")).toBe(true);
  });

  it("uses opaque jpeg for the ortho basemap", () => {
    const url = wmsTileUrl(GURS_WMS_KN, "X", "image/jpeg");
    expect(url).toContain("format=image%2Fjpeg");
    expect(url).toContain("transparent=false");
  });
});

describe("basemapStyleUrl", () => {
  it("uses keyless OpenFreeMap styles for light and dark", () => {
    expect(basemapStyleUrl(false)).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(basemapStyleUrl(true)).toBe("https://tiles.openfreemap.org/styles/dark");
  });
});

describe("GURS_LAYERS", () => {
  it("stacks ortho below the cadastre overlays", () => {
    expect(GURS_LAYERS.map((l) => l.id)).toEqual(["ortho", ...OVERLAYS.map((o) => o.id)]);
  });

  it("keeps GURS scale limits as min zoom and credits GURS", () => {
    for (const o of OVERLAYS) {
      const l = GURS_LAYERS.find((x) => x.id === o.id)!;
      expect(l.minzoom).toBe(o.minzoom);
      expect(l.source.attribution).toContain("GURS");
    }
  });
});

describe("layerVisibility", () => {
  it("shows ortho only for the aerial basemap", () => {
    expect(layerVisibility("street", { parcels: true, buildings: true }).ortho).toBe("none");
    expect(layerVisibility("ortho", { parcels: true, buildings: true }).ortho).toBe("visible");
  });

  it("toggles overlays independently", () => {
    const v = layerVisibility("street", { parcels: true, buildings: false });
    expect(v.parcels).toBe("visible");
    expect(v.buildings).toBe("none");
  });
});

describe("basemapLabelLayers", () => {
  it("returns basemap symbol layers in order, skipping our own", () => {
    const layers = [{ id: "water", type: "fill" }, { id: "road_label", type: "symbol" }, { id: "ortho", type: "raster" }, { id: "place_city", type: "symbol" }, { id: "mine", type: "symbol" }];
    expect(basemapLabelLayers(layers, (id) => id === "mine")).toEqual(["road_label", "place_city"]);
  });
});

import { isOwnLayer } from "./MapView";
it("result markers, selection, list and draft layers are app-owned (not hidden on the orthophoto)", () => {
  for (const id of ["results-dot", "results-cluster", "results-label", "sel-fill", "cart-line", "draft-line"]) expect(isOwnLayer(id)).toBe(true);
  expect(isOwnLayer("building")).toBe(false);
});

it("orthophoto uses 512 px tiles (4x fewer requests to the HTTP/1.1 GURS server)", () => {
  const o = GURS_LAYERS.find((l) => l.id === "ortho")!;
  expect(o.source.tileSize).toBe(512);
  expect(o.source.tiles![0]).toContain("width=512");
});
