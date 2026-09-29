import type { Geometry } from "geojson";
import { GursError } from "./errors";
import { WFS_KN, wfsGet, type WfsOptions } from "./wfs";
import { collectFeatures, type Split } from "./collect";

/** Building manager (upravnik) as recorded on building parts (SI.GURS.KN:DELI_STAVB). */
export interface Manager { id: number; name: string; address: string | null; parts: number | null }
export interface ManagedPart { koId: number; building: number; part: number; eid: string; buildingEid: string; use: string | null }
export interface ManagedBuilding { koId: number; number: number; eid: string; parts: ManagedPart[] }
export interface ManagerSearch { managers: Manager[]; /** More managers may match than shown: refine the name. */ truncated: boolean }
export interface ManagerPortfolio { manager: Manager; parts: ManagedPart[]; buildings: ManagedBuilding[] }

const LAYER = "SI.GURS.KN:DELI_STAVB";
const PAGE = 300;
/** Hard stop so one careless query cannot hammer GURS. */
export const MANAGER_MAX_PARTS = 25_000;
/** Split order when a query matches more than one page (GURS paging depth is ~600). */
const SPLITS: Split[] = [["KO_ID", 1, 9999], ["ST_STAVBE", 1, 999_999], ["ST_DELA_STAVBE", 1, 99_999]];

/** CQL string literal for ILIKE, quotes doubled, wildcards from user input neutralised. */
export const likeLiteral = (q: string) => `'%${q.trim().replace(/\s+/g, " ").replace(/'/g, "''").replace(/[%_]/g, " ")}%'`;

type SearchProps = { UPRAVNIK_ID: number; NAZIV?: string; NASLOV?: string };
type PartProps = { KO_ID: number; ST_STAVBE: number; ST_DELA_STAVBE: number; EID_DEL_STAVBE: string | number; EID_STAVBA: string | number; VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL?: string; UPRAVNIK_ID?: number; NAZIV?: string; NASLOV?: string };
const PART_FIELDS = "KO_ID,ST_STAVBE,ST_DELA_STAVBE,EID_DEL_STAVBE,EID_STAVBA,VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL,UPRAVNIK_ID,NAZIV,NASLOV";

