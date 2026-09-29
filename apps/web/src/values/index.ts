/**
 * GURS mass-appraisal values ("posplošena vrednost") per cadastral municipality.
 *
 * Values come from the public GURS "Evidenca vrednotenja" dataset, pre-split
 * into one small JSON file per KO (see scripts/valuations/build.py). A KO file
 * is fetched once, kept in IndexedDB and refreshed after VALUES_TTL.
 */
import Dexie, { type Table } from "dexie";
import { createContext, useContext, useEffect, useState } from "react";

export const VALUES_BASE: string =
  (import.meta.env.VITE_IKATASTER_VALUES_URL as string | undefined) ?? "https://raw.githubusercontent.com/ibracic/ikataster/data";
export const VALUES_TTL = 7 * 24 * 3600 * 1000;

export interface KoValues {
  ko: number;
  /** Dataset date (YYYY-MM-DD). */
  date: string;
  /** Parcel number -> EUR. */
  p: Record<string, number>;
  /** "building/part" -> EUR. */
  d: Record<string, number>;
}

interface Row extends KoValues { fetchedAt: number; missing?: boolean }

class ValuesDb extends Dexie {
  kos!: Table<Row, number>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ kos: "&ko" });
  }
}

export interface Values {
  /** Values for a KO, or null if GURS publishes none for it. Throws only if nothing is cached and the network fails. */
  get(ko: number): Promise<KoValues | null>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export function createValues(opts: { name?: string; base?: string; fetch?: typeof fetch; now?: () => number } = {}): Values {
  const db = new ValuesDb(opts.name ?? "ikataster-values");
  const base = (opts.base ?? VALUES_BASE).replace(/\/$/, "");
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = opts.now ?? Date.now;
  const inflight = new Map<number, Promise<KoValues | null>>();

  const load = async (ko: number): Promise<KoValues | null> => {
    const cached = await db.kos.get(ko).catch(() => undefined);
    if (cached && now() - cached.fetchedAt < VALUES_TTL) return cached.missing ? null : cached;
    try {
      const res = await doFetch(`${base}/ko/${ko}.json`);
      if (res.status === 404) {
        await db.kos.put({ ko, date: "", p: {}, d: {}, fetchedAt: now(), missing: true });
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as KoValues;
      const row: Row = { ko, date: j.date, p: j.p ?? {}, d: j.d ?? {}, fetchedAt: now() };
      await db.kos.put(row);
      return row;
    } catch (e) {
      if (cached) return cached.missing ? null : cached; // stale beats nothing
      throw e;
    }
  };

  return {
    get(ko) {
      let p = inflight.get(ko);
      if (!p) {
        p = load(ko).finally(() => inflight.delete(ko));
        inflight.set(ko, p);
      }
      return p;
    },
    count: () => db.kos.count(),
    clear: () => db.kos.clear(),
  };
}

export const partValue = (v: KoValues | null | undefined, building: number | string, part: number | string) =>
  v?.d[`${building}/${part}`];
export const parcelValue = (v: KoValues | null | undefined, number: string) => v?.p[number];

let defaultValues: Values | null = null;
export const valuesInstance = () => (defaultValues ??= createValues());

export const ValuesContext = createContext<Values | null>(null);

export type KoValuesState = { status: "loading" } | { status: "ready"; values: KoValues | null } | { status: "error" };

export function useKoValues(ko: number | null | undefined): KoValuesState {
  const ctx = useContext(ValuesContext);
  const [state, setState] = useState<KoValuesState>({ status: "loading" });
  useEffect(() => {
    if (ko == null) return;
    let live = true;
    setState({ status: "loading" });
    (ctx ?? valuesInstance()).get(ko).then(
      (values) => live && setState({ status: "ready", values }),
      () => live && setState({ status: "error" }),
    );
    return () => { live = false; };
  }, [ko, ctx]);
  return state;
}

export function formatEur(v: number, lang: string) {
  return new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}
