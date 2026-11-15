import { createMirror } from "../mirror/data";
import { withCopy } from "../cadastre/copy";
import { createOfflineStore, type OfflineStore } from "../offline/store";
import type { GursClient, LiveGurs } from "../gurs";

/**
 * The production cadastre composition (copy client over the published mirror + saved KOs), served from
 * a small real copy in mirror/__fixtures__/site (regenerate: scripts/mirror/test_site.py).
 * Live GURS is only the EUP lookup; every other live call fails the test.
 */
const files = import.meta.glob("../mirror/__fixtures__/site/**/*.json", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const BASE = "https://copy.test/mirror";

export interface TestCadastre { client: GursClient; store: OfflineStore; requests: string[]; setOnline(on: boolean): void }

let n = 0;
export function testCadastre(o: { store?: OfflineStore } = {}): TestCadastre {
  const requests: string[] = [];
  let online = true;
  const fetchCopy = (async (url: string) => {
    requests.push(url.slice(BASE.length));
    if (!online) throw new TypeError("Failed to fetch");
    const body = files[`../mirror/__fixtures__/site${url.slice(BASE.length)}`];
    return body ? new Response(body, { headers: { "content-type": "application/json" } }) : new Response("not found", { status: 404 });
  }) as typeof fetch;
  // Fixture KO files carry their EUPs, so live GURS must never be needed.
  const live: LiveGurs = { spatialPlanUnit: async () => { throw new Error("live GURS must not be asked"); } };
  const store = o.store ?? createOfflineStore(`test-cadastre-${++n}`);
  const client = withCopy(live, createMirror({ base: BASE, fetch: fetchCopy }), store, { pinDelayMs: 0 });
  return { client, store, requests, setOnline: (on) => { online = on; } };
}
