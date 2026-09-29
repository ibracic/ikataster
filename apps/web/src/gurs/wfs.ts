import type { Feature, FeatureCollection, Geometry } from "geojson";
import { GursError } from "./errors";
import { noteResponse } from "../sw/cacheStatus";

export const WFS_KN = "https://ipi.eprostor.gov.si/wfs-si-gurs-kn/wfs";
export const WFS_MNVP_PA = "https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/wfs";

export interface WfsOptions {
  fetch: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type WfsParams = {
  typeNames: string;
  cql_filter?: string;
  propertyName?: string;
  srsName?: string;
  count?: number;
  startIndex?: number;
};

interface WfsCollection<P> extends FeatureCollection<Geometry | null, P> {
  numberMatched?: number;
  numberReturned?: number;
}

/** One WFS 2.0 GetFeature request returning GeoJSON, with typed errors and timeout. */
export async function wfsGet<P>(endpoint: string, params: WfsParams, opt: WfsOptions): Promise<WfsCollection<P>> {
  const u = new URL(endpoint);
  const all: Record<string, string> = { service: "WFS", version: "2.0.0", request: "GetFeature", outputFormat: "application/json" };
  for (const [k, v] of Object.entries(params)) if (v !== undefined) all[k] = String(v);
  for (const [k, v] of Object.entries(all)) u.searchParams.set(k, v);

  return getJson<WfsCollection<P>>(u.toString(), opt);
}

/** At most this many GURS requests are in flight app-wide, so bulk features cannot overload GURS. */
export const GURS_MAX_PARALLEL = 4;
let inFlight = 0;
const queue: (() => void)[] = [];
/** Current number of GURS requests in flight (tests / diagnostics). */
export const gursInFlight = () => inFlight;

async function acquire(signal?: AbortSignal): Promise<void> {
  while (inFlight >= GURS_MAX_PARALLEL) {
    await new Promise<void>((r) => queue.push(r));
    if (signal?.aborted) { queue.shift()?.(); throw new DOMException("Aborted", "AbortError"); }
  }
  inFlight++;
}
function release() { inFlight--; queue.shift()?.(); }

/** GET a GURS JSON endpoint with timeout and typed errors (OGC XML exceptions → service). */
export async function getJson<T>(url: string, opt: WfsOptions): Promise<T> {
  if (opt.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  await acquire(opt.signal);
  try { return await getJsonNow<T>(url, opt); } finally { release(); }
}

async function getJsonNow<T>(url: string, opt: WfsOptions): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opt.timeoutMs);
  opt.signal?.addEventListener("abort", () => ctl.abort());
  let res: Response;
  try {
    res = await opt.fetch(url, { signal: ctl.signal });
  } catch (e) {
    if (ctl.signal.aborted && !opt.signal?.aborted) throw new GursError("timeout", "GURS did not respond in time");
    if ((e as Error)?.name === "AbortError") throw e;
    throw new GursError("network", "GURS is unreachable");
  } finally {
    clearTimeout(timer);
  }
  noteResponse(res);
  if (!res.ok) throw new GursError("http", `GURS responded with HTTP ${res.status}`, res.status);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    const msg = /ExceptionText>([^<]*)/.exec(text)?.[1]?.trim() || "GURS service error";
    throw new GursError("service", msg);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GursError("parse", "Unexpected GURS response");
  }
}

/** GURS geoserver rejects GetFeature with count above ~300 (HTTP 400). */
export const MAX_PAGE_SIZE = 300;

/** Page through all results: first page tells numberMatched, remaining pages are fetched in parallel. */
export async function wfsGetAll<P>(endpoint: string, params: WfsParams, opt: WfsOptions, pageSize = MAX_PAGE_SIZE, max = 50_000): Promise<Feature<Geometry | null, P>[]> {
  const size = Math.min(pageSize, MAX_PAGE_SIZE);
  const first = await wfsGet<P>(endpoint, { ...params, count: size, startIndex: 0 }, opt);
  const total = Math.min(first.numberMatched ?? first.features.length, max);
  if (first.features.length < size || total <= size) return first.features;
  const starts: number[] = [];
  for (let s = size; s < total; s += size) starts.push(s);
  const rest = await Promise.all(starts.map((s) => wfsGet<P>(endpoint, { ...params, count: size, startIndex: s }, opt)));
  return [first, ...rest].flatMap((fc) => fc.features);
}
