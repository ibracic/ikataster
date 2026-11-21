import { describe, expect, it } from "vitest";
import { classifyEzkResponse, downloadWithRetry, MAX_PDF_BYTES, type EzkOutcome } from "./ezk";
import { fetchExtract } from "./ezk";
import { BridgeError } from "./protocol";

const enc = (s: string) => new TextEncoder().encode(s);
const html = (body: string) => enc(`<html><body>${body}</body></html>`);

describe("classifyEzkResponse", () => {
  it("accepts a PDF", () => {
    const r = classifyEzkResponse(enc("%PDF-1.7 ..."), "application/pdf");
    expect(r.ok).toBe(true);
  });
  it("detects the daily limit page", () => {
    expect(classifyEzkResponse(html('<div class="errors">Dnevno lahko pridobite največ 400 ZK izpiskov. Mejo ste dosegli.</div>'))).toMatchObject({ ok: false, code: "LIMIT" });
  });
  it("limit wins over other markers", () => {
    expect(classifyEzkResponse(html("EZK.1812 ... 400 ZK izpiskov. Mejo ste dosegli"))).toMatchObject({ code: "LIMIT" });
  });
  it("maps eZK error codes", () => {
    expect(classifyEzkResponse(html('<span class="errors">EZK.1400 - Nepremičnina ne obstaja</span>'))).toMatchObject({ code: "NOT_IN_ZK" });
    expect(classifyEzkResponse(html("EZK.1399 - Nepremičnina ni vpisana"))).toMatchObject({ code: "NOT_IN_ZK" });
    expect(classifyEzkResponse(html("EZK.1812 sistemska napaka"))).toMatchObject({ code: "EZK_SYSERR" });
    expect(classifyEzkResponse(html("EZK.1396"))).toMatchObject({ code: "EZK_SYSERR" });
  });
  it("detects captcha, expired session, bad and oversized PDFs", () => {
    expect(classifyEzkResponse(html('<img src="/captcha.jpg">'))).toMatchObject({ code: "CAPTCHA" });
    expect(classifyEzkResponse(html("Prijava s SI-PASS"))).toMatchObject({ code: "SESSION_EXPIRED" });
    expect(classifyEzkResponse(enc("garbage"), "application/pdf")).toMatchObject({ code: "INVALID_PDF" });
    const big = new Uint8Array(MAX_PDF_BYTES + 1); big.set(enc("%PDF-"));
    expect(classifyEzkResponse(big)).toMatchObject({ code: "TOO_LARGE" });
  });
});

describe("downloadWithRetry", () => {
  const seq = (...outs: EzkOutcome[]) => { let i = 0; return async () => outs[Math.min(i++, outs.length - 1)]; };
  const sys: EzkOutcome = { ok: false, code: "EZK_SYSERR" };
  it("retries system errors 3x with 3/6/9 s backoff", async () => {
    const waits: number[] = [];
    const r = await downloadWithRetry(seq(sys), async (ms) => { waits.push(ms); });
    expect(r).toMatchObject({ ok: false, code: "EZK_SYSERR", attempts: 4 });
    expect(waits).toEqual([3000, 6000, 9000]);
  });
  it("recovers after a transient error", async () => {
    const r = await downloadWithRetry(seq(sys, { ok: true, pdf: enc("%PDF-") }), async () => {});
    expect(r).toMatchObject({ ok: true, attempts: 2 });
  });
  it("never retries the daily limit", async () => {
    const waits: number[] = [];
    const r = await downloadWithRetry(seq({ ok: false, code: "LIMIT" }), async (ms) => { waits.push(ms); });
    expect(r).toMatchObject({ code: "LIMIT", attempts: 1 }); expect(waits).toEqual([]);
  });
});

describe("fetchExtract (app side interprets the raw e-ZK reply)", () => {
  const raw = (contentType: string, body: string, status = 200) =>
    ({ raw: { status, contentType, url: "https://esodisce.si/x", bodyBase64: btoa(body) }, fileName: "f.pdf" });
  const bridge = (replies: unknown[]) => { const calls: unknown[] = []; return { calls, request: async (_t: string, p: unknown) => { calls.push(p); return replies.shift(); } } as never; };
  const req = { kind: "parcel", koId: 999, number: "1" } as const;

  it("returns the PDF from a raw reply", async () => {
    const r = await fetchExtract(bridge([raw("application/pdf", "%PDF-1.7 abc")]), req, async () => undefined);
    expect(atob(r.pdfBase64)).toBe("%PDF-1.7 abc");
    expect(r.fileName).toBe("f.pdf");
  });
  it("retries system errors, then throws the classified code", async () => {
    const b = bridge([raw("text/html", "EZK.1812 x"), raw("text/html", "EZK.1400 ni vpisana")]);
    await expect(fetchExtract(b, req, async () => undefined)).rejects.toMatchObject({ code: "NOT_IN_ZK" });
    expect((b as unknown as { calls: unknown[] }).calls).toHaveLength(2);
  });
  it("limit page throws LIMIT without retry", async () => {
    const e = await fetchExtract(bridge([raw("text/html", "400 ZK izpiskov")]), req, async () => undefined).catch((x) => x);
    expect(e).toBeInstanceOf(BridgeError); expect(e.code).toBe("LIMIT");
  });
  it("adds HTTP status and URL to invalid replies", async () => {
    const e = await fetchExtract(bridge([raw("text/html", "<title>Oops</title>", 500)]), req, async () => undefined).catch((x) => x);
    expect(e.code).toBe("INVALID_PDF"); expect(e.message).toMatch(/HTTP 500 https:\/\/esodisce\.si\/x/);
  });
  it("still accepts older extensions that return pdfBase64", async () => {
    const r = await fetchExtract(bridge([{ pdfBase64: btoa("%PDF-1"), fileName: "o.pdf" }]), req);
    expect(r).toEqual({ pdfBase64: btoa("%PDF-1"), fileName: "o.pdf" });
  });
});
