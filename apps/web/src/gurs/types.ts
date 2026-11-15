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
  /** Municipality (občina) from the copy; undefined when unknown. */
  municipality?: string;
  /** Detail sections that came with the parcel from the mirror (no GURS query needed). */
  extra?: ParcelExtra;
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

export interface ParcelExtra {
  landUse: string[];
  intendedUse: { code: string; description: string }[];
  buildings: BuildingOnParcel[];
  /** Spatial plan unit from the copy; undefined = this copy has no EUP data (older file). */
  spatialPlanUnit?: { code: string; plan: string } | null;
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
  /** Detail attributes (absent on parts cached before they were added). */
  address?: string | null;
  flat?: number | null;
  entranceFloor?: number | null;
  installationsYear?: number | null;
  windowsYear?: number | null;
  commonPart?: boolean | null;
  status?: string | null;
  areaMethod?: string | null;
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

/** Building manager (upravnik) as recorded on building parts. */
export interface Manager { id: number; name: string; address: string | null; parts: number | null }
export interface ManagedPart { koId: number; building: number; part: number; eid: string; buildingEid: string; use: string | null }
export interface ManagedBuilding { koId: number; number: number; eid: string; parts: ManagedPart[] }
export interface ManagerSearch { managers: Manager[]; /** More managers may match than shown: refine the name. */ truncated: boolean }
export interface ManagerPortfolio { manager: Manager; parts: ManagedPart[]; buildings: ManagedBuilding[] }

/** Everything needed to look up parcels, buildings and parts of one KO. */
export interface KoDownload {
  ko: Ko;
  parcels: Parcel[];
  buildings: Building[];
  parts: { building: number; part: BuildingPart }[];
}

export interface SpatialPlanUnit { code: string; plan: string }

/** The cadastre as the app sees it (answered from the app's GURS copy, see cadastre/copy.ts). */
export interface GursClient {
  listKos(): Promise<Ko[]>;
  downloadKo(koId: number): Promise<KoDownload>;
  findParcel(koId: number, number: string): Promise<Parcel | null>;
  parcelAt(lon: number, lat: number): Promise<Parcel | null>;
  parcelAtD96(e: number, n: number): Promise<Parcel | null>;
  parcelDetails(p: Parcel): Promise<ParcelDetails>;
  findBuilding(koId: number, number: number): Promise<Building | null>;
  buildingAt(lon: number, lat: number): Promise<Building | null>;
  buildingParts(koId: number, number: number): Promise<BuildingPart[]>;
  featuresInPolygon(kind: AreaKind, ring: [number, number][], o?: { max?: number }): Promise<AreaResult>;
  searchAddresses(query: string, size?: number): Promise<Address[]>;
  searchManagers(query: string): Promise<ManagerSearch>;
  managerPortfolio(id: number, o?: { koId?: number; signal?: AbortSignal; onProgress?: (n: number) => void }): Promise<ManagerPortfolio | null>;
  buildingOutlines(list: { koId: number; number: number }[]): Promise<Map<string, Geometry>>;
}
