import { createContext, useContext } from "react";
import type { OfflineStore } from "./store";
import { gursStore } from "../local/instance";

export const offlineStore: OfflineStore = gursStore;
export const OfflineContext = createContext<OfflineStore>(offlineStore);
export const useOffline = () => useContext(OfflineContext);
