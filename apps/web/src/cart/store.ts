import { DATABASES } from "../data/inventory";
import { propertyKey } from "../property/identity";
import { ensurePersisted } from "../data/storage";
import Dexie, { type Table } from "dexie";
import type { Geometry } from "geojson";

export type CartKind = "parcel" | "building" | "part";

export interface CartInput {
  kind: CartKind;
  koId: number;
  koName: string;
  /** Parcel number ("1/1") or building number ("130"). */
  number: string;
  /** Building part number (kind "part" only). */
  part?: number;
  eid: string;
  /** Parcel / building outline (parts use the building outline). */
  geometry: Geometry | null;
  /** Optional short description, e.g. part use ("stanovanje"). */
  note?: string;
}

export interface CartItem extends CartInput {
  key: string;
  addedAt: number;
}

export const itemKey = (i: Pick<CartInput, "kind" | "koId" | "number" | "part">) =>
  propertyKey(i);

class CartDb extends Dexie {
  items!: Table<CartItem, string>;
  constructor(name: string) {
    super(name);
    // v1: cart items keyed by kind:ko:number[:part]
    this.version(1).stores({ items: "key, kind, koId, addedAt" });
  }
}

/** Cart persisted in IndexedDB. Only this module knows about Dexie. */
export function createCartStore(name: string = DATABASES.cart.name) {
  const db = new CartDb(name);
  let clock = 0;
  const now = () => (clock = Math.max(clock + 1, Date.now()));

  return {
    db,
    /** Adds items not yet in the cart. Returns how many were newly added. */
    async add(inputs: CartInput[]): Promise<number> {
      return db.transaction("rw", db.items, async () => {
        const unique = new Map(inputs.map((i) => [itemKey(i), i]));
        const existing = await db.items.bulkGet([...unique.keys()]);
        const fresh = [...unique].filter((_, i) => !existing[i]).map(([key, i]) => ({ ...i, key, addedAt: now() }));
        await db.items.bulkAdd(fresh);
        return fresh.length;
      }).then((n) => { if (n) void ensurePersisted(); return n; });
    },
    list: () => db.items.orderBy("addedAt").toArray(),
    count: () => db.items.count(),
    has: async (key: string) => (await db.items.get(key)) !== undefined,
    remove: (keys: string[]) => db.items.bulkDelete(keys),
    clear: () => db.items.clear(),
  };
}

export type CartStore = ReturnType<typeof createCartStore>;
