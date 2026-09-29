import { createContext, useContext, useMemo } from "react";
import { createQuota, type Quota } from "../ezk/quota";
import { useResults } from "../ezk/useResults";
import { useBridge } from "../bridge/instance";
import { createQueueStore, type QueueStore } from "./store";
import { createRunner, type Runner } from "./runner";

export const queueStore = createQueueStore();
let sharedQuota: Quota | null = null;
/** eZK quota counter stored in IndexedDB (hydrate queueStore before first use; main.tsx does). */
export const appQuota = () => (sharedQuota ??= createQuota(queueStore.quotaStorage));

export interface QueueCtx { store: QueueStore; runner: Runner; quota: Quota }
export const QueueContext = createContext<QueueCtx | null>(null);
const runners = new WeakMap<object, Runner>();

export function useQueue(): QueueCtx {
  const ctx = useContext(QueueContext);
  const { client } = useBridge();
  const { store: results } = useResults();
  return useMemo(() => {
    if (ctx) return ctx;
    let runner = runners.get(client);
    if (!runner) runners.set(client, (runner = createRunner({ queue: queueStore, bridge: client, results, quota: appQuota() })));
    return { store: queueStore, runner, quota: appQuota() };
  }, [ctx, client, results]);
}
