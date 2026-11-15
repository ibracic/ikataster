import { GursError } from "./errors";
import { noteResponse } from "../sw/cacheStatus";
import type { Parcel, SpatialPlanUnit } from "./types";

/**
 * The only cadastre question still asked of live GURS: the spatial plan unit (EUP) of a parcel, for KO
 * files saved before the copy carried EUPs. Everything else comes from the app's copy.
 */
export interface LiveGurs { spatialPlanUnit(p: Parcel): Promise<SpatialPlanUnit | null> }

const WFS_MNVP_PA = "https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/wfs";

export function createLiveGurs(o: { fetch?: typeof fetch; timeoutMs?: number } = {}): LiveGurs {
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const timeoutMs = o.timeoutMs ?? 15_000;
  return {
    async spatialPlanUnit(p) {
      const u = new URL(WFS_MNVP_PA);
      const [e, n] = p.centroidD96;
      for (const [k, v] of Object.entries({ service: "WFS", version: "2.0.0", request: "GetFeature", outputFormat: "application/json",
        typeNames: "SI.MNVP.PA:EUP_OPN", count: "5", propertyName: "EUP_OZN,NAZIV_PA", cql_filter: `INTERSECTS(GEOM,POINT(${e} ${n}))` })) u.searchParams.set(k, v);
      const fc = await getJson<{ features: { properties: { EUP_OZN: string; NAZIV_PA: string } }[] }>(u.toString(), f, timeoutMs);
      const x = fc.features[0];
      return x ? { code: x.properties.EUP_OZN, plan: x.properties.NAZIV_PA } : null;
    },
  };
}

/** GET a GURS JSON endpoint with timeout and typed errors (OGC XML exceptions → service). */
async function getJson<T>(url: string, f: typeof fetch, timeoutMs: number): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await f(url, { signal: ctl.signal });
  } catch {
    throw ctl.signal.aborted ? new GursError("timeout", "GURS did not respond in time") : new GursError("network", "GURS is unreachable");
  } finally {
    clearTimeout(timer);
  }
  noteResponse(res);
  if (!res.ok) throw new GursError("http", `GURS responded with HTTP ${res.status}`, res.status);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new GursError("service", /ExceptionText>([^<]*)/.exec(text)?.[1]?.trim() || "GURS service error");
  try { return JSON.parse(text) as T; } catch { throw new GursError("parse", "Unexpected GURS response"); }
}
