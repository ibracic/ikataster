import { useSyncExternalStore } from "react";

/** Oldest "stored at" time of GURS data currently shown from the SW cache; null when data is fresh. */
let cachedAt: number | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function noteResponse(res: Pick<Response, "headers">): void {
  const h = res.headers?.get?.("X-Ikataster-Cached");
  if (h) {
    const t = Number(h) || 0;
    if (cachedAt === null || t < cachedAt) { cachedAt = t; emit(); }
  } else if (cachedAt !== null) { cachedAt = null; emit(); }
}
/** Data shown came from local storage saved at `at` (e.g. a pinned KO). */
export function noteCached(at: number): void {
  if (cachedAt === null || at < cachedAt) { cachedAt = at; emit(); }
}
export function resetCacheStatus(): void { if (cachedAt !== null) { cachedAt = null; emit(); } }
export function getCachedAt(): number | null { return cachedAt; }
export function useCachedAt(): number | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cachedAt);
}
/** Human age: "5 min", "3 h", "2 d". */
export function ageText(from: number, now: number, lang: "sl" | "en"): string {
  const m = Math.max(0, Math.round((now - from) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} ${lang === "sl" ? "d" : "d"}`;
}
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
}
