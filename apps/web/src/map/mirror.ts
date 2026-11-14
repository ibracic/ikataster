import type * as maplibregl from "maplibre-gl";

/**
 * Static copy of the GURS cadastre (parcel + building outlines, cadastral municipalities) as vector tiles,
 * published with the app. Used when GURS can't be reached (e.g. outside Slovenia).
 */
export type CadastreSource = "gurs" | "mirror";
export const MIRROR_SOURCE = "mirror";
export const MIRROR_MAX_ZOOM = 14;
const ATTR = '© <a href="https://www.e-prostor.gov.si/" target="_blank" rel="noopener">Geodetska uprava RS</a> (kopija iKataster)';

export function mirrorSource(origin: string): maplibregl.VectorSourceSpecification & { tiles: string[] } {
  return { type: "vector", tiles: [`${origin}/mirror/tiles/{z}/{x}/{y}.pbf`], minzoom: 8, maxzoom: MIRROR_MAX_ZOOM, attribution: ATTR };
}

const PARCEL = "#c92a2a", BUILDING = "#1c7ed6";
export function mirrorLayers(): maplibregl.LayerSpecification[] {
  const s = { source: MIRROR_SOURCE } as const;
  return [
    { id: "mirror-parcels", type: "line", ...s, "source-layer": "parcels", minzoom: 15, paint: { "line-color": PARCEL, "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.6, 19, 1.6] } },
    { id: "mirror-buildings-fill", type: "fill", ...s, "source-layer": "buildings", minzoom: 16, paint: { "fill-color": BUILDING, "fill-opacity": 0.12 } },
    { id: "mirror-buildings-line", type: "line", ...s, "source-layer": "buildings", minzoom: 16, paint: { "line-color": BUILDING, "line-width": 1.2 } },
    { id: "mirror-parcel-labels", type: "symbol", ...s, "source-layer": "parcels", minzoom: 18, layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Regular"], "text-size": 11 }, paint: { "text-color": PARCEL, "text-halo-color": "#ffffff", "text-halo-width": 1.4 } },
    { id: "mirror-building-labels", type: "symbol", ...s, "source-layer": "buildings", minzoom: 18, layout: { "text-field": ["to-string", ["get", "n"]], "text-font": ["Noto Sans Bold"], "text-size": 11 }, paint: { "text-color": BUILDING, "text-halo-color": "#ffffff", "text-halo-width": 1.4 } },
  ];
}
export const MIRROR_LAYER_IDS = ["mirror-parcels", "mirror-buildings-fill", "mirror-buildings-line", "mirror-parcel-labels", "mirror-building-labels"];
export const MIRROR_OVERLAY: Record<string, "parcels" | "buildings"> = {
  "mirror-parcels": "parcels", "mirror-parcel-labels": "parcels",
  "mirror-buildings-fill": "buildings", "mirror-buildings-line": "buildings", "mirror-building-labels": "buildings",
};

/** `?mirror=1` forces the copy, `?mirror=0` forces GURS; otherwise null (probe decides). */
export function cadastreOverride(search: string): CadastreSource | null {
  const v = new URLSearchParams(search).get("mirror");
  return v === "1" ? "mirror" : v === "0" ? "gurs" : null;
}

