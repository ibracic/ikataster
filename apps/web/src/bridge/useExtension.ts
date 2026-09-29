import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtensionInfo, StatusResult } from "@ikataster/bridge";
import { useBridge } from "./instance";

export type ExtensionState =
  | { status: "checking" }
  | { status: "missing" }
  | { status: "detected"; info: ExtensionInfo; ezkTab: boolean | null; mock: boolean };

/** Detects the browser extension (hello/ready handshake) and asks whether an eZK tab is open. Re-checks on window focus. */
export function useExtension(helloMs = 1500) {
  const { client, mode } = useBridge();
  const [state, setState] = useState<ExtensionState>({ status: "checking" });
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const info = await client.hello(helloMs);
      if (!info) return setState({ status: "missing" });
      let ezkTab: boolean | null = null;
      try { ezkTab = (await client.request<StatusResult>("status", undefined, 5000)).ezkTab; } catch { /* old/limited extension */ }
      setState({ status: "detected", info, ezkTab, mock: mode === "mock" || !!info.mock });
    } finally { busy.current = false; }
  }, [client, mode, helloMs]);

  useEffect(() => {
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [check]);

  return { state, recheck: check };
}
