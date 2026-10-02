import { DATABASES } from "../data/inventory";
/**
 * Real-estate sales and rentals from the public GURS "Evidenca trga nepremičnin" (ETN),
 * pre-split into one JSON file per KO (scripts/transactions/build.py) on the data branch.
 * A KO file is fetched once, kept in IndexedDB and refreshed after TX_TTL.
 */
import { createDataset, DATASET_TTL, type Dataset, type DatasetOptions } from "../datasets/loader";
import { createContext, useContext, useEffect, useState } from "react";

export const TX_TTL = DATASET_TTL;

/** [date, price, kind, market, nParts, nParcels] */
export type SaleDeal = [string, number | null, number | null, number | null, number, number];
/** [date, rent, kind, market, start, end] */
export type RentDeal = [string, number | null, number | null, number | null, string, string];
/** [deal, partPrice, area, type, share, floor] */
export type PartSale = [number, number | null, number | null, number | null, string, string];
/** [deal, parcelPrice, area, landType, share] */
export type ParcelSale = [number, number | null, number | null, number | null, string];
/** [deal, rent, area, type] */
export type PartRent = [number, number | null, number | null, number | null];

export interface KoTx {
  ko: number;
  date: string;
  s: Record<string, SaleDeal>;
  sd: Record<string, PartSale[]>;
  sp: Record<string, ParcelSale[]>;
  r: Record<string, RentDeal>;
  rd: Record<string, PartRent[]>;
}

export type Transactions = Dataset<KoTx>;
const EMPTY = { s: {}, sd: {}, sp: {}, r: {}, rd: {} };
export function createTransactions(opts: DatasetOptions = {}): Transactions {
  return createDataset<KoTx>({
    name: DATABASES.transactions.name, path: 'tx/ko',
    empty: ko => ({ ...EMPTY, ko, date: '' }),
    decode: (j, ko) => ({ ...EMPTY, ...j, ko, date: j.date ?? '' }),
  }, opts);
}

let instance: Transactions | null = null;
export const txInstance = () => (instance ??= createTransactions());
export const TxContext = createContext<Transactions | null>(null);

export type KoTxState = { status: "loading" } | { status: "ready"; tx: KoTx | null } | { status: "error" };

export function useKoTx(ko: number | null | undefined): KoTxState {
  const ctx = useContext(TxContext);
  const [state, setState] = useState<KoTxState>({ status: "loading" });
  useEffect(() => {
    if (ko == null) return;
    let live = true;
    setState({ status: "loading" });
    (ctx ?? txInstance()).get(ko).then((tx) => live && setState({ status: "ready", tx }), () => live && setState({ status: "error" }));
    return () => { live = false; };
  }, [ko, ctx]);
  return state;
}

/** One sale or rental row ready for display. */
export interface TxItem {
  kind: "sale" | "rent";
  deal: number;
  date: string;
  /** Price attributed to this property (its own price if given, else the whole deal price). */
  price: number | null;
  /** True when `price` is the price of the whole deal covering several properties. */
  wholeDeal: boolean;
  items: number;
  area: number | null;
  type: number | null;
  share?: string;
  /** Building part number (building lists only). */
  part?: string;
  /** All part numbers of this building covered by the same deal (grouped building rows). */
  parts?: string[];
  /** Per-part lines of a grouped row. */
  rows?: TxLine[];
  /** GURS deal kind code (Vrsta kupoprodajnega / najemnega posla). */
  dealKind: number | null;
  floor?: string;
  /** Parcels in the same sale deal. */
  parcels?: number;
  /** Lease start / end (rentals). */
  start?: string;
  end?: string;
  market: number | null;
  /** Price recorded for this property alone (null = only the deal total is known). */
  ownPrice?: number | null;
  /** €/m² when the price refers to this property alone. */
  perM2: number | null;
}

function saleItem(tx: KoTx, row: PartSale | ParcelSale, part?: string): TxItem {
  const d = tx.s[String(row[0])] ?? ["", null, null, null, 1, 0];
  const items = (d[4] ?? 0) + (d[5] ?? 0);
  const own = row[1];
  const price = own ?? d[1];
  const wholeDeal = own == null && items > 1;
  const area = row[2];
  const fullShare = !row[4] || /^(\d+)\/\1$/.test(row[4]);
  return {
    kind: "sale", deal: row[0], date: d[0], price, wholeDeal, items, area, type: row[3], share: row[4] || undefined, part,
    dealKind: d[2], parcels: d[5] ?? 0, floor: (row as PartSale)[5] || undefined, ownPrice: own,
    market: d[3], perM2: price && area && !wholeDeal && fullShare ? Math.round(price / area) : null,
  };
}

