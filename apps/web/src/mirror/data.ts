import type { Geometry, Position } from "geojson";
import { fromD96 } from "../gurs/proj";
import type { Address, Building, BuildingPart, GursClient, Ko, KoDownload, Parcel } from "../gurs";

/**
 * Static per-KO copy of the GURS cadastre published with the app under /mirror
 * (built weekly by scripts/mirror). Same shapes as the GURS client, so callers don't care where data came from.
 * Source: Geodetska uprava Republike Slovenije (CC BY 4.0).
 */
type Codes = Record<"use" | "type" | "structure" | "status" | "areaMethod" | "mgrStatus", Record<string, string>>;
interface IndexDoc { v: 1; date: string; src: string; codes: Codes; kos: [number, string, [number, number, number, number], number, number][] }
type GeomEnc = number[][][];
interface KoDoc {
  v: 1; ko: [number, string]; date: string; src: string; managers: Record<string, string>;
  p: [string, string, number | null, number | null, number, number, GeomEnc][];
  b: [number, string, number | null, number | null, number | null, number | null, number | null, number | null, number | null,
    YN, YN, YN, YN, number, number, GeomEnc][];
  d: Record<string, [number, string, number | null, number | null, number | null, YN, YN, number | null, number | null, number | null, YN, number | null, number | null, number | null, number | null][]>;
}
type YN = 0 | 1 | null;
interface AddrDoc { v: 1; a: [string, string, number, string, string, number, number, string | null][] }

export const MIRROR_BASE = "/mirror";

function decodeRing(flat: number[]): Position[] {
  const out: Position[] = [];
  let x = 0, y = 0;
  for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; out.push([x / 1e6, y / 1e6]); }
  return out;
}
export function decodeGeometry(g: GeomEnc): Geometry {
  const polys = g.map((poly) => poly.map(decodeRing));
  return polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
}

const bool = (v: YN) => (v === 1 ? true : v === 0 ? false : null);
const name = (t: Record<string, string>, id: number | null) => (id === null || id === undefined ? null : t[String(id)] ?? null);
const fold = (s: string) => s.toLowerCase().replace(/đ/g, "d").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
/** Shard key of an address search: first two folded letters of the street (or settlement) name. */
export function addressKey(s: string): string {
  const k = fold(s).slice(0, 2);
  return k ? (k + "_").slice(0, 2) : "__";
}

export function decodeKo(doc: KoDoc, codes: Codes): KoDownload {
  const [koId, koName] = doc.ko;
  const parcels: Parcel[] = doc.p.map(([number, eid, area, soil, e, n, g]) => ({
    eid, koId, koName, number, area: area ?? 0, soilQuality: soil, centroidD96: [e, n], centroid: fromD96(e, n), geometry: decodeGeometry(g),
  }));
  const buildings: Building[] = doc.b.map(([number, eid, floors, flats, business, year, facade, type, structure, el, water, sewage, gas, e, n, g]) => ({
    eid, koId, koName, number, floors, flats, businessUnits: business, yearBuilt: year, facadeRenovated: facade,
    type: name(codes.type, type), structure: name(codes.structure, structure),
    utilities: { electricity: bool(el), water: bool(water), sewage: bool(sewage), gas: bool(gas) },
    centroidD96: [e, n], centroid: fromD96(e, n), geometry: decodeGeometry(g),
  }));
  const parts: KoDownload["parts"] = [];
  for (const [b, rows] of Object.entries(doc.d)) {
    for (const [number, eid, use, area, usable, elevator, condo, flat, inst, win, common, status, method, mgr, mgrStatus] of rows) {
      const part: BuildingPart = {
        eid, number, use: name(codes.use, use), area, usableArea: usable, floor: null, elevator: bool(elevator), condominium: bool(condo),
        address: null, flat, entranceFloor: null, installationsYear: inst, windowsYear: win, commonPart: bool(common),
        status: name(codes.status, status), areaMethod: name(codes.areaMethod, method),
        manager: mgr ? { id: mgr, name: doc.managers[String(mgr)] ?? "", status: name(codes.mgrStatus, mgrStatus) } : null,
      };
      parts.push({ building: Number(b), part });
    }
  }
  return { ko: { id: koId, name: koName }, parcels, buildings, parts };
}

export interface MirrorOptions { fetch?: typeof fetch; base?: string }

export function createMirror(o: MirrorOptions = {}) {
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const base = o.base ?? `${globalThis.location?.origin ?? ""}${MIRROR_BASE}`;
  let index: Promise<IndexDoc> | null = null;
  let loaded: IndexDoc | null = null;
  const shards = new Map<string, Promise<AddrDoc | null>>();
  async function json<T>(path: string): Promise<T> {
    const r = await f(`${base}${path}`);
    if (!r.ok) throw new Error(`Mirror ${path}: HTTP ${r.status}`);
    return r.json() as Promise<T>;
  }
  const getIndex = () => (index ??= json<IndexDoc>("/ko/index.json").then((d) => (loaded = d)).catch((e) => { index = null; throw e; }));

  return {
    /** Date of the GURS data in the mirror (null until the index was loaded). */
    date: () => loaded?.date ?? null,
    async index() { return getIndex(); },
    async listKos(): Promise<Ko[]> {
      return (await getIndex()).kos.map(([id, n]) => ({ id, name: n }));
    },
    async downloadKo(koId: number): Promise<KoDownload> {
      const idx = await getIndex();
      if (!idx.kos.some((k) => k[0] === koId)) throw new Error(`Mirror: unknown KO ${koId}`);
      return decodeKo(await json<KoDoc>(`/ko/${koId}.json`), idx.codes);
    },
    async searchAddresses(query: string, size = 8): Promise<Address[]> {
      const tokens = query.split(/[\s,]+/).filter(Boolean);
      const at = tokens.findIndex((t) => /^\d/.test(t));
      const street = fold((at < 0 ? tokens : tokens.slice(0, at)).join(""));
      if (street.length < 2) return [];
      const hs = at < 0 ? "" : tokens[at].toLowerCase();
      const place = (at < 0 ? [] : tokens.slice(at + 1)).map(fold).filter(Boolean);
      const key = addressKey(street);
      if (!shards.has(key)) shards.set(key, json<AddrDoc>(`/addr/${key}.json`).catch(() => { shards.delete(key); return null; }));
      const doc = await shards.get(key)!;
      if (!doc) return [];
      const hits = doc.a.filter(([s, h, , pn, mun]) => fold(s).startsWith(street) && h.toLowerCase().startsWith(hs)
        && place.every((p) => fold(pn).includes(p) || fold(mun).includes(p)));
      if (hs) hits.sort((a, b) => Number(b[1].toLowerCase() === hs) - Number(a[1].toLowerCase() === hs));
      return hits.slice(0, size).map(([s, h, pc, pn, mun, e, n, beid]) => {
        const [lon, lat] = fromD96(e, n);
        return { id: `m:${s}:${h}:${pc}`, label: `${s} ${h}`.trim(), place: `${pc} ${pn}`, postCode: pc, municipality: mun, e, n, lon, lat, buildingEid: beid };
      });
    },
  };
}
export type Mirror = ReturnType<typeof createMirror>;

/** KO list and KO pinning read the mirror (fast, spares GURS, whose WFS now rejects range filters); GURS is the fallback. */
export function withMirror(client: GursClient, mirror: Mirror): GursClient {
  return {
    ...client,
    async listKos() {
      try { return await mirror.listKos(); } catch { return client.listKos(); }
    },
    async downloadKo(koId, o) {
      try { return await mirror.downloadKo(koId); } catch { return client.downloadKo(koId, o); }
    },
  };
}
