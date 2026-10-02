import { SETTINGS } from "../data/inventory";
import { useEffect, useState } from "react";
import type { GursClient } from "./client";
import type { Ko } from "./types";

const LS_KEY = SETTINGS.kos;
const TTL_MS = 7 * 24 * 3600 * 1000;

/** KO list, cached in localStorage for a week (it rarely changes). */
export function useKos(client: GursClient) {
  const [kos, setKos] = useState<Ko[]>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      return c && Date.now() - c.at < TTL_MS ? c.kos : [];
    } catch { return []; }
  });
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (kos.length) return;
    let live = true;
    client.listKos().then((k) => {
      if (!live) return;
      setKos(k);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), kos: k })); } catch { /* quota */ }
    }).catch((e) => live && setError(e));
    return () => { live = false; };
  }, [client, kos.length]);
  return { kos, error };
}