const rentCounts = new WeakMap<KoTx, Map<number, number>>();
/** Number of building parts a rental contract covers (within this KO). */
function rentParts(tx: KoTx, deal: number): number {
  let m = rentCounts.get(tx);
  if (!m) {
    m = new Map();
    for (const rows of Object.values(tx.rd)) for (const r of new Set(rows.map((x) => x[0]))) m.set(r, (m.get(r) ?? 0) + 1);
    rentCounts.set(tx, m);
  }
  return m.get(deal) ?? 1;
}

function rentItem(tx: KoTx, row: PartRent, part?: string): TxItem {
  const d = tx.r[String(row[0])] ?? ["", null, null, null, "", ""];
  const price = row[1] ?? d[1];
  const items = rentParts(tx, row[0]);
  return { kind: "rent", deal: row[0], date: d[0], price, wholeDeal: row[1] == null && items > 1, items, area: row[2], type: row[3], part,
    dealKind: d[2], start: d[4] || undefined, end: d[5] || undefined, ownPrice: row[1],
    market: d[3], perM2: price && row[2] && row[1] != null ? Math.round((price / row[2]) * 10) / 10 : null };
}

export interface TxLine { part: string; area: number | null; type: number | null; ownPrice: number | null; share?: string; floor?: string }

const byDate = (a: TxItem, b: TxItem) => b.date.localeCompare(a.date);

export function parcelTx(tx: KoTx | null | undefined, parcel: string): TxItem[] {
  return tx ? (tx.sp[parcel] ?? []).map((r) => saleItem(tx, r)).sort(byDate) : [];
}

export function partTx(tx: KoTx | null | undefined, building: number | string, part: number | string): TxItem[] {
  if (!tx) return [];
  const k = `${building}/${part}`;
  return [...(tx.sd[k] ?? []).map((r) => saleItem(tx, r)), ...(tx.rd[k] ?? []).map((r) => rentItem(tx, r))].sort(byDate);
}

/** All sales and rentals of parts of one building (newest first). */
export function buildingTx(tx: KoTx | null | undefined, building: number | string): TxItem[] {
  if (!tx) return [];
  const pre = `${building}/`;
  const out: TxItem[] = [];
  for (const [k, rows] of Object.entries(tx.sd)) if (k.startsWith(pre)) for (const r of rows) out.push(saleItem(tx, r, k.slice(pre.length)));
  for (const [k, rows] of Object.entries(tx.rd)) if (k.startsWith(pre)) for (const r of rows) out.push(rentItem(tx, r, k.slice(pre.length)));
  // One row per deal when the price is the whole deal's (e.g. one lease over 35 parts), not 35 identical rows.
  const grouped: TxItem[] = [];
  const byDeal = new Map<string, TxItem>();
  for (const i of out) {
    if (!i.wholeDeal) { grouped.push(i); continue; }
    const key = `${i.kind}:${i.deal}`;
    const g = byDeal.get(key);
    const line: TxLine = { part: i.part!, area: i.area, type: i.type, ownPrice: i.ownPrice ?? null, share: i.share, floor: i.floor };
    if (!g) { const n: TxItem = { ...i, parts: [i.part!], rows: [line] }; byDeal.set(key, n); grouped.push(n); continue; }
    if (!g.parts!.includes(i.part!)) { g.parts!.push(i.part!); g.rows!.push(line); }
    g.area = g.area != null && i.area != null ? Math.round((g.area + i.area) * 10) / 10 : g.area ?? i.area;
    if (g.type !== i.type) g.type = null;
  }
  for (const g of byDeal.values()) {
    g.parts!.sort((a, b) => Number(a) - Number(b));
    g.rows!.sort((a, b) => Number(a.part) - Number(b.part));
    if (g.parts!.length > 1) g.part = undefined;
    else g.parts = undefined;
  }
  return grouped.sort(byDate);
}
