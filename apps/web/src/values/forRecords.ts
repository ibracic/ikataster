import type { ResultRecord } from "../ezk/results";
import { parcelValue, partValue, valuesInstance, type Values as ValuesApi } from ".";

/** GURS values for extract records (result key -> EUR); KOs that fail to load are skipped. */
export async function valuesForRecords(records: ResultRecord[], api: ValuesApi = valuesInstance()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const kos = [...new Set(records.map((r) => r.extract.property.koId).filter((k): k is number => !!k))];
  const byKo = new Map(await Promise.all(kos.map(async (k) => [k, await api.get(k).catch(() => null)] as const)));
  for (const r of records) {
    const p = r.extract.property;
    const v = p.koId ? byKo.get(p.koId) : null;
    if (!v || !p.number) continue;
    const x = p.type === "part" ? partValue(v, p.number, p.part ?? "") : p.type === "parcel" ? parcelValue(v, p.number) : undefined;
    if (x != null) out.set(r.key, x);
  }
  return out;
}
