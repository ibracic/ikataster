import { describe, expect, it } from "vitest";
import { handleBackgroundMessage, type BackgroundApi } from "./background-core";
import { ezkFileName, ezkFormBody } from "./ezk-form";
import { APP_SOURCE, PROTOCOL_VERSION } from "@ikataster/bridge";

const APP = "https://app.example";
const sender = { id: "ext", origin: APP };
const msg = (payload: unknown) => ({ source: APP_SOURCE, v: PROTOCOL_VERSION, id: "1", type: "download", payload });
const b64 = (s: string) => btoa(s);
const pdf = "%PDF-1.7 " + "x".repeat(200);

function api(responses: Array<{ contentType: string; body: string }>, tabs = [{ id: 7 }]) {
  const calls: Array<{ tabId: number; url: string; body: string }> = [];
  const a: BackgroundApi = {
    runtimeId: "ext", version: "0.2.0",
    queryTabs: async () => tabs,
    postInTab: async (tabId, url, body) => { calls.push({ tabId, url, body }); const r = responses.shift()!; return { status: 200, contentType: r.contentType, base64: b64(r.body) }; },
    sleep: async () => undefined,
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
  it("POSTs in the e-ZK tab and returns the PDF", async () => {
    const { a, calls } = api([{ contentType: "application/pdf", body: pdf }]);
    const r = await handleBackgroundMessage(msg({ kind: "part", koId: 999, number: "20", part: 3 }), sender, a) as { ok: boolean; data: { pdfBase64: string; fileName: string } };
    expect(r.ok).toBe(true);
    expect(atob(r.data.pdfBase64)).toBe(pdf);
    expect(calls[0].tabId).toBe(7);
    expect(calls[0].url).toMatch(/javni_izpisi\/03-001\.html$/);
  });
  it("needs an open e-ZK tab", async () => {
    const { a } = api([], []);
    expect(await handleBackgroundMessage(msg({ kind: "parcel", koId: 999, number: "1" }), sender, a)).toMatchObject({ ok: false, code: "NO_EZK_TAB" });
  });
  it("classifies not-in-land-registry and retries system errors", async () => {
    const { a, calls } = api([
      { contentType: "text/html", body: '<div class="errors">EZK.1812 napaka</div>' },
      { contentType: "text/html", body: '<div class="errors">EZK.1400 Nepremicnina ni vpisana</div>' },
    ]);
    expect(await handleBackgroundMessage(msg({ kind: "parcel", koId: 999, number: "1" }), sender, a)).toMatchObject({ ok: false, code: "NOT_IN_ZK" });
    expect(calls).toHaveLength(2);
  });
  it("rejects malformed requests", async () => {
    const { a } = api([]);
    expect(await handleBackgroundMessage(msg({ kind: "part", koId: 999, number: "20" }), sender, a)).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });
});
