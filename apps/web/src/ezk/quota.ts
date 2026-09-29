import { EZK_DAILY_LIMIT } from "@ikataster/bridge";

/** Local estimate of today's eZK usage (eZK does not expose the counter). Day = Europe/Ljubljana calendar day. */
export interface QuotaState { day: string; used: number; exhausted: boolean }
export interface QuotaStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

export const QUOTA_KEY = "ikataster.ezk.quota.v1";
const KEY = QUOTA_KEY;
export const dayOf = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Ljubljana" }).format(d);

export interface BatchPlan { requested: number; remaining: number; allowed: number; deferred: number; blocked: boolean; warn: boolean }

export function createQuota(storage: QuotaStorage = localStorage, now: () => Date = () => new Date(), limit = EZK_DAILY_LIMIT) {
  const read = (): QuotaState => {
    const today = dayOf(now());
    try {
      const s = JSON.parse(storage.getItem(KEY) ?? "null") as QuotaState | null;
      if (s && s.day === today) return s;
    } catch { /* corrupt -> reset */ }
    return { day: today, used: 0, exhausted: false };
  };
  const write = (s: QuotaState) => { storage.setItem(KEY, JSON.stringify(s)); return s; };
  const remaining = (s = read()) => (s.exhausted ? 0 : Math.max(0, limit - s.used));
  return {
    limit,
    state: read,
    remaining: () => remaining(),
    /** Count one successful download. */
    recordSuccess: (n = 1) => { const s = read(); return write({ ...s, used: s.used + n }); },
    /** eZK returned LIMIT: nothing more today, whatever our counter said. */
    markExhausted: () => { const s = read(); return write({ ...s, used: Math.max(s.used, limit), exhausted: true }); },
    /** How much of a batch fits today; the rest waits for tomorrow. */
    plan: (requested: number): BatchPlan => {
      const rem = remaining();
      const allowed = Math.min(requested, rem);
      return { requested, remaining: rem, allowed, deferred: requested - allowed, blocked: rem === 0 && requested > 0, warn: requested > rem || rem <= limit * 0.1 };
    },
  };
}
export type Quota = ReturnType<typeof createQuota>;
