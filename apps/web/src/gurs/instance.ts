import { createContext, useContext } from "react";
import { createGursClient, type GursClient } from "./client";
import { withOffline } from "../offline/withOffline";
import { offlineStore } from "../offline/instance";
import { withCache } from "../cache/withCache";
import { cacheStore } from "../cache/instance";

/** Default client: local answer cache → live GURS → pinned KOs when GURS is unavailable. */
export const GursContext = createContext<GursClient>(withCache(withOffline(createGursClient(), offlineStore), cacheStore));
export const useGurs = () => useContext(GursContext);
