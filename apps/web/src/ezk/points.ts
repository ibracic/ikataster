import { belongsTo, mapIdentity, propertyKey } from "../property/identity";
import { useEffect, useState } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";
import { bboxOf } from "../local/db";
import type { GursClient } from "../gurs";
import type { ResultRecord } from "./results";

/** One map target per parcel or building; building parts are grouped into their building. */
export interface ResultTarget { kind: "parcel" | "building"; ko: number; n: string; count: number }

export function resultTargets(records: ResultRecord[]): ResultTarget[] {
  const by = new Map<string, ResultTarget>();
  for (const r of records) {
    const p = r.extract.property;
    if (!p.koId || !p.number) continue;
    const kind = p.type === "parcel" ? "parcel" : p.type === "building" || p.type === "part" ? "building" : null;
    if (!kind) continue;
    const id = propertyKey(mapIdentity({ kind, koId: p.koId, number: p.number }));
    const t = by.get(id);
    if (t) t.count++;
    else by.set(id, { kind, ko: p.koId, n: String(p.number), count: 1 });
  }
  return [...by.values()];
}

/** Results that belong to a property: a parcel, a building (incl. its parts) or one part. */
export function resultsFor(records: ResultRecord[], kind: "parcel" | "building" | "part", ko: number, n: string | number, part?: number): ResultRecord[] {
  return records.filter((r) => {
    const p = r.extract.property;
    if (p.type !== 'parcel' && p.type !== 'building' && p.type !== 'part') return false;
    return belongsTo({ kind: p.type, koId: p.koId, number: p.number, part: p.part }, { kind, koId: ko, number: n, part });
  });
}

type Pos = [number, number] | null;
const positions = new Map<string, Pos>();

async function locate(client: GursClient, t: ResultTarget): Promise<Pos> {
  const id = propertyKey({ kind: t.kind, koId: t.ko, number: t.n });
  if (positions.has(id)) return positions.get(id)!;
  try {
    const f = t.kind === "parcel" ? await client.findParcel(t.ko, t.n) : await client.findBuilding(t.ko, Number(t.n));
    const g = f?.geometry;
    let pos: Pos = null;
    if (g) {
      const [w, s, e, nn] = bboxOf(g);
      if (Number.isFinite(w)) pos = [(w + e) / 2, (s + nn) / 2];
    }
    positions.set(id, pos);
    return pos;
  } catch {
    return null; // GURS unavailable: try again next time
  }
}

/** Map markers for stored eZK results (props kind, ko, n, count). Positions come from the cached GURS client. */
export function useResultPoints(records: ResultRecord[], client: GursClient, enabled = true): FeatureCollection<Point> | null {
  const [fc, setFc] = useState<FeatureCollection<Point> | null>(null);
  const sig = records.map((r) => r.key).sort().join("|");
  useEffect(() => {
    if (!enabled) { setFc(null); return; }
    let alive = true;
    const targets = resultTargets(records);
    void Promise.all(targets.map(async (t) => ({ t, pos: await locate(client, t) }))).then((rows) => {
      if (!alive) return;
      const features: Feature<Point>[] = rows.filter((r) => r.pos).map(({ t, pos }) => ({
        type: "Feature", properties: { kind: t.kind, ko: t.ko, n: t.n, count: t.count }, geometry: { type: "Point", coordinates: pos! },
      }));
      setFc({ type: "FeatureCollection", features });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, client, enabled]);
  return fc;
}
