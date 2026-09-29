import type { Geometry } from "geojson";
import type { GursClient, Ko } from "../gurs";
import type { CartInput } from "../cart/store";
import type { ImportReason, ParsedRow } from "./parse";

export type InvalidRow = { line: number; raw: string; reason: ImportReason | "serviceError" };
export interface ImportResult { items: CartInput[]; invalid: InvalidRow[] }

/** Numbers per CQL IN (...) list: keeps URLs well under GURS limits and results ≤300. */
export const CHUNK = 40;
const chunks = <T,>(xs: T[], n = CHUNK) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

type Ok = Extract<ParsedRow, { ok: true }>;
type Feat = { properties: Record<string, unknown>; geometry: Geometry | null };

/**
 * Validates parsed rows against GURS with batched CQL IN queries per KO
 * (parcels → PARCELE, buildings/parts → STAVBE_OBRIS outline + DELI_STAVB).
 * Never throws: a failed batch marks its rows as serviceError.
 */
export async function resolveImport(client: GursClient, rows: ParsedRow[], kos: Ko[]): Promise<ImportResult> {
  const names = new Map(kos.map((k) => [k.id, k.name]));
  const invalid: InvalidRow[] = rows.filter((r): r is Extract<ParsedRow, { ok: false }> => !r.ok).map(({ line, raw, reason }) => ({ line, raw, reason }));
  const ok = rows.filter((r): r is Ok => r.ok);
  const found = new Map<Ok, CartInput>();
  const failed = new Set<Ok>();

  const byKo = new Map<number, Ok[]>();
  for (const r of ok) byKo.set(r.koId, [...(byKo.get(r.koId) ?? []), r]);

  const run = async (batch: Ok[], fn: () => Promise<void>) => {
    try { await fn(); } catch { batch.forEach((r) => failed.add(r)); }
  };

  const jobs: Promise<void>[] = [];
  for (const [koId, list] of byKo) {
    const koName = names.get(koId) ?? "";
    const parcels = list.filter((r) => r.kind === "parcel");
    for (const batch of chunks(parcels)) jobs.push(run(batch, async () => {
      const fs = await client.wfs("SI.GURS.KN:PARCELE", "EID_PARCELA,KO_ID,ST_PARCELE,GEOM",
        `KO_ID=${koId} AND ST_PARCELE IN (${batch.map((r) => `'${r.number.replace(/'/g, "")}'`).join(",")})`) as Feat[];
      const m = new Map(fs.map((f) => [String(f.properties.ST_PARCELE), f]));
      for (const r of batch) {
        const f = m.get(r.number);
        if (f) found.set(r, { kind: "parcel", koId, koName, number: r.number, eid: String(f.properties.EID_PARCELA), geometry: f.geometry });
      }
    }));

    const bRows = list.filter((r) => r.kind !== "parcel");
    const bNums = [...new Set(bRows.map((r) => r.number))];
    const outlines = new Map<string, Feat>();
    const outlineJobs = chunks(bNums).map((nums) => run(bRows.filter((r) => nums.includes(r.number)), async () => {
      const fs = await client.wfs("SI.GURS.KN:STAVBE_OBRIS", "EID_STAVBA,KO_ID,ST_STAVBE,OBRIS_GEOM",
        `KO_ID=${koId} AND ST_STAVBE IN (${nums.map(Number).join(",")})`) as Feat[];
      for (const f of fs) outlines.set(String(f.properties.ST_STAVBE), f);
    }));

    const parts = bRows.filter((r) => r.kind === "part");
    const partHits = new Map<string, Feat>();
    const byBuilding = new Map<string, Ok[]>();
    for (const r of parts) byBuilding.set(r.number, [...(byBuilding.get(r.number) ?? []), r]);
    const partJobs = chunks([...byBuilding], 10).map((group) => run(group.flatMap(([, rs]) => rs), async () => {
      const cond = group.map(([b, rs]) => `(ST_STAVBE=${Number(b)} AND ST_DELA_STAVBE IN (${rs.map((r) => r.part).join(",")}))`).join(" OR ");
      const fs = await client.wfs("SI.GURS.KN:DELI_STAVB", "KO_ID,ST_STAVBE,ST_DELA_STAVBE,EID_DEL_STAVBE,VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL",
        `KO_ID=${koId} AND (${cond})`) as Feat[];
      for (const f of fs) partHits.set(`${f.properties.ST_STAVBE}/${f.properties.ST_DELA_STAVBE}`, f);
    }));

    jobs.push(Promise.all([...outlineJobs, ...partJobs]).then(() => {
      for (const r of bRows) {
        if (failed.has(r)) continue;
        const o = outlines.get(r.number);
        if (r.kind === "building") {
          if (o) found.set(r, { kind: "building", koId, koName, number: r.number, eid: String(o.properties.EID_STAVBA), geometry: o.geometry });
        } else {
          const p = partHits.get(`${r.number}/${r.part}`);
          if (p) found.set(r, {
            kind: "part", koId, koName, number: r.number, part: r.part, eid: String(p.properties.EID_DEL_STAVBE),
            geometry: o?.geometry ?? null, note: (p.properties.VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL as string) ?? undefined,
          });
        }
      }
    }));
  }
  await Promise.all(jobs);

  const items: CartInput[] = [];
  for (const r of ok) {
    const it = found.get(r);
    if (it) items.push(it);
    else invalid.push({ line: r.line, raw: r.raw, reason: failed.has(r) ? "serviceError" : "notFound" });
  }
  invalid.sort((a, b) => a.line - b.line);
  return { items, invalid };
}
