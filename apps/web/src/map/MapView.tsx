import { SEL, CART, DRAFT, RES, EZK, RES_AREA, addResultLayers, addEzkLayers, addAreaResultLayers, addDraftLayers, addCartLayers, addSelectionLayers, bindLayerInteractions, isOwnLayer } from './appLayers';
export { draftData, isOwnLayer } from './appLayers';
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, Geometry, GeometryCollection } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre v6 resolves its worker relative to its own module URL, which breaks once bundled.
// Let Vite bundle the worker (with its shared chunk) and point MapLibre at it.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);
import {
  basemapLabelLayers, basemapStyleUrl, GURS_LAYERS, INITIAL_VIEW, layerVisibility, SLOVENIA_BOUNDS, type BasemapId, type OverlayId,
  ORTHO_MIN_ZOOM,
} from "./layers";

type MlMap = maplibregl.Map;

interface Props {
  basemap: BasemapId;
  overlays: Record<OverlayId, boolean>;
  /** Names of places, roads, streets and house numbers (above ortho + cadastre). */
  labels?: boolean;
  dark: boolean;
  onZoom?: (z: number) => void;
  /** Highlighted parcel geometry (WGS84). */
  selection?: Geometry | null;
  /** Bump to re-fit the map to the selection. */
  fitKey?: number;
  /** Cart items highlighted on the map. */
  cart?: FeatureCollection | null;
  /** Polygon being drawn ([lon, lat] vertices); null when not drawing. */
  draft?: [number, number][] | null;
  onMapClick?: (lon: number, lat: number) => void;
  /** Search results as markers (props ko, n, parts); a click opens the building. */
  results?: FeatureCollection | null;
  onResultClick?: (ko: number, n: number) => void;
  /** Stored land-registry extracts as markers (props kind parcel|building, ko, n, count). */
  ezk?: FeatureCollection | null;
  onEzkClick?: (kind: "parcel" | "building", ko: number, n: string) => void;
  /** Parcels/buildings found in a drawn area, highlighted as outlines. */
  areaResults?: FeatureCollection | null;
}

/** Bounding box [[w,s],[e,n]] of any GeoJSON geometry. */
export function geometryBounds(g: Geometry): [[number, number], [number, number]] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      const [x, y] = c as number[];
      w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    } else (c as unknown[]).forEach(walk);
  };
  if (g.type === "GeometryCollection") g.geometries.forEach((x) => walk(geometryBounds(x)));
  else walk((g as Exclude<Geometry, GeometryCollection>).coordinates);
  return [[w, s], [e, n]];
}

const labelIds = (m: MlMap) => basemapLabelLayers(m.getStyle()?.layers ?? [], isOwnLayer);

