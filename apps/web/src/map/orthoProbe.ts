import { GURS_WMS_DTS } from "./layers";

/** One tiny GetMap request (only standard WMS params: GURS WAF answers 403 to unknown ones) to the GURS orthophoto service. GURS blocks many visitors outside Slovenia. */
export const ORTHO_PROBE_URL = `${GURS_WMS_DTS}?service=WMS&version=1.3.0&request=GetMap&layers=SI.GURS.ZPDZ:DOF025&styles=&crs=EPSG:3857&width=8&height=8&format=image/jpeg&bbox=1627000,5770000,1627100,5770100`;
/** A random small bbox each time, so the service worker's ortho cache can't answer the probe. */
export function probeUrl(rand = Math.random()): string {
  const x = 1627000 + Math.round(rand * 50000), y = 5770000 + Math.round(rand * 30000);
  return ORTHO_PROBE_URL.replace(/bbox=[^&]*/, `bbox=${x},${y},${x + 100},${y + 100}`);
}

let cached: Promise<boolean> | null = null;

export async function probeOrtho(fetchFn: typeof fetch = fetch, timeoutMs = 8000): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(probeUrl(), { signal: ctl.signal, cache: "no-store" });
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch { return false; }
  finally { clearTimeout(timer); }
}

/** Probe once per page load. */
export function orthoAvailable(): Promise<boolean> {
  return (cached ??= probeOrtho());
}
export function resetOrthoProbe() { cached = null; }
