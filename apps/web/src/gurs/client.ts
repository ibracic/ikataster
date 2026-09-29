import { managerApi } from "./managers";
import { collectFeatures } from "./collect";
import type { Feature, Geometry } from "geojson";
import { GursError } from "./errors";
import { toD96, fromD96 } from "./proj";
import { getJson, MAX_PAGE_SIZE, WFS_KN, WFS_MNVP_PA, wfsGet, type WfsOptions } from "./wfs";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { AreaFeature, AreaKind, AreaResult, Address, Building, BuildingOnParcel, BuildingPart, Ko, Parcel, ParcelDetails } from "./types";

export interface GursClientOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  pageSize?: number;
}

/** Highest KO_ID range queried in fixed chunks (current max is 2716; the tail is covered by an open range). */
const KO_ID_SPAN = 3300;

const PARCEL_NO = /^\d{1,6}(\/\d{1,5})?$/;

interface ParcelProps {
  EID_PARCELA: string;
  PARCELA_ID?: number;
  KO_ID: number;
  NAZIV: string;
  ST_PARCELE: string;
  POVRSINA: number;
  BONITETA: number | null;
  E_CEN: number;
  N_CEN: number;
}

function toParcel(f: Feature<Geometry | null, ParcelProps>): Parcel {
  const p = f.properties;
  return {
    eid: String(p.EID_PARCELA),
    ...(p.PARCELA_ID ? { id: p.PARCELA_ID } : {}),
    koId: p.KO_ID,
    koName: String(p.NAZIV ?? "").replace(/^\d+\s+/, ""),
    number: p.ST_PARCELE,
    area: p.POVRSINA,
    soilQuality: p.BONITETA ?? null,
    centroidD96: [p.E_CEN, p.N_CEN],
    centroid: fromD96(p.E_CEN, p.N_CEN),
    geometry: f.geometry as Geometry,
  };
}

/** Address index used by the GURS public viewer (CORS *, no key). */
export const JV_SEARCH = "https://ipi.eprostor.gov.si/jv-api/search";

interface JvAddressProps {
  HS_STEVILKA?: number;
  HS_DODATEK?: string;
  ULICA_NAZIV?: string;
  NASELJE_NAZIV?: string;
  POSTNI_OKOLIS_SIFRA?: number;
  POSTNI_OKOLIS_NAZIV?: string;
  OBCINA_NAZIV?: string;
  E?: number;
  N?: number;
  EID_STAVBA?: string;
  EID_HISNA_STEVILKA?: string;
}

function toAddress(p: JvAddressProps): Address | null {
  if (!p.E || !p.N) return null;
  const hs = `${p.HS_STEVILKA ?? ""}${p.HS_DODATEK ?? ""}`.trim();
  const [lon, lat] = fromD96(p.E, p.N);
  return {
    id: String(p.EID_HISNA_STEVILKA ?? `${p.E},${p.N},${hs}`),
    label: [p.ULICA_NAZIV || p.NASELJE_NAZIV, hs].filter(Boolean).join(" "),
    place: [p.POSTNI_OKOLIS_SIFRA, p.POSTNI_OKOLIS_NAZIV || p.NASELJE_NAZIV].filter(Boolean).join(" "),
    postCode: p.POSTNI_OKOLIS_SIFRA ?? null,
    municipality: p.OBCINA_NAZIV ?? null,
    e: p.E, n: p.N, lon, lat,
    buildingEid: p.EID_STAVBA ? String(p.EID_STAVBA) : null,
  };
}

