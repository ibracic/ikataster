import {
  BRIDGE_TIMEOUT_MS, BridgeError, acceptWindowMessage, appMessage, okResponse, errorResponse, readyMessage,
  type AppMessage, type ExtMessage, type ExtensionInfo, type RequestType,
} from "./protocol";

/** How the app reaches the extension (window relay in production, mock in dev/tests). */
export interface Transport {
  send(msg: AppMessage): void;
  onMessage(fn: (msg: ExtMessage) => void): () => void;
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function createBridgeClient(transport: Transport, opts: { timeoutMs?: number } = {}) {
  const timeoutMs = opts.timeoutMs ?? BRIDGE_TIMEOUT_MS;
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let readyInfo: ExtensionInfo | null = null;
  const readyWaiters = new Set<(i: ExtensionInfo) => void>();

  transport.onMessage((m) => {
    if (m.type === "ready") {
      readyInfo = { version: m.version };
      readyWaiters.forEach((w) => w(readyInfo!));
      return;
    }
    const p = pending.get(m.id);
    if (!p) return; // late or foreign reply
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.data);
    else p.reject(new BridgeError(m.code, m.error));
  });

  function request<T = unknown>(type: RequestType, payload?: unknown, ms = timeoutMs): Promise<T> {
    const id = newId();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new BridgeError("TIMEOUT", `No reply to ${type} within ${ms} ms`)); }, ms);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      transport.send(appMessage(id, type, payload));
    });
  }

  return {
    request,
    /** Handshake: resolves with extension info, or null when no extension answers within `ms`. */
    async hello(ms = 1500): Promise<ExtensionInfo | null> {
      if (readyInfo) return readyInfo;
      const viaReady = new Promise<ExtensionInfo>((r) => readyWaiters.add(r));
      try {
        return await Promise.race([request<ExtensionInfo>("hello", undefined, ms), viaReady]);
      } catch {
        return readyInfo;
      }
    },
  };
}

export type BridgeClient = ReturnType<typeof createBridgeClient>;

/** Production transport: window.postMessage to the relay content script, same origin only. */
export function windowTransport(win: Window = window): Transport {
  return {
    send: (msg) => win.postMessage(msg, win.location.origin),
    onMessage(fn) {
      const h = (ev: MessageEvent) => { const m = acceptWindowMessage(ev, win, "ext"); if (m) fn(m); };
      win.addEventListener("message", h);
      return () => win.removeEventListener("message", h);
    },
  };
}

type Handlers = Partial<Record<Exclude<RequestType, "hello">, (payload: unknown) => Promise<unknown>>>;

/** In-memory transport for dev (?bridge=mock) and tests. Replies asynchronously like the real thing. */
export function mockTransport(handlers: Handlers, version = "mock"): Transport {
  const listeners = new Set<(m: ExtMessage) => void>();
  const emit = (m: ExtMessage) => queueMicrotask(() => listeners.forEach((l) => l(m)));
  return {
    send(msg) {
      if (msg.type === "hello") return emit(okResponse(msg.id, { version, mock: true }));
      const h = handlers[msg.type];
      if (!h) return emit(errorResponse(msg.id, "NOT_IMPLEMENTED", msg.type));
      h(msg.payload).then(
        (d) => emit(okResponse(msg.id, d)),
        (e) => emit(errorResponse(msg.id, e instanceof BridgeError ? e.code : "EXT_ERR", String(e?.message ?? e))),
      );
    },
    onMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

export { readyMessage };
