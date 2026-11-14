import type { GursClient, Ko } from "../gurs";
import type { CartInput } from "../cart/store";
import type { ImportReason, ParsedRow } from "./parse";

export type InvalidRow = { line: number; raw: string; reason: ImportReason | "serviceError" };
export interface ImportResult { items: CartInput[]; invalid: InvalidRow[] }

type Ok = Extract<ParsedRow, { ok: true }>;

/**
 * Validates parsed rows against the cadastre (the app's GURS copy): parcel, building or building part must exist.
 * Never throws: a row whose lookup failed is marked serviceError.
 */
export async function resolveImport(client: GursClient, rows: ParsedRow[], kos: Ko[]): Promise<ImportResult> {
  const names = new Map(kos.map((k) => [k.id, k.name]));
  const invalid: InvalidRow[] = rows.filter((r): r is Extract<ParsedRow, { ok: false }> => !r.ok).map(({ line, raw, reason }) => ({ line, raw, reason }));
  const ok = rows.filter((r): r is Ok => r.ok);
  const found = new Map<Ok, CartInput>();
  const failed = new Set<Ok>();

  // Rows of one KO run in sequence (the KO is loaded once), KOs in parallel.
  const byKo = new Map<number, Ok[]>();
  for (const r of ok) byKo.set(r.koId, [...(byKo.get(r.koId) ?? []), r]);
  await Promise.all([...byKo].map(async ([koId, list]) => {
    const koName = names.get(koId) ?? "";
    for (const r of list) {
      try {
        if (r.kind === "parcel") {
          const p = await client.findParcel(koId, r.number);
          if (p) found.set(r, { kind: "parcel", koId, koName, number: r.number, eid: p.eid, geometry: p.geometry ?? null });
          continue;
        }
        const b = await client.findBuilding(koId, Number(r.number));
        if (r.kind === "building") {
          if (b) found.set(r, { kind: "building", koId, koName, number: r.number, eid: b.eid, geometry: b.geometry ?? null });
          continue;
        }
        const part = (await client.buildingParts(koId, Number(r.number))).find((x) => x.number === r.part);
        if (part) found.set(r, { kind: "part", koId, koName, number: r.number, part: r.part, eid: part.eid ?? "", geometry: b?.geometry ?? null, note: part.use ?? undefined });
      } catch {
        failed.add(r);
      }
    }
  }));

  const items: CartInput[] = [];
  for (const r of ok) {
    const it = found.get(r);
    if (it) items.push(it);
    else invalid.push({ line: r.line, raw: r.raw, reason: failed.has(r) ? "serviceError" : "notFound" });
  }
  invalid.sort((a, b) => a.line - b.line);
  return { items, invalid };
}
