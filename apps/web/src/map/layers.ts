import { MIRROR_LAYER_IDS, MIRROR_OVERLAY, type CadastreSource } from "./mirror";

/** Public GURS endpoints (CORS *, no key). */
export const GURS_WMS_KN = "https://ipi.eprostor.gov.si/wms-si-gurs-kn/wms";
export const GURS_WMS_DTS = "https://ipi.eprostor.gov.si/wms-si-gurs-dts/wms";

export type BasemapId = "street" | "ortho";
export type OverlayId = "parcels" | "buildings";

export interface OverlayDef {
  id: OverlayId;
  layer: string;
  minzoom: number;
}

/** GURS styles are scale-restricted; below these zooms tiles are blank. */
export const OVERLAYS: OverlayDef[] = [
  { id: "parcels", layer: "SI.GURS.KN:PARCELE", minzoom: 15 },
  { id: "buildings", layer: "SI.GURS.KN:STAVBE_OBRIS", minzoom: 17 },
];

/** Slovenia bounding box (lon/lat) and a sensible initial view. */
export const SLOVENIA_BOUNDS: [[number, number], [number, number]] = [
  [13.3, 45.4],
  [16.65, 46.9],
];
export const INITIAL_VIEW = { center: [14.99, 46.15] as [number, number], zoom: 7.4 };

/** Build a MapLibre-compatible WMS GetMap tile URL template (EPSG:3857). */
export function wmsTileUrl(base: string, layer: string, format: "image/png" | "image/jpeg" = "image/png", size = 256): string {
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetMap",
    layers: layer,
    styles: "",
    crs: "EPSG:3857",
    width: String(size),
    height: String(size),
    format,
    transparent: format === "image/png" ? "true" : "false",
  });
  // {bbox-epsg-3857} must stay unencoded so MapLibre can substitute it
  return `${base}?${params.toString()}&bbox={bbox-epsg-3857}`;
}

const ATTR_GURS = '© <a href="https://www.e-prostor.gov.si/" target="_blank" rel="noopener">Geodetska uprava RS</a>';

/** Vector basemap from OpenFreeMap (free, no API key, OSM data). */
export function basemapStyleUrl(dark: boolean): string {
  return `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;
}

export interface GursLayer {
  id: string;
  source: { type: "raster"; tiles: string[]; tileSize: number; minzoom?: number; maxzoom: number; attribution: string };
  minzoom?: number;
}

/** Years offered by GURS DOF050_Z (WMS time dimension); not every year covers every area. */
export const ORTHO_YEARS: number[] = [1990, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006,
  2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

/** Tile URL template of the historical orthophoto for one year. */
export function orthoYearTiles(year: number): string[] {
  return [`${wmsTileUrl(GURS_WMS_DTS, "SI.GURS.ZPDZ:DOF050_Z", "image/png", 512)}&time=${year}-01-01T00:00:00.000Z`];
}

/** Nearest available year (ties go to the older one). */
export function orthoYearWindow(v: number): number {
  return ORTHO_YEARS.reduce((best, y) => (Math.abs(y - v) < Math.abs(best - v) ? y : best), ORTHO_YEARS[0]);
}

/** Below this map zoom the GURS orthophoto service renders nothing (white). */
export const ORTHO_MIN_ZOOM = 8;

/** GURS raster layers stacked on top of the vector basemap (ortho first, then cadastre overlays). */
export const GURS_LAYERS: GursLayer[] = [
  {
    id: "ortho",
    // GURS returns plain white images for DOF025 when zoomed out further; the street map shows there instead.
    minzoom: ORTHO_MIN_ZOOM,
    source: { type: "raster", tiles: [wmsTileUrl(GURS_WMS_DTS, "SI.GURS.ZPDZ:DOF025", "image/jpeg", 512)], tileSize: 512, minzoom: ORTHO_MIN_ZOOM, maxzoom: 20, attribution: ATTR_GURS },
  },
  {
    // Historical orthophoto (transparent PNG): where GURS has no image for the year, today's ortho shows through.
    id: "orthoYear",
    minzoom: ORTHO_MIN_ZOOM,
    source: { type: "raster", tiles: orthoYearTiles(ORTHO_YEARS[ORTHO_YEARS.length - 1]), tileSize: 512, minzoom: ORTHO_MIN_ZOOM, maxzoom: 20, attribution: ATTR_GURS },
  },
  ...OVERLAYS.map((o) => ({
    id: o.id,
    minzoom: o.minzoom,
    source: { type: "raster" as const, tiles: [wmsTileUrl(GURS_WMS_KN, o.layer)], tileSize: 256, minzoom: o.minzoom, maxzoom: 21, attribution: ATTR_GURS },
  })),
];

/**
 * Basemap label layers (place, road, street, house-number names). GURS layers go *below* the first one,
 * so names stay readable on top of the orthophoto and the cadastre.
 */
export function basemapLabelLayers(layers: { id: string; type: string }[], own: (id: string) => boolean = () => false): string[] {
  return layers.filter((l) => l.type === "symbol" && !own(l.id)).map((l) => l.id);
}

/** Pure: which GURS layers are visible for the current UI state. */
export function layerVisibility(basemap: BasemapId, overlays: Record<OverlayId, boolean>, orthoYear: number | null = null, cadastre: CadastreSource = "gurs"): Record<string, "visible" | "none"> {
  const v: Record<string, "visible" | "none"> = {
    ortho: basemap === "ortho" ? "visible" : "none",
    orthoYear: basemap === "ortho" && orthoYear ? "visible" : "none",
  };
  for (const o of OVERLAYS) v[o.id] = overlays[o.id] && cadastre === "gurs" ? "visible" : "none";
  for (const id of MIRROR_LAYER_IDS) v[id] = overlays[MIRROR_OVERLAY[id]] && cadastre === "mirror" ? "visible" : "none";
  return v;
}