export function managerApi(opt: WfsOptions) {
  const slow = (signal?: AbortSignal): WfsOptions => ({ ...opt, timeoutMs: Math.max(opt.timeoutMs, 60_000), signal });

  const collect = async <P extends Record<string, unknown>>(base: string, fields: string, o: WfsOptions, onProgress?: (n: number) => void): Promise<P[]> =>
    (await collectFeatures<P>(o, { layer: LAYER, base, propertyName: fields, splits: SPLITS, max: MANAGER_MAX_PARTS, onProgress: onProgress && ((n) => onProgress(n)) })).map((f) => f.properties);

  return {
    /**
     * Managers whose name contains `query` (nationwide, ~15 s on GURS). Distinct by UPRAVNIK_ID;
     * a second round excludes already-found ids so one big manager cannot hide the others.
     */
    async searchManagers(query: string, signal?: AbortSignal): Promise<ManagerSearch> {
      if (query.trim().length < 3) return { managers: [], truncated: false };
      const o = slow(signal);
      const fc = await wfsGet<SearchProps>(WFS_KN, {
        typeNames: LAYER, count: PAGE, propertyName: "UPRAVNIK_ID,NAZIV,NASLOV",
        cql_filter: `NAZIV ILIKE ${likeLiteral(query)}`,
      }, o);
      const found = new Map<number, Manager>();
      for (const { properties: p } of fc.features) {
        if (p.UPRAVNIK_ID != null && !found.has(p.UPRAVNIK_ID)) found.set(p.UPRAVNIK_ID, { id: p.UPRAVNIK_ID, name: p.NAZIV ?? "", address: p.NASLOV ?? null, parts: null });
      }
      const list = [...found.values()].slice(0, 20);
      await Promise.all(list.map(async (m) => {
        try {
          const c = await wfsGet(WFS_KN, { typeNames: LAYER, count: 1, propertyName: "UPRAVNIK_ID", cql_filter: `UPRAVNIK_ID=${m.id}` }, o);
          m.parts = c.numberMatched ?? null;
        } catch (e) { if ((e as Error)?.name === "AbortError") throw e; }
      }));
      const sum = list.reduce((a, m) => a + (m.parts ?? 0), 0);
      const managers = list.sort((a, b) => (b.parts ?? 0) - (a.parts ?? 0) || a.name.localeCompare(b.name, "sl"));
      return { managers, truncated: found.size > 20 || (fc.numberMatched ?? 0) > sum };
    },

    /** All parts managed by `id`, grouped into buildings (optionally one KO). */
    async managerPortfolio(id: number, o2: { koId?: number; signal?: AbortSignal; onProgress?: (n: number) => void } = {}): Promise<ManagerPortfolio | null> {
      if (!Number.isInteger(id) || id <= 0) throw new GursError("invalid-input", "Invalid manager id");
      const ko = o2.koId && Number.isInteger(o2.koId) ? ` AND KO_ID=${o2.koId}` : "";
      const rows = await collect<PartProps>(`UPRAVNIK_ID=${id}${ko}`, PART_FIELDS, slow(o2.signal), o2.onProgress);
      if (!rows.length) return null;
      const seen = new Set<string>();
      const parts: ManagedPart[] = [];
      for (const r of rows) {
        const eid = String(r.EID_DEL_STAVBE);
        if (seen.has(eid)) continue;
        seen.add(eid);
        parts.push({ koId: r.KO_ID, building: r.ST_STAVBE, part: r.ST_DELA_STAVBE, eid, buildingEid: String(r.EID_STAVBA), use: r.VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL ?? null });
      }
      parts.sort((a, b) => a.koId - b.koId || a.building - b.building || a.part - b.part);
      const byB = new Map<string, ManagedBuilding>();
      for (const p of parts) {
        const k = `${p.koId}:${p.building}`;
        let b = byB.get(k);
        if (!b) byB.set(k, (b = { koId: p.koId, number: p.building, eid: p.buildingEid, parts: [] }));
        b.parts.push(p);
      }
      const r0 = rows[0];
      return { manager: { id, name: r0.NAZIV ?? "", address: r0.NASLOV ?? null, parts: parts.length }, parts, buildings: [...byB.values()] };
    },

    /** Building outlines (WGS84) for many buildings, batched per KO. Key "ko:number". */
    async buildingOutlines(list: { koId: number; number: number }[], signal?: AbortSignal): Promise<Map<string, Geometry>> {
      const byKo = new Map<number, number[]>();
      for (const b of list) byKo.set(b.koId, [...(byKo.get(b.koId) ?? []), b.number]);
      const batches: string[] = [];
      for (const [ko, nums] of byKo) for (let i = 0; i < nums.length; i += 100) batches.push(`KO_ID=${ko} AND ST_STAVBE IN (${nums.slice(i, i + 100).join(",")})`);
      const out = new Map<string, Geometry>();
      const o = { ...opt, signal };
      for (let i = 0; i < batches.length; i += 4) {
        const pages = await Promise.all(batches.slice(i, i + 4).map((c) =>
          wfsGet<{ KO_ID: number; ST_STAVBE: number }>(WFS_KN, { typeNames: "SI.GURS.KN:STAVBE_OBRIS", srsName: "EPSG:4326", count: PAGE, propertyName: "KO_ID,ST_STAVBE,OBRIS_GEOM", cql_filter: c }, o)));
        for (const f of pages.flatMap((p) => p.features)) if (f.geometry) out.set(`${f.properties.KO_ID}:${f.properties.ST_STAVBE}`, f.geometry);
      }
      return out;
    },
  };
}
