import { errorResponse, isAllowedOrigin, isAppMessage, okResponse, type ExtMessage } from "@ikataster/bridge";
import { EZK_MATCH } from "./popup-core";
import { classifyEzkResponse, downloadWithRetry } from "./ezk-classify";
import { EZK_FORM_URL, ezkFileName, ezkFormBody, fromBase64, isEzkRequest } from "./ezk-form";

export interface SenderLike { id?: string; origin?: string; url?: string }
export interface BackgroundApi {
  runtimeId: string;
  version: string;
  queryTabs(q: { url: string }): Promise<{ id?: number; windowId?: number }[]>;
  /** POST the e-ZK form from inside the given e-ZK tab (same-origin, session cookie included). */
  postInTab?(tabId: number, url: string, body: string): Promise<{ status: number; contentType: string; base64: string; url?: string }>;
  sleep?(ms: number): Promise<void>;
}

function senderOrigin(s: SenderLike): string | null {
  if (s.origin) return s.origin;
  try { return s.url ? new URL(s.url).origin : null; } catch { return null; }
}

/** Background worker request handler. Only our own relay on allowed app origins may call it. */
export async function handleBackgroundMessage(msg: unknown, sender: SenderLike, api: BackgroundApi): Promise<ExtMessage> {
  const id = typeof (msg as { id?: unknown })?.id === "string" ? (msg as { id: string }).id : "invalid";
  if (sender.id !== api.runtimeId || !isAllowedOrigin(senderOrigin(sender))) return errorResponse(id, "FORBIDDEN_ORIGIN");
  if (!isAppMessage(msg)) return errorResponse(id, "BAD_REQUEST");
  switch (msg.type) {
    case "hello":
      return okResponse(msg.id, { version: api.version });
    case "status": {
      const tabs = await api.queryTabs({ url: EZK_MATCH });
      return okResponse(msg.id, { ezkTab: tabs.length > 0 });
    }
    case "download": {
      if (!isEzkRequest(msg.payload)) return errorResponse(msg.id, "BAD_REQUEST");
      const req = msg.payload;
      const tab = (await api.queryTabs({ url: EZK_MATCH })).find((t) => t.id !== undefined);
      if (!tab || !api.postInTab) return errorResponse(msg.id, "NO_EZK_TAB");
      try {
        const r = await downloadWithRetry(async () => {
          const res = await api.postInTab!(tab.id!, EZK_FORM_URL, ezkFormBody(req));
          const out = classifyEzkResponse(fromBase64(res.base64), res.contentType);
          if (!out.ok && out.code === "INVALID_PDF") out.detail = `HTTP ${res.status} ${res.url ?? ""} | ${out.detail ?? ""}`;
          return out;
        }, api.sleep);
        if (!r.ok) return errorResponse(msg.id, r.code, r.detail);
        let bin = ""; for (let i = 0; i < r.pdf.length; i += 0x8000) bin += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000));
        return okResponse(msg.id, { pdfBase64: btoa(bin), fileName: ezkFileName(req) });
      } catch (e) {
        return errorResponse(msg.id, "EXT_ERR", String((e as Error)?.message ?? e));
      }
    }
  }
}

/** Content scripts are only injected into pages loaded after install, so reload open app tabs once. */
export async function reloadAppTabs(
  matches: string[],
  tabs: { query(q: { url: string[] }): Promise<Array<{ id?: number }>>; reload(id: number): Promise<void> },
): Promise<number> {
  const open = await tabs.query({ url: matches });
  await Promise.all(open.filter((t) => t.id !== undefined).map((t) => tabs.reload(t.id!)));
  return open.length;
}
