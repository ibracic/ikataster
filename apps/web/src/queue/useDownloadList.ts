import { useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useCart } from "../cart/useCart";
import { QueueContext, queueStore } from "./instance";

/** One projection for to-do counts and rows. Stored cart records are preserved for backups/map membership. */
export function useDownloadList() {
  const cart = useCart();
  const store = useContext(QueueContext)?.store ?? queueStore;
  const jobs = useLiveQuery(() => store.list(), [store]);
  const byKey = new Map((jobs ?? []).map(j => [j.key, j]));
  const pending = cart.items.filter(i => { const j = byKey.get(i.key); return !j || !["done", "failed"].includes(j.status); });
  return { ...cart, pending, jobs: jobs ?? [], ready: cart.ready && jobs !== undefined };
}
