import { errorResponse, isAllowedOrigin, isAppMessage, okResponse, type ExtMessage } from "@ikataster/bridge";
import { EZK_MATCH } from "./popup-core";

export interface SenderLike { id?: string; origin?: string; url?: string }
export interface BackgroundApi {
  runtimeId: string;
  version: string;
  queryTabs(q: { url: string }): Promise<{ id?: number; windowId?: number }[]>;
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
    case "download":
      return errorResponse(msg.id, "NOT_IMPLEMENTED", "eZK download arrives with issue #10");
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
