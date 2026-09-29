import { BridgeError, createBridgeClient, mockTransport } from "@ikataster/bridge";
import { createResultsStore } from "../ezk/results";
import { createQuota } from "../ezk/quota";
import type { EzkExtract } from "../ezk/types";
import type { CartInput } from "../cart/store";
import { createQueueStore, LEGACY_QUOTA_KEY } from "./store";
import { createRunner, type DownloadRequest } from "./runner";

const item = (number: string, koId = 657): CartInput => ({ kind: "parcel", koId, koName: "MARIBOR GRAD", number, eid: "E" + number, geometry: null });
const b64 = (s: string) => btoa(s);
/** Fake parse: the "PDF" is just JSON of the request, like a real extract of that property. */
const parse = async (bytes: Uint8Array): Promise<EzkExtract> => {
  const r = JSON.parse(new TextDecoder().decode(bytes)) as DownloadRequest;
  return { kind: "current", createdAt: "2026-09-29T10:00:00", pending: false, owners: [], rights: [], benefits: [],
    property: { type: "parcel", koId: r.koId, koName: "MARIBOR GRAD", number: r.number, label: `${r.koId} ${r.number}` } };
};

let n = 0;
function setup(behaviour: (r: DownloadRequest, call: number) => Promise<unknown> | unknown, o: { used?: number } = {}) {
  const tag = `${Date.now()}-${n++}`;
  const queue = createQueueStore(`q-${tag}`);
  const results = createResultsStore(`r-${tag}`);
  const mem = new Map<string, string>();
  const quota = createQuota({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) }, () => new Date("2026-09-29T10:00:00+02:00"));
  if (o.used) quota.recordSuccess(o.used);
  let call = 0;
  const calls: DownloadRequest[] = [];
  const bridge = createBridgeClient(mockTransport({
    download: async (p) => { calls.push(p as DownloadRequest); return behaviour(p as DownloadRequest, call++); },
  }));
  const runner = createRunner({ queue, bridge, results, quota, parse, pacingMs: 0 });
  return { queue, results, quota, runner, calls };
}
const ok = (r: DownloadRequest) => ({ pdfBase64: b64(JSON.stringify(r)) });
const statuses = async (q: ReturnType<typeof createQueueStore>) => Object.fromEntries((await q.list()).map((j) => [j.item.number, j.status + (j.code ? ":" + j.code : "")]));

describe("download queue", () => {
  it("downloads the whole cart sequentially, parses and stores results with PDFs, NOT_IN_ZK fails without retry", async () => {
    const s = setup((r) => { if (r.number === "999") throw new BridgeError("NOT_IN_ZK"); return ok(r); });
    expect(await s.queue.enqueue([item("1"), item("999"), item("2/1")])).toBe(3);
    const rep = await s.runner.run();
    expect(rep).toMatchObject({ reason: "done", done: 2, failed: 1 });
    expect(await statuses(s.queue)).toEqual({ "1": "done", "999": "failed:NOT_IN_ZK", "2/1": "done" });
    expect(s.calls.map((c) => c.number)).toEqual(["1", "999", "2/1"]);
    expect((await s.results.list()).map((r) => r.key).sort()).toEqual(["parcel:657:1", "parcel:657:2/1"]);
    expect((await s.results.list()).every((r) => r.hasPdf)).toBe(true);
    expect(s.quota.state().used).toBe(2);
    // retry only failed items
    await s.queue.retryFailed();
    await s.runner.run();
    expect(s.calls.map((c) => c.number)).toEqual(["1", "999", "2/1", "999"]);
    // enqueueing the cart again does not re-download done items
    expect(await s.queue.enqueue([item("1"), item("2/1")])).toBe(0);
  });

  it("LIMIT stops the run, marks the quota exhausted and keeps the rest queued for tomorrow", async () => {
    const s = setup((r, i) => { if (i === 1) throw new BridgeError("LIMIT", "400 ZK izpiskov"); return ok(r); });
    await s.queue.enqueue([item("1"), item("2"), item("3")]);
    const rep = await s.runner.run();
    expect(rep).toMatchObject({ reason: "limit", done: 1 });
    expect(await statuses(s.queue)).toEqual({ "1": "done", "2": "deferred:LIMIT", "3": "queued" });
    expect(s.quota.remaining()).toBe(0);
    expect(await s.runner.run()).toMatchObject({ reason: "quota", deferred: 2 });
    expect(s.calls).toHaveLength(2);
  });

  it("takes only plan.allowed items and defers the rest", async () => {
    const s = setup(ok, { used: 398 });
    await s.queue.enqueue([item("1"), item("2"), item("3")]);
    expect(await s.runner.run()).toMatchObject({ reason: "done", done: 2, deferred: 1 });
    expect(await statuses(s.queue)).toEqual({ "1": "done", "2": "done", "3": "deferred" });
  });

  it("session/tab problems stop the run with the item still queued", async () => {
    const s = setup(() => { throw new BridgeError("SESSION_EXPIRED"); });
    await s.queue.enqueue([item("1"), item("2")]);
    expect(await s.runner.run()).toMatchObject({ reason: "needsUser", code: "SESSION_EXPIRED" });
    expect(await statuses(s.queue)).toEqual({ "1": "queued:SESSION_EXPIRED", "2": "queued" });
  });

  it("pause stops after the current item; a reload (new runner) resumes and recovers a 'running' job", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = setup(async (r, i) => { if (i === 0) await gate; return ok(r); });
    await s.queue.enqueue([item("1"), item("2"), item("3")]);
    const p = s.runner.run();
    await vi.waitFor(async () => expect((await s.queue.get("parcel:657:1"))?.status).toBe("running"));
    // simulate a reload: the page dies with job 1 "running"; a fresh runner on the same DB takes over
    const again = createRunner({ queue: s.queue, bridge: createBridgeClient(mockTransport({ download: async (x) => ok(x as DownloadRequest) })), results: s.results, quota: s.quota, parse, pacingMs: 0 });
    s.runner.pause(); release(); await p;
    await s.queue.set("parcel:657:2", { status: "running" }); // killed mid-flight
    expect(await again.run()).toMatchObject({ reason: "done" });
    expect(await statuses(s.queue)).toEqual({ "1": "done", "2": "done", "3": "done" });
  });

  it("cancel drops everything not downloaded yet", async () => {
    const s = setup(ok);
    await s.queue.enqueue([item("1"), item("2")]);
    await s.runner.cancel();
    expect(await s.queue.list()).toEqual([]);
  });

  it("migrates the old localStorage quota into IndexedDB once", async () => {
    localStorage.setItem(LEGACY_QUOTA_KEY, JSON.stringify({ day: "2026-09-29", used: 17, exhausted: false }));
    const name = `q-mig-${Date.now()}`;
    const q = createQueueStore(name);
    await q.hydrate();
    expect(localStorage.getItem(LEGACY_QUOTA_KEY)).toBeNull();
    const quota = createQuota(q.quotaStorage, () => new Date("2026-09-29T10:00:00+02:00"));
    expect(quota.state().used).toBe(17);
    quota.recordSuccess(3);
    await new Promise((r) => setTimeout(r, 20));
    const q2 = createQueueStore(name); await q2.hydrate();
    expect(createQuota(q2.quotaStorage, () => new Date("2026-09-29T10:00:00+02:00")).state().used).toBe(20);
  });
});
