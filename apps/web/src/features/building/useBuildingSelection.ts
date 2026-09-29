import { useCallback, useRef, useState } from "react";
import type { Building, BuildingPart, GursClient } from "../../gurs";
import type { MsgKey } from "../../i18n";
import { errorMessageKey } from "../parcel/errorMessage";

/** Selected building + its parts (loaded after the building). */
export function useBuildingSelection(client: GursClient) {
  const [building, setBuilding] = useState<Building | null>(null);
  const [parts, setParts] = useState<BuildingPart[] | null>(null);
  const [partsError, setPartsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MsgKey | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (find: () => Promise<Building | null>, notFoundIsError: boolean) => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const b = await find();
      if (id !== seq.current) return null;
      if (!b) { if (notFoundIsError) setError("buildingNotFound"); return null; }
      setBuilding(b);
      setParts(null);
      setPartsError(false);
      client.buildingParts(b.koId, b.number)
        .then((p) => { if (id === seq.current) setParts(p); })
        .catch(() => { if (id === seq.current) { setParts([]); setPartsError(true); } });
      return b;
    } catch (e) {
      if (id === seq.current) setError(errorMessageKey(e));
      return null;
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [client]);

  return {
    building, parts, partsError, loading, error,
    search: (koId: number, number: number) => load(() => client.findBuilding(koId, number), true),
    pick: (lon: number, lat: number) => load(() => client.buildingAt(lon, lat), false),
    clear: () => { seq.current++; setBuilding(null); setParts(null); setError(null); setLoading(false); },
    dismissError: () => setError(null),
  };
}
