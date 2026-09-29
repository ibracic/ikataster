import { BridgeError, type BridgeClient, type BridgeErrorCode } from "@ikataster/bridge";
import type { CartInput } from "../cart/store";
import type { Quota } from "../ezk/quota";
import type { ResultsStore } from "../ezk/results";
import type { EzkExtract } from "../ezk/types";
import type { QueueStore } from "./store";

/** What the extension returns for one eZK extract (base64 survives postMessage/runtime messaging everywhere). */
export interface DownloadResult { pdfBase64: string; fileName?: string }
export interface DownloadRequest { kind: CartInput["kind"]; koId: number; number: string; part?: number }

/** Item-level failures: this item is done for now, continue with the next one. */
const ITEM_FAIL: readonly string[] = ["NOT_IN_ZK", "INVALID_PDF", "TOO_LARGE", "EZK_SYSERR", "BAD_REQUEST", "EXT_ERR", "NOT_IMPLEMENTED"];
/** Run-level stops: the item goes back to the queue and the user has to act (log in, open eZK, wait for tomorrow). */
export type StopReason = "done" | "paused" | "limit" | "quota" | "needsUser";

export interface RunReport { reason: StopReason; code?: BridgeErrorCode; done: number; failed: number; deferred: number }

export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export const request = (i: CartInput): DownloadRequest => ({ kind: i.kind, koId: i.koId, number: i.number, ...(i.part != null ? { part: i.part } : {}) });

export interface RunnerDeps {
  queue: QueueStore;
  bridge: Pick<BridgeClient, "request">;
  results: ResultsStore;
  quota: Quota;
  parse?: (bytes: Uint8Array) => Promise<EzkExtract>;
  /** Pause between downloads so eZK is not hammered. */
  pacingMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Sequential (concurrency 1) eZK download queue. One instance per app; `run()` is idempotent while running. */
export function createRunner(d: RunnerDeps) {
  const parse = d.parse ?? (async (b: Uint8Array) => (await import("../ezk/pdf")).extractFromPdf(b));
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pacing = d.pacingMs ?? 1500;
  let active: Promise<RunReport> | null = null;
  let pauseRequested = false;
  const listeners = new Set<(running: boolean) => void>();
  const emit = () => listeners.forEach((l) => l(!!active));

  async function loop(): Promise<RunReport> {
    await d.queue.recover();
    const rep: RunReport = { reason: "done", done: 0, failed: 0, deferred: 0 };
    const waiting = await d.queue.waiting();
    const plan = d.quota.plan(waiting.length);
    // over today's quota: the rest waits for tomorrow
    for (const j of waiting.slice(plan.allowed)) { await d.queue.set(j.key, { status: "deferred" }); rep.deferred++; }
    if (plan.blocked) return { ...rep, reason: "quota" };
    const todo = waiting.slice(0, plan.allowed);
    for (let i = 0; i < todo.length; i++) {
      if (pauseRequested) return { ...rep, reason: "paused" };
      const job = todo[i];
      const cur = await d.queue.get(job.key);
      if (!cur || (cur.status !== "queued" && cur.status !== "deferred")) continue; // cancelled meanwhile
      await d.queue.set(job.key, { status: "running", attempts: cur.attempts + 1 });
      try {
        const res = await d.bridge.request<DownloadResult>("download", request(job.item));
        const bytes = b64ToBytes(res.pdfBase64);
        let x: EzkExtract;
        try { x = await parse(bytes.slice()); } catch (e) {
          await d.queue.set(job.key, { status: "failed", code: "PARSE", error: String((e as Error)?.message ?? e) }); rep.failed++; continue;
        }
        await d.results.put(x, res.fileName ?? `${job.item.koId}_${job.item.number}${job.item.part ? "-" + job.item.part : ""}.pdf`, bytes);
        d.quota.recordSuccess();
        await d.queue.set(job.key, { status: "done", code: undefined, error: undefined });
        rep.done++;
      } catch (e) {
        const code: BridgeErrorCode = e instanceof BridgeError ? e.code : "EXT_ERR";
        if (code === "LIMIT") {
          d.quota.markExhausted();
          await d.queue.set(job.key, { status: "deferred", code });
          return { ...rep, reason: "limit", code };
        }
        if (ITEM_FAIL.includes(code)) {
          // NOT_IN_ZK etc. are final for this item; eZK system errors were already retried 3x by the extension
          await d.queue.set(job.key, { status: "failed", code, error: (e as Error)?.message });
          rep.failed++;
        } else {
          await d.queue.set(job.key, { status: "queued", code, error: (e as Error)?.message });
          return { ...rep, reason: "needsUser", code };
        }
      }
      if (i < todo.length - 1 && pacing > 0) await sleep(pacing);
    }
    return rep;
  }

  return {
    get running() { return !!active; },
    onChange(fn: (running: boolean) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    run(): Promise<RunReport> {
      if (active) return active;
      pauseRequested = false;
      active = loop().finally(() => { active = null; emit(); });
      emit();
      return active;
    },
    /** Stop after the current download. */
    pause() { pauseRequested = true; },
    /** Stop and drop everything not downloaded yet. */
    async cancel() { pauseRequested = true; await d.queue.cancelPending(); },
  };
}
export type Runner = ReturnType<typeof createRunner>;
