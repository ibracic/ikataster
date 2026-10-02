import { DATABASES } from "../data/inventory";
/**
 * GURS mass-appraisal values ("posplošena vrednost") per cadastral municipality.
 *
 * Values come from the public GURS "Evidenca vrednotenja" dataset, pre-split
 * into one small JSON file per KO (see scripts/valuations/build.py). A KO file
 * is fetched once, kept in IndexedDB and refreshed after VALUES_TTL.
 */
import { createDataset, DATASET_BASE, DATASET_TTL, type Dataset, type DatasetOptions } from "../datasets/loader";
import { createContext, useContext, useEffect, useState } from "react";

export const VALUES_BASE = DATASET_BASE;
export const VALUES_TTL = DATASET_TTL;

export interface KoValues {
  ko: number;
  /** Dataset date (YYYY-MM-DD). */
  date: string;
  /** Parcel number -> EUR. */
  p: Record<string, number>;
  /** "building/part" -> EUR. */
  d: Record<string, number>;
}

export type Values = Dataset<KoValues>;
export function createValues(opts: DatasetOptions = {}): Values {
  return createDataset<KoValues>({
    name: DATABASES.values.name, path: 'ko',
    empty: ko => ({ ko, date: '', p: {}, d: {} }),
    decode: (j, ko) => ({ ko, date: j.date, p: j.p ?? {}, d: j.d ?? {} }),
  }, opts);
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
