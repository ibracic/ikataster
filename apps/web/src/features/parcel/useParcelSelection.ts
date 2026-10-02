import { useCallback, useEffect, useRef, useState } from "react";
import type { GursClient, Parcel, ParcelDetails } from "../../gurs";
import type { MsgKey } from "../../i18n";
import { errorMessageKey } from "./errorMessage";

/** Selected parcel state: search by KO + number or by map click, then load details. */
export function useParcelSelection(client: GursClient) {
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [details, setDetails] = useState<ParcelDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MsgKey | null>(null);
  const seq = useRef(0);
  useEffect(() => () => { seq.current++; }, []);

  const load = useCallback(async (find: () => Promise<Parcel | null>, notFoundIsError: boolean) => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const p = await find();
      if (id !== seq.current) return null;
      if (!p) {
        if (notFoundIsError) setError("notFound");
        return null;
      }
      setParcel(p);
      setDetails(null);
      const d = await client.parcelDetails(p);
      if (id === seq.current) setDetails(d);
      return id === seq.current ? p : null;
    } catch (e) {
      if (id === seq.current) setError(errorMessageKey(e));
      return null;
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [client]);

  return {
    parcel, details, loading, error,
    search: (koId: number, number: string) => load(() => client.findParcel(koId, number), true),
    pick: (lon: number, lat: number) => load(() => client.parcelAt(lon, lat), false),
    pickAddress: async (e: number, n: number) => {
      const pending = load(() => client.parcelAtD96(e, n), false);
      const id = seq.current;
      const p = await pending;
      if (!p && id === seq.current) setError("noParcelAtAddress");
      return id === seq.current ? p : null;
    },
    clear: () => { seq.current++; setParcel(null); setDetails(null); setError(null); setLoading(false); },
    dismissError: () => setError(null),
  };
}
