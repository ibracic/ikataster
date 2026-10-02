import type * as maplibregl from 'maplibre-gl';
import type { FeatureCollection, Geometry } from 'geojson';
import { GURS_LAYERS } from './layers';
type MlMap = maplibregl.Map;
export const SEL = 'selection', CART = 'cart', DRAFT = 'draft', RES = 'results', EZK = 'results-ezk', RES_AREA = 'results-area';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
export function draftData(pts: [number, number][] | null | undefined): FeatureCollection {
  if (!pts?.length) return EMPTY;
  const features: FeatureCollection["features"] = pts.map((c) => ({ type: "Feature", properties: { kind: "vertex" }, geometry: { type: "Point", coordinates: c } }));
  if (pts.length >= 3) features.unshift({ type: "Feature", properties: { kind: "area" }, geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] } });
  else if (pts.length === 2) features.unshift({ type: "Feature", properties: { kind: "area" }, geometry: { type: "LineString", coordinates: pts } });
  return { type: "FeatureCollection", features };
}

export interface LayerDefinition { source: string; options: Omit<maplibregl.GeoJSONSourceSpecification, 'data'>; layers: maplibregl.LayerSpecification[] }
export function installLayer(m: MlMap, definition: LayerDefinition, data: FeatureCollection) {
  const src = m.getSource(definition.source) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else m.addSource(definition.source, { ...definition.options, data });
  for (const layer of definition.layers) if (!m.getLayer(layer.id)) m.addLayer(layer);
}
export function layerOwnership(definitions: LayerDefinition[], rasterIds: string[] = []) {
  const ids = new Set([...rasterIds, ...definitions.flatMap(d => d.layers.map(l => l.id))]);
  return (id: string) => ids.has(id);
}
const RES_DEF: LayerDefinition = { source: RES, options: { type: "geojson", cluster: true, clusterRadius: 40, clusterMaxZoom: 15, clusterProperties: { parts: ["+", ["get", "parts"]] } }, layers: [
{ id: `${RES}-cluster`, type: "circle", source: RES, filter: ["has", "point_count"], paint: {
    "circle-color": "#087f5b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.92,
    "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 16, 10, 22, 50, 30] } },
{ id: `${RES}-cluster-label`, type: "symbol", source: RES, filter: ["has", "point_count"], layout: {
    "text-field": ["concat", ["to-string", ["get", "point_count"]], " st.\n", ["to-string", ["get", "parts"]]],
    "text-font": ["Noto Sans Bold"], "text-size": 10, "text-line-height": 1.1, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#ffffff" } },
{ id: `${RES}-dot`, type: "circle", source: RES, filter: ["!", ["has", "point_count"]], paint: {
    "circle-color": "#0ca678", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2,
    "circle-radius": ["interpolate", ["linear"], ["get", "parts"], 1, 9, 50, 12, 300, 16] } },
{ id: `${RES}-label`, type: "symbol", source: RES, filter: ["!", ["has", "point_count"]], layout: {
    "text-field": ["to-string", ["get", "parts"]], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#ffffff" } }
] };
export function addResultLayers(m: MlMap, fc: FeatureCollection | null | undefined) { installLayer(m, RES_DEF, fc ?? EMPTY); }
const EZK_DEF: LayerDefinition = { source: EZK, options: { type: "geojson", cluster: true, clusterRadius: 36, clusterMaxZoom: 15, clusterProperties: { count: ["+", ["get", "count"]] } }, layers: [
{ id: `${EZK}-cluster`, type: "circle", source: EZK, filter: ["has", "point_count"], paint: {
    "circle-color": "#5f3dc4", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-opacity": 0.92,
    "circle-radius": ["interpolate", ["linear"], ["get", "count"], 2, 14, 20, 20, 200, 28] } },
{ id: `${EZK}-cluster-label`, type: "symbol", source: EZK, filter: ["has", "point_count"], layout: {
    "text-field": ["to-string", ["get", "count"]], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#ffffff" } },
{ id: `${EZK}-dot`, type: "circle", source: EZK, filter: ["!", ["has", "point_count"]], paint: {
    "circle-color": "#7048e8", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-radius": 9 } },
{ id: `${EZK}-label`, type: "symbol", source: EZK, filter: ["all", ["!", ["has", "point_count"]], [">", ["get", "count"], 1]], layout: {
    "text-field": ["to-string", ["get", "count"]], "text-font": ["Noto Sans Bold"], "text-size": 10, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#ffffff" } }
] };
export function addEzkLayers(m: MlMap, fc: FeatureCollection | null | undefined) { installLayer(m, EZK_DEF, fc ?? EMPTY); }
const RES_AREA_DEF: LayerDefinition = { source: RES_AREA, options: { type: "geojson" }, layers: [
{ id: `${RES_AREA}-fill`, type: "fill", source: RES_AREA, paint: { "fill-color": "#0ca678", "fill-opacity": 0.28 } },
{ id: `${RES_AREA}-line`, type: "line", source: RES_AREA, paint: { "line-color": "#087f5b", "line-width": 1.5 } }
] };
export function addAreaResultLayers(m: MlMap, fc: FeatureCollection | null | undefined) { installLayer(m, RES_AREA_DEF, fc ?? EMPTY); }
const DRAFT_DEF: LayerDefinition = { source: DRAFT, options: { type: "geojson" }, layers: [
{ id: `${DRAFT}-fill`, type: "fill", source: DRAFT, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#228be6", "fill-opacity": 0.15 } },
{ id: `${DRAFT}-line`, type: "line", source: DRAFT, filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#1971c2", "line-width": 2.5 } },
{ id: `${DRAFT}-pt`, type: "circle", source: DRAFT, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 6, "circle-color": "#fff", "circle-stroke-color": "#1971c2", "circle-stroke-width": 2.5 } }
] };
export function addDraftLayers(m: MlMap, pts: [number, number][] | null | undefined) { installLayer(m, DRAFT_DEF, draftData(pts)); }
const CART_DEF: LayerDefinition = { source: CART, options: { type: "geojson" }, layers: [
{ id: `${CART}-fill`, type: "fill", source: CART, paint: { "fill-color": "#f59f00", "fill-opacity": 0.18 } },
{ id: `${CART}-line`, type: "line", source: CART, paint: { "line-color": "#e8590c", "line-width": 2, "line-dasharray": [2, 1] } }
] };
export function addCartLayers(m: MlMap, fc: FeatureCollection | null | undefined) { installLayer(m, CART_DEF, fc ?? EMPTY); }
const SEL_DEF: LayerDefinition = { source: SEL, options: { type: "geojson" }, layers: [
{ id: `${SEL}-fill`, type: "fill", source: SEL, paint: { "fill-color": "#12b886", "fill-opacity": 0.22 } },
{ id: `${SEL}-line`, type: "line", source: SEL, paint: { "line-color": "#087f5b", "line-width": 3 } }
] };
export function addSelectionLayers(m: MlMap, geom: Geometry | null | undefined) { installLayer(m, SEL_DEF, geom ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: geom }] } : EMPTY); }
export const APP_LAYERS = [CART_DEF, SEL_DEF, DRAFT_DEF, RES_AREA_DEF, EZK_DEF, RES_DEF];
export const isOwnLayer = layerOwnership(APP_LAYERS, GURS_LAYERS.map(l => l.id));
interface MarkerHandlers {
  result?: (ko: number, n: number) => void;
  ezk?: (kind: 'parcel' | 'building', ko: number, n: string) => void;
  map?: (lon: number, lat: number) => void;
}
const MARKERS = [
  { definition: RES_DEF, open: (p: Record<string, any>, h: MarkerHandlers) => { if (!h.result) return false; h.result(Number(p.ko), Number(p.n)); return true; } },
  { definition: EZK_DEF, open: (p: Record<string, any>, h: MarkerHandlers) => { if (!h.ezk) return false; h.ezk(p.kind, Number(p.ko), String(p.n)); return true; } },
];
export function bindLayerInteractions(m: MlMap, getHandlers: () => MarkerHandlers) {
  m.on('click', e => {
    const handlers = getHandlers();
    for (const { definition, open } of MARKERS) {
      const id = definition.source;
      const query = (suffixes: string[]) => {
        const layers = suffixes.map(s => `${id}-${s}`).filter(l => !!m.getLayer(l));
        return layers.length ? m.queryRenderedFeatures(e.point, { layers })[0] : undefined;
      };
      const cluster = query(['cluster', 'cluster-label']);
      if (cluster) {
        const source = m.getSource(id) as maplibregl.GeoJSONSource;
        void source.getClusterExpansionZoom(Number(cluster.properties.cluster_id)).then(zoom => {
          if (m.getSource(id) === source) m.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
        }).catch(() => undefined);
        return;
      }
      const hit = query(['dot', 'label']);
      if (hit && open(hit.properties, handlers)) return;
    }
    handlers.map?.(e.lngLat.lng, e.lngLat.lat);
  });
  for (const { definition } of MARKERS) for (const suffix of ['dot', 'cluster']) {
    m.on('mouseenter', `${definition.source}-${suffix}`, () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', `${definition.source}-${suffix}`, () => { m.getCanvas().style.cursor = ''; });
  }
}
