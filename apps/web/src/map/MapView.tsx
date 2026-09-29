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
  /** Parcels/buildings found in a drawn area, highlighted as outlines. */
  areaResults?: FeatureCollection | null;
}

const SEL = "selection";
const CART = "cart";
const DRAFT = "draft";

export function draftData(pts: [number, number][] | null | undefined): FeatureCollection {
  if (!pts?.length) return EMPTY;
  const features: FeatureCollection["features"] = pts.map((c) => ({ type: "Feature", properties: { kind: "vertex" }, geometry: { type: "Point", coordinates: c } }));
  if (pts.length >= 3) features.unshift({ type: "Feature", properties: { kind: "area" }, geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] } });
  else if (pts.length === 2) features.unshift({ type: "Feature", properties: { kind: "area" }, geometry: { type: "LineString", coordinates: pts } });
  return { type: "FeatureCollection", features };
}

const RES = "results";
function addResultLayers(m: MlMap, fc: FeatureCollection | null | undefined) {
  const data = fc ?? EMPTY_RES;
  const src = m.getSource(RES) as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  m.addSource(RES, { type: "geojson", data, cluster: true, clusterRadius: 40, clusterMaxZoom: 15, clusterProperties: { parts: ["+", ["get", "parts"]] } });
  // clusters: darker ring, label = buildings · parts; a click zooms in
  m.addLayer({ id: `${RES}-cluster`, type: "circle", source: RES, filter: ["has", "point_count"], paint: {
    "circle-color": "#087f5b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.92,
    "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 16, 10, 22, 50, 30] } });
  m.addLayer({ id: `${RES}-cluster-label`, type: "symbol", source: RES, filter: ["has", "point_count"], layout: {
    "text-field": ["concat", ["to-string", ["get", "point_count"]], " st.\n", ["to-string", ["get", "parts"]]],
    "text-font": ["Noto Sans Bold"], "text-size": 10, "text-line-height": 1.1, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#ffffff" } });
  m.addLayer({ id: `${RES}-dot`, type: "circle", source: RES, filter: ["!", ["has", "point_count"]], paint: {
    "circle-color": "#0ca678", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
    "circle-radius": ["interpolate", ["linear"], ["get", "parts"], 1, 9, 50, 12, 300, 16] } });
  m.addLayer({ id: `${RES}-label`, type: "symbol", source: RES, filter: ["!", ["has", "point_count"]], layout: {
    "text-field": ["to-string", ["get", "parts"]], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#ffffff" } });
}
const EMPTY_RES: FeatureCollection = { type: "FeatureCollection", features: [] };

const RES_AREA = "results-area";
function addAreaResultLayers(m: MlMap, fc: FeatureCollection | null | undefined) {
  const data = fc ?? EMPTY_RES;
  const src = m.getSource(RES_AREA) as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  m.addSource(RES_AREA, { type: "geojson", data });
  m.addLayer({ id: `${RES_AREA}-fill`, type: "fill", source: RES_AREA, paint: { "fill-color": "#0ca678", "fill-opacity": 0.28 } });
  m.addLayer({ id: `${RES_AREA}-line`, type: "line", source: RES_AREA, paint: { "line-color": "#087f5b", "line-width": 1.5 } });
}

function addDraftLayers(m: MlMap, pts: [number, number][] | null | undefined) {
  const data = draftData(pts);
  const src = m.getSource(DRAFT) as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  m.addSource(DRAFT, { type: "geojson", data });
  m.addLayer({ id: `${DRAFT}-fill`, type: "fill", source: DRAFT, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#228be6", "fill-opacity": 0.15 } });
  m.addLayer({ id: `${DRAFT}-line`, type: "line", source: DRAFT, filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#1971c2", "line-width": 2.5 } });
  m.addLayer({ id: `${DRAFT}-pt`, type: "circle", source: DRAFT, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#fff", "circle-stroke-color": "#1971c2", "circle-stroke-width": 2.5 } });
}

function addCartLayers(m: MlMap, data: FeatureCollection | null | undefined) {
  const fc = data ?? EMPTY;
  const src = m.getSource(CART) as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(fc); return; }
  m.addSource(CART, { type: "geojson", data: fc });
  m.addLayer({ id: `${CART}-fill`, type: "fill", source: CART, paint: { "fill-color": "#f59f00", "fill-opacity": 0.18 } });
  m.addLayer({ id: `${CART}-line`, type: "line", source: CART, paint: { "line-color": "#e8590c", "line-width": 2, "line-dasharray": [2, 1] } });
}
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function addSelectionLayers(m: MlMap, geom: Geometry | null | undefined) {
  const data: FeatureCollection = geom ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom }] } : EMPTY;
  const src = m.getSource(SEL) as maplibregl.GeoJSONSource | undefined;
  if (src) { src.setData(data); return; }
  m.addSource(SEL, { type: "geojson", data });
  m.addLayer({ id: `${SEL}-fill`, type: "fill", source: SEL, paint: { "fill-color": "#12b886", "fill-opacity": 0.22 } });
  m.addLayer({ id: `${SEL}-line`, type: "line", source: SEL, paint: { "line-color": "#087f5b", "line-width": 3 } });
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

const GURS_IDS = new Set(GURS_LAYERS.map((l) => l.id));
/** App-owned layers (never hidden/restyled as basemap layers). */
export const isOwnLayer = (id: string) => GURS_IDS.has(id) || /^(ikataster-|sel|cart|draft|results)/.test(id);
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
  styleLabels(m, vis.ortho === "visible");
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

export function MapView({ basemap, overlays, labels = true, dark, onZoom, selection, fitKey, onMapClick, cart, draft, results, onResultClick, areaResults }: Props) {
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
    m.on("style.load", () => { addGursLayers(m, vis.current, labelsRef.current); addCartLayers(m, cartRef.current); addSelectionLayers(m, sel.current); addDraftLayers(m, draftRef.current); addAreaResultLayers(m, areaRef.current); addResultLayers(m, resultsRef.current); });
    m.on("click", (e) => {
      const hit = m.getLayer(`${RES}-dot`) ? m.queryRenderedFeatures(e.point, { layers: [`${RES}-dot`, `${RES}-label`] })[0] : undefined;
      const cl = m.getLayer(`${RES}-cluster`) ? m.queryRenderedFeatures(e.point, { layers: [`${RES}-cluster`, `${RES}-cluster-label`] })[0] : undefined;
      if (cl) {
        const src = m.getSource(RES) as maplibregl.GeoJSONSource;
        void src.getClusterExpansionZoom(Number(cl.properties.cluster_id)).then((z) => m.easeTo({ center: (cl.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z }));
        return;
      }
      if (hit && resClick.current) { const p = hit.properties as { ko: number; n: number }; resClick.current(Number(p.ko), Number(p.n)); return; }
      click.current?.(e.lngLat.lng, e.lngLat.lat);
    });
    m.on("mouseenter", `${RES}-dot`, () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", `${RES}-dot`, () => { m.getCanvas().style.cursor = ""; });
    m.on("mouseenter", `${RES}-cluster`, () => { m.getCanvas().style.cursor = "pointer"; });
    m.on("mouseleave", `${RES}-cluster`, () => { m.getCanvas().style.cursor = ""; });
    m.on("zoomend", () => onZoom?.(m.getZoom()));
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
    try { styleLabels(m, basemap === "ortho"); } catch { /* style not ready; style.load applies it */ }
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
