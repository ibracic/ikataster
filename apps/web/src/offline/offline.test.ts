import { describe, expect, it } from "vitest";
import { createGursClient, GursError } from "../gurs";
import { getCachedAt, resetCacheStatus } from "../sw/cacheStatus";
import { createOfflineStore } from "./store";
import { withOffline } from "./withOffline";
import { pinKo, refreshStale } from "./pins";

type Row = Record<string, number | string | null>;
/** Fake GURS KN WFS over several layers: evaluates the CQL subset we emit, caps at `count`, shuffles like GeoServer. */
function fakeGurs(layers: Record<string, Row[]>, state = { down: false, calls: 0 }) {
  const test = (cql: string) => (r: Row) => !cql || cql.split(" AND ").reduce<[boolean, string | null]>(([ok, pend], part) => {
    if (pend) { const [f, a] = pend.split("|"); return [ok && Number(r[f]) >= Number(a) && Number(r[f]) <= Number(part), null]; }
    let m;
    if ((m = /^(\w+) BETWEEN (\d+)$/.exec(part))) return [ok, `${m[1]}|${m[2]}`];
    if ((m = /^(\w+) > (\d+)$/.exec(part))) return [ok && Number(r[m[1]]) > Number(m[2]), null];
    if ((m = /^(\w+)=(\d+)$/.exec(part))) return [ok && Number(r[m[1]]) === Number(m[2]), null];
    if ((m = /^(\w+)='(.+)'$/.exec(part))) return [ok && String(r[m[1]]) === m[2], null];
    throw new Error("cql? " + part);
  }, [true, null])[0];
  const fn = async (input: RequestInfo | URL) => {
    state.calls++;
    if (state.down) throw new TypeError("Failed to fetch");
    const u = new URL(String(input));
    const layer = (u.searchParams.get("typeNames") ?? "").replace("SI.GURS.KN:", "");
    const matched = (layers[layer] ?? []).filter(test(u.searchParams.get("cql_filter") ?? "")).sort(() => Math.random() - 0.5);
    const count = Number(u.searchParams.get("count") ?? 300);
    const feats = matched.slice(0, count).map(({ __geom, ...p }) => ({ type: "Feature", properties: p, geometry: __geom ? JSON.parse(String(__geom)) : null }));
    return new Response(JSON.stringify({ type: "FeatureCollection", features: feats, numberMatched: matched.length }), { status: 200 });
  };
  return fn as typeof fetch;
}
const square = (x: number, y: number, d = 0.001) => JSON.stringify({ type: "Polygon", coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
function koRows(ko = 2, n = 700) {
  const PARCELE: Row[] = [], STAVBE: Row[] = [], STAVBE_OBRIS: Row[] = [], DELI_STAVB: Row[] = [];
  for (let i = 1; i <= n; i++) {
    const x = 15 + (i % 30) * 0.002, y = 46 + Math.floor(i / 30) * 0.002;
    PARCELE.push({ EID_PARCELA: `P${ko}-${i}`, PARCELA_ID: 1000 + i * 7, KO_ID: ko, NAZIV: `${ko} SUHI VRH`, ST_PARCELE: i % 5 ? String(i) : `${i}/1`, POVRSINA: 100 + i, BONITETA: null, E_CEN: 500000, N_CEN: 100000, __geom: square(x, y) });
  }
  for (let b = 1; b <= 350; b++) {
    STAVBE.push({ EID_STAVBA: `S${b}`, KO_ID: ko, NAZIV: `${ko} SUHI VRH`, ST_STAVBE: b, STEVILO_ETAZ: 2 });
    STAVBE_OBRIS.push({ EID_STAVBA: `S${b}`, KO_ID: ko, ST_STAVBE: b, E_CEN: 500000, N_CEN: 100000, __geom: square(16 + b * 0.002, 46, 0.0005) });
    for (let d = 1; d <= (b === 1 ? 320 : 1); d++) DELI_STAVB.push({ KO_ID: ko, ST_STAVBE: b, ST_DELA_STAVBE: d, EID_DEL_STAVBE: `D${b}-${d}`, VRSTE_DEJANSKIH_RAB_DEL_ST_NAZIV_SL: "stanovanje", POVRSINA: 50 });
  }
  return { PARCELE, STAVBE, STAVBE_OBRIS, DELI_STAVB, KATASTRSKE_OBCINE: [{ KO_ID: ko, NAZIV: "SUHI VRH" }, { KO_ID: 657, NAZIV: "MARIBOR GRAD" }] };
}
let n = 0;
const setup = () => {
  const state = { down: false, calls: 0 };
  const raw = createGursClient({ fetch: fakeGurs(koRows(), state) });
  const store = createOfflineStore(`offline-test-${n++}`);
  return { state, raw, store, client: withOffline(raw, store) };
};

describe("pin KO", () => {
  it("downloads every parcel, building and part past the 300 cap, with progress and size", async () => {
    const { raw, store } = setup();
    const phases = new Set<string>();
    const pin = await pinKo(raw, store, 2, { onProgress: (p) => phases.add(p), now: 1000 });
    expect(pin).toMatchObject({ koId: 2, name: "SUHI VRH", parcels: 700, buildings: 350, parts: 669, pinnedAt: 1000 });
    expect(pin.bytes).toBeGreaterThan(10_000);
    expect([...phases]).toEqual(["parcels", "buildings", "outlines", "parts"]);
    expect(await store.db.parcels.count()).toBe(700);
    expect(await store.buildingParts(2, 1)).toHaveLength(320);
    await store.removePin(2);
    expect(await store.db.parcels.count()).toBe(0);
    expect(await store.listPins()).toEqual([]);
  });
  it("can be cancelled", async () => {
    const { raw, store } = setup();
    const ctl = new AbortController(); ctl.abort();
    await expect(pinKo(raw, store, 2, { signal: ctl.signal })).rejects.toThrow();
    expect(await store.listPins()).toEqual([]);
  });
});

describe("offline fallback", () => {
  it("answers parcel/building search and map clicks from pinned data when GURS is down, with cached badge", async () => {
    const { raw, store, client, state } = setup();
    await pinKo(raw, store, 2, { now: 5000 });
    await client.listKos();
    state.down = true;
    resetCacheStatus();
    expect((await client.findParcel(2, "10/1"))!.eid).toBe("P2-10");
    expect(getCachedAt()).toBe(5000);
    expect((await client.parcelAt(15 + 11 * 0.002 + 0.0005, 46 + 0.0005))!.number).toBe("11");
    expect((await client.findBuilding(2, 7))!.eid).toBe("S7");
    expect((await client.buildingAt(16 + 7 * 0.002 + 0.0002, 46.0002))!.number).toBe(7);
    expect(await client.buildingParts(2, 1)).toHaveLength(320);
    expect((await client.listKos()).map((k) => k.id)).toEqual([2, 657]);
    // not pinned → the original network error surfaces
    await expect(client.findParcel(657, "1")).rejects.toBeInstanceOf(GursError);
    resetCacheStatus();
  });
  it("prefers GURS when it answers and never masks 'not found'", async () => {
    const { raw, store, client } = setup();
    await pinKo(raw, store, 2);
    resetCacheStatus();
    expect(await client.findParcel(2, "99999")).toBeNull();
    expect((await client.findParcel(2, "3"))!.number).toBe("3");
    expect(getCachedAt()).toBeNull();
  });
});

describe("stale pins", () => {
  it("refresh on open when older than max age, keep data when GURS is down", async () => {
    const { raw, store, state } = setup();
    await pinKo(raw, store, 2, { now: 0 });
    state.down = true;
    expect(await refreshStale(raw, store, 30, 31 * 86_400_000)).toEqual([]);
    expect((await store.getPin(2))!.pinnedAt).toBe(0);
    state.down = false;
    expect(await refreshStale(raw, store, 30, 10 * 86_400_000)).toEqual([]);
    expect(await refreshStale(raw, store, 30, 31 * 86_400_000)).toEqual([2]);
    expect((await store.getPin(2))!.pinnedAt).toBe(31 * 86_400_000);
  });
});
