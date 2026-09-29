import type { PdfTextItem } from "./types";

export interface Cell { x: number; text: string }
export interface Line { page: number; y: number; x: number; cells: Cell[]; text: string }

const FOOTER_Y = 45;

/**
 * Groups positioned text into reading-order lines. Runs closer than ~1pt are
 * glued ("998" "-" "50" -> "998-50"); a wider gap starts a new cell, so a
 * label and its value stay separate cells. Page footers ("1/3") are dropped.
 */
export function toLines(items: PdfTextItem[]): Line[] {
  const rows = new Map<string, PdfTextItem[]>();
  const sorted = items.filter((i) => i.str.trim() && i.y > FOOTER_Y).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const keys: { page: number; y: number; key: string }[] = [];
  for (const it of sorted) {
    let k = keys.find((r) => r.page === it.page && Math.abs(r.y - it.y) < 2.5);
    if (!k) { k = { page: it.page, y: it.y, key: `${it.page}:${it.y}` }; keys.push(k); rows.set(k.key, []); }
    rows.get(k.key)!.push(it);
  }
  return keys.map(({ page, y, key }) => {
    const runs = rows.get(key)!.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    let end = -Infinity;
    for (const r of runs) {
      const gap = r.x - end;
      const last = cells[cells.length - 1];
      if (last && gap < 1.5) last.text += r.str;
      else if (last && gap < 6) last.text += " " + r.str;
      else cells.push({ x: r.x, text: r.str });
      end = r.x + r.w;
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, " ").trim();
    const kept = cells.filter((c) => c.text);
    return { page, y, x: kept[0]?.x ?? 0, cells: kept, text: kept.map((c) => c.text).join(" ") };
  }).filter((l) => l.cells.length);
}
