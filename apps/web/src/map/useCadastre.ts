import { cadastreOverride, type CadastreSource } from "./mirror";

/** Parcel and building lines come from the app's own GURS copy; `?mirror=0` shows the GURS WMS instead (for comparison). */
export function useCadastre(): CadastreSource {
  return cadastreOverride(window.location.search) ?? "mirror";
}
