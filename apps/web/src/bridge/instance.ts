import { SETTINGS } from "../data/inventory";
import { createContext, useContext } from "react";
import { BridgeError, createBridgeClient, mockTransport, windowTransport, type BridgeClient } from "@ikataster/bridge";
// Sample extracts for the mock bridge live in a git-ignored folder; without them the mock reports "not available".
const FIXTURES = Object.values(import.meta.glob<string>("../ezk/__private__/*.pdf", { query: "?url", import: "default", eager: true }));
/**
 * Mock eZK download (?bridge=mock): ~2 s per extract, returns an anonymised fixture PDF (chosen by item),
 * numbers containing "999" are "not in the land registry". Real downloads go through the extension.
 */
async function mockDownload(p: unknown): Promise<{ pdfBase64: string; fileName: string }> {
  const r = p as { koId: number; number: string; part?: number };
  await new Promise((res) => setTimeout(res, 2000));
  if (String(r.number).includes("999")) throw new BridgeError("NOT_IN_ZK", "Nepremičnina ni vpisana v zemljiško knjigo");
  if (!FIXTURES.length) throw new BridgeError("NOT_IMPLEMENTED", "Mock extracts are not available in this build");
  const h = [...`${r.koId}:${r.number}:${r.part ?? ""}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const bytes = new Uint8Array(await (await fetch(FIXTURES[h % FIXTURES.length])).arrayBuffer());
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return { pdfBase64: btoa(bin), fileName: `mock_${r.koId}_${r.number}.pdf` };
}

export const BRIDGE_LS = SETTINGS.bridge;
export type BridgeMode = "extension" | "mock";

/** ?bridge=mock (persisted in localStorage) switches to the in-page mock; ?bridge=extension switches back. */
export function bridgeMode(search = window.location.search, storage: Storage = localStorage): BridgeMode {
  const q = new URLSearchParams(search).get("bridge");
  if (q === "mock") storage.setItem(BRIDGE_LS, "mock");
  if (q === "extension" || q === "off") storage.removeItem(BRIDGE_LS);
  return storage.getItem(BRIDGE_LS) === "mock" ? "mock" : "extension";
}

export function createAppBridge(mode: BridgeMode): BridgeClient {
  return mode === "mock"
    ? createBridgeClient(mockTransport({ status: async () => ({ ezkTab: true }), download: mockDownload }, "mock"))
    : createBridgeClient(windowTransport(window));
}

let defaultBridge: { mode: BridgeMode; client: BridgeClient } | null = null;
export const BridgeContext = createContext<{ mode: BridgeMode; client: BridgeClient } | null>(null);

export function useBridge() {
  const ctx = useContext(BridgeContext);
  if (ctx) return ctx;
  if (!defaultBridge) { const mode = bridgeMode(); defaultBridge = { mode, client: createAppBridge(mode) }; }
  return defaultBridge;
}
