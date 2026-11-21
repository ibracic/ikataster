import { BridgeError, type BridgeErrorCode } from "./protocol";

// Interpreting e-ZK replies lives in the APP (not the extension), so wording changes on
// e-Sodstvo are fixed with a web deploy instead of a store update.

export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export type EzkOutcome = { ok: true; pdf: Uint8Array } | { ok: false; code: BridgeErrorCode; detail?: string };

const isPdf = (b: Uint8Array) => b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === "%PDF-";

/** Classify an eZK form response (PDF bytes or an HTML error page). Order matters: the daily limit wins. */
export function classifyEzkResponse(body: Uint8Array, contentType = ""): EzkOutcome {
  if (isPdf(body)) {
    if (body.length > MAX_PDF_BYTES) return { ok: false, code: "TOO_LARGE" };
    return { ok: true, pdf: body };
  }
  if (/application\/pdf/i.test(contentType)) return { ok: false, code: "INVALID_PDF" };
  const text = new TextDecoder("utf-8").decode(body.subarray(0, 200_000));
  if (/400\s+ZK\s+izpiskov/i.test(text) || /Mejo ste (že )?dosegli/i.test(text)) return { ok: false, code: "LIMIT" };
  if (/EZK\.1400|EZK\.1399/.test(text)) return { ok: false, code: "NOT_IN_ZK", detail: text.match(/EZK\.\d+[^<]*/)?.[0]?.trim() };
  if (/EZK\.1812|EZK\.1396/.test(text)) return { ok: false, code: "EZK_SYSERR", detail: text.match(/EZK\.\d+[^<]*/)?.[0]?.trim() };
  if (/captcha/i.test(text)) return { ok: false, code: "CAPTCHA" };
  if (/SI-PASS|sipass|prijava|login/i.test(text) && !/odjava/i.test(text)) return { ok: false, code: "SESSION_EXPIRED" };
  const title = text.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim();
  const err = text.match(/class="errors?"[^>]*>([^<]{1,200})/i)?.[1]?.trim();
  const snippet = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return { ok: false, code: "INVALID_PDF", detail: [contentType, title && `title: ${title}`, err && `error: ${err}`, !err && snippet && `text: ${snippet}`].filter(Boolean).join(" | ") };
}

export const RETRY_DELAYS_MS = [3000, 6000, 9000];

/** Run fetchOnce; retry only EZK_SYSERR (3x, 3/6/9 s). LIMIT and all other errors return immediately. */
export async function downloadWithRetry(
  fetchOnce: () => Promise<EzkOutcome>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<EzkOutcome & { attempts: number }> {
  let attempts = 0;
  for (;;) {
    const r = await fetchOnce(); attempts++;
    if (r.ok || r.code !== "EZK_SYSERR" || attempts > RETRY_DELAYS_MS.length) return { ...r, attempts };
    await sleep(RETRY_DELAYS_MS[attempts - 1]);
  }
}

/** What the extension (>= 0.5) returns: the e-ZK reply exactly as received. */
export interface RawEzkReply { raw: { status: number; contentType: string; url?: string; bodyBase64: string }; fileName?: string }
/** What extensions <= 0.4 returned (they classified in the extension). */
interface LegacyReply { pdfBase64: string; fileName?: string }
export interface EzkRequestPayload { kind: "parcel" | "building" | "part"; koId: number; number: string; part?: number }

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** Ask the extension for one extract, classify the reply and retry e-ZK system errors. Throws BridgeError. */
export async function fetchExtract(
  bridge: { request<T>(type: "download", payload: unknown): Promise<T> },
  req: EzkRequestPayload,
  sleep?: (ms: number) => Promise<void>,
): Promise<{ pdfBase64: string; fileName?: string }> {
  let legacy: LegacyReply | null = null;
  let fileName: string | undefined;
  const r = await downloadWithRetry(async () => {
    const res = await bridge.request<RawEzkReply | LegacyReply>("download", req);
    if ("pdfBase64" in res) { legacy = res; return { ok: true, pdf: new Uint8Array() }; }
    fileName = res.fileName;
    const out = classifyEzkResponse(fromB64(res.raw.bodyBase64), res.raw.contentType);
    if (!out.ok && out.code === "INVALID_PDF") out.detail = `HTTP ${res.raw.status} ${res.raw.url ?? ""} | ${out.detail ?? ""}`;
    return out;
  }, sleep);
  if (legacy) return legacy;
  if (!r.ok) throw new BridgeError(r.code, r.detail);
  return { pdfBase64: toB64(r.pdf), fileName };
}
