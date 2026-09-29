/**
 * iKataster app <-> browser extension bridge protocol.
 * App (window) --postMessage--> relay content script --runtime--> background worker.
 * Replies travel back the same way. Both window endpoints use acceptWindowMessage().
 */
export const APP_SOURCE = "ikataster-app";
export const EXT_SOURCE = "ikataster-ext";
export const PROTOCOL_VERSION = 1;
export const BRIDGE_TIMEOUT_MS = 90_000;

/** Injected at build time from IKATASTER_ORIGINS (see .env.example); never committed. */
declare const __IKATASTER_ORIGINS__: string | undefined;

/** Parses a comma/space separated list of https origins; drops anything that isn't a bare https origin. */
export function parseOrigins(raw: string | undefined | null): string[] {
  return (raw ?? "").split(/[\s,]+/).filter((o) => {
    try { const u = new URL(o); return u.protocol === "https:" && u.origin === o; } catch { return false; }
  });
}

/** Origins allowed to talk to the extension. Exact match only. */
export const ALLOWED_ORIGINS: readonly string[] =
  parseOrigins(typeof __IKATASTER_ORIGINS__ === "string" ? __IKATASTER_ORIGINS__ : "");
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN.test(origin);
}

export type RequestType = "hello" | "status" | "download";
const REQUEST_TYPES: readonly RequestType[] = ["hello", "status", "download"];

export type BridgeErrorCode =
  | "TIMEOUT" | "NO_EXTENSION" | "NO_EZK_TAB" | "FORBIDDEN_ORIGIN" | "BAD_REQUEST"
  | "NOT_IMPLEMENTED" | "EXT_RELOAD" | "EXT_ERR"
  // eZK download outcomes (classified in the extension, see ezk-classify)
  | "LIMIT" | "NOT_IN_ZK" | "EZK_SYSERR" | "CAPTCHA" | "SESSION_EXPIRED" | "INVALID_PDF" | "TOO_LARGE";

/** Daily eZK cap per SI-PASS user (e-Sodstvo notice 13.05.2020; error text "400 ZK izpiskov. Mejo ste ..."). */
export const EZK_DAILY_LIMIT = 400;

export interface AppMessage {
  source: typeof APP_SOURCE;
  v: typeof PROTOCOL_VERSION;
  id: string;
  type: RequestType;
  payload?: unknown;
}

export type ExtMessage =
  | { source: typeof EXT_SOURCE; v: typeof PROTOCOL_VERSION; type: "ready"; version: string }
  | { source: typeof EXT_SOURCE; v: typeof PROTOCOL_VERSION; type: "response"; id: string; ok: true; data: unknown }
  | { source: typeof EXT_SOURCE; v: typeof PROTOCOL_VERSION; type: "response"; id: string; ok: false; code: BridgeErrorCode; error?: string };

/** Info returned by the hello handshake. */
export interface ExtensionInfo { version: string; mock?: boolean }
export interface StatusResult { ezkTab: boolean }

export class BridgeError extends Error {
  constructor(public code: BridgeErrorCode, message?: string) {
    super(message ?? code);
    this.name = "BridgeError";
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

export function isAppMessage(x: unknown): x is AppMessage {
  return isObj(x) && x.source === APP_SOURCE && x.v === PROTOCOL_VERSION
    && typeof x.id === "string" && x.id.length > 0 && x.id.length <= 64
    && REQUEST_TYPES.includes(x.type as RequestType);
}

export function isExtMessage(x: unknown): x is ExtMessage {
  if (!isObj(x) || x.source !== EXT_SOURCE || x.v !== PROTOCOL_VERSION) return false;
  if (x.type === "ready") return typeof x.version === "string";
  if (x.type === "response") return typeof x.id === "string" && x.id.length > 0 && typeof x.ok === "boolean";
  return false;
}

/**
 * Strict window.postMessage filter used by both the app and the relay:
 * same window (no iframes/openers), same origin as the page, allowed origin, valid shape.
 */
export function acceptWindowMessage(ev: MessageEvent, win: Window, from: "app"): AppMessage | null;
export function acceptWindowMessage(ev: MessageEvent, win: Window, from: "ext"): ExtMessage | null;
export function acceptWindowMessage(ev: MessageEvent, win: Window, from: "app" | "ext"): AppMessage | ExtMessage | null {
  if (ev.source !== win) return null;
  const origin = win.location.origin;
  if (ev.origin !== origin || !isAllowedOrigin(origin)) return null;
  const ok = from === "app" ? isAppMessage(ev.data) : isExtMessage(ev.data);
  return ok ? (ev.data as AppMessage | ExtMessage) : null;
}

export const appMessage = (id: string, type: RequestType, payload?: unknown): AppMessage =>
  ({ source: APP_SOURCE, v: PROTOCOL_VERSION, id, type, ...(payload === undefined ? {} : { payload }) });

export const readyMessage = (version: string): ExtMessage => ({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "ready", version });

export const okResponse = (id: string, data: unknown): ExtMessage => ({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "response", id, ok: true, data });

export const errorResponse = (id: string, code: BridgeErrorCode, error?: string): ExtMessage =>
  ({ source: EXT_SOURCE, v: PROTOCOL_VERSION, type: "response", id, ok: false, code, ...(error ? { error } : {}) });
