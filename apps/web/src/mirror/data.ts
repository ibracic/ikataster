import type { Geometry, Position } from "geojson";
import { fromD96 } from "../gurs/proj";
import type { Address, Building, BuildingPart, GursClient, Ko, KoDownload, Parcel } from "../gurs";
import type { ManagedBuilding, ManagedPart, Manager, ManagerPortfolio, ManagerSearch } from "../gurs/managers";

/**
 * Static per-KO copy of the GURS cadastre published with the app under /mirror
 * (built weekly by scripts/mirror). Same shapes as the GURS client, so callers don't care where data came from.
 * Source: Geodetska uprava Republike Slovenije (CC BY 4.0).
 */
type Codes = Record<"use" | "type" | "structure" | "status" | "areaMethod" | "mgrStatus", Record<string, string>> & {
  landUse?: Record<string, string>; intended?: Record<string, [string, string]>;
};
interface IndexDoc { v: 1; date: string; src: string; codes: Codes; kos: [number, string, [number, number, number, number], number, number][] }
type GeomEnc = number[][][];
interface KoDoc {
  v: 1; ko: [number, string]; date: string; src: string; managers: Record<string, string>;
  p: [string, string, number | null, number | null, number, number, GeomEnc][];
  b: [number, string, number | null, number | null, number | null, number | null, number | null, number | null, number | null,
    YN, YN, YN, YN, number, number, GeomEnc][];
  /** parcel -> [land use [[ids], share], intended use [id, share], buildings [ko, n, area, eid]] (added by extras.py) */
  pe?: Record<string, [[number[], number | null][], [number, number | null][], [number, number, number, string][]]>;
  /** building -> [part, floors "1,2", entrance floor, address] */
  de?: Record<string, [number, string | null, number | null, string | null][]>;
  d: Record<string, [number, string, number | null, number | null, number | null, YN, YN, number | null, number | null, number | null, YN, number | null, number | null, number | null, number | null][]>;
}
type YN = 0 | 1 | null;
interface MgrIndexDoc { v: 1; date: string; m: [number, string, number, number, number[]][] }
interface MgrDoc { v: 1; id: number; name: string; b: [number, number, string | null, GeomEnc | null, [number, string, number | null][]][] }
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
  const share = (s: number | null) => (s !== null && s < 100 ? ` (${s} %)` : "");
  const parcels: Parcel[] = doc.p.map(([number, eid, area, soil, e, n, g]) => {
    const p: Parcel = { eid, koId, koName, number, area: area ?? 0, soilQuality: soil, centroidD96: [e, n], centroid: fromD96(e, n), geometry: decodeGeometry(g) };
    const x = doc.pe?.[number];
    if (doc.pe) {
      p.extra = {
        landUse: (x?.[0] ?? []).map(([ids, s]) => ids.map((id) => codes.landUse?.[String(id)] ?? String(id)).join(", ") + share(s)).filter(Boolean),
        intendedUse: (x?.[1] ?? []).map(([id, s]) => { const c = codes.intended?.[String(id)]; return { code: (c?.[0] ?? String(id)) + share(s), description: c?.[1] ?? "" }; }),
        buildings: (x?.[2] ?? []).map(([ko, nr, a, beid]) => ({ eid: beid, koId: ko, number: nr, areaOnParcel: a })),
      };
    }
    return p;
  });
  const extraParts = new Map<string, [string | null, number | null, string | null]>();
  for (const [b, rows] of Object.entries(doc.de ?? {})) for (const [nr, fl, en, ad] of rows) extraParts.set(`${b}/${nr}`, [fl, en, ad]);
  const buildings: Building[] = doc.b.map(([number, eid, floors, flats, business, year, facade, type, structure, el, water, sewage, gas, e, n, g]) => ({
    eid, koId, koName, number, floors, flats, businessUnits: business, yearBuilt: year, facadeRenovated: facade,
    type: name(codes.type, type), structure: name(codes.structure, structure),
    utilities: { electricity: bool(el), water: bool(water), sewage: bool(sewage), gas: bool(gas) },
    centroidD96: [e, n], centroid: fromD96(e, n), geometry: decodeGeometry(g),
  }));
  const parts: KoDownload["parts"] = [];
  for (const [b, rows] of Object.entries(doc.d)) {
    for (const [number, eid, use, area, usable, elevator, condo, flat, inst, win, common, status, method, mgr, mgrStatus] of rows) {
      const [floor, entranceFloor, address] = extraParts.get(`${b}/${number}`) ?? [null, null, null];
      const part: BuildingPart = {
        eid, number, use: name(codes.use, use), area, usableArea: usable, floor, elevator: bool(elevator), condominium: bool(condo),
        address, flat, entranceFloor, installationsYear: inst, windowsYear: win, commonPart: bool(common),
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
  let mgrIndex: Promise<MgrIndexDoc> | null = null;
  const mgrDocs = new Map<number, Promise<MgrDoc>>();
  const outlines = new Map<string, Geometry>();
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
    /** KOs whose bounding box contains the point (candidates for a point lookup, nearest centre first). */
    async kosAt(lon: number, lat: number): Promise<number[]> {
      return (await getIndex()).kos.filter(([, , [w, s, e, n]]) => lon >= w && lon <= e && lat >= s && lat <= n)
        .map(([id, , [w, s, e, n]]) => [id, (lon - (w + e) / 2) ** 2 + (lat - (s + n) / 2) ** 2] as const)
        .sort((a, b) => a[1] - b[1]).map(([id]) => id);
    },
    async downloadKo(koId: number): Promise<KoDownload> {
      // Index and KO file in parallel: the KO file is the slow part, don't wait for the index first.
      const file = json<KoDoc>(`/ko/${koId}.json`);
      file.catch(() => undefined);
      const idx = await getIndex();
      if (!idx.kos.some((k) => k[0] === koId)) throw new Error(`Mirror: unknown KO ${koId}`);
      return decodeKo(await file, idx.codes);
    },
    /** Managers whose name contains every word of the query (local, instant). */
    async searchManagers(query: string, limit = 20): Promise<ManagerSearch> {
      const words = query.split(/\s+/).map(fold).filter(Boolean);
      if (!words.length || words.join("").length < 3) return { managers: [], truncated: false };
      const idx = await (mgrIndex ??= json<MgrIndexDoc>("/mgr/index.json").catch((e) => { mgrIndex = null; throw e; }));
      const hits = idx.m.filter(([, n]) => { const f = fold(n); return words.every((w) => f.includes(w)); });
      const managers: Manager[] = hits.slice(0, limit).map(([id, n, parts]) => ({ id, name: n, address: null, parts }));
      return { managers, truncated: hits.length > limit };
    },
    /** Whole portfolio of a manager from one file (optionally one KO). Also primes building outlines. */
    async managerPortfolio(id: number, koId?: number): Promise<ManagerPortfolio | null> {
      const idx = await getIndex();
      let p = mgrDocs.get(id);
      if (!p) { p = json<MgrDoc>(`/mgr/${id}.json`); mgrDocs.set(id, p); p.catch(() => mgrDocs.delete(id)); }
      const doc = await p;
      const buildings: ManagedBuilding[] = [];
      const parts: ManagedPart[] = [];
      for (const [ko, number, eid, geom, rows] of doc.b) {
        if (geom && !outlines.has(`${ko}:${number}`)) outlines.set(`${ko}:${number}`, decodeGeometry(geom));
        if (koId && ko !== koId) continue;
        const bp = rows.map(([part, peid, use]) => ({ koId: ko, building: number, part, eid: peid, buildingEid: eid ?? "", use: name(idx.codes.use, use) }));
        parts.push(...bp);
        buildings.push({ koId: ko, number, eid: eid ?? "", parts: bp });
      }
      if (!parts.length) return null;
      return { manager: { id, name: doc.name, address: null, parts: parts.length }, parts, buildings };
    },
    /** Outlines already loaded with a manager portfolio. */
    knownOutlines(list: { koId: number; number: number }[]): Map<string, Geometry> {
      const out = new Map<string, Geometry>();
      for (const b of list) { const g = outlines.get(`${b.koId}:${b.number}`); if (g) out.set(`${b.koId}:${b.number}`, g); }
      return out;
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
      const hits = doc.a.filter(([s, h, pc, pn, mun]) => fold(s).startsWith(street) && h.toLowerCase().startsWith(hs)
        && place.every((p) => fold(pn).includes(p) || fold(mun).includes(p) || String(pc) === p));
      if (hs) hits.sort((a, b) => Number(b[1].toLowerCase() === hs) - Number(a[1].toLowerCase() === hs));
      return hits.slice(0, size).map(([s, h, pc, pn, mun, e, n, beid]) => {
        const [lon, lat] = fromD96(e, n);
        return { id: `m:${s}:${h}:${pc}`, label: `${s} ${h}`.trim(), place: `${pc} ${pn}`, postCode: pc, municipality: mun, e, n, lon, lat, buildingEid: beid };
      });
    },
  };
}
export type Mirror = ReturnType<typeof createMirror>;

/** KO list, KO pinning and manager search/portfolios read the mirror (fast, spares GURS, whose WFS now rejects range filters); GURS is the fallback. */
export function withMirror(client: GursClient, mirror: Mirror): GursClient {
  return {
    ...client,
    async listKos() {
      try { return await mirror.listKos(); } catch { return client.listKos(); }
    },
    async downloadKo(koId, o) {
      try { return await mirror.downloadKo(koId); } catch { return client.downloadKo(koId, o); }
    },
    async searchManagers(q, signal) {
      try { return await mirror.searchManagers(q); } catch { return client.searchManagers(q, signal); }
    },
    async managerPortfolio(id, o = {}) {
      try { return await mirror.managerPortfolio(id, o.koId); } catch { return client.managerPortfolio(id, o); }
    },
    async buildingOutlines(list, signal) {
      const got = mirror.knownOutlines(list);
      const missing = list.filter((b) => !got.has(`${b.koId}:${b.number}`));
      if (missing.length) {
        try { for (const [k, g] of await client.buildingOutlines(missing, signal)) got.set(k, g); } catch (e) { if (!got.size) throw e; }
      }
      return got;
    },
  };
}
