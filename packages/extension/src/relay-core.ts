import { acceptWindowMessage, errorResponse, isExtMessage, okResponse, readyMessage, type ExtMessage } from "@ikataster/bridge";

export interface RuntimeLike { sendMessage(msg: unknown): Promise<unknown> }

/**
 * Content script on the app origin: window.postMessage <-> runtime.sendMessage.
 * Replies go only to the page's own origin, never "*".
 */
export function startRelay(win: Window, runtime: RuntimeLike, version: string): () => void {
  const origin = win.location.origin;
  const reply = (m: ExtMessage) => win.postMessage(m, origin);

  const onMessage = async (ev: MessageEvent) => {
    const msg = acceptWindowMessage(ev, win, "app");
    if (!msg) return;
    if (msg.type === "hello") return reply(okResponse(msg.id, { version }));
    try {
      const res = await runtime.sendMessage(msg);
      reply(isExtMessage(res) ? res : errorResponse(msg.id, "EXT_ERR", "No valid reply from background"));
    } catch (e) {
      const text = String((e as Error)?.message ?? e);
      reply(errorResponse(msg.id, /context invalidated|Receiving end does not exist/i.test(text) ? "EXT_RELOAD" : "EXT_ERR", text));
    }
  };
  win.addEventListener("message", onMessage);
  reply(readyMessage(version));
  return () => win.removeEventListener("message", onMessage);
}