interface BuildingAttrs {
  EID_STAVBA: string; KO_ID: number; NAZIV: string; ST_STAVBE: number;
  STEVILO_ETAZ?: number; STEVILO_STANOVANJ?: number; STEVILO_POSLOVNIH_PROSTOROV?: number;
  TIPI_STAVB_NAZIV_SL?: string; LETO_IZGRADNJE?: number; LETO_OBNOVE_FASADE?: number; NOSILNE_KONSTRUKCIJE_NAZIV_SL?: string;
  ELEKTRIKA_NAZIV_SL?: string; VODOVOD_NAZIV_SL?: string; KANALIZACIJA_NAZIV_SL?: string; PLIN_NAZIV_SL?: string;
}
const BUILDING_PROPS = "KO_ID,NAZIV,ST_STAVBE,EID_STAVBA,STEVILO_ETAZ,STEVILO_STANOVANJ,STEVILO_POSLOVNIH_PROSTOROV,TIPI_STAVB_NAZIV_SL,LETO_IZGRADNJE,LETO_OBNOVE_FASADE,NOSILNE_KONSTRUKCIJE_NAZIV_SL,ELEKTRIKA_NAZIV_SL,VODOVOD_NAZIV_SL,KANALIZACIJA_NAZIV_SL,PLIN_NAZIV_SL";
interface ObrisProps { EID_STAVBA: string; KO_ID: number; ST_STAVBE: number; E_CEN: number; N_CEN: number }
interface PartProps {
  EID_DEL_STAVBE: string; DEL_STAVBE_ID?: number; ST_DELA_STAVBE: number; VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL?: string;
  POVRSINA?: number; UPORABNA_POVRSINA?: number; ETAZE_DELA_STAVBE?: string; DVIGALO_NAZIV_SL?: string; ETAZNA_LASTNINA_NAZIV_SL?: string;
  UPRAVNIK_ID?: number | null; NAZIV?: string | null; STATUSI_UPRAVNIKOV_NAZIV_SL?: string | null;
  NASLOV_DELA_STAVBE?: string | null; ST_STANOVANJA?: number | null; ST_ETAZE_GLAVNEGA_VHODA?: number | null;
  LETO_OBNOVE_INSTALACIJ?: number | null; LETO_OBNOVE_OKEN?: number | null; SKUPNI_DEL_ETAZNA_LASTNINA_NAZIV_SL?: string | null;
  STATUSI_VPISA_DELA_STAVBE_NAZIV_SL?: string | null; NACINI_DOLOCITVE_POVRSIN_DELA_STAVBE_NAZIV_SL?: string | null;
}
const PART_PROPS = "ST_DELA_STAVBE,EID_DEL_STAVBE,DEL_STAVBE_ID,VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL,POVRSINA,UPORABNA_POVRSINA,ETAZE_DELA_STAVBE,ST_ETAZE_GLAVNEGA_VHODA,DVIGALO_NAZIV_SL,ETAZNA_LASTNINA_NAZIV_SL,UPRAVNIK_ID,NAZIV,STATUSI_UPRAVNIKOV_NAZIV_SL,NASLOV_DELA_STAVBE,ST_STANOVANJA,LETO_OBNOVE_INSTALACIJ,LETO_OBNOVE_OKEN,SKUPNI_DEL_ETAZNA_LASTNINA_NAZIV_SL,STATUSI_VPISA_DELA_STAVBE_NAZIV_SL,NACINI_DOLOCITVE_POVRSIN_DELA_STAVBE_NAZIV_SL";

