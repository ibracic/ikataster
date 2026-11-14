import { createContext, useContext } from "react";
import { createGursClient, type GursClient } from "./client";
import { withOffline } from "../offline/withOffline";
import { offlineStore } from "../offline/instance";
import { withCache } from "../cache/withCache";
import { cacheStore } from "../cache/instance";
import { createMirror, withMirror } from "../mirror/data";

/** Static GURS copy published with the app (see scripts/mirror). */
export const mirror = createMirror();

/** Default client: local answer cache → live GURS (KO pins from the mirror) → pinned KOs when GURS is unavailable. */
export const GursContext = createContext<GursClient>(withCache(withOffline(withMirror(createGursClient(), mirror), offlineStore, mirror), cacheStore));
export const useGurs = () => useContext(GursContext);
