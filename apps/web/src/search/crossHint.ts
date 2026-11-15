import { searchKos, type Address, type GursClient, type Ko, type Manager } from "../gurs";

export type SearchTab = "address" | "parcel" | "building" | "manager";

export type CrossHint =
  | { kind: "parcel"; koId: number; koName: string; number: string }
  | { kind: "building"; koId: number; koName: string; number: number }
  | { kind: "address"; address: Address }
  | { kind: "manager"; manager: Manager };

/** "400 634", "Ptuj 634", "ptuj 1/2" -> KO + number (KO by id or name, number = last token). */
export function parsePropertyQuery(text: string, kos: Ko[]): { ko: Ko; number: string } | null {
  const m = text.trim().replace(/,/g, " ").match(/^(.+?)\s+(\d+(?:\/\d+)?)$/);
  if (!m) return null;
  const ko = searchKos(kos, m[1].trim(), 1)[0];
  return ko ? { ko, number: m[2] } : null;
}

/**
 * When a search in one tab found nothing, look for the same text as another kind of result.
 * Returns the first hit (parcel, building, address, manager — skipping the current tab) or null.
 */
export async function findElsewhere(tab: SearchTab, text: string, client: GursClient, kos: Ko[], signal?: AbortSignal): Promise<CrossHint | null> {
  const q = text.trim();
  if (!q) return null;
  const prop = parsePropertyQuery(q, kos);
  if (prop && tab !== "parcel") {
    const p = await client.findParcel(prop.ko.id, prop.number).catch(() => null);
    if (p) return { kind: "parcel", koId: prop.ko.id, koName: prop.ko.name, number: prop.number };
  }
  if (prop && tab !== "building" && /^\d+$/.test(prop.number)) {
    const b = await client.findBuilding(prop.ko.id, Number(prop.number)).catch(() => null);
    if (b) return { kind: "building", koId: prop.ko.id, koName: prop.ko.name, number: Number(prop.number) };
  }
  if (signal?.aborted || q.length < 3) return null;
  if (tab !== "address" && tab !== "parcel" && tab !== "building") {
    const a = await client.searchAddresses(q, 1).catch(() => []);
    if (a[0]) return { kind: "address", address: a[0] };
  }
  if (tab !== "manager" && !prop) {
    const r = await client.searchManagers(q).catch(() => null);
    if (r?.managers[0]) return { kind: "manager", manager: r.managers[0] };
  }
  return null;
}
