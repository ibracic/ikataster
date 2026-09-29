import { createContext, useContext } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { createResultsStore, type ResultRecord, type ResultsStore } from "./results";

export const ResultsContext = createContext<ResultsStore | null>(null);
let fallback: ResultsStore | null = null;

export function useResults() {
  const store = useContext(ResultsContext) ?? (fallback ??= createResultsStore());
  const records = useLiveQuery(() => store.list(), [store]) as ResultRecord[] | undefined;
  return { store, records: records ?? [] };
}
