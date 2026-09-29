import type { GursClient, KoDownloadPhase } from "../gurs";
import type { OfflineStore, Pin } from "./store";

export const PIN_MAX_AGE_KEY = "ikataster.pinMaxAgeDays";
export const PIN_MAX_AGE_DEFAULT = 30;
export function pinMaxAgeDays(storage: Storage | null = globalThis.localStorage ?? null): number {
  const v = Number(storage?.getItem(PIN_MAX_AGE_KEY));
  return Number.isFinite(v) && v > 0 ? v : PIN_MAX_AGE_DEFAULT;
}

export async function pinKo(client: GursClient, store: OfflineStore, koId: number,
  o: { signal?: AbortSignal; onProgress?: (phase: KoDownloadPhase, done: number, total: number) => void; now?: number } = {}): Promise<Pin> {
  const d = await client.downloadKo(koId, o);
  if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return store.savePin(d, o.now);
}

/** Refresh pins older than maxAgeDays, one at a time; failures keep the old data. Returns refreshed KO ids. */
export async function refreshStale(client: GursClient, store: OfflineStore, maxAgeDays: number, now = Date.now()): Promise<number[]> {
  const done: number[] = [];
  for (const p of await store.listPins()) {
    if (now - p.pinnedAt < maxAgeDays * 86_400_000) continue;
    try { await pinKo(client, store, p.koId, { now }); done.push(p.koId); } catch { /* offline / GURS down: try next open */ }
  }
  return done;
}