/** Add GURS raster layers under the basemap labels, so names stay visible on the orthophoto. */
function addGursLayers(m: MlMap, vis: Record<string, "visible" | "none">, labels: boolean) {
  const before = labelIds(m)[0];
  for (const l of GURS_LAYERS) {
    if (!m.getSource(l.id)) m.addSource(l.id, l.source);
    if (!m.getLayer(l.id)) {
      m.addLayer({ id: l.id, type: "raster", source: l.id, ...(l.minzoom ? { minzoom: l.minzoom } : {}), layout: { visibility: vis[l.id] } }, before);
    }
  }
  setLabels(m, labels);
  originalPaint.delete(m); originalBg.delete(m); // new style: remember its own colours again
  styleLabels(m, vis.ortho === "visible" && m.getZoom() >= ORTHO_MIN_ZOOM);
}
function setLabels(m: MlMap, on: boolean) {
  for (const id of labelIds(m)) m.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

/** On the orthophoto: white text with a dark halo (satellite-map style); back to the style's own colours on the map. */
const ORTHO_PAINT = { "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,0.8)", "text-halo-width": 1.6 } as const;
const originalPaint = new WeakMap<MlMap, Map<string, Record<string, unknown>>>();
/** Basemap non-label layers drawn above the rasters (bridges, building blocks); hidden on the orthophoto. */
function aboveRasterIds(m: MlMap): string[] {
  const layers = m.getStyle()?.layers ?? [];
  const first = layers.findIndex((l) => l.id === labelIds(m)[0]);
  if (first < 0) return [];
  return layers.slice(first).filter((l) => l.type !== "symbol" && !l.id.startsWith("boundary") && !isOwnLayer(l.id)).map((l) => l.id);
}
/** Basemap layers under the rasters (land, roads, water...): hidden on the orthophoto so that tiles
 * still loading show a neutral background instead of the street map. */
function belowRasterIds(m: MlMap): string[] {
  const layers = m.getStyle()?.layers ?? [];
  const first = layers.findIndex((l) => l.id === labelIds(m)[0]);
  return layers.slice(0, first < 0 ? layers.length : first).filter((l) => l.type !== "background" && !isOwnLayer(l.id)).map((l) => l.id);
}
const ORTHO_BG = "#3b4236";
const originalBg = new WeakMap<MlMap, Map<string, unknown>>();
function styleLabels(m: MlMap, ortho: boolean) {
  if (!m.getStyle()) return;
  for (const id of [...aboveRasterIds(m), ...belowRasterIds(m)]) m.setLayoutProperty(id, "visibility", ortho ? "none" : "visible");
  let bg = originalBg.get(m);
  if (!bg) originalBg.set(m, (bg = new Map()));
  for (const l of m.getStyle()?.layers ?? []) {
    if (l.type !== "background") continue;
    if (!bg.has(l.id)) bg.set(l.id, m.getPaintProperty(l.id, "background-color" as never));
    m.setPaintProperty(l.id, "background-color" as never, (ortho ? ORTHO_BG : bg.get(l.id)) as never);
  }
  let saved = originalPaint.get(m);
  if (!saved) originalPaint.set(m, (saved = new Map()));
  for (const id of labelIds(m)) {
    if (!saved.has(id)) saved.set(id, Object.fromEntries(Object.keys(ORTHO_PAINT).map((k) => [k, m.getPaintProperty(id, k as never)])));
    const src = ortho ? ORTHO_PAINT : saved.get(id)!;
    for (const [k, v] of Object.entries(src)) m.setPaintProperty(id, k as never, v as never);
  }
}

export function MapView({ basemap, overlays, labels = true, dark, onZoom, selection, fitKey, onMapClick, cart, draft, results, onResultClick, areaResults, ezk, onEzkClick }: Props) {
  const ezkRef = useRef(ezk);
  ezkRef.current = ezk;
  const ezkClick = useRef(onEzkClick);
  ezkClick.current = onEzkClick;
  const areaRef = useRef(areaResults);
  areaRef.current = areaResults;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const resClick = useRef(onResultClick);
  resClick.current = onResultClick;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const vis = useRef(layerVisibility(basemap, overlays));
  vis.current = layerVisibility(basemap, overlays);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const sel = useRef(selection);
  sel.current = selection;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const click = useRef(onMapClick);
  click.current = onMapClick;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: basemapStyleUrl(dark),
      center: INITIAL_VIEW.center,
      zoom: INITIAL_VIEW.zoom,
      maxBounds: [
        [SLOVENIA_BOUNDS[0][0] - 1.5, SLOVENIA_BOUNDS[0][1] - 1],
        [SLOVENIA_BOUNDS[1][0] + 1.5, SLOVENIA_BOUNDS[1][1] + 1],
      ],
      attributionControl: { compact: true },
      hash: true,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "bottom-right");
    m.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "bottom-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    m.on("style.load", () => { addGursLayers(m, vis.current, labelsRef.current); addCartLayers(m, cartRef.current); addSelectionLayers(m, sel.current); addDraftLayers(m, draftRef.current); addAreaResultLayers(m, areaRef.current); addEzkLayers(m, ezkRef.current); addResultLayers(m, resultsRef.current); });
    bindLayerInteractions(m, () => ({ result: resClick.current, ezk: ezkClick.current, map: click.current }));
    m.on("zoomend", () => onZoom?.(m.getZoom()));
    // Orthophoto only exists from ORTHO_MIN_ZOOM; zoomed further out keep the street map visible.
    let orthoShown: boolean | null = null;
    m.on("zoom", () => {
      const on = vis.current.ortho === "visible" && m.getZoom() >= ORTHO_MIN_ZOOM;
      if (on === orthoShown) return;
      orthoShown = on;
      try { styleLabels(m, on); } catch { /* style not ready */ }
    });
    map.current = m;
    (window as unknown as { __map?: MlMap }).__map = m;
    onZoom?.(m.getZoom());
    return () => m.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // light/dark basemap swap; GURS layers are re-added on style.load
  const firstDark = useRef(dark);
  useEffect(() => {
    if (firstDark.current === dark) return;
    firstDark.current = dark;
    map.current?.setStyle(basemapStyleUrl(dark));
  }, [dark]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [id, v] of Object.entries(vis.current)) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", v);
    try { styleLabels(m, basemap === "ortho" && m.getZoom() >= ORTHO_MIN_ZOOM); } catch { /* style not ready; style.load applies it */ }
  }, [basemap, overlays]);

  useEffect(() => { const m = map.current; if (m?.getStyle()) setLabels(m, labels); }, [labels]);

  useEffect(() => {
    const m = map.current;
    if (m?.getSource(SEL) || m?.isStyleLoaded()) addSelectionLayers(m!, selection);
  }, [selection]);

  useEffect(() => {
    const m = map.current;
    if (m && (m.getSource(RES) || m.isStyleLoaded())) addResultLayers(m, results);
  }, [results]);

  useEffect(() => {
    const m = map.current;
    if (m && (m.getSource(EZK) || m.isStyleLoaded())) addEzkLayers(m, ezk);
  }, [ezk]);

  useEffect(() => {
    const m = map.current;
    if (m && (m.getSource(RES_AREA) || m.isStyleLoaded())) addAreaResultLayers(m, areaResults);
  }, [areaResults]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (m.getSource(DRAFT) || m.isStyleLoaded()) addDraftLayers(m, draft);
    m.getCanvas().style.cursor = draft ? "crosshair" : "";
    if (draft) m.doubleClickZoom.disable(); else m.doubleClickZoom.enable();
  }, [draft]);

  useEffect(() => {
    const m = map.current;
    if (m?.getSource(CART) || m?.isStyleLoaded()) addCartLayers(m!, cart);
  }, [cart]);

  useEffect(() => {
    if (!fitKey || !selection || !map.current) return;
    const mobile = window.innerWidth < 640;
    map.current.fitBounds(geometryBounds(selection), {
      padding: mobile ? { top: 130, bottom: 230, left: 30, right: 30 } : { top: 120, bottom: 60, left: 440, right: 80 },
      maxZoom: 18.5, duration: 700,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={el} data-testid="map" style={{ position: "absolute", inset: 0 }} />;
}
