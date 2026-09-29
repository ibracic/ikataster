import type { Geometry } from "geojson";

/** Katastrska občina (cadastral municipality). */
export interface Ko {
  id: number;
  name: string;
}

export interface Parcel {
  eid: string;
  /** Internal GURS parcel id (PARCELA_ID): key of the mass-valuation viewer. */
  id?: number;
  koId: number;
  koName: string;
  /** Parcel number as written in the cadastre, e.g. "1587" or "1/1". */
  number: string;
  /** Area in m² as recorded by GURS. */
  area: number;
  /** Soil quality (boniteta), null when not recorded. */
  soilQuality: number | null;
  /** [lon, lat] */
  centroid: [number, number];
  /** Centroid in D96/TM metres [E, N] as provided by GURS. */
  centroidD96: [number, number];
  geometry: Geometry;
}

export interface BuildingOnParcel {
  eid: string;
  koId: number;
  number: number;
  /** Building footprint area on this parcel, m². */
  areaOnParcel: number;
}

export interface ParcelDetails {
  landUse: string[] | null;
  intendedUse: { code: string; description: string }[] | null;
  soilQuality: number | null;
  buildings: BuildingOnParcel[] | null;
  spatialPlanUnit: { code: string; plan: string } | null;
  /** Sections that failed to load (others still returned). */
  errors: ("landUse" | "intendedUse" | "buildings" | "spatialPlanUnit")[];
}

/** A house-number address from the GURS register (RPE). */
export interface Address {
  id: string;
  /** "Street 12a" (or settlement name when there is no street). */
  label: string;
  /** "2000 Maribor" */
  place: string;
  postCode: number | null;
  municipality: string | null;
  /** D96/TM metres */
  e: number;
  n: number;
  lon: number;
  lat: number;
  buildingEid: string | null;
}

export interface Building {
  eid: string;
  koId: number;
  koName: string;
  number: number;
  floors: number | null;
  flats: number | null;
  businessUnits: number | null;
  yearBuilt: number | null;
  facadeRenovated: number | null;
  type: string | null;
  structure: string | null;
  utilities: { electricity: boolean | null; water: boolean | null; sewage: boolean | null; gas: boolean | null };
  /** [lon, lat] */
  centroid: [number, number];
  centroidD96: [number, number];
  geometry: Geometry;
}

/** Del stavbe (building part, e.g. a flat). */
export interface BuildingPart {
  eid: string;
  /** Internal GURS part id (DEL_STAVBE_ID): key of the mass-valuation viewer. */
  id?: number;
  number: number;
  use: string | null;
  area: number | null;
  usableArea: number | null;
  /** Floor(s) of the part as recorded, e.g. "3" or "2,3". */
  floor: string | null;
  elevator: boolean | null;
  condominium: boolean | null;
  /** Building manager (upravnik) recorded in the cadastre, if any. */
  manager?: { id: number; name: string; status: string | null } | null;
}

export type AreaKind = "parcel" | "building";

/** Parcel or building found inside a drawn polygon (cart-ready). */
export interface AreaFeature {
  kind: AreaKind;
  koId: number;
  koName: string;
  number: string;
  eid: string;
  geometry: Geometry | null;
}

export interface AreaResult {
  /** Features GURS matched by intersection (before centroid filtering). */
  total: number;
  /** True when total exceeds the limit; items is then empty. */
  tooMany: boolean;
  items: AreaFeature[];
}
