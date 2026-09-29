import { createContext, useContext, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createCartStore, type CartItem, type CartStore } from "./store";

export const CartContext = createContext<CartStore | null>(null);
let fallback: CartStore | null = null;

/** Live cart contents from IndexedDB (updates across tabs and panels). */
export function useCart() {
  const store = useContext(CartContext) ?? (fallback ??= createCartStore());
  const items = useLiveQuery(() => store.list(), [store]) as CartItem[] | undefined;
  const keys = useMemo(() => new Set((items ?? []).map((i) => i.key)), [items]);
  return { store, items: items ?? [], ready: items !== undefined, keys };
}
