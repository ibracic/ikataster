/**
 * Comparable sales: recent open-market ETN sales of the same kind of building part
 * and a similar size in the same KO, with the median €/m² and a rough estimate.
 */
import type { KoTx } from ".";

export const COMPARABLE_YEARS = 5;
export const COMPARABLE_AREA_TOLERANCE = 0.35;

/** Map the GURS actual-use name of a building part to the ETN part type code (TxList PART_TYPE). */
export function partTypeFromUse(use: string | null | undefined): number | null {
  if (!use) return null;
  const u = use.toLowerCase();
  if (/enostanovanjsk|dvostanovanjsk|\bhiš/.test(u)) return 1;
  if (/stanovanj/.test(u)) return 2;
  if (/parkir/.test(u)) return 3;
  if (/garaž/.test(u)) return 4;
  if (/pisarn/.test(u)) return 5;
  if (/gostin/.test(u)) return 9;
  if (/trgovin|lokal/.test(u)) return 8;
  return null;
}

export interface Comparable { key: string; date: string; price: number; area: number; perM2: number }
export interface Comparables { items: Comparable[]; count: number; medianPerM2: number; estimate: number | null }

interface Query { type: number | null; area: number | null | undefined; exclude?: string; now?: string; limit?: number }

const fullShare = (s: string) => !s || /^(\d+)\/\1$/.test(s);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function comparableParts(tx: KoTx | null | undefined, q: Query): Comparables | null {
  if (!tx || q.type == null) return null;
  const now = q.now ? new Date(q.now) : new Date();
  const since = new Date(now); since.setFullYear(now.getFullYear() - COMPARABLE_YEARS);
  const from = since.toISOString().slice(0, 10);
  const lo = q.area ? q.area * (1 - COMPARABLE_AREA_TOLERANCE) : 0;
  const hi = q.area ? q.area * (1 + COMPARABLE_AREA_TOLERANCE) : Infinity;
  const all: (Comparable & { exact: number })[] = [];
  for (const [key, rows] of Object.entries(tx.sd)) {
    if (key === q.exclude) continue;
    for (const [deal, own, area, type, share] of rows) {
      if (type !== q.type || !area || !fullShare(share) || area < lo || area > hi) continue;
      const d = tx.s[String(deal)];
      if (!d || d[3] !== 1 || d[0] < from) continue;
      const items = (d[4] ?? 0) + (d[5] ?? 0);
      const price = own ?? (items <= 1 ? d[1] : null);
      if (!price) continue;
      all.push({ key, date: d[0], price, area, exact: price / area, perM2: Math.round(price / area) });
    }
  }
  if (!all.length) return null;
  const medianPerM2 = Math.round(median(all.map((c) => c.exact)));
  const items = all
    .sort((a, b) => (q.area ? Math.abs(a.area - q.area) - Math.abs(b.area - q.area) : 0) || b.date.localeCompare(a.date))
    .slice(0, q.limit ?? 5)
    .map(({ exact: _e, ...c }) => c);
  return { items, count: all.length, medianPerM2, estimate: q.area ? Math.round((medianPerM2 * q.area) / 100) * 100 : null };
}
