import type { Feature, Geometry } from "geojson";
import { GursError } from "./errors";
import { MAX_PAGE_SIZE, WFS_KN, wfsGet, type WfsOptions } from "./wfs";

/** Parallel GURS requests while collecting (more makes GURS drop connections). */
const CONCURRENCY = 4;

export type Split = [field: string, lo: number, hi: number];

export interface CollectSpec {
  layer: string;
  /** Base CQL filter. */
  base: string;
  propertyName: string;
  /** Integer fields to split on, in order, when a range matches more than one page. */
  splits: Split[];
  srsName?: string;
  /** Refuse queries matching more than this. */
  max: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Fetch every feature matching `base`. GURS caps pages at 300, paging depth at 600 and rejects sortBy.
 * Unsorted paging is not stable (pages overlap), so every range above 300 is split into integer attribute
 * ranges at quantiles of the returned sample. Filters are rebuilt from explicit bounds, so they never grow.
 * The result is checked against numberMatched; anything else means GURS changed under us.
 */
export async function collectFeatures<P extends object>(o: WfsOptions, s: CollectSpec): Promise<Feature<Geometry | null, P>[]> {
  const PAGE = MAX_PAGE_SIZE;
  const out: Feature<Geometry | null, P>[] = [];
  let total = 0;
  let active = 0; const waiting: (() => void)[] = [];
  const get = async (c: string) => {
    while (active >= CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const q = () => wfsGet<P>(WFS_KN, { typeNames: s.layer, count: PAGE, propertyName: s.propertyName, srsName: s.srsName, cql_filter: c }, o);
      try { return await q(); } catch (e) {
        if (e instanceof GursError && (e.kind === "timeout" || e.kind === "network")) return await q(); // GURS hiccup: one retry
        throw e;
      }
    } finally { active--; waiting.shift()?.(); }
  };
  type Box = [number, number][];
  const cqlOf = (box: Box) => [s.base, ...box.flatMap(([lo, hi], i) => {
    const [f, min, max] = s.splits[i];
    return lo === hi ? [`${f}=${lo}`] : lo === min && hi === max ? [] : [`${f} BETWEEN ${lo} AND ${hi}`];
  })].join(" AND ");
  const full: Box = s.splits.map(([, lo, hi]) => [lo, hi]);
  const take = (rows: Feature<Geometry | null, P>[]) => { out.push(...rows); s.onProgress?.(out.length, total); };

  const visit = async (box: Box, first?: { rows: Feature<Geometry | null, P>[]; n: number }): Promise<void> => {
    let rows: Feature<Geometry | null, P>[], n: number;
    if (first) ({ rows, n } = first);
    else { const fc = await get(cqlOf(box)); rows = fc.features; n = fc.numberMatched ?? rows.length; }
    if (n <= rows.length) return take(rows);
    const level = box.findIndex(([lo, hi]) => lo !== hi);
    if (level < 0) throw new GursError("service", "Too many features in one range");
    const [lo, hi] = box[level];
    const field = s.splits[level][0];
    const vals = rows.map((r) => Number((r.properties as Record<string, unknown>)[field])).filter((v) => Number.isFinite(v) && v >= lo && v <= hi).sort((x, y) => x - y);
    const pieces = Math.max(2, Math.ceil(n / (PAGE * 1.2)));
    const cuts = new Set<number>();
    for (let i = 1; i < pieces; i++) cuts.add(vals[Math.floor((i * vals.length) / pieces)]);
    // every sampled value gets its own start so a dominant value becomes a single-value range
    const starts = [...new Set([lo, ...[...cuts].filter((v) => v !== undefined && v > lo), ...[...cuts].filter((v) => v !== undefined && v < hi).map((v) => v + 1)])].sort((x, y) => x - y);
    const ranges = starts.map((st, i) => [st, (starts[i + 1] ?? hi + 1) - 1] as [number, number]).filter(([a, b]) => a <= b);
    if (ranges.length < 2) { const mid = Math.floor((lo + hi) / 2); ranges.splice(0, ranges.length, [lo, mid], [mid + 1, hi]); }
    await Promise.all(ranges.map((r) => visit(box.map((b, i) => (i === level ? r : b)) as Box)));
  };

  const fc = await get(s.base);
  const n = fc.numberMatched ?? fc.features.length;
  total = n;
  if (n > s.max) throw new GursError("invalid-input", `Too many results (${n})`);
  await visit(full, { rows: fc.features, n });
  if (out.length !== n) throw new GursError("service", `Incomplete result (${out.length} of ${n})`);
  return out;
}