/** GURS "Da"/"Ne"/"Ni podatka" → boolean | null */
const yesNo = (v?: string) => (v === "Da" ? true : v === "Ne" ? false : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

function toPart(p: PartProps): BuildingPart {
  return {
    eid: String(p.EID_DEL_STAVBE),
    ...(p.DEL_STAVBE_ID ? { id: p.DEL_STAVBE_ID } : {}),
    number: p.ST_DELA_STAVBE,
    use: p.VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL ?? null,
    area: num(p.POVRSINA),
    usableArea: num(p.UPORABNA_POVRSINA),
    floor: p.ETAZE_DELA_STAVBE ?? null,
    elevator: yesNo(p.DVIGALO_NAZIV_SL),
    condominium: yesNo(p.ETAZNA_LASTNINA_NAZIV_SL),
    address: p.NASLOV_DELA_STAVBE ?? null,
    flat: num(p.ST_STANOVANJA),
    entranceFloor: typeof p.ST_ETAZE_GLAVNEGA_VHODA === "number" ? p.ST_ETAZE_GLAVNEGA_VHODA : null,
    installationsYear: num(p.LETO_OBNOVE_INSTALACIJ),
    windowsYear: num(p.LETO_OBNOVE_OKEN),
    commonPart: yesNo(p.SKUPNI_DEL_ETAZNA_LASTNINA_NAZIV_SL ?? undefined),
    status: p.STATUSI_VPISA_DELA_STAVBE_NAZIV_SL ?? null,
    areaMethod: p.NACINI_DOLOCITVE_POVRSIN_DELA_STAVBE_NAZIV_SL ?? null,
    manager: p.UPRAVNIK_ID ? { id: p.UPRAVNIK_ID, name: p.NAZIV ?? "", status: p.STATUSI_UPRAVNIKOV_NAZIV_SL ?? null } : null,
  };
}

function toBuilding(a: BuildingAttrs, o: ObrisProps, geometry: Geometry): Building {
  return {
    eid: String(a.EID_STAVBA),
    koId: a.KO_ID,
    koName: String(a.NAZIV ?? "").replace(/^\d+\s+/, ""),
    number: a.ST_STAVBE,
    floors: num(a.STEVILO_ETAZ),
    flats: a.STEVILO_STANOVANJ ?? null,
    businessUnits: a.STEVILO_POSLOVNIH_PROSTOROV ?? null,
    yearBuilt: num(a.LETO_IZGRADNJE),
    facadeRenovated: num(a.LETO_OBNOVE_FASADE),
    type: a.TIPI_STAVB_NAZIV_SL ?? null,
    structure: a.NOSILNE_KONSTRUKCIJE_NAZIV_SL ?? null,
    utilities: { electricity: yesNo(a.ELEKTRIKA_NAZIV_SL), water: yesNo(a.VODOVOD_NAZIV_SL), sewage: yesNo(a.KANALIZACIJA_NAZIV_SL), gas: yesNo(a.PLIN_NAZIV_SL) },
    centroidD96: [o.E_CEN, o.N_CEN],
    centroid: fromD96(o.E_CEN, o.N_CEN),
    geometry,
  };
}

/** Everything needed to look up parcels, buildings and parts of one KO without GURS. */
export interface KoDownload {
  ko: Ko;
  parcels: Parcel[];
  buildings: Building[];
  parts: { building: number; part: BuildingPart }[];
}
export type KoDownloadPhase = "parcels" | "buildings" | "outlines" | "parts";
/** Refuse pinning KOs larger than this per layer (biggest KOs have ~60k parts). */
export const PIN_MAX_FEATURES = 100_000;

const pointWkt = ([e, n]: [number, number]) => `POINT(${e} ${n})`;

export function createGursClient(o: GursClientOptions = {}) {
  const opt: WfsOptions = { fetch: o.fetch ?? ((...a) => globalThis.fetch(...a)), timeoutMs: o.timeoutMs ?? 15_000 };
  const managers = managerApi(opt);
  const pageSize = o.pageSize ?? MAX_PAGE_SIZE;

  async function parcelsWhere(cql: string): Promise<Parcel | null> {
    const fc = await wfsGet<ParcelProps>(WFS_KN, { typeNames: "SI.GURS.KN:PARCELE", srsName: "EPSG:4326", count: 2, cql_filter: cql }, opt);
    return fc.features[0] ? toParcel(fc.features[0]) : null;
  }

  const client = {
    ...managers,
    /**
     * All ~2700 cadastral municipalities (id + name).
     * GURS caps page size (~300) and paging depth (startIndex+count ~600), so we
     * split by KO_ID ranges (ids are unique, max 300 per range) and fetch them in parallel.
     */
    async listKos(): Promise<Ko[]> {
      const step = Math.min(pageSize, MAX_PAGE_SIZE);
      const ranges: string[] = [];
      for (let a = 1; a <= KO_ID_SPAN; a += step) ranges.push(`KO_ID BETWEEN ${a} AND ${a + step - 1}`);
      ranges.push(`KO_ID > ${KO_ID_SPAN}`);
      const pages = await Promise.all(ranges.map((cql) =>
        wfsGet<{ KO_ID: number; NAZIV: string }>(WFS_KN, { typeNames: "SI.GURS.KN:KATASTRSKE_OBCINE", propertyName: "KO_ID,NAZIV", count: step, cql_filter: cql }, opt)));
      const byId = new Map<number, Ko>();
      for (const f of pages.flatMap((p) => p.features)) byId.set(f.properties.KO_ID, { id: f.properties.KO_ID, name: f.properties.NAZIV });
      return [...byId.values()].sort((a, b) => a.id - b.id);
    },

    async findParcel(koId: number, number: string): Promise<Parcel | null> {
      const n = number.trim();
      if (!Number.isInteger(koId) || koId <= 0 || !PARCEL_NO.test(n)) throw new GursError("invalid-input", "Invalid cadastral municipality or parcel number");
      return parcelsWhere(`KO_ID=${koId} AND ST_PARCELE='${n}'`);
    },

    async parcelAt(lon: number, lat: number): Promise<Parcel | null> {
      return parcelsWhere(`INTERSECTS(GEOM,${pointWkt(toD96(lon, lat))})`);
    },

    async parcelAtD96(e: number, n: number): Promise<Parcel | null> {
      return parcelsWhere(`INTERSECTS(GEOM,${pointWkt([e, n])})`);
    },

    /** Building by KO + building number: attributes (STAVBE) + outline (STAVBE_OBRIS, WGS84). */
    async findBuilding(koId: number, number: number): Promise<Building | null> {
      if (!Number.isInteger(koId) || koId <= 0 || !Number.isInteger(number) || number <= 0) {
        throw new GursError("invalid-input", "Invalid cadastral municipality or building number");
      }
      const cql = `KO_ID=${koId} AND ST_STAVBE=${number}`;
      const [attrs, obris] = await Promise.all([
        wfsGet<BuildingAttrs>(WFS_KN, { typeNames: "SI.GURS.KN:STAVBE", count: 2, propertyName: BUILDING_PROPS, cql_filter: cql }, opt),
        wfsGet<ObrisProps>(WFS_KN, { typeNames: "SI.GURS.KN:STAVBE_OBRIS", srsName: "EPSG:4326", count: 2, cql_filter: cql }, opt),
      ]);
      const a = attrs.features[0]?.properties;
      const o = obris.features[0];
      if (!a || !o?.geometry) return null;
      return toBuilding(a, o.properties, o.geometry);
    },

    /** Building whose outline contains the point (map click). */
    async buildingAt(lon: number, lat: number): Promise<Building | null> {
      const fc = await wfsGet<ObrisProps>(WFS_KN, {
        typeNames: "SI.GURS.KN:STAVBE_OBRIS", count: 1, propertyName: "KO_ID,ST_STAVBE",
        cql_filter: `INTERSECTS(OBRIS_GEOM,${pointWkt(toD96(lon, lat))})`,
      }, opt);
      const p = fc.features[0]?.properties;
      return p ? client.findBuilding(p.KO_ID, p.ST_STAVBE) : null;
    },

    /** Building parts (flats, offices…). Splits by part-number ranges past GURS's 300-feature cap. */
    async buildingParts(koId: number, number: number): Promise<BuildingPart[]> {
      const base = `KO_ID=${Math.trunc(koId)} AND ST_STAVBE=${Math.trunc(number)}`;
      const size = MAX_PAGE_SIZE;
      const first = await wfsGet<PartProps>(WFS_KN, { typeNames: "SI.GURS.KN:DELI_STAVB", count: size, propertyName: PART_PROPS, cql_filter: base }, opt);
      let feats = first.features;
      const total = first.numberMatched ?? feats.length;
      if (total > feats.length) {
        const ranges: string[] = [];
        for (let a = 1; ranges.length < 20 && a <= Math.max(total * 2, size); a += size) ranges.push(`${base} AND ST_DELA_STAVBE BETWEEN ${a} AND ${a + size - 1}`);
        const pages = await Promise.all(ranges.map((c) => wfsGet<PartProps>(WFS_KN, { typeNames: "SI.GURS.KN:DELI_STAVB", count: size, propertyName: PART_PROPS, cql_filter: c }, opt)));
        feats = pages.flatMap((p) => p.features);
      }
      const byEid = new Map<string, BuildingPart>();
      for (const f of feats) byEid.set(String(f.properties.EID_DEL_STAVBE), toPart(f.properties));
      return [...byEid.values()].sort((a, b) => a.number - b.number);
    },

    /**
     * Parcels or buildings inside a drawn polygon ([lon, lat] ring).
     * GURS does the INTERSECTS in D96; we keep features whose centroid lies inside,
     * so neighbours that only touch the edge are dropped.
     */
    async featuresInPolygon(kind: AreaKind, ring: [number, number][], o2: { max?: number } = {}): Promise<AreaResult> {
      const max = Math.min(o2.max ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
      const pts = ring.filter((p, i) => i === 0 || p[0] !== ring[i - 1][0] || p[1] !== ring[i - 1][1]);
      const closed = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts : [...pts, pts[0]];
      if (closed.length < 4) throw new GursError("invalid-input", "A polygon needs at least 3 points");
      const wkt = `POLYGON((${closed.map(([lon, lat]) => toD96(lon, lat).map((v) => v.toFixed(1)).join(" ")).join(",")}))`;
      const layer = kind === "parcel"
        ? { typeNames: "SI.GURS.KN:PARCELE", geom: "GEOM", propertyName: "EID_PARCELA,KO_ID,NAZIV,ST_PARCELE,E_CEN,N_CEN,GEOM" }
        : { typeNames: "SI.GURS.KN:STAVBE_OBRIS", geom: "OBRIS_GEOM", propertyName: "EID_STAVBA,KO_ID,ST_STAVBE,E_CEN,N_CEN,OBRIS_GEOM" };
      const fc = await wfsGet<Record<string, unknown>>(WFS_KN, {
        typeNames: layer.typeNames, srsName: "EPSG:4326", count: max, propertyName: layer.propertyName,
        cql_filter: `INTERSECTS(${layer.geom},${wkt})`,
      }, opt);
      const total = fc.numberMatched ?? fc.features.length;
      if (total > max) return { total, tooMany: true, items: [] };
      const poly = { type: "Polygon" as const, coordinates: [closed] };
      const items: AreaFeature[] = [];
      const seen = new Set<string>();
      for (const f of fc.features) {
        const p = f.properties as Record<string, number & string>;
        if (!booleanPointInPolygon(fromD96(p.E_CEN, p.N_CEN), poly)) continue;
        const number = String(kind === "parcel" ? p.ST_PARCELE : p.ST_STAVBE);
        const key = `${p.KO_ID}:${number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          kind, koId: Number(p.KO_ID), number,
          koName: String(p.NAZIV ?? "").replace(/^\d+\s+/, ""),
          eid: String(kind === "parcel" ? p.EID_PARCELA : p.EID_STAVBA),
          geometry: f.geometry ?? null,
        });
      }
      return { total, tooMany: false, items };
    },

    /** Download all parcels, buildings (attributes + outlines) and building parts of one KO. */
    async downloadKo(koId: number, o2: { signal?: AbortSignal; onProgress?: (phase: KoDownloadPhase, done: number, total: number) => void } = {}): Promise<KoDownload> {
      if (!Number.isInteger(koId) || koId <= 0) throw new GursError("invalid-input", "Invalid cadastral municipality");
      const o: WfsOptions = { ...opt, timeoutMs: Math.max(opt.timeoutMs, 60_000), signal: o2.signal };
      const base = `KO_ID=${koId}`;
      const prog = (ph: KoDownloadPhase) => (d: number, t: number) => o2.onProgress?.(ph, d, t);
      const parcels = (await collectFeatures<ParcelProps & { PARCELA_ID: number }>(o, {
        layer: "SI.GURS.KN:PARCELE", base, srsName: "EPSG:4326", max: PIN_MAX_FEATURES,
        propertyName: "EID_PARCELA,PARCELA_ID,KO_ID,NAZIV,ST_PARCELE,POVRSINA,BONITETA,E_CEN,N_CEN,GEOM",
        splits: [["PARCELA_ID", 1, 999_999_999_999]], onProgress: prog("parcels"), // PARCELA_ID reaches 1e11
      })).filter((f) => f.geometry).map(toParcel);
      const attrs = await collectFeatures<BuildingAttrs>(o, {
        layer: "SI.GURS.KN:STAVBE", base, propertyName: BUILDING_PROPS, max: PIN_MAX_FEATURES,
        splits: [["ST_STAVBE", 1, 999_999]], onProgress: prog("buildings"),
      });
      const outlines = await collectFeatures<ObrisProps>(o, {
        layer: "SI.GURS.KN:STAVBE_OBRIS", base, srsName: "EPSG:4326", max: PIN_MAX_FEATURES,
        propertyName: "EID_STAVBA,KO_ID,ST_STAVBE,E_CEN,N_CEN,OBRIS_GEOM",
        splits: [["ST_STAVBE", 1, 999_999]], onProgress: prog("outlines"),
      });
      const byNo = new Map(outlines.filter((f) => f.geometry).map((f) => [f.properties.ST_STAVBE, f]));
      const buildings: Building[] = [];
      for (const { properties: a } of attrs) {
        const ob = byNo.get(a.ST_STAVBE);
        if (ob) buildings.push(toBuilding(a, ob.properties, ob.geometry!));
      }
      const parts = (await collectFeatures<PartProps & { ST_STAVBE: number }>(o, {
        layer: "SI.GURS.KN:DELI_STAVB", base, propertyName: "ST_STAVBE," + PART_PROPS, max: PIN_MAX_FEATURES,
        splits: [["ST_STAVBE", 1, 999_999], ["ST_DELA_STAVBE", 1, 99_999]], onProgress: prog("parts"),
      })).map((f) => ({ building: f.properties.ST_STAVBE, part: toPart(f.properties) }));
      const koName = parcels[0]?.koName ?? buildings[0]?.koName ?? "";
      return { ko: { id: koId, name: koName }, parcels, buildings, parts };
    },

    /** Raw KN feature query (WGS84, ≤300 features) for batch lookups such as list import. */
    async wfs(typeNames: string, propertyName: string, cql: string) {
      const fc = await wfsGet<Record<string, unknown>>(WFS_KN, { typeNames, srsName: "EPSG:4326", count: MAX_PAGE_SIZE, propertyName, cql_filter: cql }, opt);
      return fc.features;
    },

    /** Address autocomplete (street + house number, optionally place). Queries shorter than 3 chars return []. */
    async searchAddresses(query: string, size = 8, signal?: AbortSignal): Promise<Address[]> {
      // GURS matches words; a comma ("Bevkova ulica 1, Ptuj") makes it return nothing.
      const filter = query.replace(/[,;]+/g, " ").trim().replace(/\s+/g, " ");
      if (filter.length < 3) return [];
      const u = new URL(JV_SEARCH);
      u.searchParams.set("source", "NSLV-STA-FULL");
      u.searchParams.set("filter", filter);
      u.searchParams.set("size", String(size));
      const d = await getJson<{ features?: { properties?: JvAddressProps }[] | null }>(u.toString(), { ...opt, signal });
      const out: Address[] = [];
      const seen = new Set<string>();
      for (const f of d.features ?? []) {
        const a = toAddress(f.properties ?? {});
        if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); }
      }
      return out;
    },

    async parcelDetails(p: Parcel): Promise<ParcelDetails> {
      const at = `INTERSECTS(GEOM,${pointWkt(p.centroidD96)})`;
      const errors: ParcelDetails["errors"] = [];
      const safe = async <T>(key: ParcelDetails["errors"][number], fn: () => Promise<T>): Promise<T | null> => {
        try { return await fn(); } catch { errors.push(key); return null; }
      };
      const [landUse, intendedUse, buildings, spatialPlanUnit] = await Promise.all([
        safe("landUse", async () => {
          const fc = await wfsGet<{ MASKA_IME: string }>(WFS_KN, { typeNames: "SI.GURS.KN:DEJANSKE_RABE", propertyName: "MASKA_IME,MASKA_SFR", count: 10, cql_filter: at }, opt);
          return [...new Set(fc.features.map((f) => f.properties.MASKA_IME).filter(Boolean))];
        }),
        safe("intendedUse", async () => {
          const fc = await wfsGet<{ PODROBNE_NAMENSKE_RABE_NAZIV_SL: string; PODROBNE_NAMENSKE_RABE_OPIS_SL: string }>(WFS_KN, {
            typeNames: "SI.GURS.KN:NAMENSKE_RABE", count: 10, cql_filter: at,
            propertyName: "PODROBNE_NAMENSKE_RABE_SIFRA,PODROBNE_NAMENSKE_RABE_NAZIV_SL,PODROBNE_NAMENSKE_RABE_OPIS_SL",
          }, opt);
          return fc.features.map((f) => ({ code: f.properties.PODROBNE_NAMENSKE_RABE_NAZIV_SL, description: f.properties.PODROBNE_NAMENSKE_RABE_OPIS_SL }));
        }),
        safe("buildings", async () => {
          const fc = await wfsGet<{ KO_ID: number; ST_STAVBE: number; EID_STAVBA: string; POVRSINA: number }>(WFS_KN, {
            typeNames: "SI.GURS.KN:STAVBE_PARCELE", count: 200, propertyName: "KO_ID,ST_STAVBE,EID_STAVBA,POVRSINA",
            cql_filter: `EID_PARCELA='${p.eid.replace(/\D/g, "")}'`,
          }, opt);
          return fc.features
            .map((f): BuildingOnParcel => ({ eid: String(f.properties.EID_STAVBA), koId: f.properties.KO_ID, number: f.properties.ST_STAVBE, areaOnParcel: f.properties.POVRSINA }))
            .sort((a, b) => a.number - b.number);
        }),
        safe("spatialPlanUnit", async () => {
          const fc = await wfsGet<{ EUP_OZN: string; NAZIV_PA: string }>(WFS_MNVP_PA, { typeNames: "SI.MNVP.PA:EUP_OPN", count: 5, propertyName: "EUP_OZN,NAZIV_PA", cql_filter: at }, opt);
          const f = fc.features[0];
          return f ? { code: f.properties.EUP_OZN, plan: f.properties.NAZIV_PA } : null;
        }),
      ]);
      return { landUse, intendedUse, buildings, spatialPlanUnit, soilQuality: p.soilQuality, errors };
    },
  };
  return client;
}

export type GursClient = ReturnType<typeof createGursClient>;

/**
 * GURS mass-valuation public viewer (posplošena vrednost). Its API is CORS-locked and captcha-signed,
 * so we link to it instead of fetching the value. Ids are the internal PARCELA_ID / DEL_STAVBE_ID.
 */
export function valuationUrl(kind: "parcel" | "part", id: number): string {
  return `https://vrednotenje.gov.si/EV_JV/#/${kind === "parcel" ? "parcela" : "delStavbe"}_${id}`;
}

export function gursPublicViewUrl(eid: string): string {
  return `https://ipi.eprostor.gov.si/jv/?eid=${encodeURIComponent(eid)}`;
}
