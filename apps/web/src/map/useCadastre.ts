import { useEffect, useState } from "react";
import { cadastreOverride, probeGurs, type CadastreSource } from "./mirror";
import { setGursDown } from "../mirror/state";

let probed: Promise<boolean> | null = null;

/** GURS when reachable, otherwise our static copy. Probed once per page load; `?mirror=1|0` overrides. */
export function useCadastre(): CadastreSource {
  const forced = cadastreOverride(window.location.search);
  const [src, setSrc] = useState<CadastreSource>(forced ?? "gurs");
  if (forced) setGursDown(forced === "mirror");
  useEffect(() => {
    if (forced || import.meta.env.MODE === "test") return;
    let live = true;
    (probed ??= probeGurs()).then((ok) => { if (!ok) setGursDown(true); if (live && !ok) setSrc("mirror"); });
    return () => { live = false; };
  }, [forced]);
  return src;
}
