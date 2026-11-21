import { describe, expect, it } from "vitest";
import { handleBackgroundMessage, type BackgroundApi } from "./background-core";
import { ezkFileName, ezkFormBody } from "./ezk-form";
import { APP_SOURCE, PROTOCOL_VERSION } from "@ikataster/bridge";

const APP = "https://app.example";
const sender = { id: "ext", origin: APP };
const msg = (payload: unknown) => ({ source: APP_SOURCE, v: PROTOCOL_VERSION, id: "1", type: "download", payload });
const b64 = (s: string) => btoa(s);

function api(responses: Array<{ contentType: string; body: string }>, tabs = [{ id: 7 }]) {
  const calls: Array<{ tabId: number; url: string; body: string }> = [];
  const a: BackgroundApi = {
    runtimeId: "ext", version: "0.2.0",
    queryTabs: async () => tabs,
    postInTab: async (tabId, url, body) => { calls.push({ tabId, url, body }); const r = responses.shift()!; return { status: 200, contentType: r.contentType, base64: b64(r.body) }; },
  };
  return { a, calls };
}

describe("eZK form", () => {
  it("builds the building-part form", () => {
    const f = new URLSearchParams(ezkFormBody({ kind: "part", koId: 999, number: "20", part: 3 }));
    expect(f.get("tipNep")).toBe("3");
    expect(f.get("idZnakNep.katastrskaObcina.idsrcsifrant")).toBe("999");
    expect(f.get("idZnakNep.stevilkaStavbe")).toBe("20");
    expect(f.get("idZnakNep.stPosameznegaDela")).toBe("3");
  });
  it("builds the parcel form", () => {
    const f = new URLSearchParams(ezkFormBody({ kind: "parcel", koId: 999, number: "100/1" }));
    expect(f.get("tipNep")).toBe("1");
    expect(f.get("idZnakNep.parcelnaStevilkaNovo")).toBe("100/1");
  });
  it("names files", () => {
    expect(ezkFileName({ kind: "parcel", koId: 999, number: "100/1" }, new Date("2026-09-29T10:00:00Z"))).toBe("999_100-1_2026-09-29.pdf");
  });
});

describe("background download", () => {
  it("POSTs in the e-ZK tab and passes the raw reply through unchanged", async () => {
    const { a, calls } = api([{ contentType: "text/html", body: "<html>any page</html>" }]);
    const r = await handleBackgroundMessage(msg({ kind: "part", koId: 999, number: "20", part: 3 }), sender, a) as { ok: boolean; data: { raw: { status: number; contentType: string; bodyBase64: string }; fileName: string } };
    expect(r.ok).toBe(true);
    expect(r.data.raw).toMatchObject({ status: 200, contentType: "text/html" });
    expect(atob(r.data.raw.bodyBase64)).toBe("<html>any page</html>");
    expect(r.data.fileName).toMatch(/^999_20_3_/);
    expect(calls).toHaveLength(1);
    expect(calls[0].tabId).toBe(7);
    expect(calls[0].url).toMatch(/javni_izpisi\/03-001\.html$/);
  });
  it("needs an open e-ZK tab", async () => {
    const { a } = api([], []);
    expect(await handleBackgroundMessage(msg({ kind: "parcel", koId: 999, number: "1" }), sender, a)).toMatchObject({ ok: false, code: "NO_EZK_TAB" });
  });
  it("rejects malformed requests", async () => {
    const { a } = api([]);
    expect(await handleBackgroundMessage(msg({ kind: "part", koId: 999, number: "20" }), sender, a)).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
});
