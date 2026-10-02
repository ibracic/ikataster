import { propertyKey } from "../property/identity";
import { normalize, type Ko } from "../gurs";

export type ImportKind = "parcel" | "building" | "part";
export type ImportReason = "malformed" | "unknownKo" | "duplicate" | "notFound";

export type ParsedRow =
  | { ok: true; line: number; raw: string; koId: number; kind: ImportKind; number: string; part?: number }
  | { ok: false; line: number; raw: string; reason: ImportReason };

/** Pasted text / CSV / TSV → rows of cells. Whitespace-only rows are dropped. */
export function splitText(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[;,\t]/).map((c) => c.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean));
}

const BUILDING = /^(?:st\.?|stavba|stavbe|building|bld)\s*:?\s*(\d+)(?:\s*\/\s*(\d+))?$/;
const PART = /^(?:del|ds|part)\s*:?\s*(\d+)\s*\/\s*(\d+)$/;
const PARCEL = /^(\d+(?:\/\d+)?)$/;
const MARKERS = /\b(?:k\.?\s?o\.?|parc\.?|parcela|parcele|parcel|p\.)(?=\s|$|\d)/g;

function parseTarget(rest: string): Pick<Extract<ParsedRow, { ok: true }>, "kind" | "number" | "part"> | null {
  const s = rest.replace(/\s*\/\s*/g, "/").trim();
  let m = s.match(PART);
  if (m) return { kind: "part", number: m[1], part: Number(m[2]) };
  m = s.match(BUILDING);
  if (m) return m[2] ? { kind: "part", number: m[1], part: Number(m[2]) } : { kind: "building", number: m[1] };
  m = s.match(PARCEL);
  return m ? { kind: "parcel", number: m[1] } : null;
}

/**
 * Tolerant import parser. Each row → KO (id, name, or "id NAME") + target
 * (parcel "1587" / "31/8", building "st:130", part "del:130/2" or "st 130/2").
 * A bare "a/b" is always a parcel number; parts need a prefix.
 */
export function parseRows(rows: unknown[][], kos: Ko[]): ParsedRow[] {
  const byId = new Map(kos.map((k) => [k.id, k]));
  const names = kos.map((k) => ({ k, n: normalize(k.name) })).sort((a, b) => b.n.length - a.n.length);
  const seen = new Set<string>();
  const out: ParsedRow[] = [];

  rows.forEach((cells, i) => {
    const line = i + 1;
    const raw = cells.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
    if (!raw) return;
    if (i === 0 && !/\d/.test(raw)) return; // header row
    let s = normalize(raw).replace(MARKERS, " ").replace(/\s+/g, " ").trim();
    const bad = (reason: ImportReason) => out.push({ ok: false, line, raw, reason });

    let koId: number | undefined;
    const num = s.match(/^(\d{1,4})(?:\s+|\/(?=\d)|$)(.*)$/);
    if (num) {
      koId = Number(num[1]);
      s = num[2].trim();
      const ko = byId.get(koId);
      if (!ko) return bad(s && /\d/.test(s) ? "unknownKo" : "malformed");
      const n = normalize(ko.name);
      if (s.startsWith(n + " ")) s = s.slice(n.length).trim();
    } else {
      const hit = names.find(({ n }) => s === n || s.startsWith(n + " "));
      if (!hit) return bad(/\d/.test(s) ? "unknownKo" : "malformed");
      koId = hit.k.id;
      s = s.slice(hit.n.length).trim();
    }

    const target = parseTarget(s);
    if (!target) return bad("malformed");
    const key = propertyKey({ ...target, koId });
    if (seen.has(key)) return bad("duplicate");
    seen.add(key);
    out.push({ ok: true, line, raw, koId, ...target });
  });
  return out;
}
