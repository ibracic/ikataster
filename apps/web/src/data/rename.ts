import Dexie from "dexie";
import { createCartStore } from "../cart/store";
import { createResultsStore } from "../ezk/results";
import { createQueueStore } from "../queue/store";

/** The app was called "Parcela" before it became iKataster: same data, new storage names. */
export const DB_RENAMES: [from: string, to: string][] = [
  ["parcela", "ikataster"], ["parcela-results", "ikataster-results"], ["parcela-offline", "ikataster-offline"], ["parcela-queue", "ikataster-queue"],
];
const openTarget = (name: string): Dexie => {
  if (name === "ikataster") return createCartStore(name).db;
  if (name === "ikataster-results") return createResultsStore(name).db;
  if (name === "ikataster-offline") { // legacy layout; moved into ikataster-gurs right after (local/db migrateLegacyStores)
    const d = new Dexie(name);
    d.version(1).stores({ pins: "&koId", parcels: "[koId+number], koId", buildings: "[koId+number], koId", parts: "[koId+building+number], [koId+building], koId", kos: "&id" });
    return d;
  }
  return createQueueStore(name).db;
};

/** localStorage parcela.* -> ikataster.* (never overwrites newer values). */
export function migrateLocalStorage(ls: Storage): number {
  let n = 0;
  for (let i = ls.length - 1; i >= 0; i--) {
    const k = ls.key(i);
    if (!k?.startsWith("parcela.")) continue;
    const nk = "ikataster." + k.slice("parcela.".length);
    if (ls.getItem(nk) == null && !k.startsWith("parcela.kos.")) ls.setItem(nk, ls.getItem(k)!);
    ls.removeItem(k);
    n++;
  }
  return n;
}

/** Copy every table of the old IndexedDB databases into the new ones (only into empty ones), then delete the old. */
export async function migrateDatabases(renames = DB_RENAMES, target = openTarget): Promise<number> {
  let moved = 0;
  for (const [from, to] of renames) {
    if (!(await Dexie.exists(from))) continue;
    const src = new Dexie(from);
    await src.open(); // dynamic mode: schema read from the existing database
    const dst = target(to);
    await dst.open();
    const empty = (await Promise.all(dst.tables.map((t) => t.count()))).every((c) => c === 0);
    if (empty) {
      for (const t of src.tables) {
        const rows = await t.toArray();
        const dt = dst.tables.find((x) => x.name === t.name);
        if (!dt || !rows.length) continue;
        // inbound-key tables only (all ours are); keys travel inside the rows
        await dt.bulkPut(rows);
        moved += rows.length;
      }
    }
    src.close(); dst.close();
    await Dexie.delete(from);
  }
  return moved;
}

export async function migrateFromParcela(ls: Storage | null = globalThis.localStorage ?? null): Promise<void> {
  try { if (ls) migrateLocalStorage(ls); } catch { /* private mode */ }
  try { await migrateDatabases(); } catch (e) { console.warn("storage rename migration failed", e); }
}
