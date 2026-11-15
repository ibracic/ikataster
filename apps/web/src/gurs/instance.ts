import { createContext, useContext } from "react";
import type { GursClient } from "./types";
import { createLiveGurs } from "./live";
import { offlineStore } from "../offline/instance";
import { createMirror } from "../mirror/data";
import { withCopy } from "../cadastre/copy";

/** Static GURS copy published with the app (see scripts/mirror). */
export const mirror = createMirror();

/** Default client: the app's own GURS copy for everything it contains; live GURS only for an old KO file's parcel EUP. */
export const GursContext = createContext<GursClient>(withCopy(createLiveGurs(), mirror, offlineStore));
export const useGurs = () => useContext(GursContext);
