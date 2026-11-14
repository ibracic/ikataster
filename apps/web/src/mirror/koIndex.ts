import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { MultiPolygon, Polygon } from "geojson";
import type { Building, BuildingPart, KoDownload, Parcel } from "../gurs";
import { bboxOf } from "../local/db";

/** A KO from the mirror held in memory with lookup tables: answers in microseconds, no IndexedDB round-trips. */
export interface KoIndex {
  koId: number;
  parcel(number: string): Parcel | null;
  building(number: number): Building | null;
  parts(building: number): BuildingPart[];
  parcelAt(lon: number, lat: number): Parcel | null;
  buildingAt(lon: number, lat: number): Building | null;
  /** Parcels or buildings whose bounding box overlaps [w, s, e, n]. */
  within(kind: "parcel" | "building", box: [number, number, number, number]): (Parcel | Building)[];
}

type Boxed<T> = { v: T; b: [number, number, number, number] };
const hit = <T extends { geometry: unknown }>(list: Boxed<T>[], x: number, y: number): T | null => {
  for (const { v, b } of list) {
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    const g = v.geometry as Polygon | MultiPolygon | null;
    if (g && (g.type === "Polygon" || g.type === "MultiPolygon") && booleanPointInPolygon([x, y], g)) return v;
  }
  return null;
};

export function indexKo(d: KoDownload): KoIndex {
  const parcels = new Map(d.parcels.map((p) => [p.number, p]));
  const buildings = new Map(d.buildings.map((b) => [b.number, b]));
  const parts = new Map<number, BuildingPart[]>();
  for (const { building, part } of d.parts) {
    let l = parts.get(building);
    if (!l) parts.set(building, (l = []));
    l.push(part);
  }
  for (const l of parts.values()) l.sort((a, b) => a.number - b.number);
  let pBoxes: Boxed<Parcel>[] | null = null;
  let bBoxes: Boxed<Building>[] | null = null;
  return {
    koId: d.ko.id,
    parcel: (n) => parcels.get(n.trim()) ?? null,
    building: (n) => buildings.get(n) ?? null,
    parts: (b) => parts.get(b) ?? [],
    parcelAt: (x, y) => hit((pBoxes ??= d.parcels.filter((p) => p.geometry).map((v) => ({ v, b: bboxOf(v.geometry!) }))), x, y),
    buildingAt: (x, y) => hit((bBoxes ??= d.buildings.filter((b) => b.geometry).map((v) => ({ v, b: bboxOf(v.geometry!) }))), x, y),
    within: (kind, [w, s, e, n]) => {
      const list: Boxed<Parcel | Building>[] = kind === "parcel"
        ? (pBoxes ??= d.parcels.filter((p) => p.geometry).map((v) => ({ v, b: bboxOf(v.geometry!) })))
        : (bBoxes ??= d.buildings.filter((b) => b.geometry).map((v) => ({ v, b: bboxOf(v.geometry!) })));
      return list.filter(({ b }) => b[0] <= e && b[2] >= w && b[1] <= n && b[3] >= s).map(({ v }) => v);
    },
  };
}
